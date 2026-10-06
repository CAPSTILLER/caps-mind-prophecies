import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/server/app.js';
import { configFromEnv } from '../src/server/config.js';
import {
  CAPS_MIND_NFT,
  capsMindNftAbi,
  decodeStorageStringHeader,
  effectiveTokenUri,
  metadataDataUri,
} from '../src/capsMindNft.js';
import { toFunctionSelector } from 'viem';

describe('CAPs Mind key owner page', () => {
  const { app } = createApp(configFromEnv({ CHAIN_ID: '84532' }));

  it('serves /key with the deployed contract and committed art', async () => {
    const res = await app.request('http://x/key');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(CAPS_MIND_NFT.address);
    expect(html).toContain('https://capsmind.gearup.wtf/key/caps-mind-key.json');
    expect(html).toContain('/key/caps-mind-key.jpg');
    expect(html).toContain('/key-page.js');
    expect(html).not.toContain('src="/app.js"');
    expect(html).not.toContain('\u2014');
  });

  it('redirects /owner to /key', async () => {
    const res = await app.request('http://x/owner');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/key');
  });

  it('committed metadata points at the committed image', async () => {
    const meta = JSON.parse(await readFile('public/key/caps-mind-key.json', 'utf8'));
    expect(meta.image).toBe('https://capsmind.gearup.wtf/key/caps-mind-key.jpg');
    expect(meta.name).toBe('CAPs Mind');
  });

  it('ABI matches selectors found in the deployed bytecode', () => {
    const sigs = capsMindNftAbi
      .filter((x) => x.type === 'function')
      .map((f) => `${f.name}(${f.inputs.map((i) => i.type).join(',')})`);
    expect(sigs).toContain('ownerGenesisMint(string)');
    expect(sigs).toContain('mint(string)');
    expect(toFunctionSelector('ownerGenesisMint(string)')).toBe('0x5a873512');
    expect(toFunctionSelector('setTokenURI(uint256,string)')).toBe('0x162094c4');
    expect(toFunctionSelector('setBaseURI(string)')).toBe('0x55f804b3');
    expect(toFunctionSelector('acceptOwnership()')).toBe('0x79ba5097');
  });
});

describe('token URI helpers', () => {
  it('follows ERC721URIStorage concatenation rules', () => {
    const uri = 'https://capsmind.gearup.wtf/key/caps-mind-key.json';
    expect(effectiveTokenUri('', uri, 1)).toBe(uri);
    expect(effectiveTokenUri('https://a/', 'x.json', 1)).toBe('https://a/x.json');
    expect(effectiveTokenUri('https://a/', '', 7)).toBe('https://a/7');
  });

  it('decodes short and long storage strings', () => {
    expect(decodeStorageStringHeader('0x' + '0'.repeat(64))).toEqual({ short: '', longLength: 0 });
    const ab = '6162' + '0'.repeat(58) + '04';
    expect(decodeStorageStringHeader('0x' + ab).short).toBe('ab');
    const long = (100 * 2 + 1).toString(16).padStart(64, '0');
    expect(decodeStorageStringHeader('0x' + long)).toEqual({ short: null, longLength: 100 });
  });

  it('builds a base64 metadata data URI', () => {
    const uri = metadataDataUri({ name: 'CAPs Mind', description: 'd', image: 'https://x/i.jpg' });
    expect(uri.startsWith('data:application/json;base64,')).toBe(true);
    const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
    expect(json).toEqual({ name: 'CAPs Mind', description: 'd', image: 'https://x/i.jpg' });
  });
});
