import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { configFromEnv } from '../src/server/config.js';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

describe('app local mode', () => {
  it('lists seeded prophecies and serves gallery HTML', async () => {
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
    expect(body.prophecies).toHaveLength(2);

    const byId = Object.fromEntries(body.prophecies.map((p: { id: number }) => [p.id, p]));
    expect(byId[1].description).toContain('it bends but never breaks');
    expect(byId[1].imageUri).toBe('/prophecies/1.png');
    expect(byId[1].nextPriceWholeGear).toBe(1);
    expect(byId[2].description).toContain('CAPs mind, they float where the bamboo ends');
    expect(byId[2].imageUri).toBe('/prophecies/2.png');
    expect(byId[2].nextPriceWholeGear).toBe(1);

    const home = await app.request('http://x/');
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('/prophecies/1.png');
    expect(html).toContain('/prophecies/2.png');
    expect(html).toContain('it bends but never breaks');
    expect(html).toContain('CAPs mind, they float where the bamboo ends');
    expect(html).toContain('Demo mode');

    const detail1 = await app.request('http://x/prophecy/1');
    expect(detail1.status).toBe(200);
    const d1 = await detail1.text();
    expect(d1).toContain('/prophecies/1.png');
    expect(d1).toContain('shall never B blown');

    const detail2 = await app.request('http://x/prophecy/2');
    expect(detail2.status).toBe(200);
    const d2 = await detail2.text();
    expect(d2).toContain('/prophecies/2.png');
    expect(d2).toContain('based enough to call it home');
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
    expect(published.prophecy.id).toBe(3);
    expect(published.prophecy.nextPriceWholeGear).toBe(1);
  });
});
