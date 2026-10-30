import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { walletFace, composeCustom, contentHash } from '../src/faces/engine.js';
const load = (f: string) => JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));
describe('face engine matches caps-rocks reference vectors', () => {
  it('wallet faces', () => { for (const v of load('wallet_face_vectors.json')) expect(contentHash(walletFace(v.wallet, v.variant).bm)).toBe(v.contentHash); });
  it('custom faces', () => { for (const v of load('custom_face_vectors.json')) expect(contentHash(composeCustom(v.layout).bm)).toBe(v.contentHash); });
});
