/**
 * Deployed CAPs Mind key NFT on Base mainnet (Bankr build).
 *
 * Identified from the unverified runtime bytecode (function and error selectors):
 * ERC721 + ERC721URIStorage + Ownable2Step, ownerGenesisMint(string), mint(string),
 * setBaseURI(string), setTokenURI(uint256,string), canMint(address), hasMinted(address).
 * No defaultTokenURI / setDefaultTokenURI, so the art for each key lives in its token URI.
 */

export const CAPS_MIND_NFT = {
  address: '0x00635ca44339c7c194ef5bc87bf2cd6df04a666d',
  chainId: 8453,
  chainName: 'Base',
  explorer: 'https://basescan.org',
  /** Wallet Cap asked to own the contract. Display only; the page always reads owner() on chain. */
  plannedOwner: '0x6C05149910C2dd102032E44b96DA36988950B257',
  gear: '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1',
  gearDecimals: 6,
  /** Committed static metadata and art, served by Vercel from public/key. */
  defaultMetadataPath: '/key/caps-mind-key.json',
  defaultImagePath: '/key/caps-mind-key.jpg',
  siteOrigin: 'https://capsmind.gearup.wtf',
  /** Storage slot of the private _baseTokenURI string (ERC721 0-5, URIStorage 6, Ownable2Step 7-8, contract 9-12). */
  baseUriSlot: 12,
  /** Browser read RPCs (CORS enabled), tried in order. */
  readRpcs: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
} as const;

export const capsMindNftAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'firstMintCompleted', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'nextTokenId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'GEAR_REQUIRED', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'GEAR_TOKEN', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'hasMinted',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'canMint',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'eligible', type: 'bool' },
      { name: 'gearBalance', type: 'uint256' },
      { name: 'reason', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'ownerGenesisMint',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'customURI', type: 'string' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'customURI', type: 'string' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setTokenURI',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setBaseURI',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newBaseURI', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'acceptOwnership', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'error', name: 'GenesisAlreadyMinted', inputs: [] },
  { type: 'error', name: 'GenesisNotMinted', inputs: [] },
  { type: 'error', name: 'AlreadyMinted', inputs: [] },
  {
    type: 'error',
    name: 'InsufficientGearBalance',
    inputs: [
      { name: 'balance', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'OwnableUnauthorizedAccount', inputs: [{ name: 'account', type: 'address' }] },
  { type: 'error', name: 'OwnableInvalidOwner', inputs: [{ name: 'owner', type: 'address' }] },
  { type: 'error', name: 'ERC721NonexistentToken', inputs: [{ name: 'tokenId', type: 'uint256' }] },
] as const;

/** Plain-English messages for the contract's custom errors. */
export const CAPS_MIND_ERROR_TEXT: Record<string, string> = {
  GenesisAlreadyMinted: 'Key #1 is already minted. The genesis mint can only happen once.',
  GenesisNotMinted: 'Key #1 has not been minted yet. The owner has to mint it first.',
  AlreadyMinted: 'This wallet has already minted a key. Each wallet can mint only once.',
  InsufficientGearBalance: 'This wallet holds less than 2,000,000 GEAR.',
  OwnableUnauthorizedAccount: 'Only the contract owner can do this. Switch to the owner wallet.',
  OwnableInvalidOwner: 'That new owner address is not valid.',
  ERC721NonexistentToken: 'That key ID has not been minted yet.',
};

/**
 * What tokenURI(id) returns for a token with a custom URI under OpenZeppelin ERC721URIStorage:
 * empty base URI returns the custom URI as is, otherwise base URI + custom URI.
 */
export function effectiveTokenUri(baseUri: string, customUri: string, tokenId: number): string {
  if (!baseUri) return customUri;
  if (customUri) return baseUri + customUri;
  return baseUri + String(tokenId);
}

/** Decode a Solidity `string` storage value from its slot word (and the long-form data words). */
export function decodeStorageStringHeader(word: string): { short: string | null; longLength: number } {
  const hex = word.replace(/^0x/, '').padStart(64, '0');
  const last = parseInt(hex.slice(62), 16);
  if ((last & 1) === 0) {
    const len = last / 2;
    const bytes = hex.slice(0, len * 2);
    return { short: hexToUtf8(bytes), longLength: 0 };
  }
  const length = (BigInt('0x' + hex) - 1n) / 2n;
  return { short: null, longLength: Number(length) };
}

export function hexToUtf8(hex: string): string {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(out);
}

/** Build a data: URI holding ERC-721 metadata JSON (used for custom images without a hosted JSON). */
export function metadataDataUri(meta: { name: string; description: string; image: string }): string {
  const json = JSON.stringify({ name: meta.name, description: meta.description, image: meta.image });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'data:application/json;base64,' + btoa(bin);
}
