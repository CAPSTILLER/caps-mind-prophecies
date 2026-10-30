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
</style>
<section>
  <h1 style="margin:4px 0 2px">Face Maker</h1>
  <p class="fm-locked" style="margin-top:0">Engrave a face onto your CAPs Rock's blank tablet with the CAPs mind laser. Anyone can preview any face. Only the rock's owner can mint one, and the files and print video unlock after minting.</p>
  <div class="fm-tabs" role="tablist">
    <button type="button" id="tabWallet" class="on" role="tab">Wallet face</button>
    <button type="button" id="tabCustom" role="tab">Custom face</button>
  </div>
  <div class="fm-grid">
    <div>
      <div class="panel fm-stage"><canvas id="stage" width="1200" height="900" aria-label="Engraving preview"></canvas>
        <div class="row">
          <button type="button" class="fm-btn primary" id="engraveBtn">▶ Watch the print</button>
          <label class="fm-locked"><input type="checkbox" id="fastChk"/> fast</label>
          <span class="fm-locked" id="hashOut"></span>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3 style="margin:0 0 8px">On your rock</h3>
        <canvas id="rock" width="800" height="560" style="width:100%;height:auto;border-radius:12px;background:#05070c"></canvas>
      </div>
    </div>
    <div>
      <div class="panel fm-ctl" id="walletCtl">
        <h3 style="margin:0">Wallet face</h3>
        <p class="fm-traits" style="margin:4px 0 0">Generated from a wallet address alone. One face per wallet: only that wallet can mint it, once.</p>
        <label for="addrIn">Wallet address (connect, or paste any address to preview)</label>
        <input id="addrIn" placeholder="0x…" autocomplete="off" spellcheck="false"/>
        <div class="fm-traits" id="traitsOut"></div>
      </div>
      <div class="panel fm-ctl fm-hidden" id="customCtl">
        <h3 style="margin:0">Custom face</h3>
        <p class="fm-traits" style="margin:4px 0 0">Build your own face from the kit pieces: pick, place, move and flip each one, then mint. Everything is engraved flat into the stone.</p>
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
      <div class="panel" style="margin-top:16px">
        <h3 style="margin:0 0 6px">Mint to your rock</h3>
        <div class="fm-traits">CAPs Rocks <a href="https://basescan.org/address/${CAPS_ROCKS_ADDRESS}" target="_blank" rel="noopener">${CAPS_ROCKS_ADDRESS.slice(0, 6)}…${CAPS_ROCKS_ADDRESS.slice(-4)}</a> on Base</div>
        <div class="fm-ctl"><label for="rockSel">Your rock</label><select id="rockSel"><option value="">Connect your wallet to find your rocks</option></select></div>
        <div class="row"><button type="button" class="fm-btn primary" id="mintBtn" disabled>Mint face</button></div>
        <div class="fm-stub fm-hidden" id="stubNote"></div>
        <div class="fm-msg" id="mintMsg"></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3 style="margin:0 0 6px">Export</h3>
        <p class="fm-locked" id="exportLock">Unlocks after this face is minted to a rock you own.</p>
        <div class="row">
          <button type="button" class="fm-btn" id="vidBtn" disabled>🎬 Print video</button>
          <button type="button" class="fm-btn" id="pngBtn" disabled>PNG</button>
          <button type="button" class="fm-btn" id="svgBtn" disabled>SVG</button>
        </div>
        <div class="fm-msg" id="exportMsg"></div>
      </div>
    </div>
  </div>
</section>`;
}
