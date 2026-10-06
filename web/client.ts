/**
 * Browser code for the tablets pages (/, /tablet/:id, /publish).
 * Talks straight to Base mainnet: reads through public RPCs, writes through the connected wallet.
 * The /key page has its own bundle (web/key-page.ts) and does not load this file.
 */
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
  parseEventLogs,
  toHex,
  type Address,
  type Hash,
} from 'viem';
import { base } from 'viem/chains';
import { capsMindKeyViewAbi, erc20Abi, tabletsAbi } from '../src/abis.js';
import {
  PREVIEW_PROPHECIES,
  TABLETS as T,
  TABLET_ERROR_TEXT,
  byteLength,
  displayImageUrl,
  isAllowedImageUri,
  tabletForPreview,
  type Tablet,
} from '../src/tablets.js';

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

type PageInfo = { page: 'gallery' | 'tablet' | 'publish'; id?: number; blobUpload?: boolean };

declare global {
  interface Window {
    __TABLETS_PAGE__?: PageInfo;
  }
}

const TABLETS_ADDR = getAddress(T.address);
const KEY_ADDR = getAddress(T.keyAddress);
const GEAR_ADDR = getAddress(T.gearAddress);
const MAX_KEY_SCAN = 500;

const pub = createPublicClient({
  chain: base,
  transport: fallback(T.readRpcs.map((u) => http(u))),
  batch: { multicall: true },
});

const info: PageInfo = window.__TABLETS_PAGE__ || { page: 'gallery' };
let account: Address | null = null;
let walletChainId: number | null = null;
let busy = false;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E | null;
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function short(a: string) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}
function txLink(hash: string) {
  return `<a href="${T.explorer}/tx/${esc(hash)}" target="_blank" rel="noopener">${short(hash)}</a>`;
}
function setText(id: string, text: string) {
  const el = $(id);
  if (el) el.textContent = text;
}
function setHtml(id: string, html: string) {
  const el = $(id);
  if (el) el.innerHTML = html;
}
function showMsg(el: HTMLElement | null, kind: 'ok' | 'bad' | 'info', html: string) {
  if (!el) return;
  el.className = 'msg show' + (kind === 'info' ? '' : ' ' + kind);
  el.innerHTML = html;
}
function provider(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}
function gear(raw: bigint) {
  return Number(formatUnits(raw, T.gearDecimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Turn wallet and contract errors into one plain-English line. */
function explain(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet. Nothing was sent.';
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = reverted?.data?.errorName;
    if (name && TABLET_ERROR_TEXT[name]) return TABLET_ERROR_TEXT[name];
    if (name) return `The contract rejected this (${name}).`;
    return err.shortMessage || err.message;
  }
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return 'You rejected the request in your wallet. Nothing was sent.';
  return e?.message || String(err);
}

// ---------------------------------------------------------------------------
// wallet
// ---------------------------------------------------------------------------

async function readWalletChain() {
  const eth = provider();
  if (!eth) return;
  try {
    walletChainId = Number(await eth.request({ method: 'eth_chainId' }));
  } catch {
    walletChainId = null;
  }
}

async function switchToBase(): Promise<boolean> {
  const eth = provider();
  if (!eth) return false;
  const chainId = toHex(T.chainId);
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId,
            chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: [T.explorer],
          },
        ],
      });
    }
  }
  await readWalletChain();
  return walletChainId === T.chainId;
}

/** Ask the wallet for an account (prompts if needed) and make sure it is on Base. */
async function connect(): Promise<boolean> {
  const eth = provider();
  if (!eth) {
    alert('No browser wallet found. Install or unlock Rabby, Coinbase Wallet, or MetaMask, then reload.');
    return false;
  }
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  account = accounts[0] ? getAddress(accounts[0]) : null;
  await readWalletChain();
  if (account && walletChainId !== T.chainId) await switchToBase();
  await onWalletChanged();
  return !!account && walletChainId === T.chainId;
}

async function ensureReady(msgEl: HTMLElement | null): Promise<boolean> {
  try {
    if (!account) {
      if (!(await connect())) {
        if (account) showMsg(msgEl, 'bad', 'Switch your wallet to Base and try again.');
        return false;
      }
    }
    await readWalletChain();
    if (walletChainId !== T.chainId && !(await switchToBase())) {
      showMsg(msgEl, 'bad', 'Your wallet is not on Base. Switch to Base and try again.');
      return false;
    }
    return true;
  } catch (e) {
    showMsg(msgEl, 'bad', esc(explain(e)));
    return false;
  }
}

function walletClient() {
  const eth = provider();
  if (!eth || !account) throw new Error('Connect your wallet first.');
  return createWalletClient({ account, chain: base, transport: custom(eth) });
}

async function renderWalletLine() {
  setText('walletChip', account ? short(account) : 'Wallet disconnected');
  const cb = $('connectBtn');
  if (cb) cb.textContent = account ? 'Reconnect' : 'Connect wallet';
  const line = $('walletLine');
  if (!line) return;
  if (!account) {
    line.textContent = 'Connect a wallet on Base to mint. You pay in GEAR.';
    return;
  }
  if (walletChainId !== T.chainId) {
    line.innerHTML = '<span class="bad">Wrong network. Switch your wallet to Base.</span>';
    return;
  }
  try {
    const bal = await pub.readContract({ address: GEAR_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
    line.textContent = `${short(account)} on Base · ${gear(bal)} GEAR`;
  } catch {
    line.textContent = `${short(account)} on Base`;
  }
}

async function onWalletChanged() {
  await renderWalletLine();
  if (info.page === 'publish') await refreshPublish();
}

// ---------------------------------------------------------------------------
// mint (gallery cards and tablet page)
// ---------------------------------------------------------------------------

async function readTablet(id: number): Promise<Tablet> {
  const row = await pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'getTablet', args: [BigInt(id)] });
  return {
    id,
    imageURI: row[0],
    description: row[1],
    minted: Number(row[2]),
    publisher: row[3],
    keyId: Number(row[4]),
    publishedAt: Number(row[5]),
    updatedAt: Number(row[6]),
    nextPriceWholeGear: Number(row[7]),
  };
}

function renderTabletNumbers(t: Tablet) {
  const detail = info.page === 'tablet';
  document.querySelectorAll<HTMLElement>(`[data-minted="${t.id}"]`).forEach((el) => {
    el.textContent = detail ? String(t.minted) : `${t.minted} ${t.minted === 1 ? 'copy' : 'copies'} minted`;
  });
  document.querySelectorAll<HTMLElement>(`[data-price="${t.id}"]`).forEach((el) => {
    el.textContent = detail ? `#${t.minted + 1} for ${t.nextPriceWholeGear} GEAR` : `${t.nextPriceWholeGear} GEAR next`;
  });
  document.querySelectorAll<HTMLButtonElement>(`[data-mint="${t.id}"]`).forEach((b) => {
    b.textContent = `Mint copy #${t.minted + 1} for ${t.nextPriceWholeGear} GEAR`;
  });
}

async function mintTablet(id: number) {
  const msg = document.querySelector<HTMLElement>(`[data-mint-msg="${id}"]`);
  if (busy) return;
  if (!(await ensureReady(msg)) || !account) return;
  busy = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-mint]');
  buttons.forEach((b) => (b.disabled = true));
  try {
    showMsg(msg, 'info', 'Checking the price…');
    const [paused, price, whole, bal, allowance] = await Promise.all([
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'paused' }),
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'nextPrice', args: [BigInt(id)] }),
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'nextPriceWhole', args: [BigInt(id)] }),
      pub.readContract({ address: GEAR_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
      pub.readContract({ address: GEAR_ADDR, abi: erc20Abi, functionName: 'allowance', args: [account, TABLETS_ADDR] }),
    ]);
    if (paused) return showMsg(msg, 'bad', esc(TABLET_ERROR_TEXT.PausedError));
    if (bal < price) {
      return showMsg(msg, 'bad', `This copy costs ${whole} GEAR and this wallet holds ${gear(bal)} GEAR.`);
    }
    const wallet = walletClient();
    if (allowance < price) {
      showMsg(msg, 'info', `Step 1 of 2: approve exactly ${whole} GEAR for the tablets contract in your wallet.`);
      const approveHash: Hash = await wallet.writeContract({
        address: GEAR_ADDR,
        abi: erc20Abi,
        functionName: 'approve',
        args: [TABLETS_ADDR, price],
      });
      showMsg(msg, 'info', `Approval sent (${txLink(approveHash)}). Waiting for Base…`);
      const r = await pub.waitForTransactionReceipt({ hash: approveHash });
      if (r.status !== 'success') return showMsg(msg, 'bad', `The approval ${txLink(approveHash)} failed on chain.`);
    }
    showMsg(msg, 'info', `${allowance < price ? 'Step 2 of 2: c' : 'C'}onfirm the mint for ${whole} GEAR in your wallet.`);
    const { request } = await pub.simulateContract({
      address: TABLETS_ADDR,
      abi: tabletsAbi,
      functionName: 'mint',
      args: [BigInt(id), price],
      account,
    });
    const hash: Hash = await wallet.writeContract(request);
    showMsg(msg, 'info', `Mint sent (${txLink(hash)}). Waiting for Base…`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') return showMsg(msg, 'bad', `The mint ${txLink(hash)} failed on chain.`);
    const ev = parseEventLogs({ abi: tabletsAbi, eventName: 'TabletMinted', logs: receipt.logs })[0];
    const what = ev
      ? `Prophecy Tablet ${ev.args.tabletId} #${ev.args.serial} (token ID ${ev.args.tokenId})`
      : `a copy of Tablet #${id}`;
    showMsg(msg, 'ok', `You minted ${esc(what)}. Transaction ${txLink(hash)}.`);
  } catch (e) {
    showMsg(msg, 'bad', esc(explain(e)));
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    try {
      renderTabletNumbers(await readTablet(id));
    } catch {
      /* numbers refresh on reload */
    }
    void renderWalletLine();
  }
}

// ---------------------------------------------------------------------------
// copy lookup
// ---------------------------------------------------------------------------

function decodeTokenUri(uri: string): { name?: string; image?: string } {
  const prefix = 'data:application/json;base64,';
  if (!uri.startsWith(prefix)) return {};
  const bin = atob(uri.slice(prefix.length));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function lookupCopy() {
  const msg = $('lookupMsg');
  const id = Number($<HTMLInputElement>('lookupId')?.value || '0');
  if (!Number.isInteger(id) || id < 1) return showMsg(msg, 'bad', 'Enter a token ID of 1 or more.');
  showMsg(msg, 'info', 'Reading Base…');
  try {
    const tid = BigInt(id);
    const [tablet, serial, owner, uri] = await Promise.all([
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'tabletOf', args: [tid] }),
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'serialOf', args: [tid] }),
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'ownerOf', args: [tid] }),
      pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'tokenURI', args: [tid] }),
    ]);
    const meta = decodeTokenUri(uri);
    const img = meta.image ? displayImageUrl(meta.image) : '';
    showMsg(
      msg,
      'ok',
      `<b>${esc(meta.name || `Prophecy Tablet ${tablet} #${serial}`)}</b><br/>Token ID ${id} is copy #${serial} of <a href="/tablet/${tablet}">Tablet #${tablet}</a>.<br/>Held by <a href="${T.explorer}/address/${esc(owner)}" target="_blank" rel="noopener">${esc(short(owner))}</a>.` +
        (img ? `<br/><img src="${esc(img)}" alt="" style="max-width:220px;margin-top:8px;border-radius:6px"/>` : ''),
    );
  } catch (e) {
    showMsg(msg, 'bad', esc(explain(e)));
  }
}

// ---------------------------------------------------------------------------
// publish page
// ---------------------------------------------------------------------------

type KeyRow = { id: number; eligible: boolean };
type PublishState = {
  paused: boolean;
  publishingPaused: boolean;
  tabletCount: number;
  tablets: Tablet[];
  keys: KeyRow[];
  keyScanError: string | null;
};
let pubState: PublishState | null = null;

async function loadPublishState(): Promise<PublishState> {
  const [paused, publishingPaused, count] = await Promise.all([
    pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'paused' }),
    pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'publishingPaused' }),
    pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'tabletCount' }),
  ]);
  const n = Math.min(Number(count), 500);
  const tablets = await Promise.all(Array.from({ length: n }, (_, i) => readTablet(i + 1)));

  const keys: KeyRow[] = [];
  let keyScanError: string | null = null;
  if (account) {
    try {
      const owner = account;
      const minted = Number(await pub.readContract({ address: KEY_ADDR, abi: capsMindKeyViewAbi, functionName: 'totalMinted' }));
      const ids = Array.from({ length: Math.min(minted, MAX_KEY_SCAN) }, (_, i) => i + 1);
      const owners = await Promise.all(
        ids.map((id) =>
          pub
            .readContract({ address: KEY_ADDR, abi: capsMindKeyViewAbi, functionName: 'ownerOf', args: [BigInt(id)] })
            .catch(() => null),
        ),
      );
      const mine = ids.filter((_, i) => owners[i] && owners[i]!.toLowerCase() === owner.toLowerCase());
      const eligible = await Promise.all(
        mine.map((id) => pub.readContract({ address: TABLETS_ADDR, abi: tabletsAbi, functionName: 'isPublishEligible', args: [BigInt(id)] })),
      );
      mine.forEach((id, i) => keys.push({ id, eligible: eligible[i] }));
    } catch (e) {
      keyScanError = explain(e);
    }
  }
  return { paused, publishingPaused, tabletCount: Number(count), tablets, keys, keyScanError };
}

function selectedKey(): KeyRow | null {
  const v = Number($<HTMLSelectElement>('keySelect')?.value || '0');
  return pubState?.keys.find((k) => k.id === v) || null;
}

/** Why publishing or editing is blocked right now, or null if the wallet can go ahead. */
function gateReason(): string | null {
  const s = pubState;
  if (!provider()) return 'No browser wallet found. Install or unlock Rabby, Coinbase Wallet, or MetaMask, then reload.';
  if (!account) return 'Connect a wallet that holds a CAPs Mind key.';
  if (walletChainId !== T.chainId) return 'Your wallet is on the wrong network. Switch to Base.';
  if (!s) return 'Reading Base…';
  if (s.keyScanError) return `Could not check your CAPs Mind keys: ${s.keyScanError}`;
  if (!s.keys.length) {
    return 'This wallet does not hold a CAPs Mind key, so it cannot publish or edit tablets. Connect the wallet that holds your key.';
  }
  if (s.paused) return TABLET_ERROR_TEXT.PausedError;
  if (s.publishingPaused) return TABLET_ERROR_TEXT.PublishingPausedError + ' Minting still works.';
  const key = selectedKey();
  if (!key) return 'Pick which CAPs Mind key to use.';
  if (!key.eligible) {
    return `CAPs Mind key #${key.id} is locked from publishing. A CAPs Mind holder with 2,000,000 GEAR can unlock it.`;
  }
  return null;
}

function renderPublish() {
  const s = pubState;
  setText('pubAddr', account || 'Not connected');
  const sw = $('switchBtn');
  if (sw) sw.style.display = account && walletChainId !== T.chainId ? '' : 'none';
  setHtml(
    'pubChain',
    !account ? '-' : walletChainId === T.chainId ? '<span class="ok">Base</span>' : '<span class="bad">Wrong network</span>',
  );
  if (s) {
    setHtml(
      'pubOpen',
      s.paused
        ? '<span class="bad">Contract paused by owner</span>'
        : s.publishingPaused
          ? '<span class="bad">Paused</span>'
          : '<span class="ok">Open</span>',
    );
    setText('pubCount', String(s.tabletCount));
    setText('nextTabletNo', `will be Tablet #${s.tabletCount + 1}`);
  }

  // key picker
  const sel = $<HTMLSelectElement>('keySelect');
  if (sel) {
    const prev = sel.value;
    if (!account) {
      sel.innerHTML = '<option value="">Connect a wallet first</option>';
      sel.disabled = true;
    } else if (s && s.keys.length) {
      sel.innerHTML = s.keys
        .map((k) => `<option value="${k.id}">Key #${k.id}${k.eligible ? ' (ready)' : ' (locked)'}</option>`)
        .join('');
      const keep = s.keys.find((k) => String(k.id) === prev) || s.keys.find((k) => k.eligible) || s.keys[0];
      sel.value = String(keep.id);
      sel.disabled = s.keys.length < 2;
    } else {
      sel.innerHTML = `<option value="">${s ? 'No CAPs Mind key in this wallet' : 'Checking…'}</option>`;
      sel.disabled = true;
    }
  }

  const why = gateReason();
  const gate = $('gateMsg');
  const key = selectedKey();
  const neutral = !s || (!account && !!provider());
  if (why) showMsg(gate, neutral ? 'info' : 'bad', esc(why));
  else showMsg(gate, 'ok', `CAPs Mind key #${key!.id} is ready. You can publish and edit tablets.`);

  // quick-fill status
  for (const p of PREVIEW_PROPHECIES) {
    const onchain = s ? tabletForPreview(p, s.tablets) : undefined;
    const badge = document.querySelector<HTMLElement>(`[data-quick-status="${p.n}"]`);
    if (badge) {
      badge.className = 'badge ' + (onchain ? 'live' : 'soon');
      badge.textContent = onchain ? `Onchain as Tablet #${onchain.id}` : 'Not yet onchain';
    }
  }

  // edit picker
  const ed = $<HTMLSelectElement>('editTablet');
  if (ed && s) {
    const prev = ed.value;
    if (s.tablets.length) {
      ed.innerHTML = s.tablets.map((t) => `<option value="${t.id}">Tablet #${t.id}: ${esc(t.description.slice(0, 50))}</option>`).join('');
      ed.value = s.tablets.some((t) => String(t.id) === prev) ? prev : String(s.tablets[s.tablets.length - 1].id);
      ed.disabled = false;
      if (prev !== ed.value) fillEditFromTablet();
    } else {
      ed.innerHTML = '<option value="">No tablets onchain yet</option>';
      ed.disabled = true;
    }
  }
  renderFormButtons();
}

function renderFormButtons() {
  const blocked = busy || !!gateReason();
  const pb = $<HTMLButtonElement>('publishBtn');
  if (pb) pb.disabled = blocked;
  const ub = $<HTMLButtonElement>('updateBtn');
  if (ub) ub.disabled = blocked || !pubState?.tablets.length;
}

async function refreshPublish() {
  try {
    pubState = await loadPublishState();
  } catch (e) {
    pubState = null;
    showMsg($('gateMsg'), 'bad', 'Could not read Base: ' + esc(explain(e)) + ' Reload in a moment.');
    renderFormButtons();
    return;
  }
  renderPublish();
}

function fillEditFromTablet() {
  const id = Number($<HTMLSelectElement>('editTablet')?.value || '0');
  const t = pubState?.tablets.find((x) => x.id === id);
  if (!t) return;
  const img = $<HTMLInputElement>('editImageUrl');
  const desc = $<HTMLTextAreaElement>('editDescription');
  if (img) img.value = t.imageURI;
  if (desc) desc.value = t.description;
  updatePreview('editImageUrl', 'editPreview', 'editPreviewImg');
  updateBytes('editDescription', 'editDescBytes');
}

function updatePreview(inputId: string, wrapId: string, imgId: string) {
  const v = ($<HTMLInputElement>(inputId)?.value || '').trim();
  const wrap = $(wrapId);
  const img = $<HTMLImageElement>(imgId);
  if (!wrap || !img) return;
  const url = isAllowedImageUri(v) ? displayImageUrl(v) : '';
  if (url) {
    img.src = url;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

function updateBytes(textId: string, outId: string) {
  const v = $<HTMLTextAreaElement>(textId)?.value || '';
  const n = byteLength(v.trim());
  setHtml(outId, n > T.maxDescriptionBytes ? `<span class="bad">${n} / ${T.maxDescriptionBytes} bytes (too long)</span>` : `${n} / ${T.maxDescriptionBytes} bytes`);
}

/** Check the form fields the same way the contract does. */
function validateForm(imageURI: string, description: string): string | null {
  if (!imageURI) return 'Add an image link first.';
  if (!isAllowedImageUri(imageURI)) return 'The image link has to start with https:// or ipfs://.';
  if (byteLength(imageURI) > T.maxImageUriBytes) return TABLET_ERROR_TEXT.ImageTooLong;
  if (!description) return 'Add a description first.';
  if (byteLength(description) > T.maxDescriptionBytes) return TABLET_ERROR_TEXT.DescriptionTooLong;
  return null;
}

async function sendKeyTx(kind: 'publish' | 'update') {
  const msg = $(kind === 'publish' ? 'publishMsg' : 'updateMsg');
  const imageURI = ($<HTMLInputElement>(kind === 'publish' ? 'imageUrl' : 'editImageUrl')?.value || '').trim();
  const description = ($<HTMLTextAreaElement>(kind === 'publish' ? 'description' : 'editDescription')?.value || '').trim();
  const bad = validateForm(imageURI, description);
  if (bad) return showMsg(msg, 'bad', esc(bad));
  if (!(await ensureReady(msg)) || !account) return;
  await refreshPublish();
  const why = gateReason();
  if (why) return showMsg(msg, 'bad', esc(why));
  const key = selectedKey()!;
  const tabletId = Number($<HTMLSelectElement>('editTablet')?.value || '0');
  if (kind === 'update' && !pubState?.tablets.some((t) => t.id === tabletId)) return showMsg(msg, 'bad', 'Pick a tablet to edit.');

  busy = true;
  renderFormButtons();
  try {
    // Last check straight from the contract, then simulate so reverts show before you sign.
    const ok = await pub.readContract({
      address: TABLETS_ADDR,
      abi: tabletsAbi,
      functionName: 'canPublishWithKey',
      args: [account, BigInt(key.id)],
    });
    if (!ok) return showMsg(msg, 'bad', esc(`The contract says key #${key.id} cannot publish from this wallet right now. Refresh and check the messages above.`));
    showMsg(msg, 'info', 'Checking with the contract…');
    const wallet = walletClient();
    let hash: Hash;
    if (kind === 'publish') {
      const { request, result } = await pub.simulateContract({
        address: TABLETS_ADDR,
        abi: tabletsAbi,
        functionName: 'publishTablet',
        args: [BigInt(key.id), imageURI, description],
        account,
      });
      showMsg(msg, 'info', `Confirm in your wallet. This publishes Tablet #${result} with key #${key.id}.`);
      hash = await wallet.writeContract(request);
    } else {
      const { request } = await pub.simulateContract({
        address: TABLETS_ADDR,
        abi: tabletsAbi,
        functionName: 'updateTablet',
        args: [BigInt(key.id), BigInt(tabletId), imageURI, description],
        account,
      });
      showMsg(msg, 'info', `Confirm in your wallet. This changes Tablet #${tabletId} for every copy.`);
      hash = await wallet.writeContract(request);
    }
    showMsg(msg, 'info', `Sent (${txLink(hash)}). Waiting for Base…`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') return showMsg(msg, 'bad', `The transaction ${txLink(hash)} failed on chain.`);
    if (kind === 'publish') {
      const ev = parseEventLogs({ abi: tabletsAbi, eventName: 'TabletPublished', logs: receipt.logs })[0];
      const id = ev ? String(ev.args.tabletId) : '';
      showMsg(
        msg,
        'ok',
        `Published${id ? ` <a href="/tablet/${id}">Tablet #${id}</a>` : ''}. Transaction ${txLink(hash)}. It is mintable now.`,
      );
      const img = $<HTMLInputElement>('imageUrl');
      const desc = $<HTMLTextAreaElement>('description');
      if (img) img.value = '';
      if (desc) desc.value = '';
      updatePreview('imageUrl', 'preview', 'previewImg');
      updateBytes('description', 'descBytes');
    } else {
      showMsg(msg, 'ok', `Saved. <a href="/tablet/${tabletId}">Tablet #${tabletId}</a> updated for every copy. Transaction ${txLink(hash)}. Marketplaces may take a few minutes to refresh.`);
    }
  } catch (e) {
    showMsg(msg, 'bad', esc(explain(e)));
  } finally {
    busy = false;
    await refreshPublish();
  }
}

function quickFill(n: number) {
  const p = PREVIEW_PROPHECIES.find((x) => x.n === n);
  if (!p) return;
  const img = $<HTMLInputElement>('imageUrl');
  const desc = $<HTMLTextAreaElement>('description');
  if (img) img.value = p.imageURI;
  if (desc) desc.value = p.description;
  updatePreview('imageUrl', 'preview', 'previewImg');
  updateBytes('description', 'descBytes');
  const onchain = pubState ? tabletForPreview(p, pubState.tablets) : undefined;
  showMsg(
    $('publishMsg'),
    onchain ? 'bad' : 'info',
    onchain
      ? `Heads up: Prophecy ${n} is already onchain as <a href="/tablet/${onchain.id}">Tablet #${onchain.id}</a>. Publishing again makes a second tablet.`
      : `Filled with Prophecy ${n}. Check it, then tap Publish tablet.`,
  );
  $('publishPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onUpload(file: File) {
  const msg = $('publishMsg');
  const fd = new FormData();
  fd.set('file', file);
  showMsg(msg, 'info', 'Uploading image…');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.');
    const url = new URL(data.url, location.origin).href;
    const input = $<HTMLInputElement>('imageUrl');
    if (input) input.value = url;
    updatePreview('imageUrl', 'preview', 'previewImg');
    showMsg(msg, 'ok', 'Image uploaded and link filled in.');
  } catch (e) {
    showMsg(msg, 'bad', 'Upload failed: ' + esc(explain(e)));
  }
}

function bootPublish() {
  $('switchBtn')?.addEventListener('click', async () => {
    await switchToBase();
    await onWalletChanged();
  });
  $('keySelect')?.addEventListener('change', () => renderPublish());
  $('editTablet')?.addEventListener('change', () => fillEditFromTablet());
  $('publishBtn')?.addEventListener('click', () => void sendKeyTx('publish'));
  $('updateBtn')?.addEventListener('click', () => void sendKeyTx('update'));
  $('imageUrl')?.addEventListener('input', () => updatePreview('imageUrl', 'preview', 'previewImg'));
  $('editImageUrl')?.addEventListener('input', () => updatePreview('editImageUrl', 'editPreview', 'editPreviewImg'));
  $('description')?.addEventListener('input', () => updateBytes('description', 'descBytes'));
  $('editDescription')?.addEventListener('input', () => updateBytes('editDescription', 'editDescBytes'));
  document.querySelectorAll<HTMLButtonElement>('[data-fill]').forEach((b) =>
    b.addEventListener('click', () => quickFill(Number(b.dataset.fill))),
  );
  $<HTMLInputElement>('imageFile')?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void onUpload(f);
  });
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  $('connectBtn')?.addEventListener('click', () => {
    void connect().catch((e) => alert(explain(e)));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mint]').forEach((b) =>
    b.addEventListener('click', () => void mintTablet(Number(b.dataset.mint))),
  );
  $('lookupBtn')?.addEventListener('click', () => void lookupCopy());
  if (info.page === 'publish') bootPublish();

  const eth = provider();
  if (eth) {
    eth.on?.('accountsChanged', (accs: unknown) => {
      const list = accs as string[];
      account = list?.[0] ? getAddress(list[0]) : null;
      void onWalletChanged();
    });
    eth.on?.('chainChanged', (id: unknown) => {
      walletChainId = Number(id);
      void onWalletChanged();
    });
    try {
      const accs = (await eth.request({ method: 'eth_accounts' })) as string[];
      if (accs[0]) account = getAddress(accs[0]);
    } catch {
      /* not authorized yet */
    }
    await readWalletChain();
  }
  await onWalletChanged();
}

void boot();
