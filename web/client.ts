import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  type Address,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { erc20Abi, propheciesAbi } from '../src/abis.js';

type SiteConfig = {
  chainId: number;
  rpcUrl: string;
  gearAddress: string;
  keyAddress: string;
  propheciesAddress: string;
  live: boolean;
  gearDecimals: number;
  maxPriceGear: number;
};

type Prophecy = {
  id: number;
  imageUri: string;
  description: string;
  minted: number;
  publisher: string;
  publishedAt: number;
  nextPriceWholeGear: number;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
    __PROPHECY_ID__?: number;
  }
}

let cfg: SiteConfig;
let account: Address | null = null;

function chain() {
  return cfg.chainId === 8453 ? base : baseSepolia;
}

function publicClient() {
  return createPublicClient({ chain: chain(), transport: http(cfg.rpcUrl) });
}

function short(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function setChip(text: string) {
  const el = document.getElementById('walletChip');
  if (el) el.textContent = text;
}

async function loadConfig() {
  const res = await fetch('/api/config');
  cfg = (await res.json()) as SiteConfig;
}

async function connect(): Promise<Address | null> {
  if (!window.ethereum) {
    alert('No wallet found. Install MetaMask, Rabby, or Coinbase Wallet.');
    return null;
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  account = (accounts[0] || null) as Address | null;
  if (!account) return null;

  const target = `0x${cfg.chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target }],
    });
  } catch {
    // Cap can switch manually if add-chain is needed
  }

  setChip(short(account));
  return account;
}

async function walletClient() {
  if (!window.ethereum || !account) throw new Error('Connect wallet first');
  return createWalletClient({
    account,
    chain: chain(),
    transport: custom(window.ethereum),
  });
}

async function canPublish(addr: Address): Promise<boolean> {
  if (!cfg.live) return true; // local demo: anyone can publish to JSON store
  const client = publicClient();
  return client.readContract({
    address: cfg.propheciesAddress as Address,
    abi: propheciesAbi,
    functionName: 'canPublish',
    args: [addr],
  });
}

async function refreshGallery() {
  const root = document.getElementById('gallery');
  if (!root) return;
  const res = await fetch('/api/prophecies');
  const data = (await res.json()) as { prophecies?: Prophecy[]; error?: string };
  if (data.error) {
    root.innerHTML = `<div class="empty bad">${data.error}</div>`;
    return;
  }
  const list = data.prophecies || [];
  if (!list.length) {
    root.innerHTML =
      '<div class="empty">No prophecies yet. Cap can publish from <a href="/publish">Publish</a>.</div>';
    return;
  }
  root.innerHTML = list
    .map(
      (p) => `<a class="card" href="/prophecy/${p.id}">
      <img class="shot" src="${escapeAttr(p.imageUri)}" alt="Prophecy ${p.id}"/>
      <div class="body">
        <div class="desc">${escapeHtml(p.description)}</div>
        <div class="meta"><span>#${p.id}</span><span>${p.nextPriceWholeGear} GEAR next</span></div>
        <div class="meta"><span>${p.minted} minted</span><span>open →</span></div>
      </div>
    </a>`,
    )
    .join('');
}

async function refreshDetail() {
  const id = window.__PROPHECY_ID__;
  if (!id) return;
  const res = await fetch(`/api/prophecies/${id}`);
  const data = (await res.json()) as { prophecy?: Prophecy; source?: string; error?: string };
  const banner = document.getElementById('modeBanner');
  if (banner) {
    banner.innerHTML = cfg.live
      ? `<b>Onchain mint.</b> Approve GEAR, then mint. Curve caps at ${cfg.maxPriceGear} GEAR.`
      : `<b>Local demo mint.</b> No GEAR pulled. Wire contracts to go live.`;
  }
  if (data.error || !data.prophecy) {
    const t = document.getElementById('propText');
    if (t) t.textContent = data.error || 'Not found';
    return;
  }
  const p = data.prophecy;
  const img = document.getElementById('propImage') as HTMLImageElement | null;
  if (img) img.src = p.imageUri;
  const text = document.getElementById('propText');
  if (text) text.textContent = p.description;
  setText('propMinted', String(p.minted));
  setText('propPrice', `${p.nextPriceWholeGear} GEAR`);
  setText('propPublisher', p.publisher);
  setText(
    'propWhen',
    p.publishedAt ? new Date(p.publishedAt * 1000).toLocaleString() : '-',
  );
  const mintBtn = document.getElementById('mintBtn') as HTMLButtonElement | null;
  if (mintBtn) mintBtn.disabled = !account;
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function refreshPublishGate() {
  const gate = document.getElementById('publishGate');
  const btn = document.getElementById('publishBtn') as HTMLButtonElement | null;
  if (!gate) return;
  if (!account) {
    gate.textContent = 'Connect the key wallet to publish.';
    if (btn) btn.disabled = true;
    return;
  }
  const ok = await canPublish(account);
  gate.innerHTML = ok
    ? `<span class="ok">Publisher key OK (${short(account)})</span>`
    : `<span class="bad">This wallet does not hold the CAPs Mind Key NFT.</span>`;
  if (btn) btn.disabled = !ok;
}

async function onPublish() {
  const status = document.getElementById('publishStatus');
  const imageUri = (document.getElementById('imageUrl') as HTMLInputElement)?.value.trim();
  const description = (document.getElementById('description') as HTMLTextAreaElement)?.value.trim();
  if (!imageUri || !description) {
    if (status) status.textContent = 'Image URL and description required.';
    return;
  }
  if (!account) {
    if (status) status.textContent = 'Connect wallet first.';
    return;
  }
  if (status) status.textContent = 'Publishing…';

  if (!cfg.live) {
    const res = await fetch('/api/local/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUri, description, publisher: account }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (status) status.textContent = data.error || 'Publish failed';
      return;
    }
    if (status) status.textContent = `Published local prophecy #${data.prophecy.id}`;
    location.href = `/prophecy/${data.prophecy.id}`;
    return;
  }

  const wallet = await walletClient();
  const hash = await wallet.writeContract({
    address: cfg.propheciesAddress as Address,
    abi: propheciesAbi,
    functionName: 'publish',
    args: [imageUri, description],
    chain: chain(),
    account,
  });
  if (status) status.textContent = `Tx ${hash.slice(0, 10)}… waiting`;
  await publicClient().waitForTransactionReceipt({ hash });
  if (status) status.textContent = 'Published onchain.';
  location.href = '/';
}

async function onMint() {
  const id = window.__PROPHECY_ID__;
  const status = document.getElementById('mintStatus');
  if (!id || !account) return;
  if (status) status.textContent = 'Minting…';

  if (!cfg.live) {
    const res = await fetch(`/api/local/mint/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      if (status) status.textContent = data.error || 'Mint failed';
      return;
    }
    if (status) status.textContent = `Local mint ok. Next ${data.prophecy.nextPriceWholeGear} GEAR.`;
    await refreshDetail();
    return;
  }

  const client = publicClient();
  const props = cfg.propheciesAddress as Address;
  const gear = cfg.gearAddress as Address;
  const price = await client.readContract({
    address: props,
    abi: propheciesAbi,
    functionName: 'nextPrice',
    args: [BigInt(id)],
  });

  const wallet = await walletClient();
  const allowance = await client.readContract({
    address: gear,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, props],
  });
  if (allowance < price) {
    if (status) status.textContent = `Approving ${formatUnits(price, cfg.gearDecimals)} GEAR…`;
    const approveHash = await wallet.writeContract({
      address: gear,
      abi: erc20Abi,
      functionName: 'approve',
      args: [props, price],
      chain: chain(),
      account,
    });
    await client.waitForTransactionReceipt({ hash: approveHash });
  }

  if (status) status.textContent = 'Sending mint…';
  const hash = await wallet.writeContract({
    address: props,
    abi: propheciesAbi,
    functionName: 'mint',
    args: [BigInt(id)],
    chain: chain(),
    account,
  });
  await client.waitForTransactionReceipt({ hash });
  if (status) status.textContent = `Minted. Tx ${hash.slice(0, 12)}…`;
  await refreshDetail();
}

async function onUploadFile(file: File) {
  const status = document.getElementById('publishStatus');
  const fd = new FormData();
  fd.set('file', file);
  if (status) status.textContent = 'Uploading image…';
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) {
    if (status) status.textContent = data.error || 'Upload failed';
    return;
  }
  const input = document.getElementById('imageUrl') as HTMLInputElement | null;
  if (input) input.value = data.url;
  const preview = document.getElementById('preview') as HTMLElement | null;
  const img = document.getElementById('previewImg') as HTMLImageElement | null;
  if (preview && img) {
    img.src = data.url;
    preview.style.display = 'block';
  }
  if (status) status.textContent = 'Image ready.';
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

async function boot() {
  await loadConfig();
  document.getElementById('connectBtn')?.addEventListener('click', async () => {
    await connect();
    await refreshPublishGate();
    await refreshDetail();
    const mintBtn = document.getElementById('mintBtn') as HTMLButtonElement | null;
    if (mintBtn) mintBtn.disabled = !account;
  });
  document.getElementById('publishBtn')?.addEventListener('click', () => void onPublish());
  document.getElementById('mintBtn')?.addEventListener('click', () => void onMint());
  document.getElementById('imageFile')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadFile(file);
  });

  // Prefer already-authorized account without prompting
  if (window.ethereum) {
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      if (accounts[0]) {
        account = accounts[0] as Address;
        setChip(short(account));
      }
    } catch {
      /* ignore */
    }
  }

  await refreshGallery();
  await refreshPublishGate();
  await refreshDetail();
}

void boot();

