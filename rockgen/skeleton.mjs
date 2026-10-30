// Skeleton + clips from the compact rig pack (rig.json, built by build-rigpack.mjs).
// Assets come from ROCKGEN_ASSETS_DIR (local folder) or ROCKGEN_ASSETS_URL (private https base, e.g. a Vercel Blob prefix).
import * as THREE from 'three';
import fs from 'fs'; import path from 'path';
let packP = null; const files = new Map();
export async function asset(name) {
  if (files.has(name)) return files.get(name);
  const p = (async () => {
    const dir = process.env.ROCKGEN_ASSETS_DIR, url = process.env.ROCKGEN_ASSETS_URL;
    if (url) { const tok = process.env.ROCKGEN_BLOB_TOKEN || process.env.BLOB_READ_WRITE_TOKEN; const r = await fetch(url.replace(/\/?$/, '/') + name, tok ? { headers: { authorization: 'Bearer ' + tok } } : undefined); if (!r.ok) throw new Error('rockgen asset ' + name + ' ' + r.status); return new Uint8Array(await r.arrayBuffer()); }
    return new Uint8Array(fs.readFileSync(path.join(dir || path.resolve('rockgen-assets'), name)));
  })();
  files.set(name, p); p.catch(() => files.delete(name)); return p;
}
const f32 = (b) => { const u = Buffer.from(b, 'base64'); return new Float32Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };
async function pack() { if (!packP) packP = asset('rig.json').then((b) => JSON.parse(Buffer.from(b).toString('utf8'))); return packP; }
export async function loadSkeleton() {
  const { skeleton: S } = await pack(), names = S.names, parent = S.parent, ibm = Array.from(f32(S.ibm)), world = {}, local = {}, pos = {};
  names.forEach((n, i) => { world[n] = new THREE.Matrix4().fromArray(ibm.slice(i * 16, i * 16 + 16)).invert(); pos[n] = new THREE.Vector3().setFromMatrixPosition(world[n]); });
  for (const n of names) {
    const m = parent[n] ? world[parent[n]].clone().invert().multiply(world[n]) : world[n].clone();
    const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(t, q, s);
    local[n] = { t: t.toArray(), r: q.toArray(), s: [1, 1, 1] };
  }
  return { names, ibm, parent, world, local, pos };
}
export async function loadClip(c) { const p = await pack(); return p.clips[c].map((ch) => ({ node: ch.node, path: ch.path, times: f32(ch.times), values: f32(ch.values), interp: 'LINEAR' })); }
export function clipDuration(chs) { return Math.max(...chs.map((c) => c.times[c.times.length - 1])); }
export function sampleChannel(ch, t) {
  const { times, values } = ch, n = ch.path === 'rotation' ? 4 : 3;
  if (t <= times[0]) return Array.from(values.slice(0, n));
  const last = times.length - 1; if (t >= times[last]) return Array.from(values.slice(last * n, last * n + n));
  let i = 0; while (times[i + 1] < t) i++;
  const a = (t - times[i]) / (times[i + 1] - times[i]), A = values.slice(i * n, i * n + n), B = values.slice((i + 1) * n, (i + 1) * n + n);
  if (n === 4) return new THREE.Quaternion().fromArray(A).slerp(new THREE.Quaternion().fromArray(B), a).toArray();
  return [0, 1, 2].map((k) => A[k] + (B[k] - A[k]) * a);
}
