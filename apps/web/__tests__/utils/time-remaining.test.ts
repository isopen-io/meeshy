import { isExpired } from '@/utils/time-remaining';

const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('isExpired', () => {
  it('treats null/undefined/empty as not expired', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isExpired('', NOW)).toBe(false);
  });

  it('is false when the target is now or in the future', () => {
    expect(isExpired(at(0), NOW)).toBe(false);
    expect(isExpired(at(60_000), NOW)).toBe(false);
  });

  it('is true when the target is strictly in the past', () => {
    expect(isExpired(at(-1), NOW)).toBe(true);
    expect(isExpired(at(-60_000), NOW)).toBe(true);
  });

  it('accepts a numeric epoch and a Date instance', () => {
    expect(isExpired(NOW - 1, NOW)).toBe(true);
    expect(isExpired(new Date(NOW - 1), NOW)).toBe(true);
  });

  it('treats an invalid date as not expired', () => {
    expect(isExpired('not-a-date', NOW)).toBe(false);
  });
});
