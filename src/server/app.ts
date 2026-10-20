import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PREVIEW_PROPHECIES, TABLETS, pendingPreviews, tabletForPreview } from '../tablets.js';
import { chainReader, type TabletReader, type TabletsState } from './chain.js';
import { configFromEnv, type SiteConfig } from './config.js';
import { keyPageBody } from './keyPage.js';
import { page } from './pages.js';
import { UPLOAD, chainUploadGate, sniffImageType, storeImage, uploadStore, gatewayUrl, pinataJwt, type UploadGate } from './upload.js';
import { galleryBody, previewBody, publishBody, tabletDetailBody } from './tabletPages.js';

export type AppEnv = { Bindings: Record<string, never> };

function errText(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}

export function createApp(
  cfg: SiteConfig = configFromEnv(),
  reader: TabletReader = chainReader(cfg),
  gate: UploadGate = chainUploadGate(cfg),
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
      const stored = await storeImage(store, folder, bytes, type);
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
