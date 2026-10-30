// "Crushed Prophecy" style: every body part is a fractured slab of layer-zero tablet stone.
// Rigid binding: each vertex -> one joint, weight 1.0.
import * as THREE from 'three';
import { normalise, helpers } from '../shapes.mjs';
import { subRng, range } from '../rng.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MATS = ['stone', 'inlay', 'glow', 'face', 'torso'];
const TILE = 0.4; // metres per texture tile

// jagged, chipped tablet fragment: star-shaped polygon (always simple) extruded, back face shrunk/sheared
export function fractureShard(r, F) {
  const n = F.sides + Math.floor(r() * 3), pts = [];
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + range(r, -0.3, 0.3)) / n) * Math.PI * 2;
    const rad = 0.5 * (1 - F.jag * r());
    pts.push([a, rad]);
    if (r() < 0.55) pts.push([a + (Math.PI / n) * range(r, 0.7, 1.3), rad * (1 - F.jag * range(r, 0.2, 0.9))]); // fracture zig-zag
  }
  // chipped corners: pull a vertex inward
  for (let c = 0; c < F.chips; c++) { const k = Math.floor(r() * pts.length); pts[k][1] *= range(r, 0.6, 0.8); }
  pts.sort((p, q) => p[0] - q[0]);
  const s = new THREE.Shape(pts.map(([a, rr]) => new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  const pos = g.attributes.position, sh = [range(r, -0.08, 0.08), range(r, -0.08, 0.08)], bk = range(r, 0.84, 0.98);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i); // z=0 back, z=1 front
    const k = 1 + (bk - 1) * (1 - z);
    pos.setXYZ(i, pos.getX(i) * k + sh[0] * (1 - z), pos.getY(i) * k + sh[1] * (1 - z), z);
  }
  return normalise(g);
}

// capital-letter stroke templates on a 1x1 cell: [x0,y0,x1,y1]
const GLYPHS = {
  E: [[0, 0, 0, 1], [0, 1, 1, 1], [0, 0.5, 0.75, 0.5], [0, 0, 1, 0]], T: [[0, 1, 1, 1], [0.5, 0, 0.5, 1]], L: [[0, 0, 0, 1], [0, 0, 1, 0]],
  H: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 1, 0.5]], I: [[0.5, 0, 0.5, 1]], N: [[0, 0, 0, 1], [0, 1, 1, 0], [1, 0, 1, 1]],
  V: [[0, 1, 0.5, 0], [0.5, 0, 1, 1]], A: [[0, 0, 0.5, 1], [0.5, 1, 1, 0], [0.25, 0.45, 0.75, 0.45]], O: [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0]],
  S: [[1, 1, 0, 1], [0, 1, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 1, 0], [1, 0, 0, 0]], W: [[0, 1, 0.25, 0], [0.25, 0, 0.5, 0.6], [0.5, 0.6, 0.75, 0], [0.75, 0, 1, 1]],
};
const GL = Object.keys(GLYPHS);

export function buildTabletBody(T, skel, torsoAsset = null, opts = {}) {
  const P = skel.pos, J = (n) => skel.names.indexOf(n);
  const buckets = Object.fromEntries(MATS.map((m) => [m, { pos: [], nrm: [], jnt: [], uv: [], col: [] }]));
  const F = T.fracture, B = T.build;
  const pool = (() => { const r = subRng(T.seed, 'fracture'); return Array.from({ length: 16 }, () => fractureShard(r, F)); })();
  const stats = { shards: 0, inscribed: 0 };
  const rTint = subRng(T.seed, 'tint');

  function push(geo, m, joint, mat, { uvOff = [0, 0], tint = 1 } = {}) {
    const g = geo.clone().applyMatrix4(m); g.computeVertexNormals();
    const b = buckets[mat], p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let t = 0; t < p.length; t += 9) {
      const ax = Math.abs(n[t]), ay = Math.abs(n[t + 1]), az = Math.abs(n[t + 2]);
      for (let v = 0; v < 9; v += 3) {
        const x = p[t + v], y = p[t + v + 1], z = p[t + v + 2];
        const [u, w] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [z, y] : [x, z];
        b.pos.push(x, y, z); b.nrm.push(n[t + v], n[t + v + 1], n[t + v + 2]); b.jnt.push(joint);
        b.uv.push(u / TILE + uvOff[0], 1 - (w / TILE + uvOff[1])); b.col.push(tint, tint, tint);
      }
    }
  }
  function basis(dir, hint = V(0, 0, 1)) {
    const y = dir.clone().normalize();
    let h = hint.clone(); if (Math.abs(h.dot(y)) > 0.92) h = Math.abs(y.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0);
    const z = h.sub(y.clone().multiplyScalar(h.dot(y))).normalize();
    return new THREE.Matrix4().makeBasis(y.clone().cross(z).normalize(), y, z);
  }
  const mat4 = (c, dir, w, l, d, { spin = 0, tx = 0, tz = 0, hint } = {}) => new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
    .multiply(basis(dir, hint)).multiply(new THREE.Matrix4().makeRotationY(spin))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tx, 0, tz))).multiply(new THREE.Matrix4().makeScale(w, l, d));

  // inscription fragments on a shard's front face (unit space z=+0.5), raised ~1.5 mm
  function inscribe(r, m, w, l, d, joint) {
    const sx = 1 / w, sy = 1 / l, sz = 0.0016 / d, z = 0.5 + sz * 0.3, sw = 0.0065;
    const strip = (x0, y0, x1, y1, width = sw) => {
      const dx = (x1 - x0) * w, dy = (y1 - y0) * l, len = Math.hypot(dx, dy) + width;
      const loc = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, z)
        .multiply(new THREE.Matrix4().makeScale(sx, sy, 1)).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx)))
        .multiply(new THREE.Matrix4().makeScale(len, width, sz));
      push(helpers.box(0.05), m.clone().multiply(loc), joint, 'inlay');
    };
    const kind = r() < 0.4 ? 'border' : 'text';
    if (kind === 'border') { // broken corner of the tablet's border line
      const off = 0.3, ex = range(r, 0.05, 0.25), ey = range(r, 0.05, 0.25), cx = r() < 0.5 ? -1 : 1, cy = r() < 0.5 ? -1 : 1;
      strip(cx * off, cy * off, -cx * ex, cy * off); strip(cx * off, cy * off, cx * off, -cy * ey);
    } else { // a run of broken capital letters
      const ch = Math.min(0.055 / l, 0.32), cw = ch * (l / w) * 0.72, n = 2 + Math.floor(r() * 3);
      const y0 = range(r, -0.15, 0.15) - ch / 2, x0 = -(n * cw * 1.45) / 2;
      for (let i = 0; i < n; i++) {
        const strokes = GLYPHS[GL[Math.floor(r() * GL.length)]];
        strokes.forEach((s, k) => { if ((i === 0 || i === n - 1) && k > 0 && r() < 0.4) return; // broken edges lose strokes
          const X = (v) => x0 + i * cw * 1.45 + v * cw, Y = (v) => y0 + v * ch;
          if (Math.abs(X(s[0])) < 0.36 && Math.abs(X(s[2])) < 0.36) strip(X(s[0]), Y(s[1]), X(s[2]), Y(s[3]), 0.005); });
      }
    }
    stats.inscribed++;
  }

  // one tablet fragment
  function shard(r, c, dir, w, l, d, joint, opts = {}) {
    const geo = opts.geo || pool[Math.floor(r() * pool.length)];
    const m = mat4(c, dir, w, l, d, opts);
    push(geo, m, J(joint), opts.mat || 'stone', { uvOff: [r(), r()], tint: 1 - T.tintSpread * rTint() });
    stats.shards++;
    if (!opts.noInscribe && (opts.forceInscribe || r() < T.inscribedRate) && w > 0.07 && l > 0.06) inscribe(r, m, w, l, d, J(joint));
  }
  // a limb section: k sections along a->b, each made of 2-3 layered slabs
  function limb(label, side, a, b, joint, { w, k = T.shardsPerLimb, hint, veins = true }) {
    const r = subRng(T.seed, label), mir = side === 'R' ? -1 : 1;
    const dir = b.clone().sub(a), len = dir.length(), th = F.thickness;
    const bas = basis(dir, hint), ex = V().setFromMatrixColumn(bas, 0), ez = V().setFromMatrixColumn(bas, 2);
    for (let i = 0; i < k; i++) {
      const c = a.clone().lerp(b, (i + 0.5) / k), sl = (len / k) * T.fill, j = () => range(r, 1 - T.sizeJitter, 1 + T.sizeJitter * 0.5);
      const sc = () => V(range(r, -1, 1), 0, range(r, -1, 1)).multiplyScalar(T.scatter);
      const tilt = () => ({ tx: range(r, -1, 1) * T.tilt * 0.6, tz: mir * range(r, -1, 1) * T.tilt * 0.6 });
      const sd = w * th * 1.05;
      // front + back plates (faces outward)
      for (const s of [1, -1]) {
        const o = sc(); const cc = c.clone().add(ez.clone().multiplyScalar(s * sd * 0.5)).add(ex.clone().multiplyScalar(o.x)).add(ez.clone().multiplyScalar(o.z));
        shard(r, cc, dir, w * j(), sl * j() * (T.layering === 'Shingled' ? 1.18 : 1), sd, joint, { spin: (s < 0 ? Math.PI : 0) + mir * range(r, -0.12, 0.12), hint, ...tilt() });
      }
      if (T.layering === 'Stacked') { // a third slab across the side
        const cc = c.clone().add(ex.clone().multiplyScalar(mir * w * 0.32));
        shard(r, cc, dir, w * 0.7 * j(), sl * 0.8, sd * 0.7, joint, { spin: mir * Math.PI / 2, hint, ...tilt(), noInscribe: true });
      }
    }
    if (veins) push(helpers.rod(6), mat4(a.clone().lerp(b, 0.5), dir, w * 0.2, len * 0.95, w * 0.2, { hint }), J(joint), 'glow');
  }

  // ---- torso
  const tw = B.torso, cols = T.torso === 'Split' ? 2 : 1, rT = subRng(T.seed, 'torso');
  const rows = [['Hips', V(0, -0.12, 0), 'Spine', 0.34, 0.22], ['Spine', null, 'Spine1', 0.29, 0.19], ['Spine1', null, 'Spine2', 0.37, 0.22], ['Spine2', null, 'Neck', 0.45, 0.24]];
  let chestZ = null;
  if (torsoAsset) {
    // Cap's Meshy "shattered block torso": fit to the rig, cut off the neck stump, and bind each triangle
    // rigidly (by centroid height) to Hips / Spine / Spine1 / Spine2 -> seams open like cracks when the spine bends.
    const { pos, nrm, uv, idx, tan } = torsoAsset, Y0 = 0.98, CUT = 0.0123;
    const sx = 44 * tw, sy = 52, sz = 37 * tw, oz = -0.035;
    const bands = [[1.10, 'Hips'], [1.245, 'Spine'], [1.39, 'Spine1'], [9, 'Spine2']].map(([y, n]) => [y, J('mixamorig:' + n)]);
    const b = buckets.torso; b.tan = [];
    for (let t = 0; t < idx.length; t += 3) {
      const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
      if ((pos[ia * 3 + 1] + pos[ib * 3 + 1] + pos[ic * 3 + 1]) / 3 > CUT) continue;
      const cy = Y0 + ((pos[ia * 3 + 1] + pos[ib * 3 + 1] + pos[ic * 3 + 1]) / 3) * sy;
      const joint = bands.find(([y]) => cy < y)[1];
      for (const i of [ia, ib, ic]) {
        const x = pos[i * 3] * sx, y = Y0 + pos[i * 3 + 1] * sy, z = pos[i * 3 + 2] * sz + oz;
        let nx = nrm[i * 3] / sx, ny = nrm[i * 3 + 1] / sy, nz = nrm[i * 3 + 2] / sz; const l = Math.hypot(nx, ny, nz) || 1;
        const N3 = V(nx / l, ny / l, nz / l), T3 = V(tan[i * 4] * sx, tan[i * 4 + 1] * sy, tan[i * 4 + 2] * sz);
        T3.sub(N3.clone().multiplyScalar(N3.dot(T3))); if (T3.lengthSq() < 1e-16) T3.set(Math.abs(N3.x) < 0.9 ? 1 : 0, Math.abs(N3.x) < 0.9 ? 0 : 1, 0).sub(N3.clone().multiplyScalar(Math.abs(N3.x) < 0.9 ? N3.x : N3.y)); T3.normalize();
        b.tan.push(T3.x, T3.y, T3.z, tan[i * 4 + 3]);
        b.pos.push(x, y, z); b.nrm.push(nx / l, ny / l, nz / l); b.uv.push(uv[i * 2], uv[i * 2 + 1]); b.col.push(1, 1, 1); b.jnt.push(joint);
        if (Math.abs(y - 1.36) < 0.03 && Math.abs(x) < 0.1) chestZ = Math.max(chestZ ?? -1, z);
      }
    }
    stats.torsoTris = b.pos.length / 9;
  }
  rows.forEach(([j0, off, j1, w, d], ri) => {
    if (torsoAsset && ri > 0) return; // Meshy torso replaces the slab rows; keep the hip slabs
    const a = P['mixamorig:' + j0].clone().add(off || V()), b = torsoAsset && ri === 0 ? P['mixamorig:Hips'].clone().add(V(0, 0.06, 0)) : P['mixamorig:' + j1].clone();
    if (j0 === 'Hips') a.x = b.x = 0;
    const ww = w * tw, dd = d * tw, len = b.distanceTo(a), ctr = a.clone().lerp(b, 0.5);
    for (let c = 0; c < cols; c++) {
      const cx = cols === 1 ? 0 : (c - 0.5) * ww * 0.5, cw = ww / cols * 1.04;
      for (const s of [1, -1]) {
        const cc = ctr.clone().add(V(cx + range(rT, -1, 1) * T.scatter, 0, s * dd * 0.25));
        const chestPlate = s > 0 && (ri === 2) && T.chest === 'Prophecy Plate';
        shard(rT, cc, b.clone().sub(a), cw * range(rT, 0.97, 1.06), len * 1.12 * Math.max(T.fill, 0.98), dd * 0.52, 'mixamorig:' + j0, {
          spin: s < 0 ? Math.PI : 0, tx: range(rT, -0.5, 0.5) * T.tilt * 0.4, tz: range(rT, -0.5, 0.5) * T.tilt * 0.3, forceInscribe: chestPlate, noInscribe: ri === 3 && s > 0 && T.chest === 'Cracked Core',
        });
      }
    }
  });
  const chest = P['mixamorig:Spine2'].clone().lerp(P['mixamorig:Spine1'], 0.4); chest.x = 0;
  if (torsoAsset && T.chest === 'Prophecy Plate') // an inscribed tablet fragment set into the chest
    shard(subRng(T.seed, 'chestplate'), V(0.03, 1.33, chestZ - 0.006), V(0, 1, 0), 0.17 * tw, 0.13, 0.03, 'mixamorig:Spine1', { forceInscribe: true, tz: 0.12 });
  if (T.chest === 'Cracked Core') { // glowing fissure across the chest
    const z = torsoAsset ? chestZ + 0.004 : chest.z + 0.24 * tw * 0.5 + 0.012; let x = -0.11 * tw, y = chest.y + 0.05; const rc = subRng(T.seed, 'crack');
    for (let i = 0; i < 5; i++) { const nx = x + 0.045 * tw, ny = y + range(rc, -0.05, 0.05); push(helpers.box(0.2), mat4(V((x + nx) / 2, (y + ny) / 2, z), V(nx - x, ny - y, 0), 0.008, Math.hypot(nx - x, ny - y) + 0.006, 0.008), J('mixamorig:Spine1'), 'glow'); x = nx; y = ny; }
  }
  // neck
  limb('neck', 'L', P['mixamorig:Neck'], P['mixamorig:Head'].clone().add(V(0, 0.03, 0)), 'mixamorig:Neck', { w: 0.1 * tw, k: 1, veins: false });

  // ---- head: fractured stone block + intact blank face tablet
  const hs = B.head, hd = { w: 0.28 * hs, h: 0.3 * hs, d: 0.26 * hs };
  const hc = P['mixamorig:Head'].clone().add(V(0, 0.17 * hs, 0)); hc.x = 0;
  const rH = subRng(T.seed, 'head');
  for (const s of [1, -1]) shard(rH, hc.clone().add(V(0, 0, s * hd.d * 0.24)), V(0, 1, 0), hd.w * (T.head === 'Wedge' && s < 0 ? 0.86 : 1), hd.h * (T.head === 'Wedge' && s < 0 ? 1.12 : 1), hd.d * 0.52, 'mixamorig:Head', { spin: s < 0 ? Math.PI : 0, tz: range(rH, -0.06, 0.06), noInscribe: true });
  if (T.head === 'Broken Crown') for (let i = 0; i < 3; i++) shard(rH, V((i - 1) * hd.w * 0.3, hc.y + hd.h * 0.5 + 0.03, hc.z + range(rH, -0.03, 0.03)), V((i - 1) * 0.25, 1, 0), 0.07, i === 1 ? 0.14 : 0.1, 0.03, 'mixamorig:Head', { noInscribe: true });
  if (T.head === 'Wedge') shard(rH, V(0, hc.y + hd.h * 0.42, hc.z - hd.d * 0.1), V(0, 0.2, -1), hd.w * 0.5, hd.d * 0.8, 0.04, 'mixamorig:Head', { hint: V(0, 1, 0), noInscribe: true });
  // face tablet (landscape, intact, chamfered corners) + thin white inlay border only
  const ft = { w: hd.w * 0.86, h: hd.w * 0.86 * 0.74, t: 0.024 }, fz = hc.z + hd.d * 0.5 + ft.t * 0.5 - 0.004;
  const fc = V(0, hc.y - hd.h * 0.03, fz);
  push(helpers.box(0.12), mat4(fc, V(0, 1, 0), ft.w, ft.h, ft.t, { hint: V(0, 0, 1) }), J('mixamorig:Head'), 'face', { uvOff: [0.31, 0.62] });
  const inset = 0.011, bw = 0.0055, bz = fz + ft.t * 0.5 + 0.0007, W = ft.w / 2 - inset, Hh = ft.h / 2 - inset;
  const bar = (x, y, w, h) => push(helpers.box(0.05), mat4(V(fc.x + x, fc.y + y, bz), V(0, 1, 0), w, h, 0.002, { hint: V(0, 0, 1) }), J('mixamorig:Head'), 'inlay');
  if (!opts.engraved) { bar(0, Hh, 2 * W + bw, bw); bar(0, -Hh, 2 * W + bw, bw); bar(-W, 0, bw, 2 * Hh + bw); bar(W, 0, bw, 2 * Hh + bw); } // an engraved face brings its own border
  const engraveZone = { joint: 'mixamorig:Head', center: [fc.x, fc.y, bz].map((v) => +v.toFixed(4)), size: [+(2 * W - bw - 0.004).toFixed(4), +(2 * Hh - bw - 0.004).toFixed(4)], normal: [0, 0, 1], note: 'inside the white inlay border of the blank face tablet' };

  // ---- limbs (mirrored)
  const L = B.limb;
  for (const S of ['Left', 'Right']) {
    const s = S[0], j = (n) => 'mixamorig:' + S + n, p = (n) => P[j(n)];
    const rS = subRng(T.seed, 'extremity');
    limb('clav', s, p('Shoulder'), p('Arm'), j('Shoulder'), { w: 0.09 * L, k: 1, veins: false });
    limb('uparm', s, p('Arm'), p('ForeArm'), j('Arm'), { w: 0.145 * L });
    limb('foarm', s, p('ForeArm'), p('Hand'), j('ForeArm'), { w: 0.13 * L });
    const hDir = p('HandMiddle1').clone().sub(p('Hand'));
    shard(rS, p('Hand').clone().lerp(p('HandMiddle1'), 0.45), hDir, 0.115 * Math.sqrt(L), hDir.length() * 0.85, 0.065 * Math.sqrt(L), j('Hand'), { hint: V(0, 1, 0), noInscribe: true });
    const fj = ['HandMiddle1', 'HandMiddle2', 'HandMiddle3', 'HandMiddle4'];
    for (let i = 0; i < 3; i++) {
      const a = p(fj[i]), b = i === 2 ? p(fj[3]).clone().add(p(fj[3]).clone().sub(p(fj[2])).multiplyScalar(0.6)) : p(fj[i + 1]);
      shard(rS, a.clone().lerp(b, 0.5), b.clone().sub(a), 0.1 * Math.sqrt(L), b.distanceTo(a) * 1.2 + 0.014, 0.05 * Math.sqrt(L), j(fj[i]), { hint: V(0, 1, 0), noInscribe: true });
    }
    const ap = p('Arm'), out = V(s === 'L' ? 1 : -1, 0, 0);
    if (T.shoulders === 'Slab Pauldrons') shard(rS, ap.clone().add(V(0, 0.075 * L, 0)), out.clone().add(V(0, -0.35, 0)), 0.2 * L, 0.2 * L, 0.035, j('Arm'), { hint: V(0, 1, 0), tx: 0.1 });
    if (T.shoulders === 'Shard Spikes') for (const dz of [-0.04, 0.035]) shard(rS, ap.clone().add(V(0, 0.09, dz)), V(s === 'L' ? 0.3 : -0.3, 1, 0), 0.07, 0.15, 0.025, j('Arm'), { noInscribe: true });
    limb('thigh', s, p('UpLeg'), p('Leg'), j('UpLeg'), { w: 0.17 * L });
    limb('shin', s, p('Leg'), p('Foot').clone().add(V(0, -0.04, 0)), j('Leg'), { w: 0.14 * L });
    // foot: a flat tablet piece lying face-up, toe chip bound to ToeBase
    const fwd = p('ToeBase').clone().sub(p('Foot')); fwd.y = 0; fwd.normalize();
    const heel = p('Foot').clone().add(fwd.clone().multiplyScalar(-0.07)); heel.y = 0.055;
    const ball = p('ToeBase').clone(); ball.y = 0.055;
    shard(rS, heel.clone().lerp(ball, 0.5), ball.clone().sub(heel), 0.13 * Math.sqrt(L), heel.distanceTo(ball) * 1.0, 0.11, j('Foot'), { hint: V(0, 1, 0), noInscribe: true });
    const toe = ball.clone().add(fwd.clone().multiplyScalar(0.07)); toe.y = 0.03;
    shard(rS, ball.clone().lerp(toe, 0.5), toe.clone().sub(ball), 0.11 * Math.sqrt(L), 0.09, 0.06, j('ToeBase'), { hint: V(0, 1, 0), noInscribe: true });
    shard(rS, p('Foot').clone().add(V(0, -0.02, 0)), V(0, 1, 0), 0.1 * Math.sqrt(L), 0.1, 0.08 * Math.sqrt(L), j('Foot'), { noInscribe: true });
  }
  const faceSlot = { joint: 'mixamorig:Head', center: [fc.x, fc.y, fz + ft.t * 0.5], w: ft.w, h: ft.h };
  return { buckets, engraveZone, faceSlot, stats };
}
