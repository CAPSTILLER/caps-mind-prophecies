// Adapter for faces capsmind's frozen engine cannot rebuild (mood faces v2, minted as kind 1 with Axle's own art)
// and for the "Exploited Faces" status. Source: mywally.gearup.wtf (myassets). Fail soft: null, never throw.
import { inflateSync } from 'node:zlib';

export const MYWALLY = 'https://mywally.gearup.wtf';
const GW = 240, GH = 170, S = 4; // Axle PNG is 960x680 = exactly 4x the 240x170 grid

/** Minimal PNG decoder: 8-bit, non-interlaced, colour types 0/2/4/6. Returns RGBA. */
export function decodePng(buf: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const b = Buffer.from(buf);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, ct = 0, depth = 0, il = 0; const idat: Buffer[] = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[ct];
  if (depth !== 8 || il !== 0 || !ch) throw new Error('unsupported PNG');
  const raw = inflateSync(Buffer.concat(idat)), bpr = w * ch, out = new Uint8Array(w * h * 4), cur = new Uint8Array(bpr), prev = new Uint8Array(bpr);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (bpr + 1)], row = raw.subarray(y * (bpr + 1) + 1, (y + 1) * (bpr + 1));
    for (let i = 0; i < bpr; i++) {
      const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0, x = row[i];
      let v = x;
      if (f === 1) v = x + a; else if (f === 2) v = x + up; else if (f === 3) v = x + ((a + up) >> 1);
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (ch <= 2) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = ch === 2 ? cur[s + 1] : 255; }
      else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = ch === 4 ? cur[s + 3] : 255; }
    }
    prev.set(cur);
  }
  return { w, h, rgba: out };
}

/** 960x680 face PNG (light ink on blue) -> 240x170 engrave bitmap: exact 4x area average, ink = bright pixels. */
export function pngToBitmap(png: Uint8Array): Uint8Array | null {
  const { w, h, rgba } = decodePng(png);
  if (w !== GW * S || h !== GH * S) return null;
  const bm = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let sum = 0;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const o = ((y * S + dy) * w + x * S + dx) * 4; sum += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]; }
    if (sum / (S * S) > 170) bm[y * GW + x] = 1; // ink ~240, background ~40..150
  }
  return bm;
}

export type AxleFace = { bm: Uint8Array; kind: string; mood: string | null; variant: number | null };
const MOODS = ['Calm', 'Based', 'Fierce', 'Sorrow', 'Joy', 'Prophet', 'Void'];
const faceCache = new Map<string, Promise<AxleFace | null>>(); // contentHash -> art (saved faces are immutable)

export function axleFace(tokenId: number, contentHash: string, fetchImpl: typeof fetch = fetch): Promise<AxleFace | null> {
  const k = `${tokenId}|${contentHash.toLowerCase()}`;
  if (!faceCache.has(k)) {
    const p = (async () => {
      const u = `${MYWALLY}/api/rocks/${tokenId}/faces/${contentHash.toLowerCase()}`;
      const [pr, jr] = await Promise.all([fetchImpl(u + '.png', { signal: AbortSignal.timeout(6000) }), fetchImpl(u + '.json', { signal: AbortSignal.timeout(6000) }).catch(() => null)]);
      if (!pr.ok) throw new Error('axle face ' + pr.status);
      const bm = pngToBitmap(new Uint8Array(await pr.arrayBuffer())); if (!bm) throw new Error('axle face: unexpected size');
      const j: any = jr && jr.ok ? await jr.json().catch(() => null) : null;
      const kind = (j && j.kind) || pr.headers.get('x-face-kind') || 'custom', variant = j && Number.isInteger(j.variant) ? j.variant : null;
      return { bm, kind, variant, mood: kind === 'mood' && variant != null ? MOODS[variant % 7] : null };
    })();
    faceCache.set(k, p);
    p.then((v) => { if (!v) faceCache.delete(k); }, () => faceCache.delete(k)); // only successes stay cached
    while (faceCache.size > 200) faceCache.delete(faceCache.keys().next().value!);
  }
  return faceCache.get(k)!.catch(() => null);
}

export type Exploit = { count: number; indices: number[]; unverified: number };
const exCache = new Map<number, { t: number; v: Promise<Exploit | null> }>();
export function exploitStatus(tokenId: number, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Exploit | null> {
  const c = exCache.get(tokenId); if (c && now - c.t < 60_000) return c.v;
  const v = (async () => {
    const r = await fetchImpl(`${MYWALLY}/api/rocks/status?id=${tokenId}`, { signal: AbortSignal.timeout(5000) }); if (!r.ok) return null;
    const j: any = await r.json();
    if (!Number.isInteger(j.exploitedFaces)) return null;
    return { count: j.exploitedFaces, indices: Array.isArray(j.exploitedFaceIndices) ? j.exploitedFaceIndices.filter(Number.isInteger) : [], unverified: Number(j.exploitUnverified) || 0 };
  })().catch(() => null);
  exCache.set(tokenId, { t: now, v }); v.then((x) => { if (!x) exCache.delete(tokenId); });
  return v;
}
export function _resetAxleCaches() { faceCache.clear(); exCache.clear(); }
