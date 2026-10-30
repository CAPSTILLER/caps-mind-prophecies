import sha3 from 'js-sha3';
const { keccak256 } = sha3;
export function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function rngFrom(hex) {
  const w = [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16));
  const r = sfc32(...w); for (let i = 0; i < 12; i++) r();
  return r;
}
// Per-part stream: keccak(seed + ':' + label). Left & right share a label so limbs mirror.
export const subRng = (seedHex, label) => rngFrom(keccak256(seedHex + ':' + label));
export const range = (r, a, b) => a + (b - a) * r();
export { keccak256 };
