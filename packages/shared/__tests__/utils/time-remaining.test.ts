import { describe, it, expect } from 'vitest';
import { formatTimeRemaining } from '../../utils/time-remaining.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

describe('formatTimeRemaining', () => {
  it('returns null for an already-expired target (delay zero or negative)', () => {
    expect(formatTimeRemaining(NOW, NOW)).toBeNull();
    expect(formatTimeRemaining(NOW - 1, NOW)).toBeNull();
    expect(formatTimeRemaining(NOW - 60 * MIN, NOW)).toBeNull();
  });

  it('formats a sub-hour remainder as whole minutes', () => {
    expect(formatTimeRemaining(NOW + 1 * MIN, NOW)).toBe('1m');
    expect(formatTimeRemaining(NOW + 30 * MIN, NOW)).toBe('30m');
    expect(formatTimeRemaining(NOW + 59 * MIN, NOW)).toBe('59m');
  });

  it('rounds a positive sub-minute remainder up to 1m (never 0m)', () => {
    expect(formatTimeRemaining(NOW + 1, NOW)).toBe('1m');
    expect(formatTimeRemaining(NOW + 30_000, NOW)).toBe('1m');
    expect(formatTimeRemaining(NOW + MIN - 1, NOW)).toBe('1m');
  });

  it('formats an hour-or-more remainder with a leftover as XhYm', () => {
    expect(formatTimeRemaining(NOW + 90 * MIN, NOW)).toBe('1h30m');
    expect(formatTimeRemaining(NOW + 23 * HOUR + 59 * MIN, NOW)).toBe('23h59m');
  });

  it('omits the minutes segment when the remainder is a whole hour', () => {
    expect(formatTimeRemaining(NOW + 1 * HOUR, NOW)).toBe('1h');
    expect(formatTimeRemaining(NOW + 2 * HOUR, NOW)).toBe('2h');
    expect(formatTimeRemaining(NOW + 24 * HOUR, NOW)).toBe('24h');
  });

  it('crosses from minutes to hours exactly at 60 minutes', () => {
    expect(formatTimeRemaining(NOW + 60 * MIN - 1, NOW)).toBe('59m');
    expect(formatTimeRemaining(NOW + 60 * MIN, NOW)).toBe('1h');
  });
});
