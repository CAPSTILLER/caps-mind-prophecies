// Procedural, tileable "layer-zero prophecy tablet" stone: dusty base-blue with fine white veins.
// Baked per wallet to a small JPEG (base colour texture).
import jpeg from 'jpeg-js';

function makeNoise(period, r, periodY = period) {
  const g = new Float32Array(period * periodY); for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
  return (x, y) => { // x,y in [0,1) -> tileable value noise (integer periods on each axis)
    const fx = x * period, fy = y * periodY, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const at = (a, b) => g[((a % period) + period) % period + (((b % periodY) + periodY) % periodY) * period];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}
const fbm = (ns, x, y) => { let s = 0, a = 0.5; for (const n of ns) { s += a * n(x, y); a *= 0.5; } return s; };
const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export const VEIN_STYLES = {
  Sparse: { freq: 3, width: 0.016, layers: 2, opacity: 0.9 },
  Fine: { freq: 4, width: 0.011, layers: 3, opacity: 0.85 },
  Dense: { freq: 6, width: 0.012, layers: 3, opacity: 0.9 },
  Marbled: { freq: 4, width: 0.024, layers: 3, opacity: 0.7 },
};

export function bakeStoneTexture(r, { size = 512, veins = 'Fine', dark = '#2b4f8f', light = '#3a5fa8', quality = 84 } = {}) {
  const V = VEIN_STYLES[veins], D = srgb(dark), L = srgb(light), W = [236, 240, 247];
  const tint = [makeNoise(2, r), makeNoise(4, r)];
  const dust = [makeNoise(16, r), makeNoise(32, r), makeNoise(64, r)];
  const warp = [makeNoise(3, r), makeNoise(6, r), makeNoise(12, r)], warp2 = [makeNoise(3, r), makeNoise(6, r), makeNoise(12, r)];
  const vein = Array.from({ length: V.layers }, (_, k) => { const f = V.freq * (k + 1); return [makeNoise(f, r, f * 3), makeNoise(f * 2, r, f * 6), makeNoise(f * 4, r, f * 12), makeNoise(f * 8, r, f * 24)]; });
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const t = Math.min(1, Math.max(0, 0.5 + fbm(tint, u, v) * 1.1));          // large-scale shard tint
    const d = fbm(dust, u, v) * 0.16;                                           // dusty grain
    let c = D.map((a, i) => (a + (L[i] - a) * t) * (1 + d));
    const wu = u + fbm(warp, u, v) * 0.2, wv = v + fbm(warp2, u, v) * 0.2;
    let vm = 0;
    vein.forEach((ns, k) => {
      const n = Math.abs(fbm(ns, ((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1));
      const w = V.width / (k + 1);
      vm = Math.max(vm, Math.max(0, 1 - n / w) ** 1.5 * (k === 0 ? 1 : 0.6));
    });
    vm *= V.opacity;
    c = c.map((a, i) => a + (W[i] - a) * vm);
    const o = (y * size + x) * 4;
    data[o] = Math.min(255, c[0]); data[o + 1] = Math.min(255, c[1]); data[o + 2] = Math.min(255, c[2]); data[o + 3] = 255;
  }
  return jpeg.encode({ data, width: size, height: size }, quality).data;
}
