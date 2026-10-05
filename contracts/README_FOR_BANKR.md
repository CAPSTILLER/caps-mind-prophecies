# CapsMindProphecies: what to deploy

Short version: deploy **two** contracts on **Base Sepolia (84532)** first.

1. `CapsMindKey` — Cap's publisher key NFT (mint token #1 to Cap).
2. `CapsMindProphecies` — prophecy catalog + edition NFTs, GEAR bonding mint.

Do **not** deploy to Base mainnet until Cap says so. The contracts reject plain ETH.

## Constructor arguments

### CapsMindKey

| Position | Name | Type | What to pass |
| --- | --- | --- | --- |
| 1 | `initialOwner` | address | Cap's admin wallet (Safe preferred). Can mint keys and transfer ownership. **Cap provides.** |
| 2 | `baseURI_` | string | Metadata base URI for key tokens (can be empty `""` for now). |

After deploy, owner calls `mint(MINT_KEY_TO)` once so Cap holds token #1.

### CapsMindProphecies

| Position | Name | Type | What to pass |
| --- | --- | --- | --- |
| 1 | `initialOwner` | address | Same Cap admin / Safe. |
| 2 | `gearToken` | address | GEAR ERC-20. Mainnet: `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` (6 decimals). On Sepolia use Cap's mock/test GEAR. |
| 3 | `treasury_` | address | Receives **90%** of each mint's GEAR. **Cap provides.** |
| 4 | `gearVault_` | address | Receives **10%** of each mint's GEAR. **Cap provides.** |
| 5 | `publisherNft_` | address | `CapsMindKey` address from step 1 (or any ERC-721 Cap chooses). |
| 6 | `publisherTokenId_` | uint256 | `0` = any token in that collection unlocks publish. Non-zero = must own that exact token id. |
| 7 | `baseURI_` | string | Metadata base for prophecy **edition** NFTs (can be empty for now). |

## Bonding price (per prophecy)

Mint number `n` (starting at 1) costs `min(1000, 2^(n-1))` **whole GEAR**, then stays at 1000 forever.

Examples: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, then 1000, 1000, ...

Atomic amount = whole GEAR * `10^decimals()` (mainnet GEAR uses 6 decimals).

## Publisher gate

Wallet connects on the site. If it holds the configured CapsMindKey (or the specific token id), Cap can publish `imageUri` + `description`, then disconnect. Anyone can view and mint.

## How to deploy (Foundry)

```bash
cd contracts
export OWNER_ADDRESS=0x...
export TREASURY_ADDRESS=0x...
export GEAR_VAULT_ADDRESS=0x...
export GEAR_TOKEN=0x...          # Sepolia mock or mainnet GEAR when Cap says
export MINT_KEY_TO=0x...         # Cap's wallet that will publish
export PUBLISHER_TOKEN_ID=0      # any key token
export KEY_BASE_URI=
export PROP_BASE_URI=
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# dry run (no broadcast):
forge script script/Deploy.s.sol --rpc-url base_sepolia

# real Sepolia deploy:
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --private-key $DEPLOYER_KEY
```

If the deployer is not `OWNER_ADDRESS`, after deploy Cap's owner wallet must call `CapsMindKey.mint(MINT_KEY_TO)`.

Add `--verify` and `BASESCAN_API_KEY` to verify on BaseScan.

## What to send back to Cap

1. `CapsMindKey` address
2. `CapsMindProphecies` address
3. Deployment tx hashes / blocks
4. Owner, treasury, GearVault, GEAR token, publisherTokenId used
5. Confirmation that Cap received key token #1 (`ownerOf(1)`)
6. BaseScan verify links if verified

## Check after deploying

```bash
cast call $KEY "ownerOf(uint256)(address)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "canPublish(address)(bool)" $MINT_KEY_TO --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "priceForMintNumber(uint256)(uint256)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "priceForMintNumber(uint256)(uint256)" 11 --rpc-url $BASE_SEPOLIA_RPC_URL
```

Expect: Cap owns key #1, `canPublish(Cap)` is true, price(1)=1, price(11)=1000.
