import { priceForMintNumber } from './config.js';

export type LocalProphecy = {
  id: number;
  imageUri: string;
  description: string;
  minted: number;
  publisher: string;
  publishedAt: number;
};

/** Built-in demo prophecies (viewable without wallet / contracts). */
export const SEED_PROPHECIES: LocalProphecy[] = [
  {
    id: 1,
    imageUri: '/prophecies/1.png',
    description:
      'CAPs mind, it bends but never breaks, locked in tight by a vault unknown, time is a friend and shall never B blown...',
    minted: 0,
    publisher: 'CAPs mind',
    publishedAt: 1728000000,
  },
  {
    id: 2,
    imageUri: '/prophecies/2.png',
    description:
      'CAPs mind, they float where the bamboo ends, black and white against the black above, soft enough to survive the void and based enough to call it home...',
    minted: 0,
    publisher: 'CAPs mind',
    publishedAt: 1728000001,
  },
];

export function withNextPrice(p: LocalProphecy) {
  return { ...p, nextPriceWholeGear: priceForMintNumber(p.minted + 1) };
}
