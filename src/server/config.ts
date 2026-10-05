export type SiteConfig = {
  chainId: number;
  rpcUrl: string;
  gearAddress: string;
  keyAddress: string;
  propheciesAddress: string;
  live: boolean;
  gearDecimals: number;
  maxPriceGear: number;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SiteConfig {
  const chainId = Number(env.CHAIN_ID || '84532');
  const gearAddress = (env.GEAR_ADDRESS || '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1').trim();
  const keyAddress = (env.KEY_ADDRESS || '').trim();
  const propheciesAddress = (env.PROPHECIES_ADDRESS || '').trim();
  const rpcUrl =
    (env.RPC_URL || '').trim() ||
    (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
  const live = Boolean(keyAddress && propheciesAddress);
  return {
    chainId,
    rpcUrl,
    gearAddress,
    keyAddress,
    propheciesAddress,
    live,
    gearDecimals: 6,
    maxPriceGear: 1000,
  };
}

/** Whole GEAR for mint number n (1-based): min(1000, 2^(n-1)). */
export function priceForMintNumber(n: number): number {
  if (n < 1) return 0;
  if (n >= 11) return 1000;
  return 2 ** (n - 1);
}
