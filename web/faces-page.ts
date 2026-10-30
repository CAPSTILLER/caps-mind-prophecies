// @ts-nocheck -- DOM glue for /faces. Engine (canonical CAPs Rocks face generators) is in src/faces/engine.ts.
import { createPublicClient, createWalletClient, custom, fallback, http, getAddress, isAddress } from 'viem';
import { base } from 'viem/chains';
import { initWalletUi, explainWalletError } from './walletUi.js';
import { GW, GH, WALLET_FACE_VERSION, CUSTOM, ORDER, traits, composeWallet, traitNames, composeCustom, encodeLayout, decodeLayout, centerX, DEFAULT_LAYOUT, contentHash, renderSvg, engraveRuns } from '../src/faces/engine.js';

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
  { type: 'function', name: 'addWalletFace', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'faceGeneratorVersion', type: 'uint16' }, { name: 'variant', type: 'uint32' }], outputs: [{ type: 'uint256' }] },
];
/** One face per wallet: always the same fixed onchain value (variant 0). No moods. */
const WALLET_VARIANT = 0;
const pub = createPublicClient({ chain: base, transport: fallback([http('https://mainnet.base.org'), http()]) });
const $ = (id) => document.getElementById(id);
const wallet = initWalletUi();

// ---------------- state ----------------
const S = { mode: 'wallet', addr: '', layout: structuredClone(DEFAULT_LAYOUT), face: null, rocks: [], unlocked: new Set() };
const faceKey = () => S.face ? S.face.hash : '';

function currentFace() {
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
  sx.fillText(laser ? `ENGRAVING · ${laser.pct}%` : (S.face ? 'CAPs mind · ' + S.face.label : 'enter a wallet address'), OX, stage.height - 40);
  sx.textAlign = 'right'; sx.fillText('CAPs ROCKS · face tablet 240×170 mm', stage.width - OX, stage.height - 40); sx.textAlign = 'left';
}
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
if (ORDER.includes('brow')) $('browSel').add(new Option('None', '-1'));
$('noseSel').add(new Option('None', '-1'));

function refresh() {
  let msg = '';
  try { S.face = currentFace(); } catch (e) { msg = String(e.message || e); }
  if (S.mode === 'custom') { $('customMsg').textContent = msg; $('customMsg').className = 'fm-msg ' + (msg ? 'bad' : ''); if (!msg) $('codeIn').value = S.face.code; }
  if (S.mode === 'wallet' && S.face) { const n = traitNames(S.face.t); delete n.mood; $('traitsOut').innerHTML = Object.entries(n).map(([k, v]) => `${k}: <b>${v === true ? 'yes' : v === false ? 'no' : v}</b>`).join(' · '); }
  else if (S.mode === 'wallet') $('traitsOut').textContent = '';
  $('hashOut').textContent = S.face ? 'hash ' + S.face.hash.slice(0, 10) + '…' : '';
  if (!anim) showStatic();
  updateMint(); updateExport();
}
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
function setMode(m) { S.mode = m; $('tabWallet').classList.toggle('on', m === 'wallet'); $('tabCustom').classList.toggle('on', m === 'custom'); $('walletCtl').classList.toggle('fm-hidden', m !== 'wallet'); $('customCtl').classList.toggle('fm-hidden', m !== 'custom'); if (anim) anim.stop = true; anim = null; refresh(); }
$('addrIn').oninput = () => { S.addr = $('addrIn').value.trim(); refresh(); };
$('borderSel').onchange = () => { S.layout.border = Number($('borderSel').value); refresh(); };
for (const t of ORDER) $(t + 'Sel').onchange = () => { setPart(t, Number($(t + 'Sel').value)); refresh(); };
document.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
  const t = $('moveSel').value, p = S.layout.parts.find((q) => q.t === t); if (!p) return;
  if (b.dataset.mv === 'mirror') { if (t === 'eye' || t === 'brow') p.mirror ? delete p.mirror : (p.mirror = true); }
  else { const [dx, dy] = b.dataset.mv.split(',').map(Number); p.x = Math.max(0, Math.min(255, p.x + dx)); p.y = Math.max(0, Math.min(255, p.y + dy)); }
  refresh();
}));
$('codeIn').onchange = () => { try { const l = decodeLayout($('codeIn').value.trim()); composeCustom(l); S.layout = l; syncCustomSelects(); refresh(); } catch (e) { $('customMsg').textContent = 'That face code does not load: ' + (e.message || e); } };
$('engraveBtn').onclick = () => playPrint();

// ---------------- rocks + mint ----------------
async function loadRocks() {
  const acct = wallet.state.account; S.rocks = []; const sel = $('rockSel'); sel.innerHTML = '';
  if (!acct) { sel.add(new Option('Connect your wallet to find your rocks', '')); updateMint(); return; }
  sel.add(new Option('Looking for your rocks…', ''));
  try {
    const n = Number(await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'totalMinted' }));
    for (let id = 1; id <= Math.min(n, 500); id++) {
      const v = await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'rockView', args: [BigInt(id)] });
      if (v.owner.toLowerCase() !== acct.toLowerCase()) continue;
      const faces = Number(v.faceCount) ? await pub.readContract({ address: ROCKS, abi: ABI, functionName: 'facesOf', args: [BigInt(id), 0n, 1000n] }) : [];
      S.rocks.push({ id, seed: v.avatar.seed, faces });
    }
  } catch (e) { sel.innerHTML = ''; sel.add(new Option('Could not read CAPs Rocks: ' + (e.shortMessage || e.message), '')); return; }
  sel.innerHTML = '';
  if (!S.rocks.length) sel.add(new Option('No CAPs Rock in this wallet yet', ''));
  for (const r of S.rocks) sel.add(new Option(`Rock #${r.id}${r.seed.toLowerCase() === acct.toLowerCase() ? ' (your wallet seed)' : ''} · ${r.faces.length} face${r.faces.length === 1 ? '' : 's'}`, String(r.id)));
  markMintedFromChain(); updateMint(); updateExport();
}
function markMintedFromChain() { // a face already on one of your rocks counts as minted, so its files unlock
  const acct = (wallet.state.account || '').toLowerCase();
  for (const r of S.rocks) for (const f of r.faces) {
    if (Number(f.kind) === 0 && f.seed.toLowerCase() === acct) S.unlocked.add(`w:${acct}`);
    if (Number(f.kind) === 1) S.unlocked.add('h:' + f.contentHash.toLowerCase());
  }
}
const unlockKey = () => !S.face ? '' : S.face.kind === 'wallet' ? `w:${S.addr.toLowerCase()}` : 'h:' + S.face.hash.toLowerCase();
function selectedRock() { return S.rocks.find((r) => String(r.id) === $('rockSel').value); }
function updateMint() {
  const acct = wallet.state.account, r = selectedRock(), btn = $('mintBtn'), stub = $('stubNote');
  stub.classList.add('fm-hidden'); btn.disabled = true; btn.textContent = 'Mint face';
  if (!S.face) return;
  if (S.mode === 'wallet') {
    if (!acct) { $('mintMsg').textContent = 'Connect the wallet this face belongs to.'; return; }
    if (acct.toLowerCase() !== S.addr.toLowerCase()) { $('mintMsg').textContent = 'Preview only: a wallet face can only be added by its own wallet.'; return; }
    if (!r) { $('mintMsg').textContent = 'You need a CAPs Rock to engrave onto.'; return; }
    if (S.unlocked.has(unlockKey())) { const on = S.rocks.find((x) => x.faces.some((f) => Number(f.kind) === 0 && f.seed.toLowerCase() === acct.toLowerCase())); $('mintMsg').textContent = `Minted: your wallet face is already on rock #${on ? on.id : '?'}. One face per wallet, so it can't be minted again.`; return; }
    if (r.seed.toLowerCase() !== acct.toLowerCase()) {
      stub.textContent = 'STUB: this rock was forged by another wallet, so adding your wallet face costs GEAR (addWalletFacePaid). That needs the CAPs mind price-quote server, which is not live yet.'; stub.classList.remove('fm-hidden'); $('mintMsg').textContent = ''; return;
    }
    btn.disabled = false; btn.textContent = `Mint my wallet face to rock #${r.id} — free, gas only`; $('mintMsg').textContent = '';
  } else {
    stub.innerHTML = '<b>STUB — not onchain yet.</b> Custom faces are paid in GEAR through <code>addCustomFace</code>, which needs a signed price quote from CAPs mind and the face file pinned to IPFS. Neither service is live, so this button only simulates the mint (nothing is sent) so you can try the export.';
    stub.classList.remove('fm-hidden'); btn.disabled = false; btn.textContent = 'Simulate mint (stub)'; $('mintMsg').textContent = '';
  }
}
$('rockSel').onchange = () => { updateMint(); };
$('mintBtn').onclick = async () => {
  const msg = $('mintMsg');
  if (S.mode === 'custom') { S.unlocked.add(unlockKey()); msg.textContent = 'Simulated. Nothing was sent onchain.'; updateExport(); return; }
  const r = selectedRock(); if (!r) return;
  try {
    $('mintBtn').disabled = true; msg.textContent = 'Confirm in your wallet…';
    if (!(await wallet.ensureBase())) throw new Error('Switch your wallet to Base.');
    const account = getAddress(wallet.state.account);
    const wc = createWalletClient({ account, chain: base, transport: custom(wallet.provider()) });
    await pub.simulateContract({ address: ROCKS, abi: ABI, functionName: 'addWalletFace', args: [BigInt(r.id), WALLET_FACE_VERSION, WALLET_VARIANT], account });
    const hash = await wc.writeContract({ address: ROCKS, abi: ABI, functionName: 'addWalletFace', args: [BigInt(r.id), WALLET_FACE_VERSION, WALLET_VARIANT] });
    msg.innerHTML = `Sent. Waiting for Base… <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">view</a>`;
    await pub.waitForTransactionReceipt({ hash });
    msg.innerHTML = `Engraved onto rock #${r.id}. <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener">tx</a>`;
    await loadRocks(); playPrint();
  } catch (e) { msg.textContent = explainWalletError(e); updateMint(); }
};

// ---------------- export ----------------
function updateExport() {
  const ok = !!S.face && S.unlocked.has(unlockKey());
  for (const id of ['vidBtn', 'pngBtn', 'svgBtn']) $(id).disabled = !ok;
  $('exportLock').classList.toggle('fm-hidden', ok);
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const baseName = () => S.face.kind === 'wallet' ? `caps-face-${S.addr.slice(0, 8)}` : `caps-face-custom-${S.face.hash.slice(2, 10)}`;
$('svgBtn').onclick = () => download(new Blob([renderSvg(S.face.bm, S.face.kind === 'wallet' ? 'wallet-v1-pixel' : 'custom-v2')], { type: 'image/svg+xml' }), baseName() + '.svg');
$('pngBtn').onclick = () => { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'), s = 1024 / 240; drawTablet(g, 0, 312 / 2400 * 1024, s); paintBitmap(g, S.face.bm, 0, 350 / 2400 * 1024, s); c.toBlob((b) => download(b, baseName() + '.png'), 'image/png'); };
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
  if (st.account && (!S.addr || S.addr.toLowerCase() === (S.connectedFill || '').toLowerCase())) { S.addr = st.account; S.connectedFill = st.account; $('addrIn').value = st.account; }
  refresh(); void loadRocks();
});
// test hook (headless screenshots only; does not touch the chain)
if (new URLSearchParams(location.search).has("fmtest")) (window as any).__faceMaker = { S, refresh, playPrint, recordPrint, setMode, unlock: () => { S.unlocked.add(unlockKey()); updateExport(); } };
syncCustomSelects(); refresh();
void wallet.init();
