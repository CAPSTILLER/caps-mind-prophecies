import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { priceForMintNumber } from './config.js';

export type LocalProphecy = {
  id: number;
  imageUri: string;
  description: string;
  minted: number;
  publisher: string;
  publishedAt: number;
};

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

export async function listLocalProphecies(): Promise<
  Array<LocalProphecy & { nextPriceWholeGear: number }>
> {
  const store = await readStore();
  return store.prophecies
    .slice()
    .sort((a, b) => b.id - a.id)
    .map((p) => ({
      ...p,
      nextPriceWholeGear: priceForMintNumber(p.minted + 1),
    }));
}

export async function getLocalProphecy(
  id: number,
): Promise<(LocalProphecy & { nextPriceWholeGear: number }) | null> {
  const store = await readStore();
  const p = store.prophecies.find((x) => x.id === id);
  if (!p) return null;
  return { ...p, nextPriceWholeGear: priceForMintNumber(p.minted + 1) };
}

export async function publishLocal(
  imageUri: string,
  description: string,
  publisher: string,
): Promise<LocalProphecy & { nextPriceWholeGear: number }> {
  const store = await readStore();
  const id = store.prophecies.reduce((m, p) => Math.max(m, p.id), 0) + 1;
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
  const store = await readStore();
  const p = store.prophecies.find((x) => x.id === id);
  if (!p) throw new Error('Prophecy not found');
  p.minted += 1;
  await writeStore(store);
  return { ...p, nextPriceWholeGear: priceForMintNumber(p.minted + 1) };
}
