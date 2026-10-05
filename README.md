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

Owner can `setBaseURI` / `pause` key minting. Cap keeps control of GEAR supply so a lost/sold key does not strand the app — a 2M GEAR holder can mint a new Caps Mind key.

## CapsMindProphecies (edition NFTs)

### Publishing

- Caller calls `publish(keyId, imageUri, description)`.
- Must **own** that Caps Mind `keyId`, and that ID must be **eligible**.
- **Default:** every Caps Mind token ID is eligible unless locked.
- Any Caps Mind holder who also holds ≥ **2,000,000 GEAR** can:
  - `setPublishEligible(keyId, bool)` — lock or unlock **any** Caps Mind ID (including others')
  - `pausePublishing(bool)` — pause **all** new uploads without changing per-id flags

So if an old key is sold/lost, Cap (or any Caps Mind + 2M GEAR holder) can lock that ID out, or pause publishing entirely.

### Minting (anyone)

For mint number `n` of a given prophecy (starting at 1):

`price = min(1000, 2^(n-1))` whole GEAR

So: 1, 2, 4, 8, …, 512, then **1000 forever**. Payment uses `transferFrom`; **90% treasury / 10% GearVault**.

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

1. Owner / Safe address
2. Treasury address (90% GEAR)
3. GearVault address (10% GEAR)
4. GEAR token on the target chain (Sepolia mock, or mainnet GEAR when Cap says)
5. Wallet that should receive CapsMindKey #1 (`MINT_KEY_TO`)
6. Optional metadata base URIs
