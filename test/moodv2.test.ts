// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs';
import { registerRockRoutes } from '../src/server/rocks.js';
import { pngToBitmap, decodePng, _resetAxleCaches } from '../src/server/axleFaces.js';
import { encodePng } from '../rockgen/png.mjs';

process.env.ROCKGEN_ASSETS_DIR ||= '/workspace/capsmind_faces/rockgen-assets';
const GW = 240, GH = 170, HASH = '0x' + 'ab'.repeat(32), H = 'http://localhost';
const src = new Uint8Array(GW * GH); for (let y = 40; y < 130; y++) for (let x = 60; x < 180; x++) if ((x + y) % 7 < 3) src[y * GW + x] = 1;
function axlePng(bm = src) { // Axle style: ink (ee,f2,f5) on blue gradient, 960x680
  const w = 960, h = 680, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, t = y / h, ink = bm[(y >> 2) * GW + (x >> 2)];
    px[o] = ink ? 0xee : 0x2f + (0x24 - 0x2f) * t; px[o + 1] = ink ? 0xf2 : 0x55 + (0x46 - 0x55) * t; px[o + 2] = ink ? 0xf5 : 0x96 + (0x7f - 0x96) * t; px[o + 3] = 255; }
  return encodePng(w, h, px);
}
const rock = { id: 3, owner: '0xc7d4E906741197aB6D3F6773D93E176596806661', seed: '0xc7d4E906741197aB6D3F6773D93E176596806661', forgedAt: 1, generatorVersion: 1, hasActive: true, active: 1,
  faces: [{ kind: 0, seed: '0xc7d4E906741197aB6D3F6773D93E176596806661', generatorVersion: 1, variant: 0, addedAt: 1, contentHash: '0x', uri: '' },
          { kind: 1, seed: '0xc7d4E906741197aB6D3F6773D93E176596806661', generatorVersion: 1, variant: 4, addedAt: 2, contentHash: HASH, uri: 'ipfs://bafymood' }] };
const reader = { rock: async () => rock, ownerOf: async () => rock.owner, verifyMessage: async () => false };
function mk(opts: { down?: boolean; exploited?: number } = {}) {
  const calls: string[] = [];
  const f = async (u: any) => { u = String(u); calls.push(u);
    if (u.includes('ipfs')) return new Response('<svg/>', { status: 200 });
    if (opts.down) throw new Error('ECONNREFUSED');
    if (u.endsWith(HASH + '.png')) return new Response(axlePng(), { headers: { 'content-type': 'image/png', 'x-face-kind': 'mood' } });
    if (u.endsWith(HASH + '.json')) return Response.json({ tokenId: 3, index: 1, kind: 'mood', art: 'mood', variant: 4, contentHash: HASH });
    if (u.includes('/api/rocks/status')) return Response.json({ exploitedFaces: opts.exploited ?? 0, exploitedFaceIndices: opts.exploited ? [1] : [], exploitUnverified: 0, exploitRule: 'x' });
    return new Response('nf', { status: 404 }); };
  const app = new Hono(); registerRockRoutes(app, reader, f); return { app, calls };
}
beforeEach(() => _resetAxleCaches());

describe('mood faces v2 (Axle art)', () => {
  it('decodes Axle PNG and downsamples exactly 4x to the 240x170 bitmap', () => {
    const p = axlePng(); expect(decodePng(p).w).toBe(960);
    expect(Array.from(pngToBitmap(p)!)).toEqual(Array.from(src));
    expect(pngToBitmap(encodePng(10, 10, new Uint8Array(400)))).toBeNull();
  });
  it('faces-info labels the mood and returns its bitmap; caches immutable art', async () => {
    const { app, calls } = mk();
    const j = await (await app.request(`${H}/api/rocks/3/faces-info`)).json();
    expect(j.faces[0]).toEqual({ i: 0, kind: 'wallet' });
    expect(j.faces[1].kind).toBe('mood'); expect(j.faces[1].mood).toBe('Joy'); expect(j.faces[1].bitmap).toMatch(/^0x[0-9a-f]+$/);
    expect(j.exploit.count).toBe(0);
    const n = calls.filter((u) => u.endsWith('.png')).length; await app.request(`${H}/api/rocks/3/faces-info`);
    expect(calls.filter((u) => u.endsWith('.png')).length).toBe(n);
  });
  it('Exploited Faces trait only when N > 0', async () => {
    const t = async (o) => (await (await mk(o).app.request(`${H}/api/rocks/3`)).json()).attributes.find((a) => a.trait_type === 'Exploited Faces');
    expect(await t({ exploited: 0 })).toBeUndefined();
    _resetAxleCaches(); expect((await t({ exploited: 2 })).value).toBe(2);
    _resetAxleCaches(); expect(await t({ down: true })).toBeUndefined();
  });
  it('Axle down: placeholder, never a 500', async () => {
    const { app } = mk({ down: true });
    const r = await app.request(`${H}/api/rocks/3/faces-info`); expect(r.status).toBe(200);
    expect((await r.json()).faces[1].placeholder).toBe(true);
    expect((await app.request(`${H}/api/rocks/3`)).status).toBe(200);
  });
  it.skipIf(!fs.existsSync(process.env.ROCKGEN_ASSETS_DIR + '/rig.json'))('face.png uses the mood art; placeholder when Axle is down', async () => {
    const ok = await mk().app.request(`${H}/api/rocks/3/face.png?face=1`); expect(ok.status).toBe(200); expect(ok.headers.get('x-face-placeholder')).toBeNull();
    _resetAxleCaches();
    const dn = await mk({ down: true }).app.request(`${H}/api/rocks/3/face.png?face=1`); expect(dn.status).toBe(200); expect(dn.headers.get('x-face-placeholder')).toBe('1');
  });
});
