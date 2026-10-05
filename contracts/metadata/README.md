# CapsMindKey metadata (video NFT)

Wallets and OpenSea use ERC-721 `tokenURI` JSON.

## How CapsMindKey serves metadata

**Default (recommended):** on-chain JSON. With `baseURI` empty, `tokenURI(id)` returns a
`data:application/json;base64,…` blob built from:

| Field | Source |
| --- | --- |
| `name` | `CAPs Mind Key #<id>` |
| `description` | Fixed publisher-key blurb |
| `image` | Owner-set `imageURI` (poster / still) |
| `animation_url` | Owner-set `animationURI` (video — main view) |

Owner updates media anytime:

```text
setMediaURIs(imageURI, animationURI)
```

**Optional override:** if owner sets a non-empty `baseURI`, `tokenURI` becomes
`baseURI + tokenId` and expects hosted JSON shaped like `caps-mind-key.template.json`.

## When Cap sends the video

1. Prefer **MP4 (H.264 + AAC)**, ~1080p or less, under ~50–100 MB for OpenSea/wallet friendliness.
2. Export a **poster still** (PNG/JPG/WebP) from a clear frame — used as `image`.
3. Host both on **IPFS** (nft.storage, Pinata, etc.) or a stable HTTPS CDN.
4. Fill the TODOs below (or call `setMediaURIs` with the final URIs):
   - `image` → poster URI (`ipfs://…` or `https://…`)
   - `animation_url` → video URI
5. Do **not** invent art — wait for Cap’s file. Leave placeholders until then.
6. After deploy, Cap’s owner wallet (`0x6C05149910C2dd102032E44b96DA36988950B257`) calls
   `setMediaURIs(poster, video)` (or sets `KEY_IMAGE_URI` / `KEY_ANIMATION_URI` at deploy time).

Template: [`caps-mind-key.template.json`](./caps-mind-key.template.json)
