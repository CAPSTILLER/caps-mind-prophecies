# CAPs Mind Prophecies

Vault 42 prophecy tablets. Cap publishes with a **CAPs Mind Key** NFT. Anyone mints editions by paying **GEAR** on a bonding curve.

Live product pieces:

- `contracts/` Foundry: `CapsMindKey` + `CapsMindProphecies` (Sepolia-ready, not deployed yet)
- Site (Hono + static): gallery, prophecy detail/mint, publisher upload
- GEAR Base mainnet: `0x5880cD05605A549f1DAb01a53ca61Ee559244bD1` (6 decimals)

## Publisher gate

1. Deploy `CapsMindKey` and mint token #1 to Cap (or Cap's Safe).
2. Deploy `CapsMindProphecies` with `publisherNft = CapsMindKey` and `publisherTokenId = 0` (any key) or a specific token id.
3. Cap connects that wallet on `/publish`, uploads image + description, calls `publish`, then disconnects.

Only wallets that pass `canPublish(account)` can publish. Viewing and minting are public.

## Bonding price

For mint number `n` of a given prophecy (starting at 1):

`price = min(1000, 2^(n-1))` whole GEAR

So: 1, 2, 4, 8, …, 512, then **1000 forever**. Payment uses `transferFrom`; **90% treasury / 10% GearVault**.

## Local demo (no contracts)

```bash
npm install
npm run build:web
npm run serve
```

Open http://127.0.0.1:8787. Without `KEY_ADDRESS` / `PROPHECIES_ADDRESS`, the site uses a local JSON store under `data/` so Cap can try the UI. Image uploads go to `public/uploads/` (or Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set).

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
