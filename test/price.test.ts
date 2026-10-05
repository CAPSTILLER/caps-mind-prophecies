import { describe, expect, it } from 'vitest';
import { priceForMintNumber } from '../src/server/config.js';

describe('priceForMintNumber', () => {
  it('follows min(1000, 2^(n-1))', () => {
    expect(priceForMintNumber(1)).toBe(1);
    expect(priceForMintNumber(2)).toBe(2);
    expect(priceForMintNumber(3)).toBe(4);
    expect(priceForMintNumber(4)).toBe(8);
    expect(priceForMintNumber(10)).toBe(512);
    expect(priceForMintNumber(11)).toBe(1000);
    expect(priceForMintNumber(12)).toBe(1000);
    expect(priceForMintNumber(99)).toBe(1000);
  });
});
