# CapsMindKey for Bankr

This handoff is for **CapsMindKey only**. Flattened source: `contracts/flat/CapsMindKey.flat.sol`.

## What it is

CapsMindKey is an ERC-721 NFT. Name: `CAPs Mind Key`. Symbol: `CAPSKEY`.

Token IDs are sequential: 1, then 2, then 3, and so on. There is no max supply in the contract.

It is the publisher key for CAPs Mind Prophecies. Holding an eligible key lets someone publish prophecies on the companion contract later. This file is only about deploying and using CapsMindKey.

## Owner

Contract owner (and documented Cap wallet):

`0x6C05149910C2dd102032E44b96DA36988950B257`

Pass this address as `initialOwner` in the constructor.

## Mint rules

1. **Key #1 (bootstrap)**  
   Only the owner may call `mint(to)`. No GEAR hold is required. Mint key #1 to Cap's wallet above.

2. **Every key after #1**  
   The caller must currently **hold** at least **2,000,000 GEAR** (balance check only). Nothing is burned or transferred. Then they may call `mint(to)`.

## GEAR token

| Network | GEAR address | Notes |
| --- | --- | --- |
| Base mainnet | `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` | 6 decimals. Hold check uses `balanceOf`. |
| Base Sepolia | Cap's Sepolia test GEAR token | **Required.** Do not pass the mainnet GEAR address on Sepolia. |

The contract reads `decimals()` from the GEAR token at deploy time and sets `keyHoldAmount = 2_000_000 * 10^decimals`.

## Metadata (image)

Default path: leave `baseURI_` empty so `tokenURI` returns on-chain JSON (`data:application/json;base64,...`) with `name`, `description`, and `image`.

Recommended image (main wallet / OpenSea view):

`https://capsmind.gearup.wtf/key/caps-mind-key.jpg`

After deploy, owner should call:

```text
setMediaURIs("https://capsmind.gearup.wtf/key/caps-mind-key.jpg", "")
```

Leave the second argument empty so `animation_url` is omitted and the still image is the main view. Owner can swap the image (or add a video URI later) anytime with `setMediaURIs`.

Optional: if `baseURI_` is non-empty, `tokenURI` becomes `baseURI + tokenId` (off-chain JSON) instead of on-chain JSON.

## Constructor arguments (in order)

| # | Name | Type | Value to pass |
| --- | --- | --- | --- |
| 1 | `initialOwner` | address | `0x6C05149910C2dd102032E44b96DA36988950B257` |
| 2 | `gearToken` | address | Mainnet GEAR above, or Cap's Sepolia test GEAR on Sepolia |
| 3 | `baseURI_` | string | `""` (empty) for on-chain JSON metadata |

ABI-style example (empty string for baseURI):

```text
["0x6C05149910C2dd102032E44b96DA36988950B257", "<GEAR_TOKEN>", ""]
```

## Deploy: Base Sepolia (84532) first

Use Cap's **Sepolia test GEAR** for `gearToken`. Do not use mainnet GEAR on Sepolia.

### Option A: Foundry script (repo)

```bash
cd contracts
export OWNER_ADDRESS=0x6C05149910C2dd102032E44b96DA36988950B257
export MINT_KEY_TO=0x6C05149910C2dd102032E44b96DA36988950B257
export GEAR_TOKEN=<SEPOLIA_TEST_GEAR>
export KEY_BASE_URI=
export KEY_IMAGE_URI=https://capsmind.gearup.wtf/key/caps-mind-key.jpg
export KEY_ANIMATION_URI=
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# dry run
forge script script/DeployKeyOnly.s.sol --rpc-url base_sepolia

# broadcast
forge script script/DeployKeyOnly.s.sol --rpc-url base_sepolia --broadcast --private-key $DEPLOYER_KEY
```

If the deployer wallet is already `OWNER_ADDRESS`, the script also calls `setMediaURIs` and `mint(MINT_KEY_TO)` for key #1. If the deployer is not the owner, Cap's owner wallet must call those after deploy.

### Option B: Flattened source in Bankr / Remix / BaseScan

1. Paste `contracts/flat/CapsMindKey.flat.sol`.
2. Compiler: Solidity `0.8.24`, optimizer on, 200 runs, EVM Cancun (or matching Base).
3. Deploy `CapsMindKey` with constructor args in the order above.
4. From owner: `setMediaURIs("https://capsmind.gearup.wtf/key/caps-mind-key.jpg", "")`.
5. From owner: `mint(0x6C05149910C2dd102032E44b96DA36988950B257)` to bootstrap key #1.
6. Verify on BaseScan Sepolia if you want a public source link.

## Deploy: Base mainnet (8453)

Only when Cap says to go live.

Same steps as Sepolia, but:

- `gearToken` = `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1`
- RPC: Base mainnet (`https://mainnet.base.org` or Cap's preferred endpoint)
- Foundry: `--rpc-url base` with `BASE_RPC_URL` set

Then owner sets media URIs (if not done in the script) and mints key #1 to Cap.

## After deploy checks

```bash
cast call $KEY "owner()(address)" --rpc-url $RPC
cast call $KEY "ownerOf(uint256)(address)" 1 --rpc-url $RPC
cast call $KEY "keyHoldAmount()(uint256)" --rpc-url $RPC
cast call $KEY "imageURI()(string)" --rpc-url $RPC
cast call $KEY "tokenURI(uint256)(string)" 1 --rpc-url $RPC
```

Expect: owner and `ownerOf(1)` are Cap's wallet, `keyHoldAmount` is `2000000000000` when GEAR has 6 decimals (2,000,000 * 10^6), `imageURI` is the JPG URL, and `tokenURI(1)` is a `data:application/json;base64,...` string (when `baseURI` is empty).

## Functions (who can call)

### Anyone (when not paused, unless noted)

| Function | Who | Notes |
| --- | --- | --- |
| `mint(address to)` | Owner only when `totalSupply == 0`. After that, any address that holds >= 2,000,000 GEAR | Reverts if paused. No ETH. |
| `canMintKey(address account)` | Anyone (view) | True if that account could mint right now |
| `name` / `symbol` / `totalSupply` / `balanceOf` / `ownerOf` / `tokenURI` / `getApproved` / `isApprovedForAll` / `supportsInterface` | Anyone (view/pure) | Standard ERC-721 metadata + views |
| `approve` / `setApprovalForAll` / `transferFrom` / `safeTransferFrom` | Token owner or approved operator | Standard ERC-721 transfers |
| `acceptOwnership()` | Current `pendingOwner` only | Completes two-step ownership transfer |
| `receive()` | Anyone who sends ETH | Always reverts (`EthRejected`). Contract does not accept ETH. |

### Owner only

| Function | Purpose |
| --- | --- |
| `setMediaURIs(string image_, string animation_)` | Set collection `image` and optional `animation_url` used in on-chain JSON |
| `setBaseURI(string uri)` | If non-empty, switch `tokenURI` to off-chain `baseURI + tokenId` |
| `pause()` / `unpause()` | Block or allow `mint` |
| `transferOwnership(address newOwner)` | Start two-step ownership transfer (sets `pendingOwner`) |

### Public state Cap / Bankr may care about

`owner`, `pendingOwner`, `gear`, `gearUnit`, `keyHoldAmount`, `KEY_HOLD_GEAR`, `CAP_OWNER`, `baseURI`, `imageURI`, `animationURI`, `paused`, `totalSupply`.

## What to send back to Cap

1. CapsMindKey contract address  
2. Deploy tx hash / block  
3. Network (Base Sepolia or Base mainnet)  
4. GEAR token address used  
5. Confirmation that Cap owns key #1 (`ownerOf(1)`)  
6. Confirmation that `imageURI` is set to the JPG URL  
7. BaseScan verify link if verified  

## Source files

- Flattened (paste into Bankr): `contracts/flat/CapsMindKey.flat.sol`
- Original: `contracts/src/CapsMindKey.sol` (+ `contracts/src/Base64.sol`)
- Key-only deploy script: `contracts/script/DeployKeyOnly.s.sol`

Do **not** deploy CapsMindProphecies from this handoff. Key only.
