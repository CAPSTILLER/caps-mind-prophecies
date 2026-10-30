// ============================================================================
// FROZEN v1 — never change; add a new generator version instead.
// Wallet faces are stored onchain as a recipe (generator version 1, variant 0)
// and redrawn from the wallet address. If any hash here fails, you changed
// what already-minted rocks look like. Do NOT update these values: revert,
// and put new drawing logic behind WALLET_FACE_VERSION 2. See FROZEN.md.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { walletFace, composeCustom, DEFAULT_LAYOUT, packBitmap, WALLET_FACE_VERSION } from '../src/faces/engine.js';
import { downloadMessage } from '../src/server/rocks.js';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const file = (p: string) => sha(readFileSync(new URL('../' + p, import.meta.url)));

const WALLET_V1_VARIANT0: Record<string, string> = {
  '0xc7d4E906741197aB6D3F6773D93E176596806661': 'f9a670b580d674d459c4963595e7b836f19cde09f3f0fb802bfe37c82827827c',
  '0x0000000000000000000000000000000000000001': 'ec01d8e45c3a813018558b357d1e7ac79c6ab534b6ba28cfafff3d317af6ad40',
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045': 'a700f5bbc4144a5055e646bb500ee14580e52dc8fc0ac69325a9759a728a9057',
  '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF': 'bfc5fdc7a5cb40e341065409700b95f6c7010b0a484140d9765e6b1b1a4a1b46',
  '0x1234567890abcdef1234567890abcdef12345678': '547cbd7c2d35dd1108d57aa5086b576804388620370f56a0153fa7fd7ebb23f6',
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B': '4b722325798464cbd0d8f4f1f04772ca5d2569072413f4f55705900b4eda68f6',
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e': '96bdcd764c1c5686a4ea0da03310f3052a8c69ff1d99f93dd8605506f0e6c47a',
};
const CUSTOM_DEFAULT_LAYOUT = '714d168bd007ebd471f8defaa294a1ed55ff62acfcfab21ed209c8b14fc23201';
const FROZEN_INPUTS: Record<string, string> = {
  'src/faces/engine.ts': 'df92082770ec12f60a0cdfbf0e257099950ee92e372110ca0f93688f7e624be5',
  'src/faces/wallet_parts.json': 'd19cbb221a7ee367ea23a21067f5584802fa9e6d2cba8f295c7eb2b77f6af910',
  'src/faces/custom_parts.json': '37a490451db36adec8c575710273ced7a05a1eb6abb805f4541c8488eca45e83',
  'rockgen/lib/tablet/traits.mjs': 'b8fc13f2b3bb9f719c1d6a8f68d37ecdfdf9cbbdfdf492c3be16dd32295ff68b', // deriveTabletTraits
  'rockgen/lib/tablet/body.mjs': 'd7a27d6e397fa70e96062371c66f07e4cb4d6112b9c34c58d3943e83eef07f82', // face slot / position
};

describe('FROZEN v1 face generator', () => {
  it('version constant is 1', () => expect(WALLET_FACE_VERSION).toBe(1));
  it('wallet face bitmaps (v1, variant 0)', () => {
    for (const [w, h] of Object.entries(WALLET_V1_VARIANT0)) expect(sha(packBitmap(walletFace(w, 0, 1).bm)), w).toBe(h);
  });
  it('custom face bitmap (DEFAULT_LAYOUT)', () => expect(sha(packBitmap(composeCustom(DEFAULT_LAYOUT).bm))).toBe(CUSTOM_DEFAULT_LAYOUT));
  it('frozen input files are byte-identical', () => {
    for (const [p, h] of Object.entries(FROZEN_INPUTS)) expect(file(p), p).toBe(h);
  });
  it('signed download message format', () => {
    expect(downloadMessage('capsmind.gearup.wtf', '0xc7d4e906741197ab6d3f6773d93e176596806661', 1, '2026-01-01T00:00:00.000Z', 'abc123'))
      .toBe('CAPs Rocks download\nDomain: capsmind.gearup.wtf\nAddress: 0xc7d4E906741197aB6D3F6773D93E176596806661\nToken: 1\nIssued: 2026-01-01T00:00:00.000Z\nExpires: 2026-01-01T00:05:00.000Z\nNonce: abc123');
  });
});
