/** Parse the signed face quote from mywally.gearup.wtf/api/rocks/quote into contract args (FaceQuote field order). */
export const QUOTE_URL = 'https://mywally.gearup.wtf/api/rocks/quote';
export type FaceQuote = { payer: `0x${string}`; tokenId: bigint; kind: number; gearAmount: bigint; nonce: bigint; validUntil: bigint };
export type ParsedQuote = { quote: FaceQuote; signature: `0x${string}`; gear: string; usd: number };

const big = (v: unknown, k: string) => { if (typeof v !== 'string' && typeof v !== 'number') throw new Error('quote missing ' + k); if (!/^\d+$/.test(String(v))) throw new Error('bad quote ' + k); return BigInt(v); };
export function parseQuote(j: any, expect: { payer: string; tokenId: bigint | number; kind: 1 }): ParsedQuote {
  if (!j || typeof j !== 'object') throw new Error('empty quote response');
  if (j.error) throw new Error(String(j.error));
  if (j.live === false) throw new Error(j.reason || 'Paid faces are not live right now.');
  const q = j.quote; if (!q) throw new Error('quote response has no quote');
  if (typeof j.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(j.signature)) throw new Error('quote has no valid signature');
  if (typeof q.payer !== 'string' || q.payer.toLowerCase() !== expect.payer.toLowerCase()) throw new Error('quote is for a different wallet');
  const quote: FaceQuote = { payer: q.payer, tokenId: big(q.tokenId, 'tokenId'), kind: Number(q.kind), gearAmount: big(q.gearAmount, 'gearAmount'), nonce: big(q.nonce, 'nonce'), validUntil: big(q.validUntil, 'validUntil') };
  if (quote.tokenId !== BigInt(expect.tokenId)) throw new Error('quote is for a different rock');
  if (quote.kind !== expect.kind) throw new Error('quote is for a different face kind');
  if (quote.gearAmount <= 0n) throw new Error('quote amount is zero');
  return { quote, signature: j.signature, gear: String(j.gear ?? quote.gearAmount / 1_000_000n), usd: Number(j.usd ?? 0.25) };
}
export const quoteExpired = (q: FaceQuote, nowS = Math.floor(Date.now() / 1000), marginS = 30) => q.validUntil <= BigInt(nowS + marginS);
