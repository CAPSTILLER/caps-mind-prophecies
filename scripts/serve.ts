import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { appFromEnv } from '../src/server/app.js';

const { app } = appFromEnv();
app.use('/prophecies/*', serveStatic({ root: './public' }));
app.use('/uploads/*', serveStatic({ root: './public' }));
app.use('/favicon.ico', serveStatic({ root: './public' }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`CAPs Mind Prophecies listening on http://127.0.0.1:${port}`);
});
