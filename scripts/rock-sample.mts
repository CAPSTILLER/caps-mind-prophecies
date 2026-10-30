import { generateRock } from '../rockgen/generate.mjs';
import { walletFace } from '../src/faces/engine.ts';
import fs from 'fs';
const a = '0x7a3F1b2C4d5E6f708192A3b4C5d6E7f809102030';
let t = Date.now(); const r = await generateRock(a, { face: walletFace(a, 0) }); console.log('full', r.glb.length, Date.now() - t, 'ms');
fs.writeFileSync('/workspace/capsmind_faces/sample_rock_face.glb', r.glb);
t = Date.now(); const p = await generateRock(a, { face: walletFace(a, 0), preview: true }); console.log('preview', p.glb.length, Date.now() - t);
fs.writeFileSync('/workspace/capsmind_faces/sample_rock_preview.glb', p.glb);
