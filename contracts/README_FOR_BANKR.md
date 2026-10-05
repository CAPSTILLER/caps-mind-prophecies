# CapsMindProphecies: what to deploy

Short version: deploy **two** contracts on **Base Sepolia (84532)** first.

1. `CapsMindKey` — CAPs Mind publisher key NFT (sequential IDs; bootstrap #1 to Cap).
2. `CapsMindProphecies` — prophecy catalog + edition NFTs, GEAR bonding mint + eligibility controls.

Do **not** deploy to Base mainnet until Cap says so. The contracts reject plain ETH.

## Constructor arguments

### CapsMindKey

| Position | Name | Type | What to pass |
| --- | --- | --- | --- |
| 1 | `initialOwner` | address | Cap's admin wallet (Safe preferred). Bootstraps key #1 and can pause / set baseURI. **Cap provides.** |
| 2 | `gearToken` | address | GEAR ERC-20. Mainnet: `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` (6 decimals). On Sepolia use Cap's mock/test GEAR. |
| 3 | `baseURI_` | string | Metadata base URI for key tokens (can be empty `""` for now). |

**Bootstrap:** when `totalSupply == 0`, only `owner` may call `mint(MINT_KEY_TO)` — **no GEAR hold**. After that, anyone who **holds** ≥ 2,000,000 GEAR (balance check only) may mint additional keys.

### CapsMindProphecies

| Position | Name | Type | What to pass |
| --- | --- | --- | --- |
| 1 | `initialOwner` | address | Same Cap admin / Safe. |
| 2 | `gearToken` | address | Same GEAR ERC-20 as CapsMindKey. |
| 3 | `treasury_` | address | Receives **90%** of each mint's GEAR. **Cap provides.** |
| 4 | `gearVault_` | address | Receives **10%** of each mint's GEAR. **Cap provides.** |
| 5 | `capsMindKey_` | address | `CapsMindKey` address from step 1. |
| 6 | `baseURI_` | string | Metadata base for prophecy **edition** NFTs (can be empty for now). |

## Bonding price (per prophecy)

Mint number `n` (starting at 1) costs `min(1000, 2^(n-1))` **whole GEAR**, then stays at 1000 forever.

Examples: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, then 1000, 1000, ...

Atomic amount = whole GEAR * `10^decimals()` (mainnet GEAR uses 6 decimals).

## Publish eligibility

- Default: every Caps Mind token ID is eligible to publish.
- `publish(keyId, imageUri, description)` — caller must own that key and it must be eligible; publishing must not be paused.
- Any Caps Mind holder who also holds ≥ **2,000,000 GEAR** may:
  - `setPublishEligible(keyId, bool)` — lock/unlock **any** Caps Mind ID
  - `pausePublishing(bool)` — pause **all** new prophecy uploads (minting editions still works unless owner `pause()`)

## How to deploy (Foundry)

```bash
cd contracts
export OWNER_ADDRESS=0x...
export TREASURY_ADDRESS=0x...
export GEAR_VAULT_ADDRESS=0x...
export GEAR_TOKEN=0x...          # Sepolia mock or mainnet GEAR when Cap says
export MINT_KEY_TO=0x...         # Cap's wallet that will publish
export KEY_BASE_URI=
export PROP_BASE_URI=
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# dry run (no broadcast):
forge script script/Deploy.s.sol --rpc-url base_sepolia

# real Sepolia deploy:
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --private-key $DEPLOYER_KEY
```

If the deployer is not `OWNER_ADDRESS`, after deploy Cap's owner wallet must call `CapsMindKey.mint(MINT_KEY_TO)` to bootstrap key #1.

Add `--verify` and `BASESCAN_API_KEY` to verify on BaseScan.

## What to send back to Cap

1. `CapsMindKey` address
2. `CapsMindProphecies` address
3. Deployment tx hashes / blocks
4. Owner, treasury, GearVault, GEAR token used
5. Confirmation that Cap received key token #1 (`ownerOf(1)`)
6. BaseScan verify links if verified

## Check after deploying

```bash
cast call $KEY "ownerOf(uint256)(address)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $KEY "keyHoldAmount()(uint256)" --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "canPublish(address)(bool)" $MINT_KEY_TO --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "isPublishEligible(uint256)(bool)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "priceForMintNumber(uint256)(uint256)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
cast call $PROPS "priceForMintNumber(uint256)(uint256)" 11 --rpc-url $BASE_SEPOLIA_RPC_URL
```

Expect: Cap owns key #1, `keyHoldAmount` = 2_000_000 * 10^decimals, `canPublish(Cap)` true, `isPublishEligible(1)` true, price(1)=1, price(11)=1000.
