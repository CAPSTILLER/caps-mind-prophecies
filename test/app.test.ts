import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { TabletReader, TabletsState } from '../src/server/chain.js';
import { configFromEnv } from '../src/server/config.js';
import { pinataUpload, uploadStore, pinataJwt, resolveSlot, clearSlotCache } from '../src/server/upload.js';
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
    // Upload button shows when storage is available (local dev here).
    expect(html).toContain('id="uploadBtn"');
    expect(html).toContain('id="imageFile"');
    const off = createApp({ ...cfg, blobUpload: false }, stubReader([])).app;
    const offHtml = await (await off.request('http://x/publish')).text();
    expect(offHtml).not.toContain('id="imageFile"');
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

describe('upload gate', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  function form(extra: Record<string, string> = {}, bytes: Uint8Array = png) {
    const fd = new FormData();
    fd.set('file', new File([bytes as Uint8Array<ArrayBuffer>], 'a.png', { type: 'image/png' }));
    for (const [k, v] of Object.entries({ address: '0x' + '1'.repeat(40), keyId: '1', issuedAt: '1', signature: '0x00', ...extra })) fd.set(k, v);
    return fd;
  }
  it('refuses uploads when the gate says no, before storing anything', async () => {
    const { app } = createApp(cfg, stubReader([]), async () => 'nope');
    const res = await app.request('http://x/api/upload', { method: 'POST', body: form() });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('nope');
  });
  it('refuses non-images even for eligible wallets', async () => {
    const { app } = createApp(cfg, stubReader([]), async () => null);
    const res = await app.request('http://x/api/upload', { method: 'POST', body: form({}, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) });
    expect(res.status).toBe(400);
  });
});

describe('pinata', () => {
  const f = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
  it('detects PINATA_JWT on Vercel, even with a Bearer prefix', () => {
    expect(uploadStore({ VERCEL: '1' })).toBe(null);
    expect(uploadStore({ VERCEL: '1', PINATA_JWT: ' Bearer abc ' })).toBe('ipfs');
    expect(pinataJwt({ PINATA_JWT: '"Bearer abc"' })).toBe('abc');
    expect(uploadStore({ VERCEL: '1', BLOB_READ_WRITE_TOKEN: 'x' })).toBe('blob');
    expect(configFromEnv({ VERCEL: '1', PINATA_JWT: 'abc' }).blobUpload).toBe(true);
    expect(configFromEnv({ VERCEL: '1' }).blobUpload).toBe(false);
  });
  it('uses v3, falls back to legacy, never leaks the key', async () => {
    const calls: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sekret');
      if (url.includes('v3')) return new Response('{}', { status: 403 });
      return new Response(JSON.stringify({ IpfsHash: 'bafyLEGACY' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await pinataUpload(f, 'a.png', { PINATA_JWT: 'sekret' }, fake)).toBe('bafyLEGACY');
    expect(calls.length).toBe(2);
    const bad = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const err = await pinataUpload(f, 'a.png', { PINATA_JWT: 'sekret' }, bad).catch((e: Error) => e.message);
    expect(err).toContain('v3 401');
    expect(err).not.toContain('sekret');
  });
});

describe('ipfs images', () => {
  const cid = 'bafybeieihyojuvuaymur7zovpmcaktsmuypcfkcfpivi5ohxtveghvmv7e';
  it('maps every gateway form to the /ipfs/ proxy', async () => {
    const { displayImageUrl, ipfsPath } = await import('../src/tablets.js');
    for (const u of [`ipfs://${cid}`, `https://ipfs.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`, `https://${cid}.ipfs.dweb.link/`]) {
      expect(displayImageUrl(u)).toBe(`/ipfs/${cid}`);
    }
    expect(ipfsPath('https://ipfs.io/ipfs/notacid')).toBe(null);
    expect(displayImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
  it('proxy skips a 429 gateway and serves the next image', async () => {
    const seen: string[] = [];
    const fake = (async (u: string) => {
      seen.push(u);
      if (seen.length === 1) return new Response('slow down', { status: 429 });
      return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const { app } = createApp(cfg, stubReader([]), async () => null, fake);
    const res = await app.request(`http://x/ipfs/${cid}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect((await app.request('http://x/ipfs/..%2Fetc')).status).toBe(400);
  });
});

describe('clean tablet image links', () => {
  const cid3 = 'bafybeieihyojuvuaymur7zovpmcaktsmuypcfkcfpivi5ohxtveghvmv7e';
  it('tablet 3 resolves to its pinned CID without Pinata', async () => {
    clearSlotCache();
    expect(await resolveSlot('prophecy-3.jpg', {})).toBe(cid3);
    expect(await resolveSlot('prophecy-9.jpg', {})).toBe(null);
  });
  it('newest Pinata pin with the slot name wins', async () => {
    clearSlotCache();
    const fake = (async () => new Response(JSON.stringify({ data: { files: [
      { name: 'prophecy-4.png', cid: 'old', created_at: '2026-01-01' },
      { name: 'prophecy-4.png', cid: 'new', created_at: '2026-02-01' },
      { name: 'prophecy-40.png', cid: 'other', created_at: '2026-03-01' },
    ] } }), { status: 200 })) as unknown as typeof fetch;
    expect(await resolveSlot('prophecy-4.png', { PINATA_JWT: 'k' }, fake)).toBe('new');
  });
  it('serves /prophecies/3.jpg through the gateway proxy and 404s unknown slots', async () => {
    clearSlotCache();
    const fake = (async (u: string) => {
      expect(u).toContain(cid3);
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const { app } = createApp(cfg, stubReader([]), async () => null, fake);
    const res = await app.request('http://x/prophecies/3.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect((await app.request('http://x/prophecies/77.jpg')).status).toBe(404);
    expect((await app.request('http://x/prophecies/..%2Fx.jpg')).status).toBe(404);
    expect((await app.request('http://x/prophecies/1.png')).headers.get('content-type')).toBe('image/png');
  });
});
