import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { IPFS_GATEWAYS, ipfsPath, PREVIEW_PROPHECIES, TABLETS, pendingPreviews, tabletForPreview } from '../tablets.js';
import { chainReader, type TabletReader, type TabletsState } from './chain.js';
import { configFromEnv, type SiteConfig } from './config.js';
import { keyPageBody } from './keyPage.js';
import { facesPageBody } from './facesPage.js';
import { page } from './pages.js';
import { UPLOAD, chainUploadGate, sniffImageType, storeImage, uploadStore, gatewayUrl, pinataJwt, resolveSlot, clearSlotCache, extFor, type UploadGate } from './upload.js';
import { galleryBody, previewBody, publishBody, tabletDetailBody } from './tabletPages.js';

export type AppEnv = { Bindings: Record<string, never> };

function errText(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}

export function createApp(
  cfg: SiteConfig = configFromEnv(),
  reader: TabletReader = chainReader(cfg),
  gate: UploadGate = chainUploadGate(cfg),
  fetchImpl: typeof fetch = fetch,
) {
  const app = new Hono<AppEnv>();

  async function safeState(): Promise<{ state: TabletsState | null; error: string | null }> {
    try {
      return { state: await reader.state(), error: null };
    } catch (e) {
      return { state: null, error: errText(e) };
    }
  }

  app.get('/api/config', (c) =>
    c.json({
      ...cfg,
      contract: TABLETS,
      previews: PREVIEW_PROPHECIES,
    }),
  );

  app.get('/api/tablets', async (c) => {
    const { state, error } = await safeState();
    if (!state) return c.json({ error: error || 'read failed', previews: PREVIEW_PROPHECIES }, 502);
    c.header('Cache-Control', 'no-store');
    return c.json({ ...state, previews: pendingPreviews(state.tablets) });
  });

  app.get('/api/tablets/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'bad tablet id' }, 400);
    try {
      const tablet = await reader.tablet(id);
      if (!tablet) return c.json({ error: 'not published yet' }, 404);
      c.header('Cache-Control', 'no-store');
      return c.json({ tablet });
    } catch (e) {
      return c.json({ error: errText(e) }, 502);
    }
  });

  /**
   * Image upload for the publish page and the key page. Gated: the wallet signs a free message and
   * must be able to publish with the named CAPs Mind key (or own the key contract for key art).
   * Stores on IPFS (PINATA_JWT) or Vercel Blob (BLOB_READ_WRITE_TOKEN). Secrets stay server-side.
   */
  async function proxyIpfs(want: string, cacheControl: string): Promise<Response | null> {
    for (const gw of IPFS_GATEWAYS) {
      try {
        const res = await fetchImpl(gw + want, { signal: AbortSignal.timeout(9_000), redirect: 'follow' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !/^image\//i.test(type)) continue;
        const buf = await res.arrayBuffer();
        return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' } });
      } catch {
        /* next gateway */
      }
    }
    return null;
  }

  /** IPFS image proxy: tries several gateways (Pinata first), only passes images, caches for a year. */
  app.get('/ipfs/*', async (c) => {
    const want = ipfsPath('ipfs://' + decodeURIComponent(new URL(c.req.url).pathname.slice(6)));
    if (!want) return c.text('bad ipfs path', 400);
    const res = await proxyIpfs(want, 'public, max-age=31536000, s-maxage=31536000, immutable');
    if (res) return res;
    c.header('Cache-Control', 'no-store');
    return c.text('image not reachable on IPFS gateways right now', 504);
  });

  /**
   * Clean tablet image links: /prophecies/<n>.<ext>. Static files (1.png, 2.png) are served by Vercel
   * before this runs; anything else is the newest Pinata pin named prophecy-<n>.<ext>.
   * Short cache because an edit can re-upload the same slot.
   */
  app.get('/prophecies/:file', async (c) => {
    const file = c.req.param('file');
    if (!/^[1-9][0-9]{0,6}\.(png|jpg|gif|webp)$/.test(file)) return c.text('not found', 404);
    try {
      const buf = await readFile(path.join(process.cwd(), 'public', 'prophecies', file));
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.gif') ? 'image/gif' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return c.body(buf, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
    } catch {
      /* not a static file */
    }
    const cid = await resolveSlot('prophecy-' + file).catch(() => null);
    if (!cid) {
      c.header('Cache-Control', 'no-store');
      return c.text('no image for this tablet yet', 404);
    }
    const res = await proxyIpfs(cid, 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
    if (res) return res;
    c.header('Cache-Control', 'no-store');
    return c.text('image not reachable on IPFS gateways right now', 504);
  });

  /** Which storage the server sees (no secrets), to debug Vercel env setup. */
  app.get('/api/upload-status', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ store: uploadStore(), pinataJwtSet: Boolean(pinataJwt()), blobTokenSet: Boolean((process.env.BLOB_READ_WRITE_TOKEN || '').trim()), vercelEnv: process.env.VERCEL_ENV || null });
  });

  app.post('/api/upload', async (c) => {
    const store = uploadStore();
    if (!store) return c.json({ error: 'Uploads are not set up on this site yet. Paste an image link instead.' }, 503);
    const len = Number(c.req.header('content-length') || '0');
    if (len > UPLOAD.maxStoreBytes + 64 * 1024) return c.json({ error: 'Image is too big. Max 4 MB after shrinking.' }, 413);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const folder = form.folder === 'key' ? 'key' : 'prophecies';
    let why: string | null;
    try {
      why = await gate({
        address: String(form.address || ''),
        keyId: Number(form.keyId || '0'),
        folder,
        issuedAt: Number(form.issuedAt || '0'),
        signature: String(form.signature || ''),
        slot: Number(form.slot || '0'),
        mode: form.mode === 'edit' ? 'edit' : 'publish',
      });
    } catch (e) {
      return c.json({ error: 'Could not check your key on Base: ' + errText(e) }, 502);
    }
    if (why) return c.json({ error: why }, 403);
    const bytes = new Uint8Array(await (file as File).arrayBuffer());
    if (bytes.length > UPLOAD.maxStoreBytes) return c.json({ error: 'Image is too big. Max 4 MB after shrinking.' }, 413);
    const type = sniffImageType(bytes);
    if (!type) return c.json({ error: 'PNG, JPEG, GIF or WebP only' }, 400);
    try {
      const slot = folder === 'prophecies' ? Number(form.slot || '0') : 0;
      const stored = await storeImage(store, folder, bytes, type, process.env, slot || undefined);
      if (slot && store === 'ipfs') {
        clearSlotCache();
        const clean = `${TABLETS.siteOrigin}/prophecies/${slot}.${extFor(type)}`;
        return c.json({ url: clean, ipfs: stored, store });
      }
      // For IPFS, the tablet stores a gateway https link (shows everywhere); the ipfs:// URI comes along too.
      if (stored.startsWith('ipfs://')) return c.json({ url: gatewayUrl(stored), ipfs: stored, store });
      return c.json({ url: stored, store });
    } catch (e) {
      return c.json({ error: errText(e) }, 502);
    }
  });

  for (const [route, file] of [
    ['/app.js', 'app.js'],
    ['/key-page.js', 'key-page.js'],
    ['/faces-page.js', 'faces-page.js'],
  ] as const) {
    app.get(route, async (c) => {
      try {
        const js = await readFile(path.join(process.cwd(), 'web', file), 'utf8');
        return c.body(js, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      } catch {
        return c.text('// run npm run build:web', 500);
      }
    });
  }

  /** Owner page for the deployed CAPs Mind key NFT on Base mainnet. */
  app.get('/key', (c) => {
    const blobUpload = cfg.blobUpload;
    return c.html(page('CAPs Mind key', keyPageBody({ blobUpload }), 'key', '/key-page.js'));
  });
  app.get('/owner', (c) => c.redirect('/key', 302));

  /** Face Maker for CAPs Rocks: wallet face + custom face, laser print preview, mint, export. */
  app.get('/faces', (c) => c.html(page('Face Maker', facesPageBody(), 'faces', '/faces-page.js')));

  app.get('/', async (c) => {
    const { state, error } = await safeState();
    return c.html(page('Tablets', galleryBody(state, error), 'gallery'));
  });

  app.get('/tablet/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.notFound();
    let tablet = null;
    let error: string | null = null;
    let paused = false;
    try {
      tablet = await reader.tablet(id);
      if (tablet) paused = await reader.paused();
    } catch (e) {
      error = errText(e);
    }
    return c.html(
      page(tablet ? `Tablet #${id}` : 'Tablet', tabletDetailBody(id, tablet, { paused }, error), 'detail'),
      tablet || error ? 200 : 404,
    );
  });

  /** Old demo links. */
  app.get('/prophecy/:id', (c) => c.redirect(`/tablet/${encodeURIComponent(c.req.param('id'))}`, 302));

  app.get('/preview/:n', async (c) => {
    const n = Number(c.req.param('n'));
    const p = PREVIEW_PROPHECIES.find((x) => x.n === n);
    if (!p) return c.notFound();
    const { state } = await safeState();
    const onchain = state ? tabletForPreview(p, state.tablets) : undefined;
    return c.html(page(`Prophecy ${n} preview`, previewBody(p, onchain), 'gallery'));
  });

  app.get('/publish', (c) => c.html(page('Publish', publishBody({ blobUpload: cfg.blobUpload }), 'publish')));

  app.notFound((c) => c.html(page('Not found', `<div class="empty">No page here. <a href="/">Back to tablets</a></div>`), 404));

  return { app, cfg };
}

export function appFromEnv() {
  return createApp(configFromEnv());
}
