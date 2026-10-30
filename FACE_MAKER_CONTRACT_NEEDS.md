# Face Maker (/faces): what's real, what's stubbed, what the contract/backend still needs

CapsRocks `0x0fa575fd563517549e714acde968051a7310aadb` (Base). The page is built around a rock: connect the wallet, pick a rock it holds, see the rock's face collection (read from `rockView` + `facesOf`), add faces, choose the displayed face, download.

## Flow vs contract

| Step | Contract function | Status in the app |
|---|---|---|
| List the wallet's rocks | `totalMinted` + `rockView(id).owner` loop (not Enumerable) | **Real** (fine at today's supply; switch to Transfer logs / indexer later) |
| Face collection of a rock | `facesOf(id, 0, n)`: wallet faces from any wallet + custom faces | **Real** |
| Free wallet face (wallet that forged the rock) | `addWalletFace(id, 1, 0)` (free; requires `msg.sender == seed` and owner) | **Real** |
| Paid wallet face (any other wallet holding the rock) | `addWalletFacePaid(id, 0, quote, sig)` (GEAR) | **Stub**: needs the EIP-712 GEAR quote signer (`quoteSigner`) + GEAR approve |
| Custom face (kit parts only) | `addCustomFace(id, contentHash, uri, quote, sig)` (GEAR) | **Stub**: needs the quote signer + IPFS pin + GEAR approve |
| Display a face on the rock | `setActiveFace(id, index)` (current holder) / `clearActiveFace` | **Real**: "Display this face on the rock" |
| Read the displayed face | `rockView.hasActiveFace/activeFaceIndex`, `activeFace(id)` | **Real** |
| Download face PNG / SVG / print video / 2D rock preview | none (client side) | **Real** for any face in the rock's collection |
| Download rock GLB with the displayed face | off-chain renderer (avatar-foundry) | **Not built**, see below |

## Wallet face rules
- One wallet face per wallet: always generator version 1, variant 0 (no moods).
- **One copy per wallet per rock.** The app blocks only a second copy of the same wallet's face on the same rock. The same wallet may put its face on other rocks, and different wallets holding the same rock can each add their own face (free only for the forging wallet).
- The contract already enforces this per-rock rule *for variant 0*: duplicates are keyed `keccak(kind, wallet, version, variant)` per rock. It does **not** stop a direct call using another variant (1, 2, …), which would add a second face for the same wallet. To enforce strictly onchain: require `variant == 0` (or drop the argument) in `addWalletFace` / `addWalletFacePaid`, or key the duplicate check on `(Wallet, msg.sender)` only. That is a contract change (new deploy); not touched.

## Custom faces
Kit parts only (border, eyes, brows, nose, mouth; place, move, flip). No uploads. The IPFS file is the final rendered face SVG (`renderSvg`, 240×170 1 mm bitmap), and `contentHash` = keccak256 of the final packed bitmap. The app reads a pinned custom face back from its `uri`, rebuilds the bitmap, and checks it against `contentHash` before showing/exporting it.

## Still needed (backend, not contract)
1. **Quote server** signing `FaceQuote(payer, tokenId, kind, gearAmount, nonce, validUntil)` with the `quoteSigner` key (owner sets it via `setQuoteSigner`), within `minFaceFee..maxFaceFee`, whole GEAR, TTL ≤ MAX_QUOTE_TTL.
2. **IPFS pin** (Pinata) of the custom face SVG before `addCustomFace`.
3. **GEAR approve** UI for the CapsRocks contract before paid adds.
4. **Metadata / tokenURI**: `tokenURI = baseURI + id`. Something must serve that JSON with the rock and its *active* face (image + GLB links) so marketplaces and apps like Mysbase show the displayed face. Suggested: `GET /api/rocks/:id` (and as baseURI `…/api/rocks/meta/`) that reads `rockView` + `activeFace` and returns `{ name, image (rock PNG with active face), animation_url (GLB), attributes, activeFace:{kind, seed, version, variant | contentHash, uri} }`. The contract emits `MetadataUpdate` on every change already.
5. **Rock GLB with the active face (Mysbase-ready)**: not feasible in this app today. avatar-foundry (`gen.js <seed> --style tablet`) makes the rigged 3–4 MB GLB in meters and exposes an `engraveZone` on the face tablet, but it has no step that applies a face bitmap yet, and the caps-rocks brief says the full generator stays server-side (owner-signed `/api/rocks/download`, not shipped to browsers). Needed: (a) add a face-engrave step to avatar-foundry using the same 240×170 bitmap, (b) the signed download endpoint that renders/caches by `(tokenId, generatorVersion, activeFace key)`. The app has a disabled "Rock GLB (soon)" button ready for it.
6. **Freeze the generators** (`wallet_parts.json`/`faces_v1.js`, custom v2 parts) before real mints: the chain stores only the recipe (wallet, version, variant), so the art code must never change.
