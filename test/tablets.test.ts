import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { toFunctionSelector } from 'viem';
import { capsMindKeyViewAbi, tabletsAbi } from '../src/abis.js';
import { configFromEnv } from '../src/server/config.js';
import {
  PREVIEW_PROPHECIES,
  TABLETS,
  displayImageUrl,
  isAllowedImageUri,
  pendingPreviews,
  priceForSerial,
} from '../src/tablets.js';

const sig = (f: { name: string; inputs: readonly { type: string }[] }) => `${f.name}(${f.inputs.map((i) => i.type).join(',')})`;

/**
 * Function selectors found as PUSH4 in the runtime bytecode at 0x43b7d848...7f0f on Base (checked 2026-10-06).
 * If an ABI entry is added that is not in the deployed contract, this test fails.
 */
const DEPLOYED_TABLET_SELECTORS: Record<string, string> = {
  'name()': '0x06fdde03',
  'symbol()': '0x95d89b41',
  'owner()': '0x8da5cb5b',
  'tabletCount()': '0x7d27ff5a',
  'totalSupply()': '0x18160ddd',
  'paused()': '0x5c975abb',
  'publishingPaused()': '0x788ab4ac',
  'getTablet(uint256)': '0xb3dddc65',
  'nextPrice(uint256)': '0x2821ca71',
  'nextPriceWhole(uint256)': '0x9aa9f045',
  'priceForSerial(uint256)': '0x7a63680e',
  'tabletOf(uint256)': '0xd0f82913',
  'serialOf(uint256)': '0xa97e51a6',
  'ownerOf(uint256)': '0x6352211e',
  'tokenURI(uint256)': '0xc87b56dd',
  'isPublishEligible(uint256)': '0x6e0dafad',
  'canPublishWithKey(address,uint256)': '0x395a2f0a',
  'canManageEligibility(address)': '0xe1691cad',
  'publishTablet(uint256,string,string)': '0xa85173f3',
  'updateTablet(uint256,uint256,string,string)': '0xa96c5a5b',
  'mint(uint256,uint256)': '0x1b2ef1ca',
};

describe('tablet contract config', () => {
  it('points at the deployed Base mainnet contracts', () => {
    expect(TABLETS.address).toBe('0x43b7d848aa48ef002eb7b7c680e0fbb82bc97f0f');
    expect(TABLETS.chainId).toBe(8453);
    expect(TABLETS.keyAddress).toBe('0x00635ca44339c7c194ef5bc87bf2cd6df04a666d');
    expect(TABLETS.gearAddress).toBe('0x5880cD05605A549f1DAb01a53ca61Ee559244bD1');
    expect(TABLETS.gearDecimals).toBe(6);
    expect(TABLETS.owner).toBe('0x1a72f7314297B0b8f6808A9248969A8108F49890');
  });

  it('ignores stale demo env vars (Sepolia chain, old addresses)', () => {
    const cfg = configFromEnv({
      CHAIN_ID: '84532',
      RPC_URL: 'https://sepolia.base.org',
      KEY_ADDRESS: '0x0000000000000000000000000000000000000001',
      PROPHECIES_ADDRESS: '0x0000000000000000000000000000000000000002',
    });
    expect(cfg.chainId).toBe(8453);
    expect(cfg.tabletsAddress).toBe(TABLETS.address);
    expect(cfg.keyAddress).toBe(TABLETS.keyAddress);
    expect(cfg.rpcUrls).not.toContain('https://sepolia.base.org');
    expect(configFromEnv({ BASE_RPC_URL: 'https://example-rpc.test' }).rpcUrls[0]).toBe('https://example-rpc.test');
  });

  it('every tablet ABI function exists in the deployed bytecode', () => {
    const fns = tabletsAbi.filter((x) => x.type === 'function');
    expect(fns.length).toBe(Object.keys(DEPLOYED_TABLET_SELECTORS).length);
    for (const f of fns) {
      const s = sig(f);
      expect(DEPLOYED_TABLET_SELECTORS[s], s).toBe(toFunctionSelector(s));
    }
  });

  it('every tablet ABI function exists in contracts/src/CapsMindProphecies.sol', async () => {
    const src = await readFile('contracts/src/CapsMindProphecies.sol', 'utf8');
    const own = ['publishTablet', 'updateTablet', 'mint', 'getTablet', 'nextPrice', 'nextPriceWhole', 'priceForSerial', 'tabletOf', 'serialOf', 'tokenURI', 'isPublishEligible', 'canPublishWithKey', 'canManageEligibility'];
    for (const name of own) expect(src, name).toMatch(new RegExp(`function ${name}\\(`));
    expect(src).toContain('uint256 public tabletCount');
    expect(src).toContain('bool public publishingPaused');
    expect(src).toContain('event TabletPublished(');
    expect(src).toContain('event TabletMinted(');
  });

  it('key view ABI uses totalMinted (the Bankr key has no totalSupply)', () => {
    const names = capsMindKeyViewAbi.map((f) => f.name);
    expect(names).toContain('totalMinted');
    expect(names).not.toContain('totalSupply');
  });
});

describe('price curve', () => {
  it('matches min(1000, 2^(n-1))', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 99].map(priceForSerial)).toEqual([1, 2, 4, 8, 512, 1000, 1000, 1000]);
    expect(priceForSerial(0)).toBe(0);
  });
});

describe('image links and previews', () => {
  it('accepts only https and ipfs links', () => {
    expect(isAllowedImageUri('https://capsmind.gearup.wtf/prophecies/1.png')).toBe(true);
    expect(isAllowedImageUri('ipfs://bafy123/1.png')).toBe(true);
    expect(isAllowedImageUri('http://example.com/a.png')).toBe(false);
    expect(isAllowedImageUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageUri('data:image/png;base64,AAAA')).toBe(false);
    expect(isAllowedImageUri('')).toBe(false);
  });

  it('maps links to something a browser can show', () => {
    expect(displayImageUrl('ipfs://bafy123/1.png')).toBe('https://ipfs.io/ipfs/bafy123/1.png');
    expect(displayImageUrl('ipfs://ipfs/bafy123')).toBe('https://ipfs.io/ipfs/bafy123');
    expect(displayImageUrl('https://capsmind.gearup.wtf/prophecies/2.png')).toBe('/prophecies/2.png');
    expect(displayImageUrl('https://other.example/x.png')).toBe('https://other.example/x.png');
    expect(displayImageUrl('javascript:alert(1)')).toBe('');
  });

  it('preview prophecy values match the committed art and descriptions', () => {
    expect(PREVIEW_PROPHECIES.map((p) => p.imageURI)).toEqual([
      'https://capsmind.gearup.wtf/prophecies/1.png',
      'https://capsmind.gearup.wtf/prophecies/2.png',
    ]);
    expect(PREVIEW_PROPHECIES[0].description).toBe(
      'CAPs mind, it bends but never breaks, locked in tight by a vault unknown, time is a friend and shall never B blown...',
    );
    expect(PREVIEW_PROPHECIES[1].description).toBe(
      'CAPs mind, they float where the bamboo ends, black and white against the black above, soft enough to survive the void and based enough to call it home...',
    );
  });

  it('a preview drops off once a tablet uses its image', () => {
    const t = (id: number, imageURI: string) => ({
      id,
      imageURI,
      description: 'x',
      minted: 0,
      publisher: TABLETS.owner,
      keyId: 1,
      publishedAt: 1,
      updatedAt: 1,
      nextPriceWholeGear: 1,
    });
    expect(pendingPreviews([]).map((p) => p.n)).toEqual([1, 2]);
    expect(pendingPreviews([t(1, 'https://capsmind.gearup.wtf/prophecies/1.png')]).map((p) => p.n)).toEqual([2]);
    expect(pendingPreviews([t(1, 'https://capsmind.gearup.wtf/prophecies/2.png'), t(2, 'https://capsmind.gearup.wtf/prophecies/1.png')])).toEqual([]);
  });
});
