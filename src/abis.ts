/**
 * ABIs for the deployed Base mainnet contracts the site talks to:
 *   - CAPs Mind Prophecy Tablets (CapsMindProphecies.sol)  0x43b7d848aa48ef002eb7b7c680e0fbb82bc97f0f
 *   - CAPs Mind key (Bankr build, read-only here)            0x00635ca44339c7c194ef5bc87bf2cd6df04a666d
 *   - GEAR (ERC-20, 6 decimals)                              0x5880cD05605A549f1DAb01a53ca61Ee559244bD1
 *
 * Only the pieces the site uses. Source of truth: contracts/src/CapsMindProphecies.sol.
 */

export const tabletsAbi = [
  // ---- reads ----
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tabletCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'publishingPaused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'getTablet',
    stateMutability: 'view',
    inputs: [{ name: 'tabletId', type: 'uint256' }],
    outputs: [
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'minted', type: 'uint256' },
      { name: 'publisher', type: 'address' },
      { name: 'keyId', type: 'uint256' },
      { name: 'publishedAt', type: 'uint64' },
      { name: 'updatedAt', type: 'uint64' },
      { name: 'nextPriceWholeGear', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'nextPrice',
    stateMutability: 'view',
    inputs: [{ name: 'tabletId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nextPriceWhole',
    stateMutability: 'view',
    inputs: [{ name: 'tabletId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'priceForSerial',
    stateMutability: 'pure',
    inputs: [{ name: 'n', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tabletOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'serialOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
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
    name: 'isPublishEligible',
    stateMutability: 'view',
    inputs: [{ name: 'keyId', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'canPublishWithKey',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'keyId', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'canManageEligibility',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // ---- writes ----
  {
    type: 'function',
    name: 'publishTablet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyId', type: 'uint256' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [{ name: 'tabletId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'updateTablet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyId', type: 'uint256' },
      { name: 'tabletId', type: 'uint256' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tabletId', type: 'uint256' },
      { name: 'maxPrice', type: 'uint256' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  // ---- events ----
  {
    type: 'event',
    name: 'TabletPublished',
    inputs: [
      { name: 'tabletId', type: 'uint256', indexed: true },
      { name: 'keyId', type: 'uint256', indexed: true },
      { name: 'publisher', type: 'address', indexed: true },
      { name: 'imageURI', type: 'string', indexed: false },
      { name: 'description', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TabletMinted',
    inputs: [
      { name: 'tabletId', type: 'uint256', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'minter', type: 'address', indexed: true },
      { name: 'serial', type: 'uint256', indexed: false },
      { name: 'pricePaid', type: 'uint256', indexed: false },
    ],
  },
  // ---- errors (so wallets and the site can explain reverts) ----
  { type: 'error', name: 'NotPublisher', inputs: [] },
  { type: 'error', name: 'NotEligibilityAdmin', inputs: [] },
  { type: 'error', name: 'KeyNotEligible', inputs: [] },
  { type: 'error', name: 'PublishingPausedError', inputs: [] },
  { type: 'error', name: 'PausedError', inputs: [] },
  { type: 'error', name: 'BadTablet', inputs: [] },
  { type: 'error', name: 'BadKey', inputs: [] },
  { type: 'error', name: 'BadToken', inputs: [] },
  { type: 'error', name: 'EmptyImage', inputs: [] },
  { type: 'error', name: 'EmptyDescription', inputs: [] },
  { type: 'error', name: 'ImageTooLong', inputs: [] },
  { type: 'error', name: 'DescriptionTooLong', inputs: [] },
  {
    type: 'error',
    name: 'PriceAboveMax',
    inputs: [
      { name: 'price', type: 'uint256' },
      { name: 'maxPrice', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'ERC721NonexistentToken', inputs: [{ name: 'tokenId', type: 'uint256' }] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'allowance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
] as const;

/** Read-only view of the Bankr CAPs Mind key. It has totalMinted() and no totalSupply(). */
export const capsMindKeyViewAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;
