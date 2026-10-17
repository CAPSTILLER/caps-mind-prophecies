import { createPublicClient, fallback, getAddress, http, isAddress, isHex, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { tabletsAbi } from '../abis.js';

const ownerAbi = [{ type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const;
import { TABLETS } from '../tablets.js';
import { UPLOAD, sniffImageType, uploadAuthMessage, type UploadFolder } from '../uploadAuth.js';
import type { SiteConfig } from './config.js';

export type UploadStore = 'ipfs' | 'blob' | 'local' | null;

export function uploadStore(env: NodeJS.ProcessEnv = process.env): UploadStore {
  if ((env.PINATA_JWT || '').trim()) return 'ipfs';
  if ((env.BLOB_READ_WRITE_TOKEN || '').trim()) return 'blob';
  if (!env.VERCEL) return 'local';
  return null;
}

export type UploadAuth = { address: string; keyId: number; folder: UploadFolder; issuedAt: number; signature: string };

/** Checks signature + gate. Returns an error sentence, or null when the wallet may upload. */
export type UploadGate = (a: UploadAuth) => Promise<string | null>;

export function chainUploadGate(cfg: SiteConfig): UploadGate {
  const client = createPublicClient({
    chain: base,
    transport: fallback(cfg.rpcUrls.map((u) => http(u, { timeout: 8_000 }))),
  });
  return async (a) => {
    if (!isAddress(a.address)) return 'Bad wallet address.';
    if (!isHex(a.signature)) return 'Bad signature.';
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(a.issuedAt) || a.issuedAt > now + 120 || now - a.issuedAt > UPLOAD.authTtlSec) {
      return 'Your upload signature expired. Tap Upload image again to sign a fresh one.';
    }
    const address = getAddress(a.address) as Address;
    const message = uploadAuthMessage(address, a.keyId, a.folder, a.issuedAt);
    // verifyMessage handles normal wallets and smart wallets (ERC-1271 / ERC-6492).
    const ok = await client.verifyMessage({ address, message, signature: a.signature as Hex }).catch(() => false);
    if (!ok) return 'The signature does not match this wallet.';
    if (a.folder === 'key') {
      const owner = await client.readContract({ address: getAddress(TABLETS.keyAddress), abi: ownerAbi, functionName: 'owner' });
      return owner.toLowerCase() === address.toLowerCase() ? null : 'Only the CAPs Mind key contract owner can upload key art.';
    }
    if (!Number.isInteger(a.keyId) || a.keyId < 1) return 'Pick a CAPs Mind key first.';
    const can = await client.readContract({
      address: getAddress(TABLETS.address),
      abi: tabletsAbi,
      functionName: 'canPublishWithKey',
      args: [address, BigInt(a.keyId)],
    });
    return can ? null : `Key #${a.keyId} cannot publish from this wallet, so it cannot upload images either.`;
  };
}

export async function storeImage(store: Exclude<UploadStore, null>, folder: UploadFolder, bytes: Uint8Array, type: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  const name = `${folder}-${Date.now()}.${ext}`;
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
  if (store === 'ipfs') {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('network', 'public');
    fd.set('name', `capsmind-${name}`);
    const res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${(env.PINATA_JWT || '').trim()}` },
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as { data?: { cid?: string }; error?: unknown };
    if (!res.ok || !j.data?.cid) throw new Error(`IPFS upload failed (${res.status}). Check PINATA_JWT on Vercel.`);
    return `ipfs://${j.data.cid}`;
  }
  if (store === 'blob') {
    const { put } = await import('@vercel/blob');
    const stored = await put(`${folder}/${name}`, file, { access: 'public', token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true });
    return stored.url;
  }
  const path = await import('node:path');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}

export { UPLOAD, sniffImageType };
