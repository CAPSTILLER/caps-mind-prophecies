import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { unzipSync } from 'fflate';
import { registerRockRoutes, type RockReader, type RockInfo } from '../src/server/rocks.js';

process.env.ROCKGEN_ASSETS_DIR ||= '/workspace/capsmind_faces/rockgen-assets';
const holder = privateKeyToAccount(generatePrivateKey()), other = privateKeyToAccount(generatePrivateKey());
const rock: RockInfo = { id: 7, owner: holder.address, seed: holder.address, forgedAt: 1761800000, generatorVersion: 1, hasActive: true, active: 0,
  faces: [{ kind: 0, seed: holder.address, generatorVersion: 1, variant: 0, addedAt: 1, contentHash: '0x', uri: '' }] };
const reader: RockReader = { rock: async () => rock, ownerOf: async () => rock.owner, verifyMessage: (address, message, signature) => verifyMessage({ address, message, signature }) };
const app = new Hono(); registerRockRoutes(app, reader);
const H = 'http://localhost';
async function signed(acct = holder, body: any = {}) {
  const ch = await (await app.request(`${H}/api/rocks/7/challenge?address=${acct.address}`)).json();
  const signature = await acct.signMessage({ message: ch.message });
  return app.request(`${H}/api/rocks/7/glb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct.address, message: ch.message, signature, ...body }) });
}

describe.skipIf(!fs.existsSync(process.env.ROCKGEN_ASSETS_DIR + '/rig.json'))('rocks api', () => {
  it('metadata', async () => {
    const j = await (await app.request(`${H}/api/rocks/7`)).json();
    expect(j.image).toBe(`${H}/api/rocks/7/face.png`); expect(j.animation_url).toBe(`${H}/api/rocks/7/preview.glb`);
  });
  it('face png', async () => { const r = await app.request(`${H}/api/rocks/7/face.png`); expect(r.headers.get('content-type')).toBe('image/png'); });
  it('user GLB export is refused even for the holder (export lives on rocks.gearup.wtf)', async () => {
    delete process.env.ROCKS_RENDER_KEY;
    for (const acct of [holder, other]) { const r = await signed(acct); expect(r.status).toBe(403); expect((await r.json()).code).toBe('export_on_rocks_site'); }
  });
  it('render key still gets the full GLB and zip server-to-server', async () => {
    process.env.ROCKS_RENDER_KEY = 'k'.repeat(40);
    try {
      const q = (body: any) => app.request(`${H}/api/rocks/7/glb`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rocks-render-key': 'k'.repeat(40) }, body: JSON.stringify(body) });
      const r = await q({}); expect(r.status).toBe(200);
      const b = new Uint8Array(await r.arrayBuffer()); expect(new TextDecoder().decode(b.slice(0, 4))).toBe('glTF');
      const z = unzipSync(new Uint8Array(await (await q({ zip: true })).arrayBuffer())); expect(z['rock.glb'].length).toBe(b.length);
      const bad = await app.request(`${H}/api/rocks/7/glb`, { method: 'POST', headers: { 'x-rocks-render-key': 'wrong' }, body: '{}' }); expect(bad.status).toBe(403);
    } finally { delete process.env.ROCKS_RENDER_KEY; }
  }, 60000);
});

describe('preview.glb holder gate', () => {
  const rocks: Record<number, RockInfo> = { 1: { ...rock, id: 1, seed: other.address, owner: other.address }, 7: rock };
  const rd: RockReader = { rock: async (id) => { if (!rocks[id]) throw new Error('nf'); return rocks[id]; }, ownerOf: async (id) => rocks[id].owner, verifyMessage: (address, message, signature) => verifyMessage({ address, message, signature }) };
  const a = new Hono(); registerRockRoutes(a, rd);
  const tok = async (acct = holder, id = 7) => {
    const ch = await (await a.request(`${H}/api/rocks/${id}/challenge?address=${acct.address}`)).json();
    const signature = await acct.signMessage({ message: ch.message });
    return a.request(`${H}/api/rocks/${id}/view-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct.address, message: ch.message, signature }) });
  };
  const hasAssets = fs.existsSync(process.env.ROCKGEN_ASSETS_DIR + '/rig.json');
  it.skipIf(!hasAssets)('demo seed is public', async () => { expect((await a.request(`${H}/api/rocks/preview.glb?seed=0x0000000000000000000000000000000000000001`)).status).toBe(200); });
  it('other rocks need a holder token (before any not-found/build)', async () => {
    for (const u of ['/api/rocks/1/preview.glb', `/api/rocks/preview.glb?seed=${other.address}`, '/api/rocks/7/preview.glb', '/api/rocks/99/preview.glb', `/api/rocks/preview.glb?seed=${holder.address}`]) {
      const r = await a.request(H + u); expect(r.status).toBe(401); expect(await r.json()).toEqual({ error: 'holder signature required' });
    }
  });
  it('non-holder cannot get a token', async () => { expect((await tok(other)).status).toBe(403); });
  it.skipIf(!hasAssets)('valid token works (query and header)', async () => {
    const { token } = await (await tok()).json();
    expect((await a.request(`${H}/api/rocks/7/preview.glb?t=${token}`)).status).toBe(200);
    expect((await a.request(`${H}/api/rocks/7/preview.glb`, { headers: { 'x-rocks-view-token': token } })).status).toBe(200);
    expect((await a.request(`${H}/api/rocks/preview.glb?seed=${holder.address}&t=${token}`)).status).toBe(200);
  });
  it('wrong id, tampered, expired and sold tokens are rejected', async () => {
    const { issueViewToken } = await import('../src/server/rocks.js');
    const { token } = await (await tok()).json();
    expect((await a.request(`${H}/api/rocks/8/preview.glb?t=${token}`)).status).toBe(401);
    expect((await a.request(`${H}/api/rocks/7/preview.glb?t=${token}x`)).status).toBe(401);
    const old = issueViewToken(7, holder.address, Date.now() - 31 * 60_000).token;
    expect((await a.request(`${H}/api/rocks/7/preview.glb?t=${old}`)).status).toBe(401);
    rocks[7] = { ...rock, owner: other.address };
    try { expect((await a.request(`${H}/api/rocks/7/preview.glb?t=${token}`)).status).toBe(401); } finally { rocks[7] = rock; }
  });
  it('render key path', async () => {
    const u = `${H}/api/rocks/99/preview.glb`;
    delete process.env.ROCKS_RENDER_KEY;
    expect((await a.request(u, { headers: { 'x-rocks-render-key': '' } })).status).toBe(401);
    process.env.ROCKS_RENDER_KEY = 'test-key-123';
    try {
      expect((await a.request(u, { headers: { 'x-rocks-render-key': 'wrong' } })).status).toBe(401);
      expect((await a.request(u, { headers: { 'x-rocks-render-key': 'test-key-123' } })).status).toBe(404); // passes gate; rock 99 does not exist
    } finally { delete process.env.ROCKS_RENDER_KEY; }
  });
});

describe('holder face image download', () => {
  const rocks: Record<number, RockInfo> = { 7: { ...rock, faces: [...rock.faces, { kind: 0, seed: other.address, generatorVersion: 1, variant: 4, addedAt: 2, contentHash: '0x', uri: '' }] } };
  const rd: RockReader = { rock: async (id) => { if (!rocks[id]) throw new Error('nf'); return rocks[id]; }, ownerOf: async (id) => rocks[id].owner, verifyMessage: (address, message, signature) => verifyMessage({ address, message, signature }) };
  const a = new Hono(); registerRockRoutes(a, rd);
  const tok = async (acct = holder) => {
    const ch = await (await a.request(`${H}/api/rocks/7/challenge?address=${acct.address}`)).json();
    const signature = await acct.signMessage({ message: ch.message });
    return a.request(`${H}/api/rocks/7/view-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct.address, message: ch.message, signature }) });
  };
  const hasAssets = fs.existsSync(process.env.ROCKGEN_ASSETS_DIR + '/rig.json');
  it('needs a holder token', async () => {
    expect((await a.request(`${H}/api/rocks/7/face-image.png`)).status).toBe(401);
    expect((await a.request(`${H}/api/rocks/7/face-image.png?t=junk`)).status).toBe(401);
    const { issueViewToken } = await import('../src/server/rocks.js');
    expect((await a.request(`${H}/api/rocks/7/face-image.png?t=${issueViewToken(7, other.address).token}`)).status).toBe(401);
  });
  it.skipIf(!hasAssets)('holder gets PNGs of any face (incl. a mood face) at native and upscaled size', async () => {
    const { token } = await (await tok()).json(), h = { 'x-rocks-view-token': token };
    const dims = async (u: string) => { const r = await a.request(H + u, { headers: h }); expect(r.status).toBe(200); expect(r.headers.get('content-type')).toBe('image/png'); const b = Buffer.from(await r.arrayBuffer()); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    const n = await dims('/api/rocks/7/face-image.png?face=1&scale=1'), u = await dims('/api/rocks/7/face-image.png?face=0&scale=8');
    expect(u[0]).toBe(n[0] * 8); expect(u[1]).toBe(n[1] * 8);
    expect((await a.request(`${H}/api/rocks/7/face-image.png?scale=99`, { headers: h })).status).toBe(400);
    expect((await a.request(`${H}/api/rocks/7/face-image.png?face=5`, { headers: h })).status).toBe(404);
  }, 30000);
});
