# FROZEN v1 — never change; add a new generator version instead

Minted wallet faces are stored onchain as a recipe (`generatorVersion = 1`, `variant = 0`, seed = wallet) and redrawn by the server. Changing any of the below changes already-minted rocks. Guarded by `test/frozen_v1.test.ts` (sha256 golden values). If it fails: revert, don't update the hashes; add version 2 instead.

## Frozen inputs (byte-identical)
- `src/faces/engine.ts` (wallet + custom face engine)
- `src/faces/wallet_parts.json`, `src/faces/custom_parts.json`
- `rockgen/lib/tablet/traits.mjs` (`deriveTabletTraits`)
- `rockgen/lib/tablet/body.mjs` (face slot / position on the tablet)

## Frozen outputs
- Wallet face bitmaps for 7 fixed wallets (incl. `0xc7d4E906741197aB6D3F6773D93E176596806661`), v1 variant 0
- Custom face bitmap for `DEFAULT_LAYOUT`

## Frozen API
Signed download message (EIP-191 `personal_sign`, TTL 300 s):
```
CAPs Rocks download
Domain: <host>
Address: <checksummed address>
Token: <id>
Issued: <ISO time>
Expires: <Issued + 300s ISO>
Nonce: <24 hex, HMAC(ROCKS_DL_SECRET)>
```
Paths:
- `GET /api/rocks/:id` — metadata JSON
- `GET /api/rocks/:id/face.png`
- `GET /api/rocks/:id/preview.glb`
- `GET /api/rocks/preview.glb?seed=<wallet>`
- `GET /api/rocks/:id/challenge?address=` — returns message to sign
- `POST /api/rocks/:id/glb` — `{address, message, signature}` → rigged GLB zip
