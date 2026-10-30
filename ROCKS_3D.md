# CAPs Rocks: face on the 3D rock, holder download, metadata

## What runs where
- `rockgen/` — server-side port of avatar-foundry (bc8610a) "Crushed Prophecy" tablet generator plus a **face engraving step**:
  the chosen face (240×170 mm bitmap) is baked to a base-colour PNG (white #eef2f5 on Base blue) + a normal map
  (strokes cut into the stone) on a plate over the face tablet (the generator's `engraveZone`/face slot), skinned 100% to
  `mixamorig:Head`. With a face, the generator's thin inlay border is skipped (the face brings its own border).
  Rig (36 Mixamo joints), metres, feet on floor, Idle + 6 clips unchanged. Full GLB ≈ 3.2 MB, ~0.8 s cold.
- Assets are **not in git** (repo is public; they are Cap's Meshy rig/clips + torso): `rig.json` (1.0 MB) + `torso_lo.glb` (1.4 MB).
  Server reads them from `ROCKGEN_ASSETS_URL` (https prefix) or `ROCKGEN_ASSETS_DIR`. Rebuild with `node rockgen/build-rigpack.mjs <dir>`.

## Endpoints
| route | who | what |
|---|---|---|
| `GET /api/rocks/:id` | public | ERC-721 metadata (image = face.png, animation_url = preview.glb) |
| `GET /api/rocks/:id/face.png[?face=i]` | public | active (or chosen) face as PNG |
| `GET /api/rocks/:id/preview.glb[?face=i]` | public | Idle-only, half-res face (marketplace viewer) |
| `GET /api/rocks/preview.glb?seed=0x…` | public | blank-face Idle preview; /faces paints the face live |
| `GET /api/rocks/:id/challenge?address=` | public | message to sign (domain, address, token, issued, expires, HMAC nonce; 5 min) |
| `POST /api/rocks/:id/glb` `{address,message,signature,face?,zip?}` | holder | full GLB, or `.zip` with `rock.glb` |
Signature: viem `verifyMessage` (EOA + ERC-1271/6492), then `ownerOf(id) == address` on Base.

## Cap's to-do
1. Vercel env (Preview + Production): `ROCKS_DL_SECRET` = long random string; `ROCKGEN_ASSETS_URL` = https folder holding `rig.json` and `torso_lo.glb`
   (e.g. upload both to Vercel Blob under an unguessable prefix). Optional `BASE_RPC_URL`.
2. Onchain (Ledger, only when happy): `CapsRocks.setBaseURI("https://capsmind.gearup.wtf/api/rocks/")` on `0x0fa575fd563517549e714acde968051a7310aadb`.
   tokenURI(id) then = that + id; the contract emits BatchMetadataUpdate so marketplaces refresh.

## Freeze list (generatorVersion 1 — never change once rocks are public)
rockgen/generate.mjs, rockgen/faceTex.mjs, rockgen/lib/rng.mjs, rockgen/lib/traits.mjs, rockgen/lib/shapes.mjs,
rockgen/lib/tablet/{body,traits,texture}.mjs, rig.json + torso_lo.glb, src/faces/engine.ts + its part kits (faces_v1 / wallet_pixel / custom parts).
Pin `three` and `@gltf-transform/*` versions (geometry math). Any art change = new generatorVersion.
