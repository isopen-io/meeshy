import { formatPresenceLabel, presenceColorClass } from '../presence-format';

// Mock translator: returns "key" or "key|param1,param2" so we can assert the branch.
const t = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key}|${Object.keys(params).sort().join(',')}` : key;

const NOW = new Date('2026-06-30T12:00:00Z').getTime();
const opts = (lastActiveAt: Date, isOnline: boolean | null) => ({
  lastActiveAt,
  isOnline,
  t,
  locale: 'fr',
  now: NOW,
});

describe('formatPresenceLabel', () => {
  it('returns "online" under one minute', () => {
    expect(formatPresenceLabel(opts(new Date(NOW - 30_000), true))).toBe('status.online');
  });

  it('returns "online" for a future timestamp (clock skew)', () => {
    expect(formatPresenceLabel(opts(new Date(NOW + 5 * 60_000), true))).toBe('status.online');
  });

  it('returns relative minutes between 1 and 59', () => {
    expect(formatPresenceLabel(opts(new Date(NOW - 5 * 60_000), false))).toBe('status.lastSeenMinutes|count');
  });

  it('returns relative hours under 24h', () => {
    expect(formatPresenceLabel(opts(new Date(NOW - 2 * 3_600_000), false))).toBe('status.lastSeenHours|count');
  });

  it('returns "yesterday at" for the previous calendar day past 24h', () => {
    expect(formatPresenceLabel(opts(new Date('2026-06-29T09:00:00Z'), false))).toBe('status.lastSeenYesterday|time');
  });

  it('returns "before yesterday at" two calendar days ago', () => {
    expect(formatPresenceLabel(opts(new Date('2026-06-28T09:00:00Z'), false))).toBe('status.lastSeenBeforeYesterday|time');
  });

  it('returns "date at" for older timestamps', () => {
    expect(formatPresenceLabel(opts(new Date('2026-06-20T09:00:00Z'), false))).toBe('status.lastSeenDateTime|date,time');
  });
});

describe('presenceColorClass', () => {
  it('is green within 5 minutes', () => {
    expect(presenceColorClass(new Date(NOW - 2 * 60_000), true, NOW)).toContain('green');
  });

  it('is orange between 5 and 30 minutes', () => {
    expect(presenceColorClass(new Date(NOW - 10 * 60_000), false, NOW)).toContain('orange');
  });

  it('is grey beyond 30 minutes', () => {
    expect(presenceColorClass(new Date(NOW - 2 * 3_600_000), false, NOW)).toContain('gray');
  });
});
