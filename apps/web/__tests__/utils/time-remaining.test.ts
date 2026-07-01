import { formatTimeRemaining } from '@/utils/time-remaining';

const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('formatTimeRemaining', () => {
  it('returns null when the target is already reached', () => {
    expect(formatTimeRemaining(at(0), NOW)).toBeNull();
  });

  it('returns null when the target is in the past', () => {
    expect(formatTimeRemaining(at(-60_000), NOW)).toBeNull();
  });

  it('formats a sub-hour delay in minutes only', () => {
    expect(formatTimeRemaining(at(5 * 60_000), NOW)).toBe('5m');
  });

  it('formats an exact hour without trailing minutes', () => {
    expect(formatTimeRemaining(at(60 * 60_000), NOW)).toBe('1h');
  });

  it('formats hours and remaining minutes', () => {
    expect(formatTimeRemaining(at(90 * 60_000), NOW)).toBe('1h30m');
  });

  it('drops the trailing minutes only when zero', () => {
    expect(formatTimeRemaining(at(125 * 60_000), NOW)).toBe('2h5m');
  });

  it('accepts a numeric epoch and a Date instance', () => {
    expect(formatTimeRemaining(NOW + 5 * 60_000, NOW)).toBe('5m');
    expect(formatTimeRemaining(new Date(NOW + 5 * 60_000), NOW)).toBe('5m');
  });
});
