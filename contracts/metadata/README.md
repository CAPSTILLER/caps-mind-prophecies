# CapsMindKey metadata (image NFT)

Wallets and OpenSea use ERC-721 `tokenURI` JSON.

## How CapsMindKey serves metadata

**Default (recommended):** on-chain JSON. With `baseURI` empty, `tokenURI(id)` returns a
`data:application/json;base64,…` blob built from:

| Field | Source |
| --- | --- |
| `name` | `CAPs Mind Key #<id>` |
| `description` | Fixed publisher-key blurb |
| `image` | Owner-set `imageURI` — **main wallet/OpenSea view** |
| `animation_url` | Owner-set `animationURI` — **only included when non-empty** |

Owner updates media anytime:

```text
setMediaURIs(imageURI, animationURI)
```

Leave `animationURI` empty so JSON has no `animation_url` field (wallets/OpenSea show the image).

**Optional override:** if owner sets a non-empty `baseURI`, `tokenURI` becomes
`baseURI + tokenId` and expects hosted JSON shaped like `caps-mind-key.template.json`.

## Cap's key art (current)

- File in repo: `public/key/caps-mind-key.jpg` (exact original; no edits)
- Default HTTPS URI: `https://capsmind.gearup.wtf/key/caps-mind-key.jpg`
- Deploy default: `KEY_IMAGE_URI` falls back to that URL; `KEY_ANIMATION_URI` defaults empty

**IPFS recommended later** for permanence (pin the same JPG to nft.storage / Pinata / etc., then
call `setMediaURIs(ipfs://…, "")` from Cap's owner wallet). HTTPS on `capsmind.gearup.wtf` is fine
for demo / first deploy.

Template: [`caps-mind-key.template.json`](./caps-mind-key.template.json)
