import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { appFromEnv } from '../src/server/app.js';

const { app } = appFromEnv();
app.use('/prophecies/*', serveStatic({ root: './public' }));
app.use('/uploads/*', serveStatic({ root: './public' }));
app.use('/key/*', serveStatic({ root: './public' }));
for (const f of ['/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/og.jpg', '/gear-logo-cutout.png']) {
  app.use(f, serveStatic({ root: './public' }));
}

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`CAPs Mind Prophecies listening on http://127.0.0.1:${port}`);
});
