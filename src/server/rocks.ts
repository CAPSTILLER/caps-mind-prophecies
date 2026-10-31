// CAPs Rocks: metadata, face PNG, 3D preview, and the holder-gated full GLB download.
// The generator (rockgen/) runs only here on the server. Nothing here writes onchain.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Hono } from 'hono';
import { createPublicClient, fallback, getAddress, http, isAddress, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { zipSync } from 'fflate';
import { traits, composeWallet, bitmapFromSvg, contentHash, WALLET_FACE_VERSION } from '../faces/engine.js';
import { IPFS_GATEWAYS, ipfsPath } from '../tablets.js';
// rockgen (three.js, gltf-transform, private assets) loads lazily, only on PNG/GLB routes,
// so the page and metadata routes never depend on it at cold start.
let rgP: Promise<any> | null = null;
function rockgen(): Promise<{ generateRock: any; faceMaps: any; encodePng: any }> {
  if (!rgP) {
    rgP = Promise.all([
      // @ts-ignore plain JS module
      import('../../rockgen/generate.mjs'),
      // @ts-ignore plain JS module
      import('../../rockgen/faceTex.mjs'),
      // @ts-ignore plain JS module
      import('../../rockgen/png.mjs'),
    ]).then(([g, f, p]) => ({ generateRock: g.generateRock, faceMaps: f.faceMaps, encodePng: p.encodePng }));
    rgP.catch(() => { rgP = null; });
  }
  return rgP;
}

export const CAPS_ROCKS = '0x0fa575fd563517549e714acde968051a7310aadb' as const;
export const ROCK_GENERATOR_VERSION = 1;
const FACE_C = [{ name: 'kind', type: 'uint8' }, { name: 'seed', type: 'address' }, { name: 'generatorVersion', type: 'uint16' }, { name: 'variant', type: 'uint32' }, { name: 'addedAt', type: 'uint64' }, { name: 'contentHash', type: 'bytes32' }, { name: 'uri', type: 'string' }] as const;
const ABI = [
  { type: 'function', name: 'rockView', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'owner', type: 'address' },
    { name: 'avatar', type: 'tuple', components: [{ name: 'seed', type: 'address' }, { name: 'forgedAt', type: 'uint64' }, { name: 'generatorVersion', type: 'uint16' }, { name: 'tabletTokenId', type: 'uint256' }, { name: 'prophecyId', type: 'uint256' }] },
    { name: 'faceCount', type: 'uint256' }, { name: 'hasActiveFace', type: 'bool' }, { name: 'activeFaceIndex', type: 'uint256' },
    { name: 'poseCount', type: 'uint256' }, { name: 'hasActivePose', type: 'bool' }, { name: 'activePoseIndex', type: 'uint256' }] }] },
  { type: 'function', name: 'facesOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'tuple[]', components: FACE_C }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const;

export type ChainFace = { kind: number; seed: string; generatorVersion: number; variant: number; addedAt: number; contentHash: string; uri: string };
export type RockInfo = { id: number; owner: string; seed: string; forgedAt: number; generatorVersion: number; faces: ChainFace[]; hasActive: boolean; active: number };
export interface RockReader {
  rock(id: number): Promise<RockInfo>;
  ownerOf(id: number): Promise<string>;
  verifyMessage(address: Address, message: string, signature: Hex): Promise<boolean>;
}

export function chainRockReader(rpcUrls: string[]): RockReader {
  const client = createPublicClient({ chain: base, transport: fallback(rpcUrls.map((u) => http(u, { timeout: 8_000 }))) });
  return {
    async rock(id) {
      const v: any = await client.readContract({ address: CAPS_ROCKS, abi: ABI, functionName: 'rockView', args: [BigInt(id)] });
      const faces: any[] = Number(v.faceCount) ? (await client.readContract({ address: CAPS_ROCKS, abi: ABI, functionName: 'facesOf', args: [BigInt(id), 0n, 1000n] })) as any[] : [];
      return { id, owner: v.owner, seed: v.avatar.seed, forgedAt: Number(v.avatar.forgedAt), generatorVersion: Number(v.avatar.generatorVersion), hasActive: v.hasActiveFace, active: Number(v.activeFaceIndex),
        faces: faces.map((f) => ({ kind: Number(f.kind), seed: f.seed, generatorVersion: Number(f.generatorVersion), variant: Number(f.variant), addedAt: Number(f.addedAt), contentHash: f.contentHash, uri: f.uri })) };
    },
    async ownerOf(id) { return (await client.readContract({ address: CAPS_ROCKS, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] })) as string; },
    // handles EOAs and smart wallets (ERC-1271 / ERC-6492)
    async verifyMessage(address, message, signature) { return client.verifyMessage({ address, message, signature }).catch(() => false); },
  };
}

// ---------- faces -> bitmap ----------
async function faceBitmap(f: ChainFace, fetchImpl: typeof fetch): Promise<Uint8Array | number[] | null> {
  if (f.kind === 0) return f.generatorVersion === WALLET_FACE_VERSION ? composeWallet(traits(getAddress(f.seed), f.variant, f.generatorVersion)).bm : null;
  const p = ipfsPath(f.uri), urls = p ? IPFS_GATEWAYS.map((g) => g + p) : /^https:\/\//.test(f.uri) ? [f.uri] : [];
  for (const u of urls) {
    try {
      const r = await fetchImpl(u, { signal: AbortSignal.timeout(6000) }); if (!r.ok) continue;
      const bm = bitmapFromSvg(await r.text());
      if (bm && contentHash(bm).toLowerCase() === f.contentHash.toLowerCase()) return bm;
    } catch { /* next gateway */ }
  }
  return null;
}
const faceKey = (f: ChainFace | null) => (f ? `${f.kind}:${f.seed}:${f.generatorVersion}:${f.variant}:${f.contentHash}` : 'blank');

// ---------- signed download message ----------
export const DL_TTL_S = 300;
function dlSecret() { return (process.env.ROCKS_DL_SECRET || '').trim() || (globalThis as any).__rocksDevSecret || ((globalThis as any).__rocksDevSecret = randomBytes(32).toString('hex')); }
function nonceFor(domain: string, address: string, id: number, issued: string) { return createHmac('sha256', dlSecret()).update(`${domain}|${address.toLowerCase()}|${id}|${issued}`).digest('hex').slice(0, 24); }
export function downloadMessage(domain: string, address: string, id: number, issued: string, nonce: string) {
  const exp = new Date(Date.parse(issued) + DL_TTL_S * 1000).toISOString();
  return `CAPs Rocks download\nDomain: ${domain}\nAddress: ${getAddress(address)}\nToken: ${id}\nIssued: ${issued}\nExpires: ${exp}\nNonce: ${nonce}`;
}
export function challenge(domain: string, address: string, id: number, now = Date.now()) {
  const issued = new Date(now).toISOString(), nonce = nonceFor(domain, address, id, issued);
  return { message: downloadMessage(domain, address, id, issued, nonce), issued, nonce, expiresIn: DL_TTL_S };
}
export async function checkDownload(reader: RockReader, domain: string, id: number, b: { address?: string; message?: string; signature?: string }, now = Date.now()): Promise<string | null> {
  if (!b.address || !isAddress(b.address) || !b.message || !b.signature) return 'address, message and signature required';
  const m = /\nIssued: (\S+)\n[\s\S]*\nNonce: ([0-9a-f]+)$/.exec(b.message);
  if (!m) return 'bad message format';
  const [, issued, nonce] = m, t = Date.parse(issued);
  if (b.message !== downloadMessage(domain, b.address, id, issued, nonce)) return 'message does not match this site, wallet and rock';
  const want = Buffer.from(nonceFor(domain, b.address, id, issued)), got = Buffer.from(nonce);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'bad nonce';
  if (!(t <= now + 30_000 && now - t <= DL_TTL_S * 1000)) return 'signature expired, sign again';
  if (!(await reader.verifyMessage(getAddress(b.address), b.message, b.signature as Hex))) return 'signature does not match the wallet';
  const owner = await reader.ownerOf(id);
  if (owner.toLowerCase() !== b.address.toLowerCase()) return 'only the current holder of this rock can download it';
  return null;
}

// ---------- holder view token (gates preview.glb for every rock except PUBLIC_ROCK) ----------
export const PUBLIC_ROCK = 1, VIEW_TTL_S = 30 * 60;
export const DEMO_SEED = '0x0000000000000000000000000000000000000001';
const b64u = (s: string) => Buffer.from(s).toString('base64url');
function viewSig(body: string) { return createHmac('sha256', dlSecret()).update('view|' + body).digest('base64url'); }
export function issueViewToken(id: number, address: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + VIEW_TTL_S, body = b64u(`${id}.${address.toLowerCase()}.${exp}`);
  return { token: `${body}.${viewSig(body)}`, expiresAt: exp };
}
export function parseViewToken(t: string | undefined | null, now = Date.now()): { id: number; address: string } | null {
  if (!t) return null;
  const [body, sig, extra] = t.split('.'); if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(viewSig(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const m = /^(\d{1,9})\.(0x[0-9a-f]{40})\.(\d+)$/.exec(Buffer.from(body, 'base64url').toString());
  if (!m || Number(m[3]) * 1000 < now) return null;
  return { id: Number(m[1]), address: m[2] };
}
export function renderKeyOk(h: string | undefined | null) {
  const k = (process.env.ROCKS_RENDER_KEY || '').trim(); if (!k || !h) return false;
  const a = createHmac('sha256', 'rk').update(k).digest(), b = createHmac('sha256', 'rk').update(h.trim()).digest();
  return timingSafeEqual(a, b);
}
const DENY = { error: 'holder signature required' };

// ---------- generation with a tiny in-memory cache ----------
const cache = new Map<string, Promise<Uint8Array>>();
function rockGlb(seed: string, bm: any, key: string, preview: boolean) {
  const k = `${ROCK_GENERATOR_VERSION}|${seed.toLowerCase()}|${key}|${preview ? 'p' : 'f'}`;
  if (!cache.has(k)) {
    const p = rockgen().then((g) => g.generateRock(getAddress(seed), { face: bm, preview })).then((r: any) => r.glb as Uint8Array);
    cache.set(k, p); p.catch(() => cache.delete(k));
    while (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return cache.get(k)!;
}
export async function facePng(bm: any, s = 4) { const g = await rockgen(); const m = g.faceMaps(bm, s); return g.encodePng(m.w, m.h, m.color) as Buffer; }
const BLANK = new Uint8Array(240 * 170);

export function registerRockRoutes(app: Hono<any>, reader: RockReader, fetchImpl: typeof fetch = fetch) {
  const idOf = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null);
  const pick = async (r: RockInfo, q?: string | null) => {
    const i = q != null && q !== '' ? Number(q) : r.hasActive ? r.active : -1;
    if (i >= 0 && !(Number.isInteger(i) && i < r.faces.length)) throw new Error('no face #' + q + ' on this rock');
    const f = i >= 0 ? r.faces[i] : null, bm = f ? await faceBitmap(f, fetchImpl) : null;
    if (f && !bm) throw new Error('face #' + i + ' could not be rebuilt (generator version or file unavailable)');
    return { i, f, bm };
  };
  const origin = (c: any) => new URL(c.req.url).origin;
  const domain = (c: any) => (c.req.header('x-forwarded-host') || new URL(c.req.url).host);

  const tokenOf = (c: any) => c.req.header('x-rocks-view-token') || c.req.query('t') || '';
  // null = allowed (holder token for this rock, still held), else a deny reason
  const holderOk = async (c: any, id: number) => {
    const v = parseViewToken(tokenOf(c)); if (!v || v.id !== id) return false;
    try { return (await reader.ownerOf(id)).toLowerCase() === v.address; } catch { return false; }
  };
  let pubSeed: Promise<string> | null = null;
  const publicSeed = () => (pubSeed ||= reader.rock(PUBLIC_ROCK).then((r) => r.seed.toLowerCase()).catch((e) => { pubSeed = null; throw e; }));
  const gated = (c: any) => !renderKeyOk(c.req.header('x-rocks-render-key'));
  const nostore = { 'cache-control': 'private, no-store' };

  // seed-only preview for the /faces viewer (Idle clip, half-res face; blank tablet, the page paints the face live)
  // Public only for rock #1's seed and the demo seed; otherwise needs a holder view token for a rock with this seed.
  app.get('/api/rocks/preview.glb', async (c) => {
    const seed = c.req.query('seed') || '';
    if (!isAddress(seed)) return c.json({ error: 'seed must be an address' }, 400);
    let pub = seed.toLowerCase() === DEMO_SEED;
    if (!pub && gated(c)) {
      pub = await publicSeed().then((s) => s === seed.toLowerCase()).catch(() => false);
      if (!pub) {
        const v = parseViewToken(tokenOf(c));
        const ok = v && await reader.rock(v.id).then((r) => r.seed.toLowerCase() === seed.toLowerCase()).catch(() => false) && await holderOk(c, v.id);
        if (!ok) return c.json(DENY, 401, nostore);
      }
    }
    try {
      const glb = await rockGlb(seed, BLANK, 'blank', true);
      return c.body(glb as any, 200, { 'content-type': 'model/gltf-binary', ...(pub ? { 'cache-control': 'public, max-age=86400, s-maxage=31536000, immutable' } : nostore) });
    } catch (e: any) { console.error('preview.glb', e); return c.text('rock build failed: ' + (e?.message || e), 500); }
  });

  // ERC-721 metadata: tokenURI = baseURI + id  =>  baseURI = https://<host>/api/rocks/
  app.get('/api/rocks/:id', async (c) => {
    const id = idOf(c.req.param('id')); if (id == null) return c.json({ error: 'bad id' }, 400);
    let r: RockInfo; try { r = await reader.rock(id); } catch (e) { return c.json({ error: 'rock not found or chain read failed' }, 404); }
    const o = origin(c), af = r.hasActive ? r.faces[r.active] : null;
    return c.json({
      name: `CAPs Rock #${id}`,
      description: 'A CAPs Rock: a rigged Crushed Prophecy stone avatar forged from a wallet, wearing its chosen face. Faces are added and chosen at capsmind.gearup.wtf/faces.',
      image: `${o}/api/rocks/${id}/face.png`,
      animation_url: `${o}/api/rocks/${id}/preview.glb`,
      external_url: `${o}/faces?rock=${id}`,
      attributes: [
        { trait_type: 'Seed Wallet', value: getAddress(r.seed) },
        { trait_type: 'Generator Version', value: r.generatorVersion },
        { trait_type: 'Faces Collected', value: r.faces.length },
        { trait_type: 'Active Face', value: af ? (af.kind === 0 ? 'Wallet face ' + af.seed.slice(0, 6) + '…' + af.seed.slice(-4) : 'Custom ' + af.contentHash.slice(0, 10)) : 'Blank tablet' },
        { display_type: 'date', trait_type: 'Forged', value: r.forgedAt },
      ],
    }, 200, { 'cache-control': 'public, max-age=60, s-maxage=60' });
  });

  app.get('/api/rocks/:id/face.png', async (c) => {
    const id = idOf(c.req.param('id')); if (id == null) return c.text('bad id', 400);
    try { const r = await reader.rock(id), { bm } = await pick(r, c.req.query('face')); return c.body(await facePng(bm || BLANK) as any, 200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=60' }); }
    catch (e: any) { return c.text(e.message || 'error', 404); }
  });

  // public marketplace preview of the active face: Idle only, half-res face texture
  app.get('/api/rocks/:id/preview.glb', async (c) => {
    const id = idOf(c.req.param('id')); if (id == null) return c.text('bad id', 400);
    const pub = id === PUBLIC_ROCK;
    if (!pub && gated(c) && !(await holderOk(c, id))) return c.json(DENY, 401, nostore);
    try { const r = await reader.rock(id), { f, bm } = await pick(r, c.req.query('face')); return c.body(await rockGlb(r.seed, bm || BLANK, faceKey(f), true) as any, 200, { 'content-type': 'model/gltf-binary', ...(pub ? { 'cache-control': 'public, max-age=60' } : nostore) }); }
    catch (e: any) { return c.text(e.message || 'error', 404); }
  });

  app.get('/api/rocks/:id/challenge', (c) => {
    const id = idOf(c.req.param('id')), a = c.req.query('address') || '';
    if (id == null || !isAddress(a)) return c.json({ error: 'id and address required' }, 400);
    return c.json(challenge(domain(c), a, id), 200, { 'cache-control': 'no-store' });
  });

  // holder view token: same signed challenge as /glb. body: {address, message, signature} -> {token, expiresAt}
  app.post('/api/rocks/:id/view-token', async (c) => {
    const id = idOf(c.req.param('id')); if (id == null) return c.json({ error: 'bad id' }, 400);
    const b = await c.req.json().catch(() => ({}));
    const err = await checkDownload(reader, domain(c), id, b).catch((e) => 'chain check failed: ' + (e?.message || e));
    if (err) return c.json({ error: err }, 403, nostore);
    return c.json(issueViewToken(id, b.address), 200, nostore);
  });

  // holder-gated full GLB (all clips, full-res face). body: {address, message, signature, face?, zip?}
  app.post('/api/rocks/:id/glb', async (c) => {
    const id = idOf(c.req.param('id')); if (id == null) return c.json({ error: 'bad id' }, 400);
    const b = await c.req.json().catch(() => ({}));
    const err = await checkDownload(reader, domain(c), id, b).catch((e) => 'chain check failed: ' + (e?.message || e));
    if (err) return c.json({ error: err }, 403);
    try {
      const r = await reader.rock(id), { i, f, bm } = await pick(r, b.face != null ? String(b.face) : null);
      const glb = await rockGlb(r.seed, bm || BLANK, faceKey(f), false), name = `caps-rock-${id}${i >= 0 ? '-face-' + i : ''}`;
      if (b.zip) {
        const z = zipSync({ 'rock.glb': [glb, { level: 6 }], 'README.txt': new TextEncoder().encode(`CAPs Rock #${id}\nFace: ${i >= 0 ? '#' + i : 'blank tablet'}\nRigged (36 Mixamo joints), 7 clips, metres, feet on the floor.\n`) });
        return c.body(z as any, 200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}.zip"`, 'cache-control': 'no-store' });
      }
      return c.body(glb as any, 200, { 'content-type': 'model/gltf-binary', 'content-disposition': `attachment; filename="${name}.glb"`, 'cache-control': 'no-store' });
    } catch (e: any) { return c.json({ error: e.message || 'generation failed' }, 500); }
  });
}
