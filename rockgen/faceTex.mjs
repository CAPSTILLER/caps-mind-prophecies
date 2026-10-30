// Face engraving maps (pure JS, runs in Node and the browser): the 240x170 1 mm face bitmap
// -> base-colour RGBA (white engraving on Base-blue tablet) + tangent-space normal map
// where engraved strokes are cut into the stone (so they read as carved under light).
export const FW = 240, FH = 170;
const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function faceMaps(bm, s = 4, { depth = 2.2 } = {}) {
  const w = FW * s, h = FH * s, color = new Uint8Array(w * h * 4), normal = new Uint8Array(w * h * 4), H = new Float32Array(w * h);
  const A = lin('#2f5596'), B = lin('#24467f'), INK = lin('#eef2f5');
  const on = (x, y) => (x >= 0 && y >= 0 && x < FW && y < FH ? bm[y * FW + x] : 0);
  // height: 1 = tablet surface, 0 = bottom of a groove; 1 px soft wall
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = Math.floor(x / s), gy = Math.floor(y / s), fx = (x % s + 0.5) / s, fy = (y % s + 0.5) / s;
    let v = on(gx, gy) ? 0 : 1;
    if (on(gx, gy)) { // soften the groove wall next to un-engraved neighbours
      const e = Math.min(on(gx - 1, gy) ? 1 : fx, on(gx + 1, gy) ? 1 : 1 - fx, on(gx, gy - 1) ? 1 : fy, on(gx, gy + 1) ? 1 : 1 - fy);
      v = Math.max(0, 0.6 - e * 2.4);
    }
    H[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4, d = Math.hypot(x / w - 0.45, y / h - 0.4) / 0.75, t = Math.min(1, d);
    const ink = 1 - H[i] > 0.5;
    const c = ink ? INK.map((v) => v - 18 * H[i]) : A.map((v, k) => v + (B[k] - v) * t);
    color.set([c[0], c[1], c[2], 255], o);
    const hx = (H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)]) * depth, hy = (H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x]) * depth;
    const n = [-hx, hy, 1], l = Math.hypot(...n); // +Y up in tangent space, image rows go down
    normal.set([(n[0] / l * 0.5 + 0.5) * 255, (n[1] / l * 0.5 + 0.5) * 255, (n[2] / l * 0.5 + 0.5) * 255, 255], o);
  }
  return { w, h, color, normal };
}
