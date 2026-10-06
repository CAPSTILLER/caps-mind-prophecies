# CAPs Mind Prophecies

Vault 42 prophecy tablets. Cap publishes with an **eligible CAPs Mind Key** NFT. Anyone mints editions by paying **GEAR** on a bonding curve.

Live product pieces:

- `contracts/` Foundry: `CapsMindKey` + `CapsMindProphecies` (Sepolia-ready, not deployed yet)
- Site (Hono + static): gallery, prophecy detail/mint, publisher upload
- GEAR Base mainnet: `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` (6 decimals)

## CapsMindKey (ERC-721, sequential IDs)

One contract; token IDs mint 1, 2, 3…

| Who | Rule |
| --- | --- |
| **Bootstrap #1** | When `totalSupply == 0`, **only owner** may call `mint(to)` — **no GEAR hold**. This is how Cap gets key #1. |
| **Later keys** | Anyone who **holds** ≥ **2,000,000 GEAR** (`balanceOf` check only; no burn/transfer) may `mint(to)`. |

Owner can `setMediaURIs(image, animation)` (on-chain JSON: OpenSea `image` is the main view; `animation_url` is omitted when empty), `setBaseURI` (optional off-chain override), and `pause` key minting. Default key image: `https://capsmind.gearup.wtf/key/caps-mind-key.jpg` (file at `public/key/caps-mind-key.jpg`; **IPFS recommended later for permanence**). Default owner / key #1 mint-to: `0x6C05149910C2dd102032E44b96DA36988950B257`. Cap keeps control of GEAR supply so a lost/sold key does not strand the app — a 2M GEAR holder can mint a new Caps Mind key.

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

## Local demo (no contracts)

```bash
npm install
npm run build:web
npm run serve
```

Open http://127.0.0.1:8787. Without `KEY_ADDRESS` / `PROPHECIES_ADDRESS`, the site uses a local JSON store under `data/`. Image uploads go to `public/uploads/` (or Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set).

## Onchain mode

Set env (see `.env.example`):

- `CHAIN_ID` (84532 Sepolia or 8453 Base)
- `RPC_URL`
- `GEAR_ADDRESS`
- `KEY_ADDRESS`
- `PROPHECIES_ADDRESS`

Deploy steps for Bankr: `contracts/README_FOR_BANKR.md`.

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
