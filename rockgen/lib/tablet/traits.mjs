import { keccak256 } from '../rng.mjs';
import { parseAddress, BUILDS, GLOWS } from '../traits.mjs';

export const LAYERINGS = ['Paired', 'Stacked', 'Shingled'];
export const VEINS = ['Sparse', 'Fine', 'Dense', 'Marbled'];
export const HEADS = ['Block', 'Wedge', 'Broken Crown'];
export const SHOULDERS = ['None', 'Slab Pauldrons', 'Shard Spikes'];
export const CHESTS = ['Prophecy Plate', 'Cracked Core', 'Plain Slab'];
export const TORSOS = ['Monolith', 'Split'];
export const AURAS = [{ name: 'Faint', strength: 0.9 }, { name: 'Glowing', strength: 1.8 }, { name: 'Blazing', strength: 3.2 }];

export function deriveTabletTraits(address) {
  const addr = parseAddress(address);
  const seed = keccak256(Buffer.from(addr.slice(2), 'hex'));
  const H = Buffer.from(seed, 'hex');
  const pick = (i, arr) => arr[H[i] % arr.length];
  const f = (i, a, b) => +(a + (b - a) * (H[i] / 255)).toFixed(3);
  return {
    style: 'tablet', address: addr, seed,
    fracture: { sides: 5 + (H[0] % 5), jag: f(1, 0.12, 0.38), chips: H[2] % 4, thickness: f(3, 0.3, 0.5) },
    sizeJitter: f(4, 0.04, 0.2),
    build: pick(5, BUILDS),
    shardsPerLimb: 1 + (H[6] % 4),
    fill: f(7, 0.92, 1.12),
    scatter: f(8, 0.0, 0.022),
    layering: pick(9, LAYERINGS),
    inscribedRate: f(10, 0.06, 0.26),
    veins: pick(11, VEINS),
    tilt: f(12, 0.04, 0.34),
    tintSpread: f(13, 0.04, 0.14),
    glow: pick(14, GLOWS),
    aura: pick(15, AURAS),
    head: pick(16, HEADS),
    shoulders: pick(17, SHOULDERS),
    chest: pick(18, CHESTS),
    torso: pick(19, TORSOS),
  };
}
