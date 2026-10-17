/**
 * Shared (server + browser) rules for image uploads. No Node imports: web bundles this file.
 * The browser signs uploadAuthMessage() once (free, no transaction); the server checks the
 * signature and that the wallet can publish (CAPs Mind key gate) before storing anything.
 */
export const UPLOAD = {
  /** Largest file the picker accepts before the browser shrinks it. */
  maxPickBytes: 8 * 1024 * 1024,
  /** Largest body the server stores (Vercel functions cap request bodies near 4.5 MB). */
  maxStoreBytes: 4 * 1024 * 1024,
  /** How long one signature works for uploads. */
  authTtlSec: 10 * 60,
  types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as readonly string[],
} as const;

export type UploadFolder = 'prophecies' | 'key';

export function uploadAuthMessage(address: string, keyId: number, folder: UploadFolder, issuedAt: number): string {
  return [
    'CAPs Mind Prophecies: allow image uploads',
    `Wallet: ${address.toLowerCase()}`,
    `Key: ${keyId}`,
    `Use: ${folder}`,
    `Issued: ${issuedAt}`,
    'This signature is free and sends nothing.',
  ].join('\n');
}

/** Detect the image type from the first bytes, so a renamed file cannot sneak through. */
export function sniffImageType(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
