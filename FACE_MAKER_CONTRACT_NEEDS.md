# Face Maker ↔ CAPs Rocks contract: what exists, what's missing

Contract: CapsRocks `0x0fa575fd563517549e714acde968051a7310aadb` on Base. It's deployed and verified, and `totalMinted()` was 1 on Oct 30 2026. The deployed bytecode contains the `addWalletFace` and `rockView` selectors.

**No new contract is needed.** The deployed contract already has the face functions:

| Need | Contract today | Face Maker |
|---|---|---|
| Wallet face added only by the wallet it's seeded from | `addWalletFace(tokenId, version, variant)`: free, but only when `msg.sender` is the rock's seed wallet and owns the rock. The seed is always `msg.sender` | **Wired for real** (always version 1, variant 0; no moods) |
| Wallet face on a rock forged by another wallet | `addWalletFacePaid(..., FaceQuote, sig)`: GEAR fee, server-signed EIP-712 quote | **Stub**: needs a quote server |
| Multiple custom faces | `addCustomFace(tokenId, contentHash, uri, FaceQuote, sig)`: GEAR fee, dedupe per rock, `uri` = ipfs:// | **Stub**: needs a quote server and IPFS pin |
| Several faces saved, pick one | `facesOf`, `setActiveFace`, `clearActiveFace`; the first face auto-activates | Reads `facesOf`. No "set active" UI yet |
| Metadata refresh | Emits ERC-4906 `MetadataUpdate` on every face add; `tokenURI` = baseURI + id | — |

## "One face per wallet"
**The UI now enforces it:** it always mints version 1, variant 0. If the connected wallet's face is already on ANY of its rocks, it shows "Minted", unlocks export and disables minting (including onto another rock).
**The contract still allows more:** each `(kind, wallet, version, variant)` is unique per rock only, so a direct contract call can add other variants or put the same face on a second rock. True enforcement needs a contract change: a `mapping(address => uint256) walletFaceRock` (or `bool walletFaceUsed`) checked and set in `addWalletFace`/`addWalletFacePaid` (`require(walletFaceRock[msg.sender] == 0)`), plus `require(variant == 0)` (or drop the variant argument). Since the deployed contract is not upgradable here, that means a new version/deploy. Not touched.

## Off-chain pieces still to build (to remove the stubs)
1. **`POST /api/face-quote`** `{payer, tokenId, kind}`. It returns a `FaceQuote` (whole GEAR ≈ $0.25, nonce, validUntil ≈ 10 min) signed EIP-712 by the `quoteSigner` key, which is stored in Vercel env only. Domain: name/version as in the contract's `EIP712(...)` constructor, chainId 8453, verifyingContract = CapsRocks.
2. **Pin custom faces**: upload the SVG (`data-caps-face="custom-v2"`) to Pinata. The site already has a Pinata JWT path in `src/server/upload.ts`. Pass `ipfs://CID` as `uri` and `contentHash` = keccak256(packed 240×170 bitmap), which the page already computes.
3. A GEAR `approve(CapsRocks, gearAmount)` step before the paid calls, or an EIP-5792 batch.
4. Metadata server at `baseURI` that renders the active face. Check what baseURI is set to.
5. **Freeze the generators.** `wallet_pixel` and custom v2 are marked UNFROZEN / LOCAL ONLY in caps-rocks. Once a wallet face is minted onchain as `(version 1, variant)`, the pixels must never change. Freeze `parts_wallet_baked.json` and `faces_v1.js` before anyone mints.

## Custom faces
Custom faces use only the kit parts (border, eyes, brows, nose, mouth): pick, place, move, flip. No image uploads. The IPFS file for a custom face is the final rendered face (SVG/PNG of the 240×170 bitmap), and `contentHash` = keccak256 of that final packed bitmap. Custom mint stays stubbed until the GEAR quote signer exists.
