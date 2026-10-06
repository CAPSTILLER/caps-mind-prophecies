# CAPs Mind Prophecies

Vault prophecy tablets. Cap publishes with an **eligible CAPs Mind Key** NFT. Anyone mints editions by paying **GEAR** on a bonding curve.

Live on Base mainnet:

- **Prophecy Tablets** (`CapsMindProphecies`): `0x43b7d848aa48ef002eb7b7c680e0fbb82bc97f0f`, deployed by Bankr. Owner `0x1a72f7314297B0b8f6808A9248969A8108F49890`.
- **CAPs Mind key** (Bankr build): `0x00635ca44339c7c194ef5bc87bf2cd6df04a666d`. Holders publish and edit tablets.
- **GEAR**: `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` (6 decimals).

Site pages (capsmind.gearup.wtf):

- `/` lists onchain tablets with a two-tap mint button: "Approve N GEAR" (exact price), then, once Base confirms, "Mint copy #S for N GEAR" (`mint(tabletId, nextPrice)`). One wallet request per tap, no batching. The header button connects and disconnects the wallet on every page. Cap's two prophecies show as "Not yet onchain" previews until a tablet with the same image is published.
- `/tablet/:id` one tablet with mint. `/preview/1` and `/preview/2` the previews. Old `/prophecy/:id` links redirect to `/tablet/:id`.
- `/publish` CAPs Mind key holders pick a key, then `publishTablet` or `updateTablet`. Quick-fill buttons for Prophecy 1 and 2.
- `/key` owner page for the CAPs Mind key contract.

Contract addresses live in `src/tablets.ts` (shared by server and browser) and ABIs in `src/abis.ts`.

## CapsMindKey (ERC-721, sequential IDs)

One contract; token IDs mint 1, 2, 3…

| Who | Rule |
| --- | --- |
| **Bootstrap #1** | When `totalSupply == 0`, **only owner** may call `mint(to)` - **no GEAR hold**. This is how Cap gets key #1. |
| **Later keys** | Anyone who **holds** ≥ **2,000,000 GEAR** (`balanceOf` check only; no burn/transfer) may `mint(to)`. |

Owner can `setMediaURIs(image, animation)` (on-chain JSON: OpenSea `image` is the main view; `animation_url` is omitted when empty), `setBaseURI` (optional off-chain override), and `pause` key minting. Default key image: `https://capsmind.gearup.wtf/key/caps-mind-key.jpg` (file at `public/key/caps-mind-key.jpg`; **IPFS recommended later for permanence**). Default owner / key #1 mint-to: `0x6C05149910C2dd102032E44b96DA36988950B257`. Cap keeps control of GEAR supply so a lost/sold key does not strand the app - a 2M GEAR holder can mint a new Caps Mind key.

## CapsMindProphecies (Prophecy Tablets, ERC-721)

Full plain-words notes: `contracts/BANKR_PROPHECY_TABLETS.md`. Flattened source: `contracts/flat/CapsMindProphecies.flat.sol`.

- Gated on the deployed CAPs Mind key `0x00635ca44339c7c194ef5bc87bf2cd6df04a666d` (Bankr's version).
- `publishTablet(keyId, imageURI, description)`: an eligible CAPs Mind key holder publishes the next tablet (1, 2, 3...).
- `updateTablet(keyId, tabletId, imageURI, description)`: an eligible key holder changes a tablet's look for every copy (ERC-4906 refresh).
- `mint(tabletId, maxPrice)`: anyone mints the next copy. Token IDs are global; each copy also has a serial inside its tablet (`tabletOf`, `serialOf`). Names read "Prophecy Tablet 2 #5" (onchain JSON in `tokenURI`).
- Price per tablet: copy `n` costs `min(1000, 2^(n-1))` GEAR, split 90% treasury / 10% GearVault.
- A key holder with 2,000,000 GEAR can `setPublishEligible(keyId, bool)` and `pausePublishing(bool)`.
- Contract owner sets treasury / GearVault and can `pause()`; it cannot publish or edit tablets.
- Constructor order: CAPs Mind key, GEAR, treasury, GearVault, owner.

## Run locally

```bash
npm install
npm run build:web
npm run serve
```

Open http://127.0.0.1:8787. The site always reads the Base mainnet contracts above. Optional env: `BASE_RPC_URL` (extra read RPC, tried first) and `BLOB_READ_WRITE_TOKEN` (turns on image upload on `/publish`). Old demo vars (`CHAIN_ID`, `KEY_ADDRESS`, `PROPHECIES_ADDRESS`, `RPC_URL`) are ignored.

## Tests

```bash
npm test
cd contracts && forge test
```

## What Cap must provide to deploy

1. Owner / Safe address (default: `0x6C05149910C2dd102032E44b96DA36988950B257`)
2. Treasury address (90% GEAR)
3. GearVault address (10% GEAR)
4. GEAR token on the target chain (Sepolia mock, or mainnet GEAR when Cap says)
5. Wallet that should receive CapsMindKey #1 (`MINT_KEY_TO`, default: same Cap wallet)
6. Optional metadata: leave `KEY_BASE_URI` empty for on-chain JSON. Default `KEY_IMAGE_URI` is `https://capsmind.gearup.wtf/key/caps-mind-key.jpg` (`public/key/caps-mind-key.jpg`). Leave `KEY_ANIMATION_URI` empty. Pin to IPFS later for permanence and call `setMediaURIs` (see `contracts/metadata/`).
