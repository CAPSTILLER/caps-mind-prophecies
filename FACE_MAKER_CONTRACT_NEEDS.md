# Face Maker ↔ CAPs Rocks contract: what exists, what's missing

Contract: CapsRocks `0x0fa575fd563517549e714acde968051a7310aadb` on Base. It's deployed and verified, and `totalMinted()` was 1 on Oct 30 2026. The deployed bytecode contains the `addWalletFace` and `rockView` selectors.

**No new contract is needed.** The deployed contract already has the face functions:

| Need | Contract today | Face Maker |
|---|---|---|
| Wallet face added only by the wallet it's seeded from | `addWalletFace(tokenId, version, variant)`: free, but only when `msg.sender` is the rock's seed wallet and owns the rock. The seed is always `msg.sender` | **Wired for real** (version 1, variant = mood 0–6) |
| Wallet face on a rock forged by another wallet | `addWalletFacePaid(..., FaceQuote, sig)`: GEAR fee, server-signed EIP-712 quote | **Stub**: needs a quote server |
| Multiple custom faces | `addCustomFace(tokenId, contentHash, uri, FaceQuote, sig)`: GEAR fee, dedupe per rock, `uri` = ipfs:// | **Stub**: needs a quote server and IPFS pin |
| Several faces saved, pick one | `facesOf`, `setActiveFace`, `clearActiveFace`; the first face auto-activates | Reads `facesOf`. No "set active" UI yet |
| Metadata refresh | Emits ERC-4906 `MetadataUpdate` on every face add; `tokenURI` = baseURI + id | — |

## "One face per wallet"
The contract makes each `(wallet, version, variant)` unique per rock. One wallet still gets 7+ variants (moods) on the same rock, and the same wallet face can go on several rocks. If Cap wants strictly ONE wallet face per wallet, the contract can't enforce it today. Two options:
- (a) The UI offers only variant 0 (a one-line change in `web/faces-page.ts`).
- (b) A new contract or version adds `mapping(address => bool) walletFaceUsed`. That needs a redeploy, which this work did not do.

## Off-chain pieces still to build (to remove the stubs)
1. **`POST /api/face-quote`** `{payer, tokenId, kind}`. It returns a `FaceQuote` (whole GEAR ≈ $0.25, nonce, validUntil ≈ 10 min) signed EIP-712 by the `quoteSigner` key, which is stored in Vercel env only. Domain: name/version as in the contract's `EIP712(...)` constructor, chainId 8453, verifyingContract = CapsRocks.
2. **Pin custom faces**: upload the SVG (`data-caps-face="custom-v2"`) to Pinata. The site already has a Pinata JWT path in `src/server/upload.ts`. Pass `ipfs://CID` as `uri` and `contentHash` = keccak256(packed 240×170 bitmap), which the page already computes.
3. A GEAR `approve(CapsRocks, gearAmount)` step before the paid calls, or an EIP-5792 batch.
4. Metadata server at `baseURI` that renders the active face. Check what baseURI is set to.
5. **Freeze the generators.** `wallet_pixel` and custom v2 are marked UNFROZEN / LOCAL ONLY in caps-rocks. Once a wallet face is minted onchain as `(version 1, variant)`, the pixels must never change. Freeze `parts_wallet_baked.json` and `faces_v1.js` before anyone mints.
