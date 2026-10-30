import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { walletFace, composeCustom, contentHash } from '../src/faces/engine.js';
const load = (f: string) => JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));
describe('face engine matches caps-rocks reference vectors', () => {
  it('wallet faces', () => { for (const v of load('wallet_face_vectors.json')) expect(contentHash(walletFace(v.wallet, v.variant).bm)).toBe(v.contentHash); });
  it('custom faces', () => { for (const v of load('custom_face_vectors.json')) expect(contentHash(composeCustom(v.layout).bm)).toBe(v.contentHash); });
});

import { bitmapFromSvg as _bfs, renderSvg as _rs, composeCustom as _cc, DEFAULT_LAYOUT as _DL, contentHash as _ch } from '../src/faces/engine.js';
describe('custom face file round trip', () => {
  it('reads a pinned face SVG back to the same bitmap (contentHash matches)', () => {
    const { bm } = _cc(_DL); const back = _bfs(_rs(bm, 'custom-v2'));
    expect(back && _ch(back)).toBe(_ch(bm));
  });
});
