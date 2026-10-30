import { keccak256 } from './rng.mjs';
import { FAMILIES } from './shapes.mjs';

export const PALETTES = [
  { name: 'Base Blue & Bronze', primary: '#0052FF', secondary: '#B0763A' },
  { name: 'Dusty Stone & Gold', primary: '#7D8FA8', secondary: '#D4A84B' },
  { name: 'Bronze & Base Blue', primary: '#9C6A35', secondary: '#0052FF' },
  { name: 'Gold & Dusty Stone', primary: '#C9A04A', secondary: '#6F829C' },
  { name: 'Deep Vault & Blue', primary: '#232C3B', secondary: '#0052FF' },
  { name: 'Stone & Slate', primary: '#97A4B6', secondary: '#4A586C' },
  { name: 'Base Blue & White Inlay', primary: '#0052FF', secondary: '#E8E4DA' },
  { name: 'Verdigris & Bronze', primary: '#4E8C7E', secondary: '#B0763A' },
];
export const GLOWS = [
  { name: 'Turquoise', hex: '#2EE6D6' }, { name: 'Aura Gold', hex: '#FFC34D' },
  { name: 'Blue Fire', hex: '#3D8BFF' }, { name: 'Ember', hex: '#FF6A2B' },
  { name: 'Violet', hex: '#A46BFF' }, { name: 'White Light', hex: '#F4F7FF' },
];
export const FINISHES = [
  { name: 'Matte Stone', metallic: 0.0, roughness: 0.85 },
  { name: 'Polished Stone', metallic: 0.1, roughness: 0.38 },
  { name: 'Forged Metal', metallic: 0.85, roughness: 0.32 },
  { name: 'Satin Bronze', metallic: 0.6, roughness: 0.5 },
];
export const BUILDS = [
  { name: 'Stocky', limb: 1.25, torso: 1.15, head: 1.08 },
  { name: 'Standard', limb: 1.0, torso: 1.0, head: 1.0 },
  { name: 'Lanky', limb: 0.86, torso: 0.9, head: 0.95 },
  { name: 'Hulking', limb: 1.42, torso: 1.32, head: 0.9 },
  { name: 'Sentinel', limb: 1.05, torso: 1.2, head: 1.14 },
];
export const EYES = ['Twin Dots', 'Visor', 'Cyclops', 'Seven Lights', 'Slits', 'Hex Lenses'];
export const CROWNS = ['None', 'Shard Crown', 'Gear Halo', 'Horns', 'Antenna', 'Fin'];
export const CORES = ['Gold Core', 'Seven Lights', 'Inlay Stripe', 'Gear Heart'];
export const PAULDRONS = ['None', 'Shape Pauldron', 'Gear Pauldron', 'Twin Spikes'];
export const PATTERNS = ['Solid', 'Alternating', 'Gloves & Boots', 'Inverted'];
export const TORSOS = ['Monolith', 'Split', 'Ribbed'];

export function parseAddress(a) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error('not a 20-byte hex address: ' + a);
  return a.toLowerCase();
}

export function deriveTraits(address) {
  const addr = parseAddress(address);
  const seed = keccak256(Buffer.from(addr.slice(2), 'hex')); // keccak256 of the 20 address bytes
  const H = Buffer.from(seed, 'hex');
  const pick = (i, arr) => arr[H[i] % arr.length];
  const f = (i, a, b) => +(a + (b - a) * (H[i] / 255)).toFixed(3);
  const family = pick(0, FAMILIES);
  const shape = {
    family,
    sides: 5 + (H[1] % 4),            // shard / prism facets 5-8
    teeth: 7 + (H[1] % 6),            // gear teeth 7-12
    bevel: f(2, 0, 1),
    twist: f(3, -0.9, 0.9),           // radians across the shape
    taper: f(4, 0.6, 1.15),
  };
  let pal = PALETTES[H[9] % PALETTES.length];
  if (H[10] & 1) pal = { name: pal.name.split(' & ').reverse().join(' & '), primary: pal.secondary, secondary: pal.primary };
  return {
    address: addr, seed,
    shape,
    build: pick(5, BUILDS),
    copiesPerLimb: family === 'Gear' ? 3 + (H[6] % 3) : 1 + (H[6] % 3),
    fill: f(7, 0.84, 1.12),           // <1 = floating shards with aura showing, >1 = overlapping
    tilt: f(8, 0.0, 0.32),            // per-copy jitter (radians)
    spinStep: f(18, -0.6, 0.6),       // spiral rotation between stacked copies
    palette: pal,
    glow: pick(11, GLOWS),
    finish: pick(12, FINISHES),
    eyes: pick(13, EYES),
    crown: pick(14, CROWNS),
    core: pick(15, CORES),
    pauldrons: pick(16, PAULDRONS),
    pattern: pick(17, PATTERNS),
    torso: pick(19, TORSOS),
    auraVeins: H[20] % 3 !== 0,
  };
}
