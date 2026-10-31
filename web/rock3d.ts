// three.js turntable of the selected rock wearing the selected face. The server sends a seed-only
// preview GLB (Idle clip, blank face plate); the face texture is painted here live from the bitmap.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore plain JS
import { faceMaps } from '../rockgen/faceTex.mjs';

export function createRockViewer(canvas: HTMLCanvasElement, status: (s: string) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#05070c');
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50); cam.position.set(0.9, 1.35, 3.1);
  const ctl = new OrbitControls(cam, canvas); ctl.target.set(0, 0.95, 0); ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.6; ctl.minDistance = 0.6; ctl.maxDistance = 6;
  canvas.addEventListener('pointerdown', () => (ctl.autoRotate = false));
  scene.add(new THREE.HemisphereLight('#cfe0ff', '#202430', 1.4));
  const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(1.5, 3, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight('#7fb0ff', 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ color: '#10141c', roughness: 1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  let model: THREE.Object3D | null = null, mixer: THREE.AnimationMixer | null = null, faceMat: THREE.MeshStandardMaterial | null = null, seed = '', want: any = null, loading: Promise<void> | null = null;
  const clock = new THREE.Clock();
  let fit = { c: new THREE.Vector3(0, 0.95, 0), d: 3.4 };
  function front(spin = true) { ctl.target.copy(fit.c); cam.position.set(fit.c.x + fit.d * 0.22, fit.c.y + fit.d * 0.08, fit.c.z + fit.d); ctl.autoRotate = spin; ctl.update(); }
  function size() { const w = canvas.clientWidth || 800, h = canvas.clientHeight || 560; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(size).observe(canvas); size();
  renderer.setAnimationLoop(() => { const dt = clock.getDelta(); mixer?.update(dt); ctl.update(); renderer.render(scene, cam); });
  function paint() {
    if (!faceMat) return;
    const bm = want || new Uint8Array(240 * 170), m = faceMaps(bm, 3);
    const tex = (d: Uint8Array, srgb: boolean) => { const t = new THREE.DataTexture(d, m.w, m.h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
    faceMat.map?.dispose(); faceMat.normalMap?.dispose();
    faceMat.map = tex(m.color, true); faceMat.normalMap = tex(m.normal, false); faceMat.needsUpdate = true;
  }
  async function setRock(s: string, token = '') {
    if (!s || s.toLowerCase() === seed.toLowerCase()) return loading || undefined;
    seed = s; status('Forging rock ' + s.slice(0, 6) + '… in 3D');
    loading = (async () => {
      const g = await new GLTFLoader().loadAsync('/api/rocks/preview.glb?seed=' + s + (token ? '&t=' + encodeURIComponent(token) : ''));
      if (seed !== s) return;
      if (model) scene.remove(model);
      model = g.scene; scene.add(model); faceMat = null;
      model.traverse((o: any) => { if (o.isMesh) { o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) if (mm.name === 'FaceEngraving') faceMat = mm; } });
      mixer = new THREE.AnimationMixer(model); const idle = g.animations.find((a) => a.name === 'Idle') || g.animations[0]; if (idle) mixer.clipAction(idle).play();
      const bb = new THREE.Box3().setFromObject(model), c = bb.getCenter(new THREE.Vector3()), hgt = bb.max.y - bb.min.y;
      fit = { c, d: (hgt / 2) / Math.tan((cam.fov * Math.PI) / 360) * 1.35 }; front();
      paint(); status('');
    })().catch((e) => { status('3D preview unavailable: ' + (e?.message || e)); seed = ''; });
    return loading;
  }
  return { front, setRock, setFace(bm: any) { want = bm || null; paint(); }, canvas, get ready() { return !!model; } };
}
