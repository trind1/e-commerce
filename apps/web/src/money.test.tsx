import { describe, expect, it } from 'vitest';
import { parseUsdMinor } from './money.js';

describe('parseUsdMinor', () => {
  it('converts valid decimal USD input without floating point rounding', () => {
    expect(parseUsdMinor('12')).toBe(1_200);
    expect(parseUsdMinor('12.5')).toBe(1_250);
    expect(parseUsdMinor('12.50')).toBe(1_250);
  });

  it('rejects zero, scientific notation, and prices with more than two decimal places', () => {
    expect(parseUsdMinor('0')).toBeNull();
    expect(parseUsdMinor('1e3')).toBeNull();
    expect(parseUsdMinor('12.345')).toBeNull();
  });
});
