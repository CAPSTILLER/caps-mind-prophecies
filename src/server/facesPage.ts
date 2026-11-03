/** Face Maker page body (/faces). Client logic lives in web/faces-page.ts. */
export const CAPS_ROCKS_ADDRESS = '0x0fa575fd563517549e714acde968051a7310aadb';

export function facesPageBody(): string {
  return `<style>
.fm-tabs { display:flex; gap:8px; margin:6px 0 14px; }
.fm-tabs button, .fm-btn { background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:999px; padding:9px 16px; font:inherit; cursor:pointer; }
.fm-tabs button.on, .fm-btn.primary { background:var(--walletBlue); border-color:var(--walletBlue); color:#fff; }
.fm-btn:disabled { opacity:.45; cursor:not-allowed; }
.fm-grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:16px; }
@media (max-width:860px){ .fm-grid { grid-template-columns:1fr; } }
.fm-stage canvas { width:100%; height:auto; display:block; border-radius:12px; background:#05070c; }
.fm-ctl label { display:block; color:var(--dim); font-size:13px; margin:10px 0 4px; }
.fm-ctl select, .fm-ctl input { width:100%; background:#0a0f1a; color:var(--text); border:1px solid var(--line); border-radius:10px; padding:9px; font:inherit; }
.fm-pad { display:grid; grid-template-columns:repeat(3,44px); gap:6px; justify-content:start; margin-top:6px; }
.fm-pad button { height:40px; }
.fm-traits { font-size:13px; color:var(--dim); line-height:1.6; }
.fm-stub { border:2px dashed #f5b942; color:#f5d38a; border-radius:12px; padding:10px 12px; font-size:13px; margin-top:10px; }
.fm-msg { font-size:13px; margin-top:8px; min-height:1.2em; }
.fm-hidden { display:none !important; }
.fm-locked { color:var(--dim); font-size:13px; }
.fm-coll { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-top:10px; }
.fm-card { border:1px solid var(--line); border-radius:12px; padding:8px; background:#0a0f1a; cursor:pointer; font-size:12px; color:var(--dim); }
.fm-card.sel { outline:2px solid var(--walletBlue); }
.fm-card canvas, .fm-card img { width:100%; height:auto; display:block; border-radius:8px; background:#24467f; }
.fm-card b { color:var(--text); }
.fm-badge { display:inline-block; background:var(--walletBlue); color:#fff; border-radius:999px; padding:1px 8px; font-size:11px; margin-left:4px; }
.fm-badge.sim { background:#f5b942; color:#111; }
.fm-badge.exploit { background:#d9463b; color:#fff; }
.fm-step { font-size:12px; letter-spacing:.08em; color:var(--walletBlue); text-transform:uppercase; }
</style>
<section>
  <h1 style="margin:4px 0 2px">Face Maker</h1>
  <p class="fm-locked" style="margin-top:0">Connect your wallet, pick one of your CAPs Rocks, and see every face collected on it. Add faces, choose which one the rock displays, and download your faces as images, with that face.</p>

  <div class="panel fm-ctl">
    <div class="fm-step">1 · Your rock</div>
    <label for="rockSel">CAPs Rocks <a href="https://basescan.org/address/${CAPS_ROCKS_ADDRESS}" target="_blank" rel="noopener">${CAPS_ROCKS_ADDRESS.slice(0, 6)}…${CAPS_ROCKS_ADDRESS.slice(-4)}</a> on Base held by your wallet</label>
    <select id="rockSel"><option value="">Connect your wallet to find your rocks</option></select>
    <div class="fm-traits" id="rockInfo"></div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="fm-step">2 · Face collection</div>
    <p class="fm-locked" id="collNote" style="margin:4px 0 0">Pick a rock to see its faces.</p>
    <div class="fm-coll" id="coll"></div>
    <div class="row" style="margin-top:10px"><button type="button" class="fm-btn primary" id="activeBtn" disabled>Display this face on the rock</button></div>
    <div class="fm-stub fm-hidden" id="activeStub"></div>
    <div class="fm-msg" id="activeMsg"></div>
  </div>

  <div class="fm-grid" style="margin-top:16px">
    <div>
      <div class="panel fm-stage"><canvas id="stage" width="1200" height="900" aria-label="Engraving preview"></canvas>
        <div class="row">
          <button type="button" class="fm-btn primary" id="engraveBtn">▶ Watch the print</button>
          <label class="fm-locked"><input type="checkbox" id="fastChk"/> fast</label>
          <span class="fm-locked" id="hashOut"></span>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3 style="margin:0 0 8px" id="rockTitle">On your rock</h3>
        <canvas id="rock3d" style="width:100%;aspect-ratio:10/7;display:block;border-radius:12px;background:#05070c;touch-action:none"></canvas>
        <div id="rock3dLock" hidden style="text-align:center"><img id="rock3dImg" alt="Rock face" style="width:60%;max-width:340px;image-rendering:pixelated;border-radius:12px;background:#05070c"><p class="fm-locked" style="margin:6px 0">The 3D rock is shown only to its holder.</p><button class="fm-btn" id="rock3dSign" hidden>Sign to view my rock in 3D (free, no transaction)</button></div>
        <p class="fm-locked" id="rock3dMsg" style="margin:6px 0 0">Drag to orbit · pinch or scroll to zoom. Tap a face in the collection to try it on.</p>
        <canvas id="rock" width="800" height="560" style="display:none"></canvas>
      </div>
    </div>
    <div>
      <div class="panel fm-ctl">
        <div class="fm-step">3 · Add a face to this rock</div>
        <div class="fm-tabs" role="tablist" style="margin-top:8px">
          <button type="button" id="tabWallet" class="on" role="tab">Wallet face</button>
          <button type="button" id="tabCustom" role="tab">Custom face</button>
        </div>
        <div id="walletCtl">
          <p class="fm-traits" style="margin:0">Your wallet face is generated from your wallet address alone. Each wallet can put its face on a rock once. Free for the wallet that forged the rock; any other wallet holding the rock pays GEAR.</p>
          <label for="addrIn">Wallet address (your connected wallet, or paste any address to preview)</label>
          <input id="addrIn" placeholder="0x…" autocomplete="off" spellcheck="false"/>
          <div class="fm-traits" id="traitsOut"></div>
        </div>
        <div id="customCtl" class="fm-hidden">
          <p class="fm-traits" style="margin:0">Build your own face from the kit pieces: pick, place, move and flip each one, then add it to the rock.</p>
          <label for="borderSel">Border</label><select id="borderSel"></select>
          <label for="eyeSel">Eyes</label><select id="eyeSel"></select>
          <label for="browSel">Brows</label><select id="browSel"></select>
          <label for="noseSel">Nose</label><select id="noseSel"></select>
          <label for="mouthSel">Mouth</label><select id="mouthSel"></select>
          <label for="moveSel">Selected piece</label><select id="moveSel"><option value="eye">Eyes</option><option value="brow">Brows</option><option value="nose">Nose</option><option value="mouth">Mouth</option></select>
          <div class="fm-pad"><span></span><button type="button" class="fm-btn" data-mv="0,-2">↑</button><span></span><button type="button" class="fm-btn" data-mv="-2,0">←</button><button type="button" class="fm-btn" data-mv="mirror" title="Flip eyes/brows">⇋</button><button type="button" class="fm-btn" data-mv="2,0">→</button><span></span><button type="button" class="fm-btn" data-mv="0,2">↓</button><span></span></div>
          <label for="codeIn">Face code (share / load)</label>
          <input id="codeIn" spellcheck="false"/>
          <div class="fm-msg" id="customMsg"></div>
        </div>
        <div class="row" style="margin-top:10px"><button type="button" class="fm-btn primary" id="mintBtn" disabled>Add face</button></div>
        <div class="fm-stub fm-hidden" id="stubNote"></div>
        <div class="fm-msg" id="mintMsg"></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="fm-step">4 · Download face image</div>
        <p class="fm-locked" id="exportLock">Select a face on your rock. Only the rock's holder can download its faces (sign a free message, no transaction). 3D files are exported on rocks.gearup.wtf.</p>
        <div class="row">
          <button type="button" class="fm-btn primary" id="pngBtn" disabled>Download face image (HD PNG)</button>
          <button type="button" class="fm-btn" id="pngNativeBtn" disabled>Native PNG (1:1)</button>
          <button type="button" class="fm-btn" id="vidBtn" disabled>🎬 Print video</button>
        </div>
        <div class="fm-msg" id="exportMsg"></div>
      </div>
    </div>
  </div>
</section>`;
}
