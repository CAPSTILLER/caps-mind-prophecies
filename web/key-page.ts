import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  formatUnits,
  getAddress,
  http,
  isAddress,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hash,
} from 'viem';
import { base } from 'viem/chains';
import {
  CAPS_MIND_ERROR_TEXT,
  CAPS_MIND_NFT as C,
  capsMindNftAbi as abi,
  decodeStorageStringHeader,
  effectiveTokenUri,
  hexToUtf8,
  metadataDataUri,
} from '../src/capsMindNft.js';

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

const NFT = getAddress(C.address);
const DEFAULT_META_URI = C.siteOrigin + C.defaultMetadataPath;
const pub = createPublicClient({
  chain: base,
  transport: fallback(C.readRpcs.map((u) => http(u))),
});

type ChainState = {
  name: string;
  symbol: string;
  owner: Address;
  pendingOwner: Address;
  genesis: boolean;
  total: bigint;
  baseUri: string;
  token1Owner: Address | null;
  token1Uri: string | null;
};

let state: ChainState | null = null;
let account: Address | null = null;
let walletChainId: number | null = null;
let walletInfo: { hasMinted: boolean; canMint: readonly [boolean, bigint, string] } | null = null;
let busy = false;
let baseMeta = { name: 'CAPs Mind', description: 'A key to CAPs mind. Holders can publish prophecies.' };
let uploadedImageUrl = '';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
function setText(id: string, text: string) {
  const el = $(id);
  if (el) el.textContent = text;
}
function setHtml(id: string, html: string) {
  const el = $(id);
  if (el) el.innerHTML = html;
}
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function short(a: string) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}
function same(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
function addrLink(a: string) {
  return `<a href="${C.explorer}/address/${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>`;
}
function provider(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}
function ipfsToHttp(u: string) {
  return u.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + u.slice(7).replace(/^ipfs\//, '') : u;
}

function showMsg(kind: 'ok' | 'bad' | 'info', html: string) {
  const el = $('txMsg');
  if (!el) return;
  el.className = 'msg show' + (kind === 'info' ? '' : ' ' + kind);
  el.innerHTML = html;
}

/** Turn wallet / contract errors into a short plain-English line. */
function explain(err: unknown): string {
  if (err instanceof BaseError) {
    const rejected = err.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return 'You rejected the request in your wallet. Nothing was sent.';
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = reverted?.data?.errorName;
    if (name && CAPS_MIND_ERROR_TEXT[name]) return CAPS_MIND_ERROR_TEXT[name];
    if (name) return `The contract rejected this (${name}).`;
    return err.shortMessage || err.message;
  }
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return 'You rejected the request in your wallet. Nothing was sent.';
  return e?.message || String(err);
}

async function readBaseUri(): Promise<string> {
  const word = await pub.getStorageAt({ address: NFT, slot: toHex(C.baseUriSlot, { size: 32 }) });
  const head = decodeStorageStringHeader(word || '0x0');
  if (head.short !== null) return head.short;
  const start = BigInt(keccak256(pad(toHex(C.baseUriSlot), { size: 32 })));
  const words = Math.ceil(head.longLength / 32);
  let hex = '';
  for (let i = 0; i < words; i++) {
    const w = await pub.getStorageAt({ address: NFT, slot: toHex(start + BigInt(i), { size: 32 }) });
    hex += (w || '0x').slice(2).padStart(64, '0');
  }
  return hexToUtf8(hex.slice(0, head.longLength * 2));
}

async function loadChain() {
  const r = (fn: string) => pub.readContract({ address: NFT, abi, functionName: fn as never });
  const [name, symbol, owner, pendingOwner, genesis, total, baseUri] = await Promise.all([
    r('name') as Promise<string>,
    r('symbol') as Promise<string>,
    r('owner') as Promise<Address>,
    r('pendingOwner') as Promise<Address>,
    r('firstMintCompleted') as Promise<boolean>,
    r('totalMinted') as Promise<bigint>,
    readBaseUri(),
  ]);
  let token1Owner: Address | null = null;
  let token1Uri: string | null = null;
  if (total >= 1n) {
    token1Owner = await pub.readContract({ address: NFT, abi, functionName: 'ownerOf', args: [1n] });
    token1Uri = await pub.readContract({ address: NFT, abi, functionName: 'tokenURI', args: [1n] });
  }
  state = { name, symbol, owner, pendingOwner, genesis, total, baseUri, token1Owner, token1Uri };
}

async function loadWallet() {
  walletInfo = null;
  if (!account) return;
  const [hasMinted, canMint] = await Promise.all([
    pub.readContract({ address: NFT, abi, functionName: 'hasMinted', args: [account] }),
    pub.readContract({ address: NFT, abi, functionName: 'canMint', args: [account] }),
  ]);
  walletInfo = { hasMinted, canMint };
}

async function resolveImageFromTokenUri(uri: string): Promise<string | null> {
  try {
    let meta: { image?: string };
    if (uri.startsWith('data:application/json')) {
      const comma = uri.indexOf(',');
      const body = uri.slice(comma + 1);
      const isB64 = uri.slice(0, comma).includes(';base64');
      const text = isB64 ? new TextDecoder().decode(Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))) : decodeURIComponent(body);
      meta = JSON.parse(text);
    } else {
      const res = await fetch(ipfsToHttp(uri));
      meta = await res.json();
    }
    return meta.image ? ipfsToHttp(meta.image) : null;
  } catch {
    return null;
  }
}

function renderChain() {
  if (!state) return;
  const s = state;
  setText('stName', `${s.name} / ${s.symbol}`);
  setHtml('stOwner', addrLink(s.owner));
  const pendRow = $('stPendingRow');
  const hasPending = s.pendingOwner && !/^0x0{40}$/i.test(s.pendingOwner);
  if (pendRow) pendRow.style.display = hasPending ? '' : 'none';
  if (hasPending) setHtml('stPending', addrLink(s.pendingOwner));
  setHtml('stGenesis', s.genesis ? '<span class="ok">Yes</span>' : 'Not yet');
  setText('stTotal', s.total.toString());
  setHtml('stBase', s.baseUri ? `<span class="bad">${esc(s.baseUri)}</span>` : '<span class="ok">Empty (good)</span>');

  const warn = $('ownerWarn');
  if (warn) {
    if (!same(s.owner, C.plannedOwner)) {
      warn.style.display = '';
      warn.innerHTML = `<b>Heads up: the owner is not your planned wallet.</b> The contract owner on chain is <span class="mono">${esc(s.owner)}</span>, not <span class="mono">${esc(C.plannedOwner)}</span>. Only the owner can mint key #1 and change images. Either connect the owner wallet and mint from it, or use "Contract ownership" below to move ownership to your planned wallet first (the new wallet then has to accept).`;
    } else {
      warn.style.display = 'none';
    }
  }

  const t1 = $('stToken1');
  if (t1) t1.style.display = s.total >= 1n ? '' : 'none';
  if (s.total >= 1n && s.token1Owner && s.token1Uri !== null) {
    setHtml('stToken1Owner', addrLink(s.token1Owner));
    setText('stToken1Uri', s.token1Uri || '(empty: wallets will show no art)');
    if (s.token1Uri) {
      void resolveImageFromTokenUri(s.token1Uri).then((img) => {
        const wrap = $('stToken1ArtWrap');
        const el = $<HTMLImageElement>('stToken1Art');
        if (img && wrap && el) {
          el.src = img;
          wrap.style.display = '';
        }
      });
    }
  }
}

function renderWallet() {
  const sw = $('switchBtn');
  const cb = $('connectBtn');
  setText('walletChip', account ? short(account) : 'Wallet disconnected');
  if (!account) {
    setText('wAddr', 'Not connected');
    setText('wChain', '-');
    setText('wIsOwner', '-');
    setText('wGear', '-');
    setText('wCanMint', '-');
    if (sw) sw.style.display = 'none';
    if (cb) cb.textContent = 'Connect wallet';
    return;
  }
  if (cb) cb.textContent = 'Reconnect';
  setHtml('wAddr', addrLink(account));
  const onBase = walletChainId === C.chainId;
  setHtml(
    'wChain',
    onBase ? '<span class="ok">Base</span>' : `<span class="bad">Wrong network (chain ${walletChainId ?? '?'}). Switch to Base.</span>`,
  );
  if (sw) sw.style.display = onBase ? 'none' : '';
  if (state) {
    const isOwner = same(account, state.owner);
    setHtml('wIsOwner', isOwner ? '<span class="ok">Yes</span>' : '<span class="bad">No</span>');
  }
  if (walletInfo) {
    const [ok, bal, reason] = walletInfo.canMint;
    setText('wGear', `${Number(formatUnits(bal, C.gearDecimals)).toLocaleString('en-US')} GEAR`);
    setHtml('wCanMint', `<span class="${ok ? 'ok' : 'bad'}">${esc(reason)}</span>`);
  }
}

function currentMode(): string {
  const el = document.querySelector<HTMLInputElement>('input[name="artMode"]:checked');
  return el?.value || 'default';
}

/** The metadata URI the owner buttons will send, or null with a reason. */
function chosenUri(): { uri: string | null; image: string | null; why?: string } {
  const mode = currentMode();
  if (mode === 'default') return { uri: DEFAULT_META_URI, image: C.defaultImagePath };
  if (mode === 'upload') {
    if (!uploadedImageUrl) return { uri: null, image: null, why: 'Pick an image file to upload first.' };
    return { uri: metadataDataUri({ ...baseMeta, image: uploadedImageUrl }), image: uploadedImageUrl };
  }
  if (mode === 'imageUrl') {
    const v = ($<HTMLInputElement>('artImageUrl')?.value || '').trim();
    if (!/^(https:\/\/|ipfs:\/\/)\S+$/.test(v)) return { uri: null, image: null, why: 'Enter an image link that starts with https:// or ipfs://.' };
    return { uri: metadataDataUri({ ...baseMeta, image: v }), image: ipfsToHttp(v) };
  }
  const v = ($<HTMLInputElement>('artMetaUrl')?.value || '').trim();
  if (!/^(https:\/\/|ipfs:\/\/|data:application\/json)\S+$/.test(v)) {
    return { uri: null, image: null, why: 'Enter a metadata link that starts with https:// or ipfs://.' };
  }
  return { uri: v, image: null };
}

async function renderArt() {
  document.querySelectorAll<HTMLElement>('.sub[data-mode]').forEach((el) => {
    el.style.display = el.dataset.mode === currentMode() ? '' : 'none';
  });
  const pick = chosenUri();
  const out = $('uriOut');
  if (out) out.textContent = pick.uri ? (pick.uri.length > 240 ? pick.uri.slice(0, 240) + '…' : pick.uri) : pick.why || '';
  const img = $<HTMLImageElement>('artPreview');
  if (img) {
    if (pick.image) img.src = pick.image;
    else if (pick.uri) void resolveImageFromTokenUri(pick.uri).then((u) => u && (img.src = u));
  }
  const res = $('uriResult');
  if (res && state && pick.uri) {
    const eff = effectiveTokenUri(state.baseUri, pick.uri, 1);
    res.innerHTML = state.baseUri
      ? `<span class="bad">The base URI is set, so wallets would load: ${esc(eff.slice(0, 200))}. Clear the base URI first.</span>`
      : 'The base URI is empty, so key #1 will use this URI exactly as shown.';
  } else if (res) res.textContent = '';
  const prev = $('metaPreview');
  if (prev && pick.uri) {
    if (pick.uri.startsWith('data:application/json;base64,')) {
      prev.textContent = JSON.stringify(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pick.uri.split(',')[1]), (ch) => ch.charCodeAt(0)))), null, 2);
    } else if (pick.uri === DEFAULT_META_URI) {
      try {
        const r = await fetch(C.defaultMetadataPath, { cache: 'no-store' });
        prev.textContent = JSON.stringify(await r.json(), null, 2);
      } catch {
        prev.textContent = 'Could not load the metadata file from this site.';
      }
    } else prev.textContent = 'External metadata. Open the link to check it.';
  }
  renderButtons();
}

function renderButtons() {
  const s = state;
  const onBase = walletChainId === C.chainId;
  const isOwner = !!(s && account && same(account, s.owner));
  const isPending = !!(s && account && same(account, s.pendingOwner));
  const pick = chosenUri();

  let why = '';
  if (!s) why = 'Loading contract state…';
  else if (s.genesis) why = 'Key #1 is already minted. Use "Set tokenURI" to change its art.';
  else if (!account) why = 'Connect the owner wallet.';
  else if (!onBase) why = 'Switch your wallet to Base.';
  else if (!isOwner) why = `This wallet is not the contract owner. Connect ${short(s.owner)}.`;
  else if (walletInfo?.hasMinted) why = 'This wallet has already minted a key.';
  else if (!pick.uri) why = pick.why || 'Choose the key image first.';
  else if (s.baseUri) why = 'The base URI is set. Clear it first so the art link works.';
  const g = $<HTMLButtonElement>('genesisBtn');
  if (g) g.disabled = busy || !!why;
  setHtml('genesisWhy', why ? esc(why) : '<span class="ok">Ready. Your wallet will ask you to sign one transaction.</span>');

  const ownerReady = !busy && !!s && onBase && isOwner;
  const st = $<HTMLButtonElement>('setTokenUriBtn');
  if (st) st.disabled = !ownerReady || !pick.uri || !s || s.total < 1n;
  const sb = $<HTMLButtonElement>('setBaseBtn');
  if (sb) sb.disabled = !ownerReady;
  const tr = $<HTMLButtonElement>('transferBtn');
  if (tr) tr.disabled = !ownerReady;
  const ac = $<HTMLButtonElement>('acceptBtn');
  if (ac) ac.disabled = busy || !onBase || !isPending;
  if (s && (isPending || !same(s.owner, C.plannedOwner))) {
    const d = $<HTMLDetailsElement>('ownerDetails');
    if (d) d.open = true;
  }
}

async function refreshAll() {
  try {
    await loadChain();
    renderChain();
  } catch (e) {
    showMsg('bad', 'Could not read the contract from Base: ' + esc(explain(e)) + ' Try Refresh.');
  }
  try {
    await loadWallet();
  } catch {
    /* wallet details are optional */
  }
  renderWallet();
  await renderArt();
}

async function readWalletChain() {
  const eth = provider();
  if (!eth) return;
  try {
    walletChainId = Number(await eth.request({ method: 'eth_chainId' }));
  } catch {
    walletChainId = null;
  }
}

async function switchToBase() {
  const eth = provider();
  if (!eth) return;
  const chainId = toHex(C.chainId);
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId,
            chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: [C.explorer],
          },
        ],
      });
    } else {
      showMsg('bad', 'Could not switch networks: ' + esc(explain(err)) + ' Switch to Base in your wallet.');
    }
  }
  await readWalletChain();
}

async function connect() {
  const eth = provider();
  if (!eth) {
    showMsg('bad', 'No browser wallet found. Install or unlock Rabby, Coinbase Wallet, or MetaMask, then reload.');
    return;
  }
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    account = accounts[0] ? getAddress(accounts[0]) : null;
    await readWalletChain();
    if (walletChainId !== C.chainId) await switchToBase();
    await refreshAll();
  } catch (e) {
    showMsg('bad', esc(explain(e)));
  }
}

type WriteFn = 'ownerGenesisMint' | 'setTokenURI' | 'setBaseURI' | 'transferOwnership' | 'acceptOwnership';

/** Simulate first (catches reverts before signing), then ask the wallet to sign and wait for the receipt. */
async function send(fn: WriteFn, args: readonly unknown[], label: string) {
  const eth = provider();
  if (!eth || !account) return showMsg('bad', 'Connect your wallet first.');
  await readWalletChain();
  if (walletChainId !== C.chainId) {
    await switchToBase();
    if (walletChainId !== C.chainId) return showMsg('bad', 'Your wallet is not on Base. Switch to Base and try again.');
  }
  busy = true;
  renderButtons();
  try {
    showMsg('info', `Checking "${esc(label)}" against the contract…`);
    const { request } = await pub.simulateContract({
      address: NFT,
      abi,
      functionName: fn as never,
      args: args as never,
      account,
    });
    showMsg('info', `Confirm "${esc(label)}" in your wallet. On a Ledger, approve it on the device.`);
    const wallet = createWalletClient({ account, chain: base, transport: custom(eth) });
    const hash: Hash = await wallet.writeContract(request as never);
    const link = `<a href="${C.explorer}/tx/${hash}" target="_blank" rel="noopener">${short(hash)}</a>`;
    showMsg('info', `Sent ${link}. Waiting for Base to confirm…`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') showMsg('ok', `Done: ${esc(label)}. Transaction ${link}.`);
    else showMsg('bad', `The transaction ${link} failed on chain.`);
  } catch (e) {
    showMsg('bad', esc(explain(e)));
  } finally {
    busy = false;
    await refreshAll();
  }
}

async function onUpload(file: File) {
  const fd = new FormData();
  fd.set('file', file);
  fd.set('folder', 'key');
  showMsg('info', 'Uploading image…');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.');
    uploadedImageUrl = new URL(data.url, location.origin).href;
    showMsg('ok', 'Image uploaded. Check the preview, then mint or set the tokenURI.');
  } catch (e) {
    showMsg('bad', 'Upload failed: ' + esc(explain(e)));
  }
  await renderArt();
}

async function boot() {
  try {
    const r = await fetch(C.defaultMetadataPath);
    const j = (await r.json()) as { name?: string; description?: string };
    baseMeta = { name: j.name || baseMeta.name, description: j.description || baseMeta.description };
  } catch {
    /* keep defaults */
  }

  $('connectBtn')?.addEventListener('click', () => void connect());
  $('switchBtn')?.addEventListener('click', async () => {
    await switchToBase();
    renderWallet();
    renderButtons();
  });
  $('refreshBtn')?.addEventListener('click', () => void refreshAll());
  document.querySelectorAll('input[name="artMode"]').forEach((el) => el.addEventListener('change', () => void renderArt()));
  $('artImageUrl')?.addEventListener('input', () => void renderArt());
  $('artMetaUrl')?.addEventListener('input', () => void renderArt());
  $<HTMLInputElement>('artFile')?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void onUpload(f);
  });

  $('genesisBtn')?.addEventListener('click', () => {
    const { uri } = chosenUri();
    if (uri) void send('ownerGenesisMint', [uri], 'Mint key #1');
  });
  $('setTokenUriBtn')?.addEventListener('click', () => {
    const { uri } = chosenUri();
    const id = Number($<HTMLInputElement>('setUriId')?.value || '0');
    if (!uri) return showMsg('bad', 'Choose the key image first.');
    if (!Number.isInteger(id) || id < 1) return showMsg('bad', 'Enter a key ID of 1 or more.');
    if (state && BigInt(id) > state.total) return showMsg('bad', `Key #${id} has not been minted yet.`);
    void send('setTokenURI', [BigInt(id), uri], `Set key #${id} tokenURI`);
  });
  $('setBaseBtn')?.addEventListener('click', () => {
    const v = ($<HTMLInputElement>('baseUriIn')?.value || '').trim();
    if (v && !confirm('Setting a base URI changes every key\'s tokenURI to base URI + its own URI. Continue?')) return;
    void send('setBaseURI', [v], v ? 'Set base URI' : 'Clear base URI');
  });
  $('transferBtn')?.addEventListener('click', () => {
    const v = ($<HTMLInputElement>('newOwnerIn')?.value || '').trim();
    if (!isAddress(v)) return showMsg('bad', 'Enter a valid wallet address for the new owner.');
    if (!confirm(`Start moving contract ownership to ${v}? That wallet must then connect here and accept.`)) return;
    void send('transferOwnership', [getAddress(v)], `Start ownership transfer to ${short(v)}`);
  });
  $('acceptBtn')?.addEventListener('click', () => void send('acceptOwnership', [], 'Accept ownership'));

  const eth = provider();
  if (eth) {
    eth.on?.('accountsChanged', (accs: unknown) => {
      const list = accs as string[];
      account = list?.[0] ? getAddress(list[0]) : null;
      void refreshAll();
    });
    eth.on?.('chainChanged', (id: unknown) => {
      walletChainId = Number(id);
      void refreshAll();
    });
    try {
      const accs = (await eth.request({ method: 'eth_accounts' })) as string[];
      if (accs[0]) account = getAddress(accs[0]);
    } catch {
      /* not authorized yet */
    }
    await readWalletChain();
  }
  await refreshAll();
}

void boot();
