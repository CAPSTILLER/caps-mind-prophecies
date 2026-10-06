import { TABLETS, priceForSerial } from '../tablets.js';

export type SiteConfig = {
  chainId: number;
  /** Server-side read RPCs, tried in order. */
  rpcUrls: string[];
  tabletsAddress: string;
  keyAddress: string;
  gearAddress: string;
  gearDecimals: number;
  maxPriceGear: number;
  /** True when Vercel Blob is set up, so the publish page can offer image uploads. */
  blobUpload: boolean;
};

/**
 * The site always points at the deployed Base mainnet contracts. Old env vars from the demo days
 * (CHAIN_ID, KEY_ADDRESS, PROPHECIES_ADDRESS, RPC_URL pointing at Sepolia) are ignored on purpose so a
 * stale Vercel setting cannot point the site somewhere else. BASE_RPC_URL can add a preferred read RPC.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SiteConfig {
  const extraRpc = (env.BASE_RPC_URL || '').trim();
  const rpcUrls = [...(extraRpc.startsWith('https://') ? [extraRpc] : []), ...TABLETS.readRpcs];
  return {
    chainId: TABLETS.chainId,
    rpcUrls,
    tabletsAddress: TABLETS.address,
    keyAddress: TABLETS.keyAddress,
    gearAddress: TABLETS.gearAddress,
    gearDecimals: TABLETS.gearDecimals,
    maxPriceGear: TABLETS.maxPriceGear,
    blobUpload: Boolean((env.BLOB_READ_WRITE_TOKEN || '').trim()),
  };
}

/** Whole GEAR for mint number n (1-based): min(1000, 2^(n-1)). */
export function priceForMintNumber(n: number): number {
  return priceForSerial(n);
}
