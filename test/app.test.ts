import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { TabletReader, TabletsState } from '../src/server/chain.js';
import { configFromEnv } from '../src/server/config.js';
import { PREVIEW_PROPHECIES, TABLETS, type Tablet } from '../src/tablets.js';

function tablet(id: number, imageURI: string, description: string, minted = 0): Tablet {
  return {
    id,
    imageURI,
    description,
    minted,
    publisher: TABLETS.owner,
    keyId: 1,
    publishedAt: 1791300000,
    updatedAt: 1791300000,
    nextPriceWholeGear: Math.min(1000, 2 ** minted),
  };
}

function stubReader(tablets: Tablet[], extra: Partial<TabletsState> = {}): TabletReader {
  const state: TabletsState = {
    tabletCount: tablets.length,
    totalSupply: tablets.reduce((n, t) => n + t.minted, 0),
    paused: false,
    publishingPaused: false,
    tablets,
    ...extra,
  };
  return {
    state: async () => state,
    tablet: async (id) => tablets.find((t) => t.id === id) ?? null,
    paused: async () => state.paused,
  };
}

const failingReader: TabletReader = {
  state: async () => {
    throw new Error('RPC down');
  },
  tablet: async () => {
    throw new Error('RPC down');
  },
  paused: async () => {
    throw new Error('RPC down');
  },
};

const cfg = configFromEnv({});
const [p1, p2] = PREVIEW_PROPHECIES;

describe('gallery (mint page)', () => {
  it('with no tablets onchain, shows both prophecies as "not yet onchain" previews', async () => {
    const { app } = createApp(cfg, stubReader([]));
    const res = await app.request('http://x/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('No tablets are onchain yet');
    expect(html).toContain('Not yet onchain');
    expect(html).toContain('/prophecies/1.png');
    expect(html).toContain('/prophecies/2.png');
    expect(html).toContain('it bends but never breaks');
    expect(html).toContain('based enough to call it home');
    expect(html).toContain(TABLETS.address.slice(0, 6));
    expect(html).not.toContain('data-mint=');
    expect(html.replace(/<footer>[\s\S]*?<\/footer>/, '')).not.toContain('\u2014'); // Cap's footer wording keeps his dash
  });

  it('lists onchain tablets with mint buttons and hides previews already published', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, p1.imageURI, p1.description, 3)]));
    const html = await (await app.request('http://x/')).text();
    expect(html).toContain('data-mint="1"');
    expect(html).toContain('8 GEAR next');
    expect(html).toContain('3 copies minted');
    // Prophecy 1 is onchain now, Prophecy 2 still a preview.
    expect(html).not.toContain('href="/preview/1"');
    expect(html).toContain('href="/preview/2"');
  });

  it('escapes onchain text and drops non https/ipfs images', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, 'javascript:alert(1)', '<script>x</script>')]));
    const html = await (await app.request('http://x/')).text();
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('javascript:alert');
  });

  it('still renders previews when Base cannot be read', async () => {
    const { app } = createApp(cfg, failingReader);
    const res = await app.request('http://x/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Could not read Base right now');
    expect(html).toContain('/prophecies/1.png');
    expect(html).toContain('/prophecies/2.png');
  });
});

describe('tablet and preview pages', () => {
  it('serves an onchain tablet with a mint button', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, 'ipfs://bafyabc/1.png', 'THE FIRST')]));
    const res = await app.request('http://x/tablet/1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Prophecy Tablet 1');
    expect(html).toContain('https://ipfs.io/ipfs/bafyabc/1.png');
    expect(html).toContain('data-mint="1"');
    expect(html).toContain('#1 for 1 GEAR');
  });

  it('404s an unpublished tablet and points to the preview', async () => {
    const { app } = createApp(cfg, stubReader([]));
    const res = await app.request('http://x/tablet/2');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('not published onchain yet');
    expect(html).toContain('/preview/2');
  });

  it('redirects old /prophecy/:id links to /tablet/:id', async () => {
    const { app } = createApp(cfg, stubReader([]));
    const res = await app.request('http://x/prophecy/1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/tablet/1');
  });

  it('serves preview pages with the exact publish values', async () => {
    const { app } = createApp(cfg, stubReader([]));
    const html = await (await app.request('http://x/preview/2')).text();
    expect(html).toContain('Not yet onchain');
    expect(html).toContain('https://capsmind.gearup.wtf/prophecies/2.png');
    expect(html).toContain('based enough to call it home');
    const onchain = await (await createApp(cfg, stubReader([tablet(5, p2.imageURI, p2.description)])).app.request('http://x/preview/2')).text();
    expect(onchain).toContain('Tablet #5');
  });
});

describe('publish page', () => {
  it('has the key picker, publish and edit forms', async () => {
    const { app } = createApp(cfg, stubReader([]));
    const res = await app.request('http://x/publish');
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const id of ['keySelect', 'gateMsg', 'imageUrl', 'description', 'publishBtn', 'editTablet', 'updateBtn']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).not.toContain('Quick fill');
    expect(html).not.toContain('data-fill=');
    expect(html).toContain('src="/app.js"');
    expect(html.replace(/<footer>[\s\S]*?<\/footer>/, '')).not.toContain('\u2014'); // Cap's footer wording keeps his dash
    // No upload box without Vercel Blob.
    expect(html).not.toContain('id="imageFile"');
  });
});

describe('api', () => {
  it('reports the deployed contract and pending previews', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, p1.imageURI, p1.description)]));
    const conf = await (await app.request('http://x/api/config')).json();
    expect(conf.tabletsAddress).toBe(TABLETS.address);
    expect(conf.chainId).toBe(8453);
    const list = await (await app.request('http://x/api/tablets')).json();
    expect(list.tabletCount).toBe(1);
    expect(list.previews.map((p: { n: number }) => p.n)).toEqual([2]);
    const one = await app.request('http://x/api/tablets/1');
    expect((await one.json()).tablet.id).toBe(1);
    expect((await app.request('http://x/api/tablets/9')).status).toBe(404);
  });
});

describe('shared footer with the GEAR logo', () => {
  const footerOf = (html: string) => html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';

  it('appears on the tablets, publish, key, tablet and preview pages', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, p1.imageURI, p1.description)]));
    for (const path of ['/', '/publish', '/key', '/tablet/1', '/preview/2']) {
      const html = await (await app.request('http://x' + path)).text();
      const footer = footerOf(html);
      expect(footer, path).toContain('doubles at every mint, 1000 cap, ');
      expect(footer, path).toContain(' only—you pay gas. 90%-treasury 10%-gearvault.');
      expect(footer, path).not.toMatch(/\bgear only/);
      expect(footer, path).toContain('href="https://landonthis.gearup.wtf"');
      expect(footer, path).toContain('src="/gear-logo-cutout.png"');
      expect(footer, path).toContain('alt="GEAR"');
      expect(footer, path).toContain('aria-label="GEAR home on landonthis.gearup.wtf"');
    }
  });
});

describe('header wallet button', () => {
  it('is the same toggle on every page, starting as "Connect wallet", with no Reconnect button', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, p1.imageURI, p1.description)]));
    for (const path of ['/', '/publish', '/key', '/tablet/1', '/preview/2']) {
      const html = await (await app.request('http://x' + path)).text();
      expect(html, path).toContain('<button type="button" class="walletbtn" id="walletBtn"');
      expect(html, path).toContain('>Connect wallet</button>');
      expect(html, path).not.toContain('id="connectBtn"');
      expect(html, path).not.toMatch(/Reconnect/);
      expect(html, path).not.toContain('walletChip');
    }
  });

  it('mint buttons start as "Connect wallet to mint"', async () => {
    const { app } = createApp(cfg, stubReader([tablet(1, p1.imageURI, p1.description)]));
    const html = await (await app.request('http://x/')).text();
    expect(html).toContain('data-mint="1">Connect wallet to mint</button>');
  });
});
