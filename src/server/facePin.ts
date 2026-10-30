/** POST /api/faces/pin: re-render a kit-only custom face server-side (frozen engine), pin its SVG to IPFS. */
import { composeCustom, contentHash, decodeLayout, encodeLayout, renderSvg } from '../faces/engine.js';
import { pinataJwt, pinataUpload } from './upload.js';

export type PinnedFace = { cid: string; uri: string; contentHash: string; code: string };
const CODE_RE = /^CF2-[0-9a-f]{28}$/;

/** Validate a custom face code (kit parts only) and render it. Throws with a user-facing message. Never trusts client SVG. */
export function renderCustomCode(code: unknown): { code: string; svg: string; contentHash: string } {
  if (typeof code !== 'string') throw new Error('code must be a CF2 face code string');
  const c = code.trim().toLowerCase().replace(/^cf2-/, 'CF2-');
  if (!CODE_RE.test(c)) throw new Error('not a valid CF2 face code');
  const layout = decodeLayout(c);
  const { bm } = composeCustom(layout); // throws on unknown parts / borders, overlap, out of bounds
  if (encodeLayout(layout) !== c) throw new Error('face code is not canonical');
  return { code: c, svg: renderSvg(bm, 'custom-v2'), contentHash: contentHash(bm) };
}

const hits = new Map<string, number[]>();
/** Simple per-instance sliding window. Returns true if allowed. */
export function allow(key: string, max = 10, windowMs = 60_000, now = Date.now()): boolean {
  const xs = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (xs.length >= max) { hits.set(key, xs); return false; }
  xs.push(now); hits.set(key, xs);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function pinCustomFace(code: unknown, env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): Promise<PinnedFace> {
  const r = renderCustomCode(code);
  if (!pinataJwt(env)) throw Object.assign(new Error('IPFS pinning is not configured here (PINATA_JWT missing).'), { status: 503 });
  const name = `caps-rocks-custom-face-${r.contentHash.slice(2, 18)}.svg`;
  const cid = await pinataUpload(new File([r.svg], name, { type: 'image/svg+xml' }), name, env, f);
  return { cid, uri: 'ipfs://' + cid, contentHash: r.contentHash, code: r.code };
}
