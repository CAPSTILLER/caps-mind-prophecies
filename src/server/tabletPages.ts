import {
  PREVIEW_PROPHECIES,
  TABLETS,
  displayImageUrl,
  pendingPreviews,
  priceForSerial,
  type PreviewProphecy,
  type Tablet,
} from '../tablets.js';
import type { TabletsState } from './chain.js';
import { escapeHtml } from './pages.js';

const T = TABLETS;

function shortAddr(a: string) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function addrLink(a: string) {
  return `<a class="mono" href="${T.explorer}/address/${escapeHtml(a)}" target="_blank" rel="noopener">${escapeHtml(shortAddr(a))}</a>`;
}

function day(ts: number) {
  return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '-';
}

/** JSON safe to drop inside a <script> tag. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export const TABLET_STYLES = `<style>
.mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; }
.note { color:var(--dim); font-size:12px; margin:8px 0 0; }
.title { font-weight:800; letter-spacing:.06em; }
/* warn banner */
.banner.warn { border-left-color:#f59e0b; }
.banner.warn b { color:#fbbf24; }
.badge { display:inline-block; font-size:11px; letter-spacing:.12em; text-transform:uppercase; border:1px solid var(--line); border-radius:999px; padding:3px 9px; color:var(--dim); }
.badge.live { border-color:var(--ok); color:var(--ok); }
.badge.soon { border-color:#f59e0b; color:#fbbf24; }
.card .shotlink { display:block; }
.card.preview .shot { opacity:.85; }
.card button { width:100%; }
.msg { margin-top:10px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0b1220; font-size:13px; display:none; }
.msg.show { display:block; }
.msg.bad { border-color:var(--bad); color:var(--bad); }
.msg.ok { border-color:var(--ok); color:var(--ok); }
.msg a { color:inherit; text-decoration:underline; }
textarea.plain, input.plain { text-transform:none; letter-spacing:0; }
.split { display:grid; grid-template-columns:1.1fr .9fr; gap:16px; }
@media (max-width:860px){ .split { grid-template-columns:1fr; } }
h2.sec { margin:26px 0 10px; font-size:18px; }
select { width:100%; border-radius:10px; border:1px solid var(--line); background:#0b1220; color:var(--text); padding:10px 12px; font:inherit; }
</style>`;

function tabletCard(t: Tablet): string {
  const img = escapeHtml(displayImageUrl(t.imageURI));
  return `<div class="card" data-tablet-card="${t.id}">
  <a class="shotlink" href="/tablet/${t.id}"><img class="shot" src="${img}" alt="Prophecy Tablet ${t.id}" loading="lazy"/></a>
  <div class="body">
    <div class="meta"><span class="title">Tablet #${t.id}</span><span class="badge live">Onchain</span></div>
    <div class="desc">${escapeHtml(t.description)}</div>
    <div class="meta"><span data-minted="${t.id}">${t.minted} ${t.minted === 1 ? 'copy' : 'copies'} minted</span><span data-price="${t.id}">${t.nextPriceWholeGear} GEAR next</span></div>
    <button type="button" class="primary" data-mint="${t.id}">Connect wallet to mint</button>
    <div class="msg" data-mint-msg="${t.id}"></div>
    <div class="meta"><a href="/tablet/${t.id}">Details</a><span></span></div>
  </div>
</div>`;
}

function previewCard(p: PreviewProphecy): string {
  return `<div class="card preview">
  <a class="shotlink" href="/preview/${p.n}"><img class="shot" src="${escapeHtml(p.path)}" alt="Prophecy ${p.n} preview" loading="lazy"/></a>
  <div class="body">
    <div class="meta"><span class="title">Prophecy ${p.n}</span><span class="badge soon">Not yet onchain</span></div>
    <div class="desc">${escapeHtml(p.description)}</div>
    <div class="meta"><span>Preview only. Minting opens once it is published as a tablet.</span></div>
    <a class="btn" href="/publish#publishPanel" style="text-align:center">Publish this tablet</a>
  </div>
</div>`;
}

function copyLookup(): string {
  return `<section class="panel" style="margin-top:22px">
  <h2 style="margin:0 0 6px;font-size:16px">Look up a copy</h2>
  <p class="note" style="margin-top:0">Every copy has a token ID. Enter one to see which tablet it is, its serial number and holder.</p>
  <div class="row">
    <input id="lookupId" type="number" min="1" placeholder="Token ID" style="width:160px"/>
    <button type="button" id="lookupBtn">Look up</button>
  </div>
  <div class="msg" id="lookupMsg"></div>
</section>`;
}

function connectBar(): string {
  return `<div class="row" style="margin-top:0;margin-bottom:14px">
  <span class="meta" id="walletLine">Use the wallet button at the top to connect on Base. You pay in GEAR.</span>
</div>`;
}

/** Home page: onchain tablets with mint buttons, then previews that are not onchain yet. */
export function galleryBody(state: TabletsState | null, readError: string | null): string {
  const tablets = state?.tablets ?? [];
  const pending = state ? pendingPreviews(tablets) : PREVIEW_PROPHECIES;
  const contract = `<a class="mono" href="${T.explorer}/address/${T.address}" target="_blank" rel="noopener">${shortAddr(T.address)}</a>`;
  let notice = '';
  if (readError) {
    notice = `<div class="banner warn"><b>Could not read Base right now.</b> Showing previews only. Reload in a moment.</div>`;
  } else if (state?.paused) {
    notice = `<div class="banner warn"><b>Paused.</b> The contract owner has paused the contract, so minting is stopped for now.</div>`;
  }
  const onchain = tablets.length
    ? `<div class="grid" id="tabletGrid">${tablets.map(tabletCard).join('')}</div>`
    : `<div class="empty">${readError ? 'Tablets will show here once Base answers.' : 'No tablets are onchain yet. The first one shows up here as soon as a CAPs Mind key holder publishes it.'}</div>`;
  const previews = pending.length
    ? `<h2 class="sec">Coming soon <span class="badge soon">Not yet onchain</span></h2>
<div class="grid">${pending.map(previewCard).join('')}</div>`
    : '';
  return `${TABLET_STYLES}
<div class="banner"><b>CAPs Mind Prophecy Tablets on Base.</b> Contract ${contract}. Each tablet has its own price curve: copy 1 costs 1 GEAR, copy 2 costs 2, then 4, 8 and so on, capped at ${T.maxPriceGear} GEAR. Minting takes two taps: Approve (the exact GEAR price), then Mint once Base confirms the approval.</div>
${notice}
${connectBar()}
<section>
  <h1 style="margin:0 0 12px;font-size:22px">Tablets${state ? ` <span class="badge">${state.tabletCount} onchain</span>` : ''}</h1>
  ${onchain}
</section>
${previews}
${copyLookup()}
<script>window.__TABLETS_PAGE__=${scriptJson({ page: 'gallery' })};</script>`;
}

/** Detail page for one onchain tablet. */
export function tabletDetailBody(id: number, t: Tablet | null, state: Pick<TabletsState, 'paused'> | null, readError: string | null): string {
  if (!t) {
    const preview = PREVIEW_PROPHECIES.find((p) => p.n === id);
    const why = readError
      ? 'Could not read Base right now. Reload in a moment.'
      : `Tablet #${id} is not published onchain yet.`;
    return `${TABLET_STYLES}
<div class="empty">${escapeHtml(why)}${preview && !readError ? ` See the <a href="/preview/${preview.n}">Prophecy ${preview.n} preview</a>.` : ''} <a href="/">Back to tablets</a></div>`;
  }
  const img = escapeHtml(displayImageUrl(t.imageURI));
  const paused = state?.paused
    ? `<div class="banner warn"><b>Paused.</b> The contract owner has paused the contract, so minting is stopped for now.</div>`
    : '';
  const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => priceForSerial(n)).join(', ');
  return `${TABLET_STYLES}
${paused}
<section class="split" data-tablet-card="${t.id}">
  <div class="tablet-frame">
    <img src="${img}" alt="Prophecy Tablet ${t.id}"/>
    <div class="tablet-text">${escapeHtml(t.description)}</div>
  </div>
  <div class="panel">
    <div class="meta"><h1 style="margin:0 0 8px;font-size:20px">Prophecy Tablet ${t.id}</h1><span class="badge live">Onchain</span></div>
    <div class="kv"><span>Copies minted</span><span data-minted="${t.id}">${t.minted}</span></div>
    <div class="kv"><span>Next copy</span><span data-price="${t.id}">#${t.minted + 1} for ${t.nextPriceWholeGear} GEAR</span></div>
    <div class="kv"><span>Published by</span><span>${addrLink(t.publisher)} with key #${t.keyId}</span></div>
    <div class="kv"><span>Published</span><span>${day(t.publishedAt)}</span></div>
    ${t.updatedAt && t.updatedAt !== t.publishedAt ? `<div class="kv"><span>Last edited</span><span>${day(t.updatedAt)}</span></div>` : ''}
    <div class="kv"><span>Image link</span><span class="mono">${escapeHtml(t.imageURI)}</span></div>
    <div class="row">
      <button type="button" class="primary" data-mint="${t.id}">Connect wallet to mint</button>
    </div>
    <span class="meta" id="walletLine"></span>
    <div class="msg" data-mint-msg="${t.id}"></div>
    <p class="note">Copies 1 to 11 cost ${prices} GEAR, then ${T.maxPriceGear} GEAR each. Each copy is its own NFT named "Prophecy Tablet ${t.id} #serial". Payment splits 90% treasury / 10% GearVault.</p>
    <p><a href="/">Back to tablets</a></p>
  </div>
</section>
<script>window.__TABLETS_PAGE__=${scriptJson({ page: 'tablet', id: t.id })};</script>`;
}

/** Preview page for one of Cap's prophecies that may not be onchain yet. */
export function previewBody(p: PreviewProphecy, onchain: Tablet | undefined): string {
  const status = onchain
    ? `<div class="banner"><b>This prophecy is onchain</b> as <a href="/tablet/${onchain.id}">Tablet #${onchain.id}</a>. Mint copies there.</div>`
    : `<div class="banner warn"><b>Not yet onchain.</b> This is a preview. Minting opens once a CAPs Mind key holder publishes it as a tablet.</div>`;
  return `${TABLET_STYLES}
${status}
<section class="split">
  <div class="tablet-frame">
    <img src="${escapeHtml(p.path)}" alt="Prophecy ${p.n}"/>
    <div class="tablet-text">${escapeHtml(p.description)}</div>
  </div>
  <div class="panel">
    <div class="meta"><h1 style="margin:0 0 8px;font-size:20px">Prophecy ${p.n}</h1><span class="badge ${onchain ? 'live">Onchain' : 'soon">Not yet onchain'}</span></div>
    <label>Image link to publish</label>
    <div class="mono">${escapeHtml(p.imageURI)}</div>
    <label>Description</label>
    <div class="mono" style="white-space:pre-wrap">${escapeHtml(p.description)}</div>
    <div class="row">${onchain ? `<a class="btn primary" href="/tablet/${onchain.id}">Go to Tablet #${onchain.id}</a>` : `<a class="btn primary" href="/publish#publishPanel">Publish this tablet</a>`}</div>
    <p><a href="/">Back to tablets</a></p>
  </div>
</section>`;
}

/** Publish and edit page for CAPs Mind key holders. All checks run in the browser against Base. */
export function publishBody(opts: { blobUpload: boolean }): string {
  const upload = opts.blobUpload
    ? `<label for="imageFile">Or upload an image</label>
  <input id="imageFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"/>
  <p class="note">Uploads to this site's storage and fills in the https link. For permanence, an ipfs:// link is best.</p>`
    : '';
  return `${TABLET_STYLES}
<div class="banner"><b>Publish a prophecy tablet.</b> Connect a wallet that holds a CAPs Mind key, pick the key, add an image link (https:// or ipfs://) and the description, then sign. The tablet becomes the next tablet number and anyone can mint copies right away. Every button opens your wallet to sign. Nothing is sent until you approve it there.</div>

<section class="panel">
  <h2 style="margin:0 0 6px;font-size:16px">1. Wallet and key</h2>
  <p class="note" style="margin-top:0">Use the wallet button at the top to connect or disconnect.</p>
  <div class="row" style="margin-top:0">
    <button type="button" id="switchBtn" style="display:none">Switch to Base</button>
  </div>
  <div class="kv"><span>Connected</span><span class="mono" id="pubAddr">Not connected</span></div>
  <div class="kv"><span>Network</span><span id="pubChain">-</span></div>
  <div class="kv"><span>Publishing</span><span id="pubOpen">Checking…</span></div>
  <div class="kv"><span>Tablets onchain</span><span id="pubCount">Checking…</span></div>
  <label for="keySelect">CAPs Mind key to use</label>
  <select id="keySelect" disabled><option value="">Connect a wallet first</option></select>
  <div class="msg show" id="gateMsg">Tap Connect wallet at the top and pick the wallet that holds your CAPs Mind key.</div>
</section>

<section class="panel" style="margin-top:16px" id="publishPanel">
  <h2 style="margin:0 0 6px;font-size:16px">2. New tablet <span class="badge" id="nextTabletNo"></span></h2>
  <label for="imageUrl">Image link (https:// or ipfs://)</label>
  <input id="imageUrl" class="plain" placeholder="https://… or ipfs://…" autocomplete="off"/>
  ${upload}
  <div id="preview" style="margin-top:12px;display:none;max-width:420px" class="tablet-frame"><img id="previewImg" alt="Image preview"/></div>
  <label for="description">Description</label>
  <textarea id="description" class="plain" placeholder="The prophecy text" maxlength="${T.maxDescriptionBytes}"></textarea>
  <div class="meta"><span id="descBytes">0 / ${T.maxDescriptionBytes} bytes</span><span></span></div>
  <div class="row">
    <button type="button" id="publishBtn" class="primary" disabled>Publish tablet</button>
  </div>
  <div class="msg" id="publishMsg"></div>
</section>

<section class="panel" style="margin-top:16px" id="editPanel">
  <h2 style="margin:0 0 6px;font-size:16px">3. Edit a tablet</h2>
  <p class="note" style="margin-top:0">Changes the image and description of every copy of a tablet at once. Any wallet with an eligible CAPs Mind key can edit any tablet. Uses the key picked in step 1.</p>
  <label for="editTablet">Tablet</label>
  <select id="editTablet" disabled><option value="">No tablets onchain yet</option></select>
  <label for="editImageUrl">New image link (https:// or ipfs://)</label>
  <input id="editImageUrl" class="plain" placeholder="https://… or ipfs://…" autocomplete="off"/>
  <div id="editPreview" style="margin-top:12px;display:none;max-width:420px" class="tablet-frame"><img id="editPreviewImg" alt="Image preview"/></div>
  <label for="editDescription">New description</label>
  <textarea id="editDescription" class="plain" maxlength="${T.maxDescriptionBytes}"></textarea>
  <div class="meta"><span id="editDescBytes">0 / ${T.maxDescriptionBytes} bytes</span><span></span></div>
  <div class="row">
    <button type="button" id="updateBtn" class="primary" disabled>Save changes to tablet</button>
  </div>
  <div class="msg" id="updateMsg"></div>
</section>
<script>window.__TABLETS_PAGE__=${scriptJson({ page: 'publish', blobUpload: opts.blobUpload })};</script>`;
}

