// DEV ONLY: pack Cap's Meshy skeleton + the 7 clips the rock uses into one small JSON (rig.json).
// The 178 MB Meshy GLBs never ship; only bone names/IBMs + keyframes do.
// usage: CAP_MODEL_DIR=/workspace/capmodel/... node rockgen/build-rigpack.mjs <outDir>
import { NodeIO } from '@gltf-transform/core';
import fs from 'fs'; import path from 'path';
const SRC = process.env.CAP_MODEL_DIR || '/workspace/capmodel/Meshy_AI_capstiller2_4_biped';
const CLIPS = ['Walking', 'Running', 'Big_Wave_Hello', 'Bass_Beats', 'Flirty_Strut_inplace', 'Cheer_with_Both_Hands'];
const out = process.argv[2] || 'rockgen-assets'; fs.mkdirSync(out, { recursive: true });
const io = new NodeIO(); const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const pack = { skeleton: null, clips: {} };
for (const c of CLIPS) {
  const doc = await io.read(path.join(SRC, `Meshy_AI_capstiller2_4_biped_Animation_${c}_withSkin.glb`));
  if (!pack.skeleton) {
    const skin = doc.getRoot().listSkins()[0], joints = skin.listJoints(), names = joints.map((j) => j.getName()), parent = {};
    for (const j of joints) { const p = j.listParents().find((x) => x.propertyType === 'Node' && names.includes(x.getName())); parent[j.getName()] = p ? p.getName() : null; }
    pack.skeleton = { names, parent, ibm: b64(Float32Array.from(skin.getInverseBindMatrices().getArray())) };
  }
  pack.clips[c] = doc.getRoot().listAnimations()[0].listChannels().map((ch) => ({ node: ch.getTargetNode().getName(), path: ch.getTargetPath(), times: b64(Float32Array.from(ch.getSampler().getInput().getArray())), values: b64(Float32Array.from(ch.getSampler().getOutput().getArray())) }));
}
fs.writeFileSync(path.join(out, 'rig.json'), JSON.stringify(pack));
fs.copyFileSync('/workspace/avatar-foundry/assets/torso/torso_lo.glb', path.join(out, 'torso_lo.glb'));
console.log('rig.json', fs.statSync(path.join(out, 'rig.json')).size);
