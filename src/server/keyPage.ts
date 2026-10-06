import { CAPS_MIND_NFT } from '../capsMindNft.js';
import { escapeHtml } from './pages.js';

/** Owner page for the deployed CAPs Mind key NFT: set the art, mint key #1, manage metadata. */
export function keyPageBody(opts: { blobUpload: boolean }): string {
  const c = CAPS_MIND_NFT;
  const addr = escapeHtml(c.address);
  const metaUrl = escapeHtml(c.siteOrigin + c.defaultMetadataPath);
  const imgUrl = escapeHtml(c.defaultImagePath);
  const uploadBlock = opts.blobUpload
    ? `<label class="choice"><input type="radio" name="artMode" value="upload"/> Upload a new image</label>
      <div class="sub" data-mode="upload">
        <input id="artFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"/>
        <p class="note">Uploads to this site's Vercel Blob storage. The key's metadata (name, description, image link) is then stored on chain as a data URI, so no extra JSON file is needed.</p>
      </div>`
    : `<p class="note">Uploading from this page is off because this site has no Vercel Blob storage set up. To change the committed art, replace <code>public/key/caps-mind-key.jpg</code> in the repo and redeploy, or paste a hosted image link below.</p>`;
  return `
<style>
.keygrid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:860px){ .keygrid { grid-template-columns:1fr; } }
.panel h2 { margin:0 0 10px; font-size:16px; letter-spacing:.04em; }
.panel h2 .step { color:var(--accent2); font-size:11px; letter-spacing:.18em; display:block; margin-bottom:2px; }
.mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; }
.kv span:last-child { text-align:right; }
.note { color:var(--dim); font-size:12px; margin:8px 0 0; }
.choice { display:flex; gap:8px; align-items:center; text-transform:none; letter-spacing:0; font-size:14px; color:var(--text); margin:10px 0 4px; }
.choice input { width:auto; }
.sub { margin:4px 0 8px 24px; }
.uribox { background:#0b1220; border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-top:6px; }
.keyart { border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#0b1220; margin-top:10px; }
.keyart img { width:100%; display:block; }
.msg { margin-top:12px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0b1220; font-size:13px; display:none; }
.msg.show { display:block; }
.msg.bad { border-color:var(--bad); color:var(--bad); }
.msg.ok { border-color:var(--ok); color:var(--ok); }
.msg a { color:inherit; text-decoration:underline; }
.warn { border-left-color:#f59e0b; }
.warn b { color:#fbbf24; }
details summary { cursor:pointer; color:var(--accent2); }
</style>

<div class="banner"><b>CAPs Mind key owner page.</b> Connect the contract owner wallet on Base, check the key art, then mint key #1. Every button opens your wallet to sign. Nothing is sent until you approve it there.</div>
<div class="banner warn" id="ownerWarn" style="display:none"></div>

<section class="keygrid">
  <div class="panel">
    <h2><span class="step">CONTRACT</span>CAPs Mind on Base</h2>
    <div class="kv"><span>Address</span><span class="mono"><a href="${escapeHtml(c.explorer)}/address/${addr}" target="_blank" rel="noopener">${addr}</a></span></div>
    <div class="kv"><span>Name / symbol</span><span id="stName">Loading…</span></div>
    <div class="kv"><span>Owner</span><span class="mono" id="stOwner">Loading…</span></div>
    <div class="kv" id="stPendingRow" style="display:none"><span>Pending owner</span><span class="mono" id="stPending"></span></div>
    <div class="kv"><span>Key #1 minted</span><span id="stGenesis">Loading…</span></div>
    <div class="kv"><span>Total minted</span><span id="stTotal">Loading…</span></div>
    <div class="kv"><span>Base URI</span><span class="mono" id="stBase">Loading…</span></div>
    <div id="stToken1" style="display:none">
      <div class="kv"><span>Key #1 holder</span><span class="mono" id="stToken1Owner"></span></div>
      <div class="kv"><span>Key #1 tokenURI</span><span class="mono" id="stToken1Uri"></span></div>
      <div class="keyart" id="stToken1ArtWrap" style="display:none"><img id="stToken1Art" alt="Key #1 art from tokenURI"/></div>
    </div>
    <div class="row"><button type="button" id="refreshBtn">Refresh</button></div>
  </div>

  <div class="panel">
    <h2><span class="step">WALLET</span>Your wallet</h2>
    <div class="row" style="margin-top:0">
      <button type="button" id="connectBtn" class="primary">Connect wallet</button>
      <button type="button" id="switchBtn" style="display:none">Switch to Base</button>
    </div>
    <div class="kv"><span>Connected</span><span class="mono" id="wAddr">Not connected</span></div>
    <div class="kv"><span>Network</span><span id="wChain">-</span></div>
    <div class="kv"><span>Contract owner?</span><span id="wIsOwner">-</span></div>
    <div class="kv"><span>GEAR balance</span><span id="wGear">-</span></div>
    <div class="kv"><span>canMint</span><span id="wCanMint">-</span></div>
    <p class="note">Works with Rabby (including Ledger through Rabby), Coinbase Wallet, and MetaMask browser extensions. If more than one is installed, the one that controls <code>window.ethereum</code> is used.</p>
  </div>
</section>

<section class="keygrid" style="margin-top:16px">
  <div class="panel">
    <h2><span class="step">STEP 1</span>Key image</h2>
    <label class="choice"><input type="radio" name="artMode" value="default" checked/> Use the committed CAP vault art (recommended)</label>
    <div class="sub" data-mode="default">
      <p class="note">Static files in this repo, served by this site: <code>${imgUrl}</code> and its metadata JSON. No upload needed.</p>
    </div>
    ${uploadBlock}
    <label class="choice"><input type="radio" name="artMode" value="imageUrl"/> Use an image link (https:// or ipfs://)</label>
    <div class="sub" data-mode="imageUrl">
      <input id="artImageUrl" placeholder="https://… or ipfs://…"/>
      <p class="note">The metadata (name, description, this image) is stored on chain as a data URI.</p>
    </div>
    <label class="choice"><input type="radio" name="artMode" value="metaUrl"/> Use my own metadata JSON link</label>
    <div class="sub" data-mode="metaUrl">
      <input id="artMetaUrl" placeholder="https://…/metadata.json or ipfs://…"/>
    </div>
    <div class="keyart"><img id="artPreview" src="${imgUrl}" alt="CAPs Mind key art preview"/></div>
    <label>Metadata URI that will be sent</label>
    <div class="uribox mono" id="uriOut">${metaUrl}</div>
    <p class="note" id="uriResult"></p>
    <details style="margin-top:10px"><summary>Metadata preview</summary><pre class="uribox mono" id="metaPreview" style="white-space:pre-wrap;margin:6px 0 0">Loading…</pre></details>
  </div>

  <div class="panel">
    <h2><span class="step">STEP 2</span>Mint key #1</h2>
    <p class="note" style="margin-top:0">Calls <code>ownerGenesisMint(metadataURI)</code> from the owner wallet. Key #1 goes to the owner wallet, no GEAR needed, gas only.</p>
    <div class="row"><button type="button" id="genesisBtn" class="primary" disabled>Mint key #1</button></div>
    <p class="note" id="genesisWhy"></p>

    <h2 style="margin-top:22px"><span class="step">OWNER</span>Metadata controls</h2>
    <label for="setUriId">Set a key's tokenURI to the URI from step 1</label>
    <div class="row" style="margin-top:0">
      <input id="setUriId" type="number" min="1" value="1" style="width:110px"/>
      <button type="button" id="setTokenUriBtn" disabled>Set tokenURI</button>
    </div>
    <p class="note">Calls <code>setTokenURI(id, metadataURI)</code>. Use this to change the art of a key after it is minted.</p>
    <details style="margin-top:12px"><summary>Base URI (advanced)</summary>
      <p class="note">Leave the base URI empty. While it is set, every key's tokenURI becomes base URI + its own URI, which breaks full links like the one above.</p>
      <input id="baseUriIn" placeholder="empty"/>
      <div class="row"><button type="button" id="setBaseBtn" disabled>Set base URI</button></div>
    </details>
    <details style="margin-top:12px" id="ownerDetails"><summary>Contract ownership</summary>
      <p class="note">Two steps: the current owner calls <code>transferOwnership(newOwner)</code>, then the new owner wallet connects here and calls <code>acceptOwnership()</code>. Ownership does not move until it is accepted.</p>
      <input id="newOwnerIn" value="${escapeHtml(c.plannedOwner)}"/>
      <div class="row">
        <button type="button" id="transferBtn" disabled>Start transfer</button>
        <button type="button" id="acceptBtn" disabled>Accept ownership</button>
      </div>
    </details>
    <div class="msg" id="txMsg"></div>
  </div>
</section>
<script>window.__KEY_PAGE__=${JSON.stringify({ blobUpload: opts.blobUpload })};</script>`;
}
