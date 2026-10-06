# CAPs Mind Prophecy Tablets: contract notes for Bankr

Contract: `CapsMindProphecies` (Solidity 0.8.24, OpenZeppelin 5.1)
Source: `contracts/src/CapsMindProphecies.sol`
Single file to paste or verify: `contracts/flat/CapsMindProphecies.flat.sol`
Compiler settings: solc 0.8.24, optimizer on, 200 runs, EVM version `cancun`.
Nothing is deployed yet.

## What it does

- It is an ERC-721 collection called **CAPs Mind Prophecy Tablets** (symbol `CAPSPROP`) on Base.
- A **tablet** is one prophecy: an image (an `ipfs://` link is recommended) and a description.
- Only a wallet holding a **CAPs Mind key** (the NFT at `0x00635ca44339c7c194ef5bc87bf2cd6df04a666d`) can publish a new tablet. Tablets are numbered 1, 2, 3 and so on. A new tablet can be minted as soon as it is published.
- **Anyone** can mint copies of any published tablet by paying GEAR.
- Every copy is its own NFT with its own token ID. Token IDs count up across the whole collection (1, 2, 3...). Each copy also gets a **serial number inside its tablet** (1, 2, 3...). Example: the 5th copy of tablet 2 is named **"Prophecy Tablet 2 #5"**.
- Only a CAPs Mind key holder can change a tablet's image or description. The change applies to every copy of that tablet, and the contract tells OpenSea to refresh them (ERC-4906).
- The contract owner cannot publish or edit tablets. The owner only sets where the GEAR goes and can pause the contract in an emergency.

## Price

Each tablet has its own price curve. Copy number `n` of a tablet costs `min(1000, 2^(n-1))` GEAR:

| Copy of a tablet | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 and up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GEAR | 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1000 |

A new tablet starts back at 1 GEAR. Each payment goes **90% to the treasury** and **10% to the GearVault**, straight from the minter's wallet. The contract never holds GEAR and does not accept ETH.

## Metadata (what wallets and OpenSea show)

`tokenURI` builds the metadata onchain, so there is no JSON file to host. It returns:

```json
{
  "name": "Prophecy Tablet 2 #5",
  "description": "<the tablet's description>",
  "image": "<the tablet's image link, for example ipfs://...>",
  "attributes": [
    { "trait_type": "Tablet", "value": 2 },
    { "trait_type": "Serial", "display_type": "number", "value": 5 }
  ]
}
```

Why this way: every copy shares one image, but the name still shows the serial number. Only the image needs to live on IPFS. Quotes and line breaks in descriptions are escaped safely. Limits: image link up to 1024 bytes, description up to 2048 bytes.

## Constructor arguments, in order

| # | Argument | Value |
| --- | --- | --- |
| 1 | `capsMindKey_` (CAPs Mind key NFT) | `0x00635ca44339c7c194ef5bc87bf2cd6df04a666d` |
| 2 | `gearToken` (GEAR, 6 decimals) | `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` |
| 3 | `treasury_` (gets 90%) | **TBD, Cap to confirm** |
| 4 | `gearVault_` (gets 10%) | **TBD, Cap to confirm** |
| 5 | `initialOwner` (contract owner) | `0x1a72f7314297B0b8f6808A9248969A8108F49890` |

None of these can be the zero address. The CAPs Mind key and GEAR addresses are fixed forever after deploy. The treasury and GearVault can be changed later by the owner.

## Functions and who can call them

### CAPs Mind key holders (with an eligible key)

The caller must own the key ID they pass in, that key must not be locked, and publishing must not be paused.

| Function | What it does |
| --- | --- |
| `publishTablet(keyId, imageURI, description)` | Publishes the next tablet. Returns the new tablet ID. |
| `updateTablet(keyId, tabletId, imageURI, description)` | Replaces a tablet's image and description for all copies. Any eligible key holder can do this, not only the one who published it. |

### CAPs Mind key holders who also hold 2,000,000 GEAR

| Function | What it does |
| --- | --- |
| `setPublishEligible(keyId, eligible)` | Locks (`false`) or unlocks (`true`) any CAPs Mind key ID. A locked key can't publish or edit. |
| `pausePublishing(paused)` | Stops (`true`) or restarts (`false`) all publishing and editing. Minting copies keeps working. |

### Anyone

| Function | What it does |
| --- | --- |
| `mint(tabletId, maxPrice)` | Mints the next copy of a tablet to the caller. First approve GEAR for this contract. `maxPrice` is the most you agree to pay, in GEAR's smallest units (1 GEAR = 1,000,000). Use the value from `nextPrice(tabletId)`. If someone mints first and the price goes up, your mint stops instead of charging more. |
| Normal ERC-721 actions | `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`. |

### Contract owner (`0x1a72...9890`)

| Function | What it does |
| --- | --- |
| `setTreasury(address)` | Changes who gets the 90%. |
| `setGearVault(address)` | Changes who gets the 10%. |
| `pause()` / `unpause()` | Emergency stop for publishing, editing, and minting. Transfers still work. |
| `transferOwnership(newOwner)` then `acceptOwnership()` from the new wallet | Moves ownership in two steps. |
| `renounceOwnership()` | Turned off. It always fails, so control can't be thrown away by accident. |

### Read-only helpers

| Function | Returns |
| --- | --- |
| `tabletCount()` | How many tablets exist. |
| `totalSupply()` | How many copies have been minted in total. |
| `getTablet(tabletId)` | Image, description, copies minted, publisher, key used, publish time, last edit time, next price in whole GEAR. |
| `tabletOf(tokenId)` / `serialOf(tokenId)` | Which tablet a token is, and its serial number. |
| `tokenOfTabletSerial(tabletId, serial)` | Token ID for a given tablet and serial. |
| `tokenName(tokenId)` | For example `Prophecy Tablet 2 #5`. |
| `nextPrice(tabletId)` / `nextPriceWhole(tabletId)` | Next copy's price in smallest units / in whole GEAR. |
| `priceForSerial(n)` | Price in whole GEAR for copy number `n`. |
| `canPublish(account)`, `canPublishWithKey(account, keyId)`, `isPublishEligible(keyId)`, `canManageEligibility(account)` | Eligibility checks for the site. |

## Events

- `TabletPublished(tabletId, keyId, publisher, imageURI, description)`
- `TabletUpdated(tabletId, keyId, editor, imageURI, description)` plus ERC-4906 `MetadataUpdate` or `BatchMetadataUpdate`
- `TabletMinted(tabletId, tokenId, minter, serial, pricePaid)`
- `PublishEligibleSet`, `PublishingPausedSet`, `TreasurySet`, `GearVaultSet`, `Paused`, `Unpaused`, plus standard ERC-721 and ownership events.

## Notes

- Works with the CAPs Mind key exactly as Bankr deployed it. That key has no `totalSupply()`, so the contract reads `totalMinted()` instead. The tests run against a copy of Bankr's key source.
- Publish rights follow the key. If a CAPs Mind key is sold or moved, the new holder can publish and edit, and the old holder can't. A key holder with 2,000,000 GEAR can lock that key ID if needed.
- Tests: `cd contracts && forge test` (25 tests for this contract, all passing).
- Deploy script (not run): `contracts/script/Deploy.s.sol`, needs `TREASURY_ADDRESS` and `GEAR_VAULT_ADDRESS`.
