// @ts-nocheck -- DOM glue for /faces. Engine (canonical CAPs Rocks face generators) is in src/faces/engine.ts.
import { createPublicClient, createWalletClient, custom, fallback, http, getAddress, isAddress } from 'viem';
import { base } from 'viem/chains';
import { initWalletUi, explainWalletError } from './walletUi.js';
import { createRockViewer } from './rock3d.js';
import { GW, GH, WALLET_FACE_VERSION, CUSTOM, ORDER, traits, composeWallet, traitNames, composeCustom, encodeLayout, decodeLayout, centerX, DEFAULT_LAYOUT, contentHash, renderSvg, engraveRuns, bitmapFromSvg } from '../src/faces/engine.js';

const ROCKS = '0x0fa575fd563517549e714acde968051a7310aadb';
const FACE_T = { type: 'tuple', components: [{ name: 'kind', type: 'uint8' }, { name: 'seed', type: 'address' }, { name: 'generatorVersion', type: 'uint16' }, { name: 'variant', type: 'uint32' }, { name: 'addedAt', type: 'uint64' }, { name: 'contentHash', type: 'bytes32' }, { name: 'uri', type: 'string' }] };
const ABI = [
  { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'rockView', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'owner', type: 'address' },
    { name: 'avatar', type: 'tuple', components: [{ name: 'seed', type: 'address' }, { name: 'forgedAt', type: 'uint64' }, { name: 'generatorVersion', type: 'uint16' }, { name: 'tabletTokenId', type: 'uint256' }, { name: 'prophecyId', type: 'uint256' }] },
    { name: 'faceCount', type: 'uint256' }, { name: 'hasActiveFace', type: 'bool' }, { name: 'activeFaceIndex', type: 'uint256' },
    { name: 'poseCount', type: 'uint256' }, { name: 'hasActivePose', type: 'bool' }, { name: 'activePoseIndex', type: 'uint256' }] }] },
  { type: 'function', name: 'facesOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'tuple[]', components: FACE_T.components }] },
  { type: 'function', name: 'setActiveFace', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'index', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'addWalletFace', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'faceGeneratorVersion', type: 'uint16' }, { name: 'variant', type: 'uint32' }], outputs: [{ type: 'uint256' }] },
];
/** A wallet has exactly one wallet face (no moods): always version 1, variant 0. One copy per wallet per rock. */
const WALLET_VARIANT = 0;
const pub = createPublicClient({ chain: base, transport: fallback([http('https://mainnet.base.org'), http()]) });
const $ = (id) => document.getElementById(id);
const wallet = initWalletUi();

// ---------------- state ----------------
const S = { mode: 'wallet', addr: '', layout: structuredClone(DEFAULT_LAYOUT), face: null, rocks: [], rock: null, coll: [], sel: -1, view: 'builder', sim: {} };

function currentFace() {
  if (S.view === 'coll') { const c = S.coll[S.sel]; return c && c.bm ? c : null; }
  if (S.mode === 'wallet') {
    if (!isAddress(S.addr)) return null;
    const t = traits(getAddress(S.addr), WALLET_VARIANT, WALLET_FACE_VERSION), f = composeWallet(t);
    return { ...f, kind: 'wallet', t, hash: contentHash(f.bm), label: `wallet face ${S.addr.slice(0, 6)}…${S.addr.slice(-4)}` };
  }
  const f = composeCustom(S.layout);
  return { ...f, kind: 'custom', hash: contentHash(f.bm), code: encodeLayout(S.layout), label: 'custom ' + contentHash(f.bm).slice(0, 10) };
}

// ---------------- drawing ----------------
const stage = $('stage'), sx = stage.getContext('2d');
const PX = 4, OX = 120, OY = 130; // 1 mm = 4 canvas px; tablet 240x170 mm (+3.8 mm margins)
const engraved = document.createElement('canvas'); engraved.width = GW * PX; engraved.height = GH * PX;
const ex = engraved.getContext('2d');
function tabletPath(c, x, y, w, h, ch) { c.beginPath(); c.moveTo(x + ch, y); c.lineTo(x + w - ch, y); c.lineTo(x + w, y + ch); c.lineTo(x + w, y + h - ch); c.lineTo(x + w - ch, y + h); c.lineTo(x + ch, y + h); c.lineTo(x, y + h - ch); c.lineTo(x, y + ch); c.closePath(); }
function drawTablet(c, x, y, s) { // s = px per mm
  const w = 240 * s, h = 177.6 * s, g = c.createRadialGradient(x + w * 0.45, y + h * 0.4, 0, x + w * 0.45, y + h * 0.4, w * 0.75);
  g.addColorStop(0, '#2f5596'); g.addColorStop(1, '#24467f'); c.fillStyle = g; tabletPath(c, x, y, w, h, 6 * s); c.fill();
}
function paintBitmap(c, bm, x, y, s, upto = null) {
  c.fillStyle = '#eef2f5';
  for (let r = 0; r < GH; r++) { let i = 0; while (i < GW) { if (!bm[r * GW + i]) { i++; continue; } let e = i; while (e < GW && bm[r * GW + e]) e++; c.fillRect(x + i * s, y + r * s, (e - i) * s, s); i = e; } }
}
function frame(laser) {
  sx.fillStyle = '#05070c'; sx.fillRect(0, 0, stage.width, stage.height);
  // gantry rail
  sx.fillStyle = '#1a2233'; sx.fillRect(60, 40, stage.width - 120, 18);
  drawTablet(sx, OX, OY - 3.8 * PX, PX);
  sx.drawImage(engraved, OX, OY);
  if (laser) {
    const lx = OX + laser.x * PX, ly = OY + laser.y * PX + PX / 2;
    sx.fillStyle = '#2b3a55'; sx.fillRect(lx - 22, 34, 44, 30); // head carriage
    sx.fillStyle = '#0052ff'; sx.fillRect(lx - 6, 64, 12, 14);   // nozzle
    const beam = sx.createLinearGradient(0, 78, 0, ly); beam.addColorStop(0, 'rgba(0,82,255,.15)'); beam.addColorStop(1, 'rgba(60,130,255,.95)');
    sx.strokeStyle = beam; sx.lineWidth = 3; sx.beginPath(); sx.moveTo(lx, 78); sx.lineTo(lx, ly); sx.stroke();
    const glow = sx.createRadialGradient(lx, ly, 0, lx, ly, 26); glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.2, 'rgba(80,150,255,.9)'); glow.addColorStop(1, 'rgba(0,82,255,0)');
    sx.fillStyle = glow; sx.beginPath(); sx.arc(lx, ly, 26, 0, Math.PI * 2); sx.fill();
  }
  sx.fillStyle = '#8b9bb8'; sx.font = '22px system-ui, sans-serif';
  sx.fillText(laser ? `ENGRAVING · ${laser.pct}%` : (S.face ? 'CAPs mind · ' + S.face.label : S.view === 'coll' ? 'face file not loaded' : 'enter a wallet address'), OX, stage.height - 40);
  sx.textAlign = 'right'; sx.fillText('CAPs ROCKS · face tablet 240×170 mm', stage.width - OX, stage.height - 40); sx.textAlign = 'left';
}
const viewer3d = createRockViewer($('rock3d'), (m) => { $('rock3dMsg').textContent = m || 'Drag to orbit · pinch or scroll to zoom. Tap a face in the collection to try it on.'; });
const VIEW_TOK: Record<number, { token: string; exp: number }> = {};
function show3d() {
  const r = S.rock, acct = wallet.state.account, lock = $('rock3dLock'), cv = $('rock3d');
  const tok = r && VIEW_TOK[r.id] && VIEW_TOK[r.id].exp * 1000 > Date.now() + 60_000 ? VIEW_TOK[r.id].token : '';
  const open = !r || r.id === 1 || !!tok;
  cv.hidden = !open; lock.hidden = open;
  if (!open) { $('rock3dImg').src = `/api/rocks/${r.id}/face.png`; $('rock3dSign').hidden = !(acct && eq(r.owner, acct)); return; }
  viewer3d.setRock(r ? r.seed : '0x0000000000000000000000000000000000000001', tok); viewer3d.setFace(S.face ? S.face.bm : null);
}
$('rock3dSign').onclick = async () => {
  const r = S.rock, acct = wallet.state.account; if (!r || !acct) return;
  try {
    $('rock3dSign').disabled = true;
    const ch = await (await fetch(`/api/rocks/${r.id}/challenge?address=${acct}`)).json();
    const signature = await createWalletClient({ chain: base, transport: custom(wallet.provider()) }).signMessage({ account: getAddress(acct), message: ch.message });
    const j = await (await fetch(`/api/rocks/${r.id}/view-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct, message: ch.message, signature }) })).json();
    if (!j.token) throw new Error(j.error || 'could not verify holder');
    VIEW_TOK[r.id] = { token: j.token, exp: j.expiresAt }; show3d();
  } catch (e) { $('rock3dMsg').textContent = explainWalletError(e); } finally { $('rock3dSign').disabled = false; }
};
function showStatic() { ex.clearRect(0, 0, engraved.width, engraved.height); if (S.face) paintBitmap(ex, S.face.bm, 0, 0, PX); frame(null); drawRock(); }

let anim = null;
/** Play the print. Resolves when the laser finishes. fps-locked so a recording looks the same everywhere. */
function playPrint(seconds = $('fastChk').checked ? 3 : 9) {
  if (!S.face) return Promise.resolve();
  if (anim) anim.stop = true;
  const runs = engraveRuns(S.face.bm, S.face.layers), total = runs.length, frames = Math.max(1, Math.round(seconds * 30));
  const per = Math.ceil(total / frames); ex.clearRect(0, 0, engraved.width, engraved.height); ex.fillStyle = '#eef2f5';
  const me = { stop: false }; anim = me; let k = 0;
  return new Promise((res) => {
    let last = 0;
    const step = (ts) => {
      if (me.stop) return res();
      if (ts - last < 1000 / 30 - 2) { requestAnimationFrame(step); return; } last = ts;
      let cur = null;
      for (let n = 0; n < per && k < total; n++, k++) { const [y, x0, x1] = runs[k]; ex.fillRect(x0 * PX, y * PX, (x1 - x0) * PX, PX); cur = { x: (y & 1) ? x0 : x1, y }; }
      if (k < total) { frame({ ...cur, pct: Math.floor((k / total) * 100) }); requestAnimationFrame(step); }
      else { frame(null); drawRock(); anim = null; setTimeout(res, 400); }
    };
    requestAnimationFrame(step);
  });
}

// 2D rock preview: deterministic boulder silhouette with the tablet set into it.
const rock = $('rock'), rx = rock.getContext('2d');
function drawRock() {
  rx.fillStyle = '#05070c'; rx.fillRect(0, 0, rock.width, rock.height);
  const cx = 400, cy = 300, pts = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 230 + 26 * Math.sin(i * 2.7) + 14 * Math.cos(i * 5.3); pts.push([cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.95]); }
  const g = rx.createRadialGradient(cx - 90, cy - 120, 30, cx, cy, 340); g.addColorStop(0, '#7d8794'); g.addColorStop(0.6, '#4a525e'); g.addColorStop(1, '#262b33');
  rx.fillStyle = g; rx.beginPath(); pts.forEach(([x, y], i) => (i ? rx.lineTo(x, y) : rx.moveTo(x, y))); rx.closePath(); rx.fill();
  rx.fillStyle = 'rgba(0,0,0,.35)'; rx.beginPath(); rx.ellipse(cx, 530, 260, 22, 0, 0, Math.PI * 2); rx.fill();
  const s = 1.6, tx = cx - 120 * s, ty = cy - 100;
  drawTablet(rx, tx, ty, s);
  if (S.face) { const c = document.createElement('canvas'); c.width = GW; c.height = GH; paintBitmap(c.getContext('2d'), S.face.bm, 0, 0, 1); rx.imageSmoothingEnabled = false; rx.drawImage(c, tx, ty + 3.8 * s, GW * s, GH * s); }
  else { rx.strokeStyle = '#eef2f5'; rx.lineWidth = 5; tabletPath(rx, tx + 6, ty + 6, 240 * s - 12, 177.6 * s - 12, 8); rx.stroke(); }
}

// ---------------- controls ----------------
CUSTOM.borders.forEach((b, i) => $('borderSel').add(new Option(b.name, String(i))));
for (const t of ORDER) CUSTOM.parts[t].forEach((p, i) => $(t + 'Sel').add(new Option(p.name, String(i))));
$('browSel').add(new Option('None', '-1')); $('noseSel').add(new Option('None', '-1'));
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const eq = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function refresh() {
  let msg = '';
  try { S.face = currentFace(); } catch (e) { S.face = null; msg = String(e.message || e); }
  if (S.view === 'builder' && S.mode === 'custom') { $('customMsg').textContent = msg; $('customMsg').className = 'fm-msg ' + (msg ? 'bad' : ''); if (!msg) $('codeIn').value = S.face.code; }
  if (S.view === 'builder' && S.mode === 'wallet' && S.face) { const n = traitNames(S.face.t); delete n.mood; $('traitsOut').innerHTML = Object.entries(n).map(([k, v]) => `${k}: <b>${v === true ? 'yes' : v === false ? 'no' : v}</b>`).join(' · '); }
  else if (S.mode === 'wallet') $('traitsOut').textContent = '';
  $('hashOut').textContent = S.face ? 'hash ' + S.face.hash.slice(0, 10) + '…' : '';
  $('rockTitle').textContent = S.rock ? `Rock #${S.rock.id} · ${S.view === 'coll' ? (S.coll[S.sel]?.active ? 'its displayed face' : 'previewing a collected face') : 'previewing a new face'}` : 'On your rock';
  if (!anim) showStatic();
  show3d();
  renderColl(); updateMint(); updateActive(); updateExport();
}
function viewBuilder() { if (S.view !== 'builder') { S.view = 'builder'; if (anim) anim.stop = true; anim = null; } }
function syncCustomSelects() {
  $('borderSel').value = String(S.layout.border);
  for (const t of ORDER) { const p = S.layout.parts.find((q) => q.t === t); $(t + 'Sel').value = p ? String(p.id) : '-1'; }
}
function setPart(t, id) {
  const old = S.layout.parts.find((q) => q.t === t), rest = S.layout.parts.filter((q) => q.t !== t);
  if (id < 0) { S.layout.parts = rest; return; }
  const yDef = { eye: 50, brow: 26, nose: 92, mouth: 112 }[t];
  rest.push({ t, id, x: centerX(t, id), y: old ? old.y : yDef, ...(old && old.mirror ? { mirror: true } : {}) }); S.layout.parts = rest;
}
$('tabWallet').onclick = () => setMode('wallet'); $('tabCustom').onclick = () => setMode('custom');
function setMode(m) { S.mode = m; viewBuilder(); $('tabWallet').classList.toggle('on', m === 'wallet'); $('tabCustom').classList.toggle('on', m === 'custom'); $('walletCtl').classList.toggle('fm-hidden', m !== 'wallet'); $('customCtl').classList.toggle('fm-hidden', m !== 'custom'); if (anim) anim.stop = true; anim = null; refresh(); }
$('addrIn').oninput = () => { S.addr = $('addrIn').value.trim(); viewBuilder(); refresh(); };
$('borderSel').onchange = () => { S.layout.border = Number($('borderSel').value); viewBuilder(); refresh(); };
for (const t of ORDER) $(t + 'Sel').onchange = () => { setPart(t, Number($(t + 'Sel').value)); viewBuilder(); refresh(); };
document.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
  const t = $('moveSel').value, p = S.layout.parts.find((q) => q.t === t); if (!p) return;
  if (b.dataset.mv === 'mirror') { if (t === 'eye' || t === 'brow') p.mirror ? delete p.mirror : (p.mirror = true); }
  else { const [dx, dy] = b.dataset.mv.split(',').map(Number); p.x = Math.max(0, Math.min(255, p.x + dx)); p.y = Math.max(0, Math.min(255, p.y + dy)); }
  viewBuilder(); refresh();
}));
$('codeIn').onchange = () => { try { const l = decodeLayout($('codeIn').value.trim()); composeCustom(l); S.layout = l; syncCustomSelects(); viewBuilder(); refresh(); } catch (e) { $('customMsg').textContent = 'That face code does not load: ' + (e.message || e); } };
$('engraveBtn').onclick = () => playPrint();

// ---------------- 1. rocks held by the wallet ----------------
async function loadRocks() {
  const acct = wallet.state.account; S.rocks = []; const sel = $('rockSel'); sel.innerHTML = '';
  if (!acct) { sel.add(new Option('Connect your wallet to find your rocks', '')); await selectRock(null); return; }
  sel.add(new Option('Looking for your rocks…', ''));
  try {
    const n = Number(await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'totalMinted' }));
    for (let id = 1; id <= Math.min(n, 500); id++) {
      const v = await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'rockView', args: [BigInt(id)] });
      if (!eq(v.owner, acct)) continue;
      S.rocks.push(await readRock(id, v));
    }
  } catch (e) { sel.innerHTML = ''; sel.add(new Option('Could not read CAPs Rocks: ' + (e.shortMessage || e.message), '')); return; }
  fillRockSel();
}
async function readRock(id, v) {
  v = v || (await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'rockView', args: [BigInt(id)] }));
  const faces = Number(v.faceCount) ? await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'facesOf', args: [BigInt(id), 0n, 1000n] }) : [];
  return { id, owner: v.owner, seed: v.avatar.seed, faces: [...faces], hasActive: v.hasActiveFace, active: Number(v.activeFaceIndex) };
}
function fillRockSel(keep) {
  const sel = $('rockSel'), acct = wallet.state.account; sel.innerHTML = '';
  if (!S.rocks.length) sel.add(new Option('No CAPs Rock in this wallet yet', ''));
  for (const r of S.rocks) sel.add(new Option(`Rock #${r.id}${eq(r.seed, acct) ? ' · forged by this wallet' : ''} · ${r.faces.length} face${r.faces.length === 1 ? '' : 's'}`, String(r.id)));
  if (keep) sel.value = String(keep);
  void selectRock(S.rocks.find((r) => String(r.id) === sel.value) || null);
}
$('rockSel').onchange = () => void selectRock(S.rocks.find((r) => String(r.id) === $('rockSel').value) || null);

// ---------------- 2. face collection ----------------
const gw = (u) => u.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + u.slice(7) : u;
async function faceFromChain(f, i, r) {
  const base = { i, onchain: true, seed: f.seed, active: r.hasActive && r.active === i };
  if (Number(f.kind) === 0) {
    const v = Number(f.generatorVersion), variant = Number(f.variant);
    if (v !== WALLET_FACE_VERSION) return { ...base, kind: 'wallet', label: `wallet face ${short(f.seed)} (generator v${v} not in this app)` };
    const t = traits(getAddress(f.seed), variant, v), c = composeWallet(t);
    return { ...base, ...c, kind: 'wallet', t, version: v, variant, hash: contentHash(c.bm), label: `wallet face ${short(f.seed)}`, free: eq(f.seed, r.seed) };
  }
  const out = { ...base, kind: 'custom', uri: f.uri, hash: f.contentHash, label: 'custom ' + f.contentHash.slice(0, 10) };
  try {
    const txt = await (await fetch(gw(f.uri))).text(), bm = bitmapFromSvg(txt);
    if (bm && contentHash(bm).toLowerCase() === f.contentHash.toLowerCase()) return { ...out, bm, layers: new Uint8Array(GW * GH).fill(7) };
    out.img = gw(f.uri); out.note = 'file loaded but not a CAPs face bitmap';
  } catch { out.note = 'face file could not be loaded'; }
  return out;
}
async function selectRock(r) {
  S.rock = r; S.coll = []; S.sel = -1;
  const acct = wallet.state.account;
  $('rockInfo').innerHTML = r ? `Forged by <b>${short(r.seed)}</b>${eq(r.seed, acct) ? ' (this wallet: your wallet face is free here)' : ' (another wallet: your wallet face costs GEAR here)'} · held by <b>${short(r.owner)}</b> · ${r.faces.length} face(s) onchain` : '';
  if (r) {
    S.coll = await Promise.all(r.faces.map((f, i) => faceFromChain(f, i, r)));
    for (const s of S.sim[r.id] || []) S.coll.push(s);
    S.sel = r.hasActive ? r.active : S.coll.length ? 0 : -1;
    S.view = S.sel >= 0 ? 'coll' : 'builder';
  } else S.view = 'builder';
  refresh();
}
function thumb(bm) { const c = document.createElement('canvas'); c.width = 240; c.height = 178; const g = c.getContext('2d'); drawTablet(g, 0, 0, 1); paintBitmap(g, bm, 0, 3.8, 1); return c; }
function renderColl() {
  const box = $('coll'); box.innerHTML = '';
  $('collNote').textContent = !wallet.state.account ? 'Connect your wallet to see your rocks and their faces.' : !S.rock ? 'Pick one of your rocks above.' : S.coll.length ? `Rock #${S.rock.id} has ${S.coll.length} face(s). Tap one to preview it; the rock displays the one marked “on rock”.` : `Rock #${S.rock.id} has no faces yet. Add one below.`;
  S.coll.forEach((c, k) => {
    const d = document.createElement('div'); d.className = 'fm-card' + (S.view === 'coll' && S.sel === k ? ' sel' : '');
    if (c.bm) d.appendChild(thumb(c.bm)); else if (c.img) { const im = new Image(); im.src = c.img; im.alt = c.label; d.appendChild(im); } else d.appendChild(Object.assign(document.createElement('div'), { textContent: c.note || 'not renderable', style: 'padding:30px 4px' }));
    const who = c.kind === 'wallet' ? `Wallet face · ${short(c.seed)}${c.free ? ' · forger (free)' : ''}` : `Custom · by ${short(c.seed)}`;
    d.insertAdjacentHTML('beforeend', `<div style="margin-top:6px"><b>#${c.sim ? '–' : c.i}</b> ${who}${c.active ? '<span class="fm-badge">on rock</span>' : ''}${c.sim ? '<span class="fm-badge sim">simulated</span>' : ''}</div>`);
    d.onclick = () => { S.sel = k; S.view = 'coll'; if (anim) anim.stop = true; anim = null; refresh(); };
    box.appendChild(d);
  });
}

// ---------------- active (displayed) face: real setActiveFace ----------------
function updateActive() {
  const b = $('activeBtn'), st = $('activeStub'), c = S.view === 'coll' ? S.coll[S.sel] : null, acct = wallet.state.account;
  st.classList.add('fm-hidden'); b.disabled = true; b.textContent = 'Display this face on the rock';
  if (!S.rock || !c) return;
  if (c.sim) { st.textContent = 'This face is only simulated (not onchain), so it cannot be displayed yet.'; st.classList.remove('fm-hidden'); return; }
  if (c.active) { b.textContent = `Displayed on rock #${S.rock.id}`; return; }
  if (!eq(acct, S.rock.owner)) return;
  b.disabled = false; b.textContent = `Display face #${c.i} on rock #${S.rock.id}`;
}
$('activeBtn').onclick = async () => {
  const c = S.coll[S.sel], r = S.rock, m = $('activeMsg'); if (!c || !r || c.sim) return;
  try {
    $('activeBtn').disabled = true; m.textContent = 'Confirm in your wallet (gas only)…';
    if (!(await wallet.ensureBase())) throw new Error('Switch your wallet to Base.');
    const account = getAddress(wallet.state.account), wc = createWalletClient({ account, chain: base, transport: custom(wallet.provider()) });
    await pub.simulateContract({ address: ROCKS, abi: ABI, functionName: 'setActiveFace', args: [BigInt(r.id), BigInt(c.i)], account });
    const hash = await wc.writeContract({ address: ROCKS, abi: ABI, functionName: 'setActiveFace', args: [BigInt(r.id), BigInt(c.i)] });
    m.innerHTML = `Sent… <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">view</a>`;
    await pub.waitForTransactionReceipt({ hash });
    m.innerHTML = `Rock #${r.id} now displays face #${c.i}. <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">tx</a>`;
    await reloadRock(r.id);
  } catch (e) { m.textContent = explainWalletError(e); updateActive(); }
};
async function reloadRock(id) { const k = S.rocks.findIndex((x) => x.id === id); if (k >= 0) S.rocks[k] = await readRock(id); fillRockSel(id); }

// ---------------- 3. add a face ----------------
function updateMint() {
  const acct = wallet.state.account, r = S.rock, btn = $('mintBtn'), stub = $('stubNote'), m = $('mintMsg');
  stub.classList.add('fm-hidden'); btn.disabled = true; btn.textContent = 'Add face'; btn.dataset.act = '';
  const f = S.view === 'builder' ? S.face : null;
  if (S.view !== 'builder') { m.textContent = 'Change the builder (or pick the Wallet/Custom tab) to make a new face.'; return; }
  if (!f) { m.textContent = ''; return; }
  if (!acct) { m.textContent = 'Connect your wallet to add faces to your rock.'; return; }
  if (!r) { m.textContent = 'Pick one of your rocks first.'; return; }
  if (S.mode === 'wallet') {
    if (!eq(acct, S.addr)) { m.textContent = 'Preview only: a wallet face can only be added by its own wallet. Clear the box to use your connected wallet.'; return; }
    if (S.coll.some((c) => c.kind === 'wallet' && eq(c.seed, acct))) { m.textContent = `Your wallet face is already on rock #${r.id} (one per wallet per rock). It's in the collection above.`; return; }
    if (eq(r.seed, acct)) { btn.disabled = false; btn.dataset.act = 'free'; btn.textContent = `Add my wallet face to rock #${r.id} (free, gas only)`; m.textContent = ''; return; }
    stub.innerHTML = '<b>STUB: paid wallet face.</b> This rock was forged by another wallet, so adding your wallet face costs GEAR through <code>addWalletFacePaid</code>. That needs a signed GEAR price quote from CAPs mind, and that server isn\'t live yet. This button only simulates it; nothing is sent.';
    stub.classList.remove('fm-hidden'); btn.disabled = false; btn.dataset.act = 'sim'; btn.textContent = 'Simulate paid wallet face (stub)'; m.textContent = ''; return;
  }
  if (S.coll.some((c) => c.kind === 'custom' && c.hash && c.hash.toLowerCase() === f.hash.toLowerCase())) { m.textContent = 'This exact custom face is already on this rock.'; return; }
  stub.innerHTML = '<b>STUB: custom face.</b> Custom faces are paid in GEAR through <code>addCustomFace</code>, which needs a signed price quote from CAPs mind and the finished face file pinned to IPFS. Neither is live, so this button only simulates it; nothing is sent.';
  stub.classList.remove('fm-hidden'); btn.disabled = false; btn.dataset.act = 'sim'; btn.textContent = 'Simulate add custom face (stub)'; m.textContent = '';
}
$('mintBtn').onclick = async () => {
  const m = $('mintMsg'), r = S.rock, f = S.face; if (!r || !f) return;
  if ($('mintBtn').dataset.act === 'sim') {
    const acct = wallet.state.account;
    (S.sim[r.id] = S.sim[r.id] || []).push({ ...f, sim: true, seed: S.mode === 'wallet' ? acct : acct, kind: S.mode, label: f.label + ' (simulated)' });
    await selectRock(r); S.sel = S.coll.length - 1; S.view = 'coll'; refresh(); $('mintMsg').textContent = 'Simulated: added to this page only. Nothing was sent onchain.'; return;
  }
  try {
    $('mintBtn').disabled = true; m.textContent = 'Confirm in your wallet…';
    if (!(await wallet.ensureBase())) throw new Error('Switch your wallet to Base.');
    const account = getAddress(wallet.state.account), wc = createWalletClient({ account, chain: base, transport: custom(wallet.provider()) });
    await pub.simulateContract({ address: ROCKS, abi: ABI, functionName: 'addWalletFace', args: [BigInt(r.id), WALLET_FACE_VERSION, WALLET_VARIANT], account });
    const hash = await wc.writeContract({ address: ROCKS, abi: ABI, functionName: 'addWalletFace', args: [BigInt(r.id), WALLET_FACE_VERSION, WALLET_VARIANT] });
    m.innerHTML = `Sent. Waiting for Base… <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">view</a>`;
    await pub.waitForTransactionReceipt({ hash });
    m.innerHTML = `Added to rock #${r.id}. <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">tx</a>`;
    await reloadRock(r.id); playPrint();
  } catch (e) { m.textContent = explainWalletError(e); updateMint(); }
};

// ---------------- 4. download ----------------
function updateExport() {
  const c = S.view === 'coll' ? S.coll[S.sel] : null, ok = !!(c && c.bm);
  for (const id of ['vidBtn', 'pngBtn', 'svgBtn', 'rockPngBtn']) $(id).disabled = !ok;
  const g = !!(c && c.onchain && c.bm && wallet.state.account && eq(S.rock.owner, wallet.state.account));
  $('glbBtn').disabled = $('glbZipBtn').disabled = !g;
  $('exportLock').textContent = ok ? `Downloading ${c.active ? 'the displayed face' : 'face'} ${c.sim ? '(simulated) ' : '#' + c.i + ' '}of rock #${S.rock.id}.` + (g ? ' Rock GLB: sign a free message (no transaction) to prove you hold this rock.' : ' Rock GLB: only the holder of this rock, with an onchain face.') : 'Select a face from this rock\'s collection. Files unlock for faces that are on your rock.';
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const baseName = () => `caps-rock-${S.rock ? S.rock.id : 'x'}-` + (S.face.kind === 'wallet' ? `face-${S.face.seed ? S.face.seed.slice(0, 8) : 'wallet'}` : `face-custom-${S.face.hash.slice(2, 10)}`);
$('svgBtn').onclick = () => download(new Blob([renderSvg(S.face.bm, S.face.kind === 'wallet' ? 'wallet-v1-pixel' : 'custom-v2')], { type: 'image/svg+xml' }), baseName() + '.svg');
$('pngBtn').onclick = () => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'), s = 1024 / 240; drawTablet(g, 0, 312 / 2400 * 1024, s); paintBitmap(g, S.face.bm, 0, 350 / 2400 * 1024, s); c.toBlob((b) => download(b, baseName() + '.png'), 'image/png'); };
$('rockPngBtn').onclick = () => { if (viewer3d.ready) return viewer3d.canvas.toBlob((b) => download(b, baseName() + '-rock-3d.png'), 'image/png'); drawRock(); rock.toBlob((b) => download(b, baseName() + '-rock-preview.png'), 'image/png'); };
async function downloadGlb(zip) {
  const m = $('exportMsg'), c = S.coll[S.sel], acct = wallet.state.account, id = S.rock.id;
  try {
    m.className = 'fm-msg'; m.textContent = 'Sign the download message in your wallet (free, no transaction)…';
    const ch = await (await fetch(`/api/rocks/${id}/challenge?address=${acct}`)).json();
    const wc = createWalletClient({ chain: base, transport: custom(wallet.provider()) });
    const signature = await wc.signMessage({ account: getAddress(acct), message: ch.message });
    m.textContent = 'Forging your rock with face #' + c.i + '…';
    const r = await fetch(`/api/rocks/${id}/glb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct, message: ch.message, signature, face: c.i, zip }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'download failed (' + r.status + ')');
    const b = await r.blob(); download(b, `caps-rock-${id}-face-${c.i}.${zip ? 'zip' : 'glb'}`);
    m.className = 'fm-msg ok'; m.textContent = `Downloaded (${(b.size / 1048576).toFixed(1)} MB). Rigged, 7 clips, metres, feet on the floor: ready for Mysbase.`;
  } catch (e) { m.className = 'fm-msg bad'; m.textContent = explainWalletError(e); }
}
$('glbBtn').onclick = () => downloadGlb(false);
$('glbZipBtn').onclick = () => downloadGlb(true);
export function pickVideoType() {
  const MR = window.MediaRecorder; if (!MR) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MR.isTypeSupported(t)) || null;
}
async function recordPrint() {
  const type = pickVideoType(); if (!type || !stage.captureStream) throw new Error('This browser cannot record video. Try Chrome, Safari 14.1+ or Firefox.');
  const stream = stage.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 }), chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(250); await playPrint(9); await new Promise((r) => setTimeout(r, 600)); rec.stop(); await done;
  stream.getTracks().forEach((t) => t.stop());
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
$('vidBtn').onclick = async () => {
  const m = $('exportMsg'); $('vidBtn').disabled = true; m.textContent = 'Recording the print… keep this tab open.';
  try { const { blob, ext } = await recordPrint(); download(blob, `${baseName()}-print.${ext}`); m.textContent = `Saved ${ext.toUpperCase()} (${(blob.size / 1e6).toFixed(1)} MB).` + (ext === 'webm' ? ' Your browser records WebM; Safari records MP4.' : ''); }
  catch (e) { m.textContent = e.message || String(e); }
  updateExport();
};

// ---------------- wallet wiring ----------------
let lastAcct = null;
wallet.subscribe((st) => {
  if (st.account === lastAcct) return; lastAcct = st.account;
  if (st.account && (!S.addr || eq(S.addr, S.connectedFill))) { S.addr = st.account; S.connectedFill = st.account; $('addrIn').value = st.account; }
  refresh(); void loadRocks();
});
// test hook (headless screenshots only; never touches the chain): fake a connected wallet holding given rocks
if (new URLSearchParams(location.search).has('fmtest')) (window as any).__faceMaker = { S, refresh, playPrint, recordPrint, setMode, selectRock,
  fake: (acct, rocks) => { wallet.state.account = acct; S.addr = acct; $('addrIn').value = acct; S.rocks = rocks; fillRockSel(); }, front: () => viewer3d.front(false) };
syncCustomSelects(); refresh();
void wallet.init();
