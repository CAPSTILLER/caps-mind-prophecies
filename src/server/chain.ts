import { createPublicClient, fallback, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { tabletsAbi } from '../abis.js';
import type { Tablet } from '../tablets.js';
import type { SiteConfig } from './config.js';

export type TabletsState = {
  tabletCount: number;
  totalSupply: number;
  paused: boolean;
  publishingPaused: boolean;
  tablets: Tablet[];
};

/** Reads the server needs. Injectable so tests run without the network. */
export type TabletReader = {
  state(): Promise<TabletsState>;
  tablet(id: number): Promise<Tablet | null>;
  /** Owner pause flag (blocks mints, publishing and edits). */
  paused(): Promise<boolean>;
};

type TabletTuple = readonly [string, string, bigint, string, bigint, bigint, bigint, bigint];

function toTablet(id: number, row: TabletTuple): Tablet {
  return {
    id,
    imageURI: row[0],
    description: row[1],
    minted: Number(row[2]),
    publisher: row[3],
    keyId: Number(row[4]),
    publishedAt: Number(row[5]),
    updatedAt: Number(row[6]),
    nextPriceWholeGear: Number(row[7]),
  };
}

/** Caps how many tablets one page render reads, so a big collection cannot stall the function. */
const MAX_TABLETS_PER_PAGE = 200;

export function chainReader(cfg: SiteConfig): TabletReader {
  const client = createPublicClient({
    chain: base,
    transport: fallback(cfg.rpcUrls.map((u) => http(u, { timeout: 8_000 }))),
    batch: { multicall: true },
  });
  const address = cfg.tabletsAddress as Address;

  async function tablet(id: number): Promise<Tablet | null> {
    if (!Number.isInteger(id) || id < 1) return null;
    const count = Number(await client.readContract({ address, abi: tabletsAbi, functionName: 'tabletCount' }));
    if (id > count) return null;
    const row = await client.readContract({ address, abi: tabletsAbi, functionName: 'getTablet', args: [BigInt(id)] });
    return toTablet(id, row);
  }

  async function state(): Promise<TabletsState> {
    const [count, supply, paused, publishingPaused] = await Promise.all([
      client.readContract({ address, abi: tabletsAbi, functionName: 'tabletCount' }),
      client.readContract({ address, abi: tabletsAbi, functionName: 'totalSupply' }),
      client.readContract({ address, abi: tabletsAbi, functionName: 'paused' }),
      client.readContract({ address, abi: tabletsAbi, functionName: 'publishingPaused' }),
    ]);
    const n = Math.min(Number(count), MAX_TABLETS_PER_PAGE);
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const rows = await Promise.all(
      ids.map((id) => client.readContract({ address, abi: tabletsAbi, functionName: 'getTablet', args: [BigInt(id)] })),
    );
    return {
      tabletCount: Number(count),
      totalSupply: Number(supply),
      paused,
      publishingPaused,
      tablets: rows.map((row, i) => toTablet(ids[i], row)),
    };
  }

  async function paused(): Promise<boolean> {
    return client.readContract({ address, abi: tabletsAbi, functionName: 'paused' });
  }

  return { state, tablet, paused };
}
