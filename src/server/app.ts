import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PREVIEW_PROPHECIES, TABLETS, pendingPreviews, tabletForPreview } from '../tablets.js';
import { chainReader, type TabletReader, type TabletsState } from './chain.js';
import { configFromEnv, type SiteConfig } from './config.js';
import { keyPageBody } from './keyPage.js';
import { page } from './pages.js';
import { galleryBody, previewBody, publishBody, tabletDetailBody } from './tabletPages.js';

export type AppEnv = { Bindings: Record<string, never> };

function errText(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}

export function createApp(cfg: SiteConfig = configFromEnv(), reader: TabletReader = chainReader(cfg)) {
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

  /** Image upload for the publish page. Only offered in the UI when Vercel Blob is set up. */
  app.post('/api/upload', async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const blob = file as File;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(blob.type)) return c.json({ error: 'PNG, JPEG, GIF or WebP only' }, 400);
    const safeName = blob.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      const { put } = await import('@vercel/blob');
      const folder = form.folder === 'key' ? 'key' : 'prophecies';
      const stored = await put(`${folder}/${Date.now()}-${safeName}`, blob, { access: 'public', token });
      return c.json({ url: stored.url });
    }
    // Local `npm run serve` only: write under public/uploads.
    const buf = Buffer.from(await blob.arrayBuffer());
    const name = `${Date.now()}-${safeName}`;
    const dir = path.join(process.cwd(), 'public', 'uploads');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buf);
    return c.json({ url: `/uploads/${name}` });
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
    const blobUpload = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
