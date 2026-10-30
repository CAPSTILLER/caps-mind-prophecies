// Base-shape families: "broken layer-zero tablet shards". Each returns a NON-indexed
// BufferGeometry normalised to the unit box [-0.5,0.5]^3 with the long axis on +Y.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { range } from './rng.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function shard(p, r) { // faceted crystal / bipyramid with uneven tips
  const pts = [], n = p.sides;
  const rings = p.bevel > 0.35 ? [-0.18, 0.18] : [range(r, -0.08, 0.12)];
  rings.forEach((y, k) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * (Math.PI / n);
      const rad = 0.5 * range(r, 0.82, 1.0);
      pts.push(V(Math.cos(a) * rad, y, Math.sin(a) * rad));
    }
  });
  pts.push(V(range(r, -0.08, 0.08), 0.5, range(r, -0.08, 0.08)));
  pts.push(V(range(r, -0.08, 0.08), -0.5, range(r, -0.08, 0.08)));
  // flattened tips read as "broken" ends
  if (p.bevel > 0.6) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; pts.push(V(Math.cos(a) * 0.12, 0.47, Math.sin(a) * 0.12)); pts.push(V(Math.cos(a) * 0.12, -0.47, Math.sin(a) * 0.12)); }
  return new ConvexGeometry(pts);
}

function chamferBox(b) { // beveled cube via convex hull of chamfered corners
  const pts = [], h = 0.5, c = Math.max(0.02, b * 0.22);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(V(sx * (h - c), sy * h, sz * (h - c)), V(sx * h, sy * (h - c), sz * (h - c)), V(sx * (h - c), sy * (h - c), sz * h));
  }
  return new ConvexGeometry(pts);
}

function gear(p) { // toothed disk, thickness along Y
  const s = new THREE.Shape(), n = p.teeth, R = 0.5, r0 = 0.5 * (0.74 + 0.08 * p.bevel);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, da = (Math.PI * 2) / n;
    const pts = [[a0, r0], [a0 + da * 0.18, R], [a0 + da * 0.5, R], [a0 + da * 0.68, r0]];
    pts.forEach(([a, rr], k) => (i === 0 && k === 0 ? s.moveTo : s.lineTo).call(s, Math.cos(a) * rr, Math.sin(a) * rr));
  }
  s.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.14, 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 1, curveSegments: 3 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function geode(p, r) { // faceted rock
  const g = new THREE.IcosahedronGeometry(0.5, p.bevel > 0.5 ? 1 : 0);
  const pos = g.attributes.position, seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(4)).join();
    if (!seen.has(key)) seen.set(key, range(r, 0.86, 1.08));
    const k = seen.get(key); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  return new ConvexGeometry(Array.from({ length: pos.count }, (_, i) => V(pos.getX(i), pos.getY(i), pos.getZ(i))));
}

function slab(p, r) { // chunk of a prophecy tablet: flat front, chipped corners
  const pts = [], h = 0.5;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of corners) {
    const chip = range(r, 0.05, 0.12 + 0.25 * p.bevel);
    for (const sz of [-1, 1]) {
      const zz = sz * h * (sz > 0 ? 1 : 0.85);
      pts.push(V(sx * h, sy * (h - chip), zz), V(sx * (h - chip * range(r, 0.6, 1.2)), sy * h, zz));
    }
  }
  return new ConvexGeometry(pts);
}

function prism(p) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, p.sides, 1, false, Math.PI / p.sides);
  return g;
}

export const FAMILIES = ['Shard', 'Beveled Cube', 'Gear', 'Geode', 'Tablet Slab', 'Prism'];

export function deform(g, { taper = 1, twist = 0 }) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y + 0.5, k = 1 + (taper - 1) * t, a = twist * (t - 0.5);
    x *= k; z *= k;
    pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  return g;
}

export function normalise(g) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g.computeBoundingBox();
  const b = g.boundingBox, c = b.getCenter(V()), s = b.getSize(V());
  g.translate(-c.x, -c.y, -c.z); g.scale(1 / s.x, 1 / s.y, 1 / s.z);
  return g;
}

export function makeShape(family, p, r) {
  let g;
  switch (family) {
    case 'Shard': g = shard(p, r); break;
    case 'Beveled Cube': g = chamferBox(p.bevel); break;
    case 'Gear': g = gear(p); break;
    case 'Geode': g = geode(p, r); break;
    case 'Tablet Slab': g = slab(p, r); break;
    case 'Prism': g = prism(p); break;
  }
  g = normalise(g);
  if (family !== 'Gear') deform(g, p);
  return normalise(g);
}

// small fixed helper shapes (eyes, rods, plates)
export const helpers = {
  box: (b = 0.3) => normalise(chamferBox(b)),
  gem: () => normalise(new ConvexGeometry([V(0, 0.5, 0), V(0, -0.5, 0), ...Array.from({ length: 6 }, (_, i) => V(Math.cos(i * Math.PI / 3) * 0.5, 0, Math.sin(i * Math.PI / 3) * 0.5))])),
  rod: (n = 6) => normalise(new THREE.CylinderGeometry(0.5, 0.5, 1, n)),
  ball: () => normalise(new THREE.IcosahedronGeometry(0.5, 1)),
  gear: (teeth = 7) => normalise(gear({ teeth, bevel: 0.5 })),
  spike: (n = 5) => normalise(new THREE.ConeGeometry(0.5, 1, n)),
};
