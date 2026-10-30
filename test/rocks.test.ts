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
  it('holder downloads GLB and zip', async () => {
    const r = await signed(); expect(r.status).toBe(200);
    const b = new Uint8Array(await r.arrayBuffer()); expect(new TextDecoder().decode(b.slice(0, 4))).toBe('glTF');
    const z = unzipSync(new Uint8Array(await (await signed(holder, { zip: true })).arrayBuffer())); expect(z['rock.glb'].length).toBe(b.length);
  }, 60000);
  it('non-holder refused', async () => { const r = await signed(other); expect(r.status).toBe(403); expect((await r.json()).error).toMatch(/holder/); });
  it('tampered / wrong-wallet signature refused', async () => {
    const ch = await (await app.request(`${H}/api/rocks/7/challenge?address=${holder.address}`)).json();
    const sig = await other.signMessage({ message: ch.message });
    const r = await app.request(`${H}/api/rocks/7/glb`, { method: 'POST', body: JSON.stringify({ address: holder.address, message: ch.message, signature: sig }) });
    expect(r.status).toBe(403);
    const forged = ch.message.replace(/Nonce: \w+/, 'Nonce: 000000000000000000000000');
    const r2 = await app.request(`${H}/api/rocks/7/glb`, { method: 'POST', body: JSON.stringify({ address: holder.address, message: forged, signature: await holder.signMessage({ message: forged }) }) });
    expect((await r2.json()).error).toMatch(/nonce/);
  });
});
