import { handle } from 'hono/vercel';
import { appFromEnv } from '../src/server/app.js';

let handler: ((req: Request) => Response | Promise<Response>) | undefined;

export default {
  async fetch(req: Request): Promise<Response> {
    if (!handler) handler = handle(appFromEnv().app) as (req: Request) => Promise<Response>;
    return handler(req);
  },
};
