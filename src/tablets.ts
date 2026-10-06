/**
 * Shared (server + browser) config for CAPs Mind Prophecy Tablets on Base mainnet.
 * No Node imports here: web/client.ts bundles this file.
 */

export const TABLETS = {
  /** CapsMindProphecies (Prophecy Tablets), deployed by Bankr. Verified onchain: name, symbol, owner, wiring. */
  address: '0x43b7d848aa48ef002eb7b7c680e0fbb82bc97f0f',
  name: 'CAPs Mind Prophecy Tablets',
  symbol: 'CAPSPROP',
  owner: '0x1a72f7314297B0b8f6808A9248969A8108F49890',
  chainId: 8453,
  chainName: 'Base',
  explorer: 'https://basescan.org',
  /** CAPs Mind key (Bankr build). Holders publish and edit tablets. */
  keyAddress: '0x00635ca44339c7c194ef5bc87bf2cd6df04a666d',
  gearAddress: '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1',
  gearDecimals: 6,
  maxPriceGear: 1000,
  keyHoldGear: 2_000_000,
  maxImageUriBytes: 1024,
  maxDescriptionBytes: 2048,
  siteOrigin: 'https://capsmind.gearup.wtf',
  /** Public Base read RPCs with CORS, tried in order (browser and server). Each one rate limits on its own. */
  readRpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base'],
  ipfsGateway: 'https://ipfs.io/ipfs/',
} as const;

export type Tablet = {
  id: number;
  imageURI: string;
  description: string;
  minted: number;
  publisher: string;
  keyId: number;
  publishedAt: number;
  updatedAt: number;
  nextPriceWholeGear: number;
};

export type PreviewProphecy = {
  /** Preview number, also the file name under public/prophecies. */
  n: number;
  /** Path served by this site. */
  path: string;
  /** Exact imageURI to publish onchain. */
  imageURI: string;
  description: string;
};

/** Cap's two prophecies, shown as "not yet onchain" until a tablet with the same image is published. */
export const PREVIEW_PROPHECIES: PreviewProphecy[] = [
  {
    n: 1,
    path: '/prophecies/1.png',
    imageURI: `${TABLETS.siteOrigin}/prophecies/1.png`,
    description:
      'CAPs mind, it bends but never breaks, locked in tight by a vault unknown, time is a friend and shall never B blown...',
  },
  {
    n: 2,
    path: '/prophecies/2.png',
    imageURI: `${TABLETS.siteOrigin}/prophecies/2.png`,
    description:
      'CAPs mind, they float where the bamboo ends, black and white against the black above, soft enough to survive the void and based enough to call it home...',
  },
];

/** Whole GEAR for copy n (1-based) of any tablet: min(1000, 2^(n-1)). Mirrors priceForSerial onchain. */
export function priceForSerial(n: number): number {
  if (n < 1) return 0;
  if (n >= 11) return TABLETS.maxPriceGear;
  return 2 ** (n - 1);
}

/** Image URIs the publish form accepts: https:// or ipfs:// only. */
export function isAllowedImageUri(uri: string): boolean {
  const u = uri.trim();
  if (/^ipfs:\/\/.+/i.test(u)) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' && !!parsed.hostname;
  } catch {
    return false;
  }
}

/**
 * URL a browser can load for a tablet image. ipfs:// goes through a public gateway, this site's own
 * https links become relative (works on preview deploys too), anything else that is not https is dropped.
 */
export function displayImageUrl(uri: string): string {
  const u = (uri || '').trim();
  if (/^ipfs:\/\//i.test(u)) return TABLETS.ipfsGateway + u.slice(7).replace(/^ipfs\//i, '');
  if (u.startsWith(TABLETS.siteOrigin + '/')) return u.slice(TABLETS.siteOrigin.length);
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  if (/^https:\/\//i.test(u)) return u;
  return '';
}

function sameImage(a: string, b: string): boolean {
  const norm = (s: string) => displayImageUrl(s).toLowerCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

/** The onchain tablet that already uses this preview's image, if any. */
export function tabletForPreview(p: PreviewProphecy, tablets: Tablet[]): Tablet | undefined {
  return tablets.find((t) => sameImage(t.imageURI, p.imageURI));
}

/** Previews that are not onchain yet (no published tablet uses their image). */
export function pendingPreviews(tablets: Tablet[]): PreviewProphecy[] {
  return PREVIEW_PROPHECIES.filter((p) => !tabletForPreview(p, tablets));
}

/** UTF-8 byte length (the contract limits bytes, not characters). */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Plain-English text for the tablet contract's custom errors. */
export const TABLET_ERROR_TEXT: Record<string, string> = {
  NotPublisher: 'This wallet does not own that CAPs Mind key. Pick a key ID this wallet holds.',
  NotEligibilityAdmin: 'Only a CAPs Mind holder who also holds 2,000,000 GEAR can do this.',
  KeyNotEligible:
    'That CAPs Mind key is locked from publishing. A CAPs Mind holder with 2,000,000 GEAR can unlock it.',
  PublishingPausedError:
    'Publishing is paused right now. A CAPs Mind holder with 2,000,000 GEAR can turn it back on.',
  PausedError: 'The contract is paused by its owner. Publishing, edits and mints are stopped for now.',
  BadTablet: 'That tablet does not exist yet.',
  BadKey: 'That CAPs Mind key ID does not exist.',
  BadToken: 'That copy does not exist.',
  EmptyImage: 'Add an image link first.',
  EmptyDescription: 'Add a description first.',
  ImageTooLong: 'The image link is too long (1024 bytes max).',
  DescriptionTooLong: 'The description is too long (2048 bytes max).',
  PriceAboveMax: 'Someone minted just before you, so the price went up. Check the new price and try again.',
  ERC721NonexistentToken: 'That token ID has not been minted yet.',
  SafeERC20FailedOperation: 'The GEAR transfer failed. Check your GEAR balance and approval, then try again.',
  ERC20InsufficientBalance: 'This wallet does not have enough GEAR for this mint.',
  ERC20InsufficientAllowance: 'The GEAR approval is too low. Approve again, then mint.',
};
