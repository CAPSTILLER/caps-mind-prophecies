import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { configFromEnv } from '../src/server/config.js';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

describe('app local mode', () => {
  it('publishes and lists prophecies', async () => {
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
    expect(published.prophecy.id).toBe(1);
    expect(published.prophecy.nextPriceWholeGear).toBe(1);

    const list = await app.request('http://x/api/prophecies');
    const body = await list.json();
    expect(body.source).toBe('local');
    expect(body.prophecies).toHaveLength(1);

    const mint = await app.request('http://x/api/local/mint/1', { method: 'POST' });
    const minted = await mint.json();
    expect(minted.prophecy.minted).toBe(1);
    expect(minted.prophecy.nextPriceWholeGear).toBe(2);
  });
});
