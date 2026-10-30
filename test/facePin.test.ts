import { describe, expect, it, vi } from 'vitest';
import { renderCustomCode, pinCustomFace, allow } from '../src/server/facePin.js';
import { DEFAULT_LAYOUT, encodeLayout, composeCustom, contentHash, bitmapFromSvg } from '../src/faces/engine.js';
import { parseQuote, quoteExpired } from '../src/faces/quote.js';
import { createApp } from '../src/server/app.js';

const code = encodeLayout(DEFAULT_LAYOUT);
describe('custom face pin', () => {
  it('re-renders kit faces and the hash matches the bitmap and the pinned SVG', () => {
    const r = renderCustomCode(code);
    const h = contentHash(composeCustom(DEFAULT_LAYOUT).bm);
    expect(r.contentHash).toBe(h);
    expect(contentHash(bitmapFromSvg(r.svg)!)).toBe(h);
  });
  it('rejects non-kit parts, bad borders, garbage and non-strings', () => {
    const bad = (mut: (b: number[]) => void) => { const b = code.slice(4).match(/../g)!.map((x) => parseInt(x, 16)); mut(b); return 'CF2-' + b.map((x) => x.toString(16).padStart(2, '0')).join(''); };
    expect(() => renderCustomCode(bad((b) => { b[2] = 0x7e; }))).toThrow();   // unknown eye part
    expect(() => renderCustomCode(bad((b) => { b[1] = 250; }))).toThrow();    // unknown border
    expect(() => renderCustomCode(bad((b) => { b[11] = 0xff; }))).toThrow();  // no mouth
    expect(() => renderCustomCode('CF2-zz')).toThrow();
    expect(() => renderCustomCode('<svg/>')).toThrow();
    expect(() => renderCustomCode({ svg: '<svg/>' })).toThrow();
  });
  it('pins the server render (not client input) and returns cid/uri/hash', async () => {
    const f = vi.fn(async (_u: string, init: any) => { const file = init.body.get('file') as File; expect(await file.text()).toBe(renderCustomCode(code).svg); return new Response(JSON.stringify({ data: { cid: 'bafyTEST' } }), { status: 200 }); });
    const out = await pinCustomFace(code, { PINATA_JWT: 'x' } as any, f as any);
    expect(out).toMatchObject({ cid: 'bafyTEST', uri: 'ipfs://bafyTEST', contentHash: renderCustomCode(code).contentHash });
  });
  it('route: 400 for bad layout, 503 without PINATA_JWT, rate limited', async () => {
    const { app } = createApp();
    const post = (b: unknown, ip = '1.1.1.1') => app.request('/api/faces/pin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(b) });
    expect((await post({ code: 'nope' })).status).toBe(400);
    const old = process.env.PINATA_JWT; delete process.env.PINATA_JWT;
    expect((await post({ code })).status).toBe(503);
    if (old !== undefined) process.env.PINATA_JWT = old;
    for (let i = 0; i < 10; i++) allow('pin:9.9.9.9');
    expect((await post({ code }, '9.9.9.9')).status).toBe(429);
  });
});

describe('quote parsing', () => {
  const payer = '0x1111111111111111111111111111111111111111';
  const j = { live: true, usd: 0.25, gear: '12', signature: '0x' + 'ab'.repeat(65), quote: { payer, tokenId: '1', kind: 1, gearAmount: '12000000', nonce: '99', validUntil: '2000000000' } };
  it('parses into FaceQuote field order with bigints', () => {
    const q = parseQuote(j, { payer, tokenId: 1n, kind: 1 });
    expect(Object.keys(q.quote)).toEqual(['payer', 'tokenId', 'kind', 'gearAmount', 'nonce', 'validUntil']);
    expect(q.quote.gearAmount).toBe(12000000n);
    expect(quoteExpired(q.quote, 1_000)).toBe(false);
    expect(quoteExpired(q.quote, 2_000_000_000)).toBe(true);
  });
  it('rejects wrong payer/rock/kind, not-live and errors', () => {
    expect(() => parseQuote(j, { payer: '0x2222222222222222222222222222222222222222', tokenId: 1n, kind: 1 })).toThrow(/different wallet/);
    expect(() => parseQuote(j, { payer, tokenId: 2n, kind: 1 })).toThrow(/different rock/);
    expect(() => parseQuote({ ...j, quote: { ...j.quote, kind: 0 } }, { payer, tokenId: 1n, kind: 1 })).toThrow(/kind/);
    expect(() => parseQuote({ live: false, reason: 'off' }, { payer, tokenId: 1n, kind: 1 })).toThrow('off');
    expect(() => parseQuote({ ...j, signature: '0x12' }, { payer, tokenId: 1n, kind: 1 })).toThrow(/signature/);
  });
});
