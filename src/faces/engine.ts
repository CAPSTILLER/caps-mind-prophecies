// @ts-nocheck -- straight port of CAPSTILLER/caps-rocks faces (wallet_pixel/faces_v1.js + custom/v2/render_v2.mjs).
// Browser-safe: no fs, keccak via viem. Baked JSON parts are the canonical source (copied unchanged).
import { keccak256, toBytes, bytesToHex } from 'viem';
import K from './wallet_parts.json';
import C from './custom_parts.json';

export const GW = 240, GH = 170;
export const MOODS = ['Calm', 'Based', 'Fierce', 'Sorrow', 'Joy', 'Prophet', 'Void'];
export const WALLET_FACE_VERSION = 1;
const kb = (m: Uint8Array) => toBytes(keccak256(m));
function addrBytes(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('bad address ' + address);
  return toBytes(address.toLowerCase() as `0x${string}`);
}
export function identitySeed(address, version = 1) { const m = new Uint8Array(22); m.set(addrBytes(address), 0); m[20] = (version >> 8) & 255; m[21] = version & 255; return kb(m); }
export function variantSeed(address, variant, version = 1) {
  const m = new Uint8Array(26); m.set(addrBytes(address), 0); m[20] = (version >> 8) & 255; m[21] = version & 255;
  m[22] = (variant >>> 24) & 255; m[23] = (variant >>> 16) & 255; m[24] = (variant >>> 8) & 255; m[25] = variant & 255; return kb(m);
}
const toBm = (p) => ({ w: p.w, h: p.h, d: Uint8Array.from(p.rows.join(''), (c) => (c === '#' ? 1 : 0)) });
const at = (b, x, y) => (x >= 0 && y >= 0 && x < b.w && y < b.h ? b.d[y * b.w + x] : 0);
const mapBm = (b, f) => { const o = { w: b.w, h: b.h, d: new Uint8Array(b.d.length) }; for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) o.d[y * b.w + x] = f(x, y, at(b, x, y)) ? 1 : 0; return o; };
const hollow = (b, r) => mapBm(b, (x, y, v) => { if (!v) return 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (!at(b, x + i, y + j)) return 1; return 0; });
function stamp(G, b, x0, y0, mirror = false, colDy = null) {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.d[y * b.w + x]) {
    const gx = x0 + (mirror ? b.w - 1 - x : x), gy = y0 + y + (colDy ? colDy(x) : 0);
    if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) G[gy * GW + gx] = 1;
  }
}
export function traits(address, variant, version = 1) {
  const A = identitySeed(address, version), V = variantSeed(address, variant, version), mood = MOODS[variant % 7];
  const nud = (i) => (variant >= 7 ? (V[i] % 5) - 2 : 0);
  return {
    version, variant, mood,
    eye: A[0] % 12, gap: 24 + (A[1] % 25), eyeCY: 56 + (A[2] % 11),
    brow: A[3] % 10, browGap: 5 + ((A[3] >> 4) % 5), nose: A[4] % 8,
    mouth: A[5] & 1, mouthDrop: (A[5] >> 1) % 9,
    mark: (A[6] % 8) < 4 ? -1 : (A[6] % 8) - 4, markSide: A[10] & 1, tally: A[7] >= 240 ? 7 : Math.trunc(A[7] / 40) + 1, seer: A[8] < 8,
    border: A[12] % 8, corner: A[13] % 5, phase: A[15],
    drift: { eye: [nud(0), nud(1)], brow: [nud(2), nud(3)], nose: [nud(4), nud(5)], mouth: [nud(6), nud(7)], mark: [nud(8), nud(9)], spread: variant >= 7 ? (V[10] % 3) - 1 : 0 },
  };
}
/** Returns the bitmap plus a per-pixel layer id (1=border, 2=eyes, 3=brows, 4=seer, 5=nose, 6=mouth, 7=mark) for engrave ordering. */
export function composeWallet(t) {
  const G = new Uint8Array(GW * GH), L = new Uint8Array(GW * GH), d = t.drift;
  const mark = (id) => { for (let i = 0; i < G.length; i++) if (G[i] && !L[i]) L[i] = id; };
  const tile = toBm(K.borders[t.border]), cor = toBm(K.corners[t.corner]), tw = tile.w, ph = t.phase % tw;
  for (let u = 0; u < 10; u++) {
    for (let x = 16; x < GW - 16; x++) if (at(tile, (x + ph) % tw, u)) { G[u * GW + x] = 1; G[(GH - 1 - u) * GW + x] = 1; }
    for (let y = 16; y < GH - 16; y++) if (at(tile, (y + ph) % tw, u)) { G[y * GW + u] = 1; G[y * GW + GW - 1 - u] = 1; }
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (at(cor, x, y)) for (const [gx, gy] of [[x, y], [GW - 1 - x, y], [x, GH - 1 - y], [GW - 1 - x, GH - 1 - y]]) G[gy * GW + gx] = 1;
  mark(1);
  let E = toBm(K.eyes[t.eye]); const ew = E.w, eh = E.h, lidded = K.eyes[t.eye].name === 'Lidded';
  if (t.mood === 'Fierce') E = mapBm(E, (x, y, v) => v && 5 * y * ew >= 2 * x * eh);
  if (t.mood === 'Joy' && !lidded) E = mapBm(E, (x, y, v) => v && 20 * y * ew * ew <= 11 * eh * ew * ew + 6 * eh * (2 * x - ew) ** 2);
  if (lidded && t.mood === 'Prophet') E = mapBm(E, (x, y, v) => v || (y >= 9 && Math.abs(2 * x - ew + 1) <= 6 && Math.abs(2 * y - 25) <= 6));
  else if (t.mood === 'Prophet' || t.mood === 'Void') { E = hollow(E, 2); if (t.mood === 'Prophet') E = mapBm(E, (x, y, v) => v || (Math.abs(2 * x - ew + 1) <= 4 && Math.abs(2 * y - eh + 1) <= 4)); }
  const gap = Math.max(t.gap, 90 - 2 * ew) + 2 * d.spread, exL = 120 - (gap >> 1) - ew + d.eye[0], exR = 240 - (120 - (gap >> 1) - ew) - ew + d.eye[0], ey = t.eyeCY - (eh >> 1) + d.eye[1];
  stamp(G, E, exL, ey);
  stamp(G, t.mood === 'Based' ? mapBm(E, (x, y, v) => v && 20 * y >= 7 * eh) : E, exR, ey, true);
  if (t.mood === 'Sorrow') stamp(G, toBm(K.tear), exL + (ew >> 1) + 2, ey + eh + 2);
  mark(2);
  let browTop = ey;
  if (t.mood !== 'Void') {
    const B = toBm(K.brows[t.brow]), bw = B.w, lift = { Joy: -3, Prophet: -2 }[t.mood] || 0;
    let bxL = exL + (ew >> 1) - (bw >> 1) + d.brow[0]; bxL = Math.min(bxL, 116 - bw); const bxR = 240 - bxL - bw;
    const by = ey - t.browGap - B.h + lift + d.brow[1] - (t.mood === 'Fierce' ? 3 : 0);
    const shear = t.mood === 'Fierce' ? (x) => Math.trunc((x * 12) / (bw - 1)) : t.mood === 'Sorrow' ? (x) => -Math.trunc((x * 6) / (bw - 1)) : null;
    stamp(G, B, bxL, by, false, shear);
    stamp(G, B, bxR, by - (t.mood === 'Based' ? 5 : 0), true, shear && ((x) => shear(bw - 1 - x)));
    browTop = by - (t.mood === 'Sorrow' ? 6 : 0) - (t.mood === 'Based' ? 5 : 0);
  }
  mark(3);
  if (t.seer) { const S = toBm(K.seer); stamp(G, S, 120 - (S.w >> 1), Math.max(12, browTop - S.h - 4)); }
  mark(4);
  const N = toBm(K.noses[t.nose]), ny = ey + eh + 3 + d.nose[1]; stamp(G, N, 120 - (N.w >> 1) + d.nose[0], ny);
  mark(5);
  const M = toBm(K.mouths[t.mood][t.mouth]);
  const my = Math.min(150 - M.h, Math.max(ny + N.h + 7, 110 + t.mouthDrop)) + d.mouth[1];
  stamp(G, M, 120 - (M.w >> 1) + d.mouth[0], my);
  mark(6);
  if (t.mark >= 0) { const isT = K.marks[t.mark].name === 'Tally', R = toBm(isT ? K.tally[t.tally - 1] : K.marks[t.mark]); stamp(G, R, (t.markSide ? 196 : 44) - (R.w >> 1) + d.mark[0], 96 + d.mark[1], t.markSide === 1 && !isT); }
  mark(7);
  return { bm: G, layers: L };
}
export const walletFace = (address, variant, version = 1) => composeWallet(traits(address, variant, version));
export const traitNames = (t) => ({ mood: t.mood, eyes: K.eyes[t.eye].name, brows: K.brows[t.brow].name, nose: K.noses[t.nose].name, border: K.borders[t.border].name, corner: K.corners[t.corner].name, mark: t.mark < 0 ? 'None' : K.marks[t.mark].name, seer: t.seer });

// ---------- custom v2 (CF2) ----------
export const CUSTOM = C; export const ORDER = ['eye', 'brow', 'nose', 'mouth'];
const I = C.grid.interior;
export function composeCustom(l) {
  if (l.v !== 2) throw new Error('v must be 2');
  const B = C.borders[l.border]; if (!B) throw new Error('bad border');
  const bm = new Uint8Array(GW * GH), L = new Uint8Array(GW * GH);
  B.rows.forEach((r, y) => { for (let x = 0; x < GW; x++) if (r[x] === '#') { bm[y * GW + x] = 1; L[y * GW + x] = 1; } });
  const seen = new Set(); const lid = { eye: 2, brow: 3, nose: 5, mouth: 6 };
  for (const p of l.parts) {
    if (!ORDER.includes(p.t)) throw new Error('bad type ' + p.t);
    if (seen.has(p.t)) throw new Error('only one ' + p.t); seen.add(p.t);
    if (p.mirror && p.t !== 'eye' && p.t !== 'brow') throw new Error('mirror only for eye/brow');
    if (!(Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 256 && p.y >= 0 && p.y < 256)) throw new Error('x,y must be uint8');
    const def = C.parts[p.t][p.id]; if (!def) throw new Error('unknown part');
    def.rows.forEach((r, dy) => { for (let dx = 0; dx < def.w; dx++) if (r[dx] === '#') {
      const x = p.x + (p.mirror ? def.w - 1 - dx : dx), y = p.y + dy;
      if (x < I.x0 || x > I.x1 || y < I.y0 || y > I.y1) throw new Error(`${p.t} goes outside the face area`);
      if (bm[y * GW + x]) throw new Error(`${p.t} overlaps another part`);
      bm[y * GW + x] = 1; L[y * GW + x] = lid[p.t];
    } });
  }
  if (!seen.has('eye') || !seen.has('mouth')) throw new Error('eyes and mouth are required');
  return { bm, layers: L };
}
const hx = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function encodeLayout(l) { const b = [l.v, l.border]; for (const t of ORDER) { const p = l.parts.find((q) => q.t === t); b.push(p ? p.id | (p.mirror ? 0x80 : 0) : 0xff, p ? p.x : 0, p ? p.y : 0); } return 'CF2-' + hx(Uint8Array.from(b)); }
export function decodeLayout(c) { const b = c.replace(/^CF2-/, '').match(/../g).map((h) => parseInt(h, 16)), parts = []; ORDER.forEach((t, i) => { const [a, x, y] = b.slice(2 + 3 * i, 5 + 3 * i); if (a !== 0xff) parts.push({ t, id: a & 0x7f, x, y, ...(a & 0x80 ? { mirror: true } : {}) }); }); return { v: b[0], border: b[1], parts }; }
export const centerX = (t, id) => 120 - (C.parts[t][id].w >> 1);
export const DEFAULT_LAYOUT = { v: 2, border: 5, parts: [{ t: 'brow', id: 3, x: centerX('brow', 3), y: 26 }, { t: 'eye', id: 0, x: centerX('eye', 0), y: 50 }, { t: 'nose', id: 0, x: centerX('nose', 0), y: 92 }, { t: 'mouth', id: 0, x: centerX('mouth', 0), y: 112 }] };

// ---------- shared output ----------
export function packBitmap(bm) { const o = new Uint8Array(bm.length / 8); bm.forEach((b, i) => { if (b) o[i >> 3] |= 0x80 >> (i & 7); }); return o; }
export const contentHash = (bm) => keccak256(packBitmap(bm));
export function runsPath(bm, w = GW, h = GH, s = 10, ox = 0, oy = 350) { let d = ''; for (let y = 0; y < h; y++) { let x = 0; while (x < w) { if (!bm[y * w + x]) { x++; continue; } let e = x; while (e < w && bm[y * w + e]) e++; d += `M${ox + x * s} ${oy + y * s}h${(e - x) * s}v${s}h${-(e - x) * s}Z`; x = e; } } return d; }
export function renderSvg(bm, kind = 'custom-v2') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 2400" width="1024" height="1024" shape-rendering="crispEdges" data-caps-face="${kind}"><defs><radialGradient id="s" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#2f5596"/><stop offset="1" stop-color="#24467f"/></radialGradient></defs><path d="M60 312H2340L2400 372V2028L2340 2088H60L0 2028V372Z" fill="url(#s)"/><path fill="#eef2f5" d="${runsPath(bm)}"/></svg>`;
}
/** Engrave order: layer by layer (border first), raster rows, serpentine like a laser head. Returns runs [y, x0, x1]. */
export function engraveRuns(bm, layers) {
  const out = [];
  for (let id = 1; id <= 7; id++) for (let y = 0; y < GH; y++) {
    const row = []; let x = 0;
    while (x < GW) { const i = y * GW + x; if (!bm[i] || layers[i] !== id) { x++; continue; } let e = x; while (e < GW && bm[y * GW + e] && layers[y * GW + e] === id) e++; row.push([y, x, e]); x = e; }
    if (y & 1) row.reverse(); out.push(...row);
  }
  return out;
}
export { bytesToHex };

/** Read a face SVG made by renderSvg() back into a bitmap (used for custom faces pinned on IPFS). Returns null if it isn't one. */
export function bitmapFromSvg(svg) {
  const m = /<path fill="#eef2f5" d="([^"]*)"/.exec(svg || ''); if (!m) return null;
  const bm = new Uint8Array(GW * GH), re = /M(\d+) (\d+)h(\d+)/g; let r;
  while ((r = re.exec(m[1]))) { const x = r[1] / 10, y = (r[2] - 350) / 10, w = r[3] / 10; if (y < 0 || y >= GH || x < 0 || x + w > GW) return null; for (let i = 0; i < w; i++) bm[y * GW + x + i] = 1; }
  return bm;
}
