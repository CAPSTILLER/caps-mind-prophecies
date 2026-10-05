import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { configFromEnv } from '../src/server/config.js';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

describe('app local mode', () => {
  it('lists seeded prophecy and serves gallery HTML', async () => {
    const dataDir = path.join(process.cwd(), 'data');
    await mkdir(dataDir, { recursive: true });
    await rm(path.join(dataDir, 'prophecies.json'), { force: true });

    const { app } = createApp(
      configFromEnv({
        CHAIN_ID: '84532',
        GEAR_ADDRESS: '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1',
      }),
    );

    const list = await app.request('http://x/api/prophecies');
    const body = await list.json();
    expect(body.source).toBe('local');
    expect(body.prophecies).toHaveLength(1);
    expect(body.prophecies[0].id).toBe(1);
    expect(body.prophecies[0].description).toContain('CAPs mind, it bends but never breaks');
    expect(body.prophecies[0].imageUri).toBe('/prophecies/1.png');
    expect(body.prophecies[0].nextPriceWholeGear).toBe(1);

    const home = await app.request('http://x/');
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('/prophecies/1.png');
    expect(html).toContain('CAPs mind, it bends but never breaks');
    expect(html).toContain('Demo mode');

    const detail = await app.request('http://x/prophecy/1');
    expect(detail.status).toBe(200);
    const dhtml = await detail.text();
    expect(dhtml).toContain('/prophecies/1.png');
    expect(dhtml).toContain('shall never B blown');
  });

  it('publishes additional local prophecies after seed', async () => {
    const dataDir = path.join(process.cwd(), 'data');
    await mkdir(dataDir, { recursive: true });
    await rm(path.join(dataDir, 'prophecies.json'), { force: true });

    const { app } = createApp(
      configFromEnv({
        CHAIN_ID: '84532',
        GEAR_ADDRESS: '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1',
      }),
    );

    const pub = await app.request('http://x/api/local/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUri: 'https://example.com/t.png',
        description: 'THE ONE WHO IS HURT FOR BEING BASED',
        publisher: '0xabc',
      }),
    });
    expect(pub.status).toBe(200);
    const published = await pub.json();
    expect(published.prophecy.id).toBe(2);
    expect(published.prophecy.nextPriceWholeGear).toBe(1);
  });
});
