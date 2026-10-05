import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { priceForMintNumber } from './config.js';
import { SEED_PROPHECIES, withNextPrice, type LocalProphecy } from './seed.js';

export type { LocalProphecy };

type StoreFile = { prophecies: LocalProphecy[] };

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'prophecies.json');

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as StoreFile;
  } catch {
    return { prophecies: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/** Merge file store over seeds (seed wins for seed ids; file can add more). */
function merged(store: StoreFile): LocalProphecy[] {
  const byId = new Map<number, LocalProphecy>();
  const seedIds = new Set(SEED_PROPHECIES.map((s) => s.id));
  for (const p of SEED_PROPHECIES) byId.set(p.id, p);
  for (const p of store.prophecies) {
    // Do not overwrite canonical seed prophecies from ephemeral local writes
    if (seedIds.has(p.id)) continue;
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

export async function listLocalProphecies(): Promise<
  Array<LocalProphecy & { nextPriceWholeGear: number }>
> {
  const store = await readStore();
  return merged(store)
    .slice()
    .sort((a, b) => b.id - a.id)
    .map(withNextPrice);
}

export async function getLocalProphecy(
  id: number,
): Promise<(LocalProphecy & { nextPriceWholeGear: number }) | null> {
  const store = await readStore();
  const p = merged(store).find((x) => x.id === id);
  if (!p) return null;
  return withNextPrice(p);
}

export async function publishLocal(
  imageUri: string,
  description: string,
  publisher: string,
): Promise<LocalProphecy & { nextPriceWholeGear: number }> {
  const store = await readStore();
  const existing = merged(store);
  const id = existing.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const row: LocalProphecy = {
    id,
    imageUri,
    description,
    minted: 0,
    publisher,
    publishedAt: Math.floor(Date.now() / 1000),
  };
  store.prophecies.push(row);
  await writeStore(store);
  return { ...row, nextPriceWholeGear: priceForMintNumber(1) };
}

export async function mintLocal(id: number): Promise<LocalProphecy & { nextPriceWholeGear: number }> {
  if (SEED_PROPHECIES.some((s) => s.id === id)) {
    // Demo seed is view-only until contracts deploy
    const p = SEED_PROPHECIES.find((s) => s.id === id)!;
    return withNextPrice(p);
  }
  const store = await readStore();
  const p = store.prophecies.find((x) => x.id === id);
  if (!p) throw new Error('Prophecy not found');
  p.minted += 1;
  await writeStore(store);
  return { ...p, nextPriceWholeGear: priceForMintNumber(p.minted + 1) };
}
