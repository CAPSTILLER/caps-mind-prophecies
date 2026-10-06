import { Hono } from 'hono';
import { createPublicClient, http, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { propheciesAbi } from '../abis.js';
import { configFromEnv, type SiteConfig } from './config.js';
import {
  getLocalProphecy,
  listLocalProphecies,
  mintLocal,
  publishLocal,
} from './localStore.js';
import { keyPageBody } from './keyPage.js';
import { escapeHtml, page } from './pages.js';
import { SEED_PROPHECIES, withNextPrice } from './seed.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type AppEnv = { Bindings: Record<string, never> };

function chainFor(cfg: SiteConfig) {
  return cfg.chainId === 8453 ? base : baseSepolia;
}

function clientFor(cfg: SiteConfig) {
  return createPublicClient({
    chain: chainFor(cfg),
    transport: http(cfg.rpcUrl),
  });
}

async function loadChainProphecies(cfg: SiteConfig) {
  if (!cfg.live) return null;
  const client = clientFor(cfg);
  const address = cfg.propheciesAddress as Address;
  const count = await client.readContract({
    address,
    abi: propheciesAbi,
    functionName: 'prophecyCount',
  });
  const out = [];
  for (let id = Number(count); id >= 1; id--) {
    const row = await client.readContract({
      address,
      abi: propheciesAbi,
      functionName: 'getProphecy',
      args: [BigInt(id)],
    });
    out.push({
      id,
      imageUri: row[0],
      description: row[1],
      minted: Number(row[2]),
      publisher: row[3],
      publishedAt: Number(row[4]),
      nextPriceWholeGear: Number(row[5]),
      keyId: Number(row[6]),
    });
  }
  return out;
}

async function loadChainProphecy(cfg: SiteConfig, id: number) {
  if (!cfg.live) return null;
  const client = clientFor(cfg);
  const row = await client.readContract({
    address: cfg.propheciesAddress as Address,
    abi: propheciesAbi,
    functionName: 'getProphecy',
    args: [BigInt(id)],
  });
  return {
    id,
    imageUri: row[0],
    description: row[1],
    minted: Number(row[2]),
    publisher: row[3],
    publishedAt: Number(row[4]),
    nextPriceWholeGear: Number(row[5]),
    keyId: Number(row[6]),
  };
}

export function createApp(cfg: SiteConfig = configFromEnv()) {
  const app = new Hono<AppEnv>();

  app.get('/api/config', (c) => c.json(cfg));

  app.get('/api/prophecies', async (c) => {
    try {
      const chain = await loadChainProphecies(cfg);
      if (chain) return c.json({ source: 'chain', prophecies: chain });
      const local = await listLocalProphecies();
      return c.json({ source: 'local', prophecies: local });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  app.get('/api/prophecies/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id) || id < 1) return c.json({ error: 'bad id' }, 400);
    try {
      if (cfg.live) {
        const p = await loadChainProphecy(cfg, id);
        return c.json({ source: 'chain', prophecy: p });
      }
      const p = await getLocalProphecy(id);
      if (!p) return c.json({ error: 'not found' }, 404);
      return c.json({ source: 'local', prophecy: p });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  /** Local-only publish (when contracts not configured). Cap uses wallet publish onchain when live. */
  app.post('/api/local/publish', async (c) => {
    if (cfg.live) {
      return c.json({ error: 'Onchain mode: publish from the wallet UI, not this endpoint.' }, 400);
    }
    const body = await c.req.json<{ imageUri?: string; description?: string; publisher?: string }>();
    const imageUri = (body.imageUri || '').trim();
    const description = (body.description || '').trim();
    const publisher = (body.publisher || 'local').trim() || 'local';
    if (!imageUri || !description) return c.json({ error: 'imageUri and description required' }, 400);
    const row = await publishLocal(imageUri, description, publisher);
    return c.json({ prophecy: row });
  });

  app.post('/api/local/mint/:id', async (c) => {
    if (cfg.live) {
      return c.json({ error: 'Onchain mode: mint from the wallet UI.' }, 400);
    }
    const id = Number(c.req.param('id'));
    try {
      const row = await mintLocal(id);
      return c.json({ prophecy: row });
    } catch (e) {
      return c.json({ error: String(e) }, 404);
    }
  });

  app.post('/api/upload', async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const blob = file as File;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      const { put } = await import('@vercel/blob');
      const folder = form.folder === 'key' ? 'key' : 'prophecies';
      const safeName = blob.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const stored = await put(`${folder}/${Date.now()}-${safeName}`, blob, {
        access: 'public',
        token,
      });
      return c.json({ url: stored.url });
    }
    // Local serve: write under public/uploads
    const buf = Buffer.from(await blob.arrayBuffer());
    const safe = blob.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const name = `${Date.now()}-${safe}`;
    const dir = path.join(process.cwd(), 'public', 'uploads');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buf);
    return c.json({ url: `/uploads/${name}` });
  });

  app.get('/app.js', async (c) => {
    const built = path.join(process.cwd(), 'web', 'app.js');
    try {
      const js = await readFile(built, 'utf8');
      return c.body(js, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    } catch {
      return c.text('// run npm run build:web', 500);
    }
  });

  app.get('/key-page.js', async (c) => {
    const built = path.join(process.cwd(), 'web', 'key-page.js');
    try {
      const js = await readFile(built, 'utf8');
      return c.body(js, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    } catch {
      return c.text('// run npm run build:web', 500);
    }
  });

  /** Owner page for the deployed CAPs Mind key NFT on Base mainnet. */
  app.get('/key', (c) => {
    const blobUpload = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    return c.html(page('CAPs Mind key', keyPageBody({ blobUpload }), 'key', '/key-page.js'));
  });
  app.get('/owner', (c) => c.redirect('/key', 302));

  app.get('/', async (c) => {
    const liveNote = cfg.live
      ? `<div class="banner"><b>Onchain.</b> Gallery reads CapsMindProphecies at <code>${escapeHtml(cfg.propheciesAddress)}</code> on chain ${cfg.chainId}. Mint pays GEAR.</div>`
      : `<div class="banner"><b>Demo mode.</b> View Vault 42 prophecies — image and description, no wallet needed. Mint and publish go live after contracts deploy.</div>`;
    let cardsHtml = '';
    try {
      const list = cfg.live
        ? ((await loadChainProphecies(cfg)) || [])
        : await listLocalProphecies();
      if (!list.length) {
        cardsHtml = '<div class="empty">No prophecies yet.</div>';
      } else {
        cardsHtml = list
          .map(
            (p) => `<a class="card" href="/prophecy/${p.id}">
      <img class="shot" src="${escapeHtml(p.imageUri)}" alt="Prophecy ${p.id}"/>
      <div class="body">
        <div class="desc">${escapeHtml(p.description)}</div>
        <div class="meta"><span>#${p.id} · Prophecy ${p.id}</span><span>${cfg.live ? p.nextPriceWholeGear + ' GEAR next' : 'View'}</span></div>
      </div>
    </a>`,
          )
          .join('');
      }
    } catch (e) {
      // Fallback to seed so the first prophecy always shows
      const list = SEED_PROPHECIES.map(withNextPrice);
      cardsHtml = list
        .map(
          (p) => `<a class="card" href="/prophecy/${p.id}">
      <img class="shot" src="${escapeHtml(p.imageUri)}" alt="Prophecy ${p.id}"/>
      <div class="body">
        <div class="desc">${escapeHtml(p.description)}</div>
        <div class="meta"><span>#${p.id} · Prophecy ${p.id}</span><span>View</span></div>
      </div>
    </a>`,
        )
        .join('');
      void e;
    }
    const body = `${liveNote}
<section>
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <h1 style="margin:0;font-size:22px">Prophecy gallery</h1>
  </div>
  <div id="gallery" class="grid">${cardsHtml}</div>
</section>`;
    return c.html(page('Gallery', body, 'gallery'));
  });

  app.get('/publish', (c) => {
    if (!cfg.live) {
      const body = `
<div class="banner"><b>Publish coming soon.</b> Demo mode is view-only. After CapsMindKey and CapsMindProphecies deploy, Cap publishes with an eligible key NFT.</div>
<p><a href="/">← Gallery</a></p>`;
      return c.html(page('Publish', body, 'publish'));
    }
    const body = `
<div class="banner"><b>Publisher gate.</b> Connect a wallet that holds an <b>eligible</b> CAPs Mind Key NFT. Upload image + description, publish, then disconnect. A Caps Mind holder who also holds 2,000,000 GEAR can lock any key ID or pause all publishing.</div>
<p id="publishPauseNote" class="meta" style="margin:0 0 12px"></p>
<section class="panel">
  <div class="row">
    <button type="button" id="connectBtn" class="primary">Connect wallet</button>
    <button type="button" id="disconnectBtn">Disconnect</button>
    <span id="publishGate" class="meta">Checking key…</span>
  </div>
  <label for="imageUrl">Image URL</label>
  <input id="imageUrl" placeholder="https://… or upload below"/>
  <label for="imageFile">Or upload image</label>
  <input id="imageFile" type="file" accept="image/*"/>
  <div id="preview" style="margin-top:12px;display:none" class="tablet-frame"><img id="previewImg" alt="preview"/></div>
  <label for="description">Description</label>
  <textarea id="description" placeholder="THE PROPHECY TEXT…" maxlength="2048"></textarea>
  <div class="row">
    <button type="button" id="publishBtn" class="primary" disabled>Publish prophecy</button>
    <span id="publishStatus" class="meta"></span>
  </div>
</section>`;
    return c.html(page('Publish', body, 'publish'));
  });

  app.get('/prophecy/:id', async (c) => {
    const id = c.req.param('id');
    const num = Number(id) || 0;
    let p =
      (cfg.live ? await loadChainProphecy(cfg, num).catch(() => null) : null) ||
      (await getLocalProphecy(num)) ||
      SEED_PROPHECIES.map(withNextPrice).find((x) => x.id === num) ||
      null;
    const imgSrc = p ? escapeHtml(p.imageUri) : '';
    const desc = p ? escapeHtml(p.description) : 'Not found';
    const banner = cfg.live
      ? `<div class="banner" id="modeBanner"><b>Onchain mint.</b> Approve GEAR, then mint. Curve caps at ${cfg.maxPriceGear} GEAR.</div>`
      : `<div class="banner" id="modeBanner"><b>Demo view.</b> Read the prophecy. Minting opens when contracts deploy.</div>`;
    const mintRow = cfg.live
      ? `<div class="row">
      <button type="button" id="connectBtn" class="primary">Connect wallet</button>
      <button type="button" id="mintBtn" class="primary" disabled>Mint edition</button>
    </div>
    <p class="meta" id="mintStatus" style="margin-top:10px"></p>
    <p class="meta">Curve: mint n costs min(1000, 2^(n-1)) GEAR. Payment splits 90% treasury / 10% GearVault.</p>`
      : `<p class="meta" id="mintStatus" style="margin-top:10px">Minting is stubbed until CapsMindProphecies is live onchain.</p>`;
    const body = `
${banner}
<section style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px">
  <div class="tablet-frame">
    <img id="propImage" alt="Prophecy tablet" src="${imgSrc}"/>
    <div class="tablet-text" id="propText">${desc}</div>
  </div>
  <div class="panel">
    <h1 style="margin:0 0 8px;font-size:20px">Prophecy #${escapeHtml(id)}</h1>
    <div class="kv"><span>Editions minted</span><span id="propMinted">${p ? p.minted : '-'}</span></div>
    <div class="kv"><span>Next price</span><span id="propPrice">${p ? p.nextPriceWholeGear + ' GEAR' : '-'}</span></div>
    <div class="kv"><span>Publisher</span><span id="propPublisher" style="font-family:ui-monospace,monospace;font-size:12px">${p ? escapeHtml(p.publisher) : '-'}</span></div>
    <div class="kv"><span>Published</span><span id="propWhen">${p && p.publishedAt ? new Date(p.publishedAt * 1000).toISOString().slice(0, 10) : '-'}</span></div>
    ${mintRow}
    <p><a href="/">← Gallery</a></p>
  </div>
</section>
<style>@media (max-width:800px){ section{grid-template-columns:1fr !important} }</style>
<script>window.__PROPHECY_ID__=${num};</script>`;
    return c.html(page(`Prophecy #${id}`, body, 'detail'));
  });

  app.notFound((c) => c.html(page('Not found', `<div class="empty">No page here. <a href="/">Gallery</a></div>`), 404));

  return { app, cfg };
}

export function appFromEnv() {
  return createApp(configFromEnv());
}
