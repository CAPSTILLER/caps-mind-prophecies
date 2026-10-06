# CAPs Mind (CAPMIND): changes for Bankr

This is Cap's adjusted version of the `CAPsMind.sol` contract Bankr wrote. Everything Bankr built is still there. Only the parts below changed.

Files:
- `CAPsMind.sol`: the contract (uses OpenZeppelin v5 imports, same as Bankr's version).
- `CAPsMind.flat.sol`: the same contract with OpenZeppelin pasted in, if a single file is easier.

Compiler: Solidity 0.8.24, optimizer on (200 runs), OpenZeppelin Contracts v5.1.0.

## What stayed the same

- ERC-721, name `CAPs Mind`, symbol `CAPMIND`.
- Token IDs go in order starting at 1.
- `ownerGenesisMint` mints token #1. Only the owner can call it, and no GEAR is needed.
- `mint()` after genesis needs the wallet to hold at least 2,000,000 GEAR at the moment of minting. GEAR is `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` on Base, 6 decimals. GEAR is only checked, never spent or locked. Cap wants this hold check exactly as Bankr wrote it.
- One mint per wallet, ever (`hasMinted`).
- Free mint, gas only.
- `setBaseURI` and `setTokenURI` are owner only.
- `canMint`, `nextTokenId`, `totalMinted` work the same and return the same messages.
- Same errors: `GenesisAlreadyMinted`, `GenesisNotMinted`, `AlreadyMinted`, `InsufficientGearBalance`.

## What changed and why

1. **Only the owner can set images and metadata.**
   Public `mint()` no longer takes a `customURI`. In Bankr's version any minter could point their own key at any image or link, inside Cap's collection. Now the only ways to change what a key shows are the owner-only setters. Old call: `mint("...")`. New call: `mint()`.

2. **`ownerGenesisMint(customURI)` keeps its optional URI.**
   Only the owner can call it, so it is safe. Pass `""` (the normal case) and key #1 shows Cap's default art. The owner can still change it later with `setTokenURI`.

3. **Every key shows Cap's CAP vault art by default.**
   New owner-settable `defaultTokenURI`, set in the constructor, with setter `setDefaultTokenURI(string)` and event `DefaultTokenURIUpdated`. In Bankr's version, a key minted with an empty base URI and no custom URI had a blank `tokenURI`, so wallets and OpenSea showed nothing.

   `tokenURI(id)` now picks, in this order:
   1. The per-token URI, if the owner set one with `setTokenURI`. Returned exactly as set.
   2. Otherwise `baseURI + id`, if the base URI is not empty.
   3. Otherwise `defaultTokenURI` (Cap's art).

   Setting a per-token URI to `""` clears it, so that key falls back to the base URI or default.

4. **Plain ERC721 instead of ERC721URIStorage.**
   OpenZeppelin's ERC721URIStorage puts the base URI in front of any per-token URI, so an owner-set link like `ipfs://...` would come out as `<base>ipfs://...` whenever a base URI is set. The contract now keeps its own per-token URI list so an owner-set URI is always returned as is. It still emits the standard ERC-4906 events (`MetadataUpdate` for one key, `BatchMetadataUpdate` for all keys when the base or default URI changes) so OpenSea refreshes the art, and it reports ERC-4906 support (`0x49064906`).

5. **Small additions.**
   - `baseURI()` view so anyone can read the current base URI.
   - `KeyMinted(recipient, tokenId)` no longer has a `uri` field, since minters cannot set one.
   - In both mint functions, all state and events happen before the NFT is sent, so a contract wallet receiving the key cannot sneak in a second mint. Tested.

## Constructor arguments (in order)

| # | Name | Value |
|---|------|-------|
| 1 | `initialOwner` (address) | `0x6C05149910C2dd102032E44b96DA36988950B257` |
| 2 | `initialBaseURI` (string) | `""` (empty) |
| 3 | `initialDefaultURI` (string) | `https://capsmind.gearup.wtf/key/caps-mind-key.json` |

The default metadata file says:

```json
{
  "name": "CAPs Mind",
  "description": "A key to CAPs mind. Holders can publish prophecies.",
  "image": "https://capsmind.gearup.wtf/key/caps-mind-key.jpg"
}
```

After deploy, Cap's wallet calls `ownerGenesisMint("")` to mint key #1.

## Notes

- **Base mainnet only.** GEAR is a fixed address in the contract, as Bankr wrote it. Testing on Base Sepolia would need a test version of the contract with the test GEAR address swapped in (or passed in the constructor).
- **Do not call `renounceOwnership`.** It still exists (from OpenZeppelin Ownable). If the owner renounces, nobody can ever change the art again.
- The art is hosted on capsmind.gearup.wtf for now. Later the JSON and image can be pinned on IPFS and the owner can call `setDefaultTokenURI` to point at it. No redeploy needed.
- Tests: 25 Foundry tests cover owner-only genesis, the 2,000,000 GEAR hold, one mint per wallet, minters not being able to set art, owner URI setters, and the `tokenURI` order. All pass.
