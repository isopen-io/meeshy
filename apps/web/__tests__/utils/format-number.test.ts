import { formatCompactNumber } from '@/utils/format-number';

describe('formatCompactNumber', () => {
  it('returns the raw integer below 1000', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('abbreviates thousands with an uppercase K', () => {
    expect(formatCompactNumber(1000)).toBe('1.0K');
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCompactNumber(15_500)).toBe('15.5K');
  });

  it('abbreviates millions with an uppercase M', () => {
    expect(formatCompactNumber(1_000_000)).toBe('1.0M');
    expect(formatCompactNumber(2_300_000)).toBe('2.3M');
  });

  it('abbreviates billions with an uppercase B', () => {
    expect(formatCompactNumber(1_000_000_000)).toBe('1.0B');
  });

  it('handles negatives symmetrically', () => {
    expect(formatCompactNumber(-1500)).toBe('-1.5K');
    expect(formatCompactNumber(-2_000_000)).toBe('-2.0M');
  });

  it('rolls over at the rounding boundary instead of printing "1000.0K"', () => {
    expect(formatCompactNumber(999_949)).toBe('999.9K');
    expect(formatCompactNumber(999_950)).toBe('1.0M');
    expect(formatCompactNumber(999_999)).toBe('1.0M');
    expect(formatCompactNumber(-999_999)).toBe('-1.0M');
  });

  it('rolls over the M→B boundary instead of printing "1000.0M"', () => {
    expect(formatCompactNumber(999_949_999)).toBe('999.9M');
    expect(formatCompactNumber(999_950_000)).toBe('1.0B');
    expect(formatCompactNumber(999_999_999)).toBe('1.0B');
  });
});
