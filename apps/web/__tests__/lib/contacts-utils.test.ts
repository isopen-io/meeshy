/**
 * Tests for lib/contacts-utils.ts
 */

import { getUserDisplayName, formatLastSeen } from '@/lib/contacts-utils';

const t = (key: string, params?: unknown) => {
  const p = params as Record<string, unknown> | undefined;
  if (p?.count !== undefined) return `${p.count} ${key}`;
  if (p?.date !== undefined) return `date:${p.date}`;
  return key;
};

const makeUser = (overrides: Record<string, unknown> = {}): any => ({
  id: 'u1',
  username: 'alice99',
  firstName: '',
  lastName: '',
  displayName: undefined,
  isOnline: false,
  lastActiveAt: null,
  ...overrides,
});

// ─── getUserDisplayName ───────────────────────────────────────────────────────

describe('getUserDisplayName', () => {
  it('returns displayName when set', () => {
    expect(getUserDisplayName({ displayName: 'Alice Smith', firstName: 'Alice', lastName: 'Smith', username: 'alice' })).toBe('Alice Smith');
  });

  it('falls back to firstName + lastName when no displayName', () => {
    expect(getUserDisplayName({ firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Bob Jones');
  });

  it('trims firstName + lastName result', () => {
    expect(getUserDisplayName({ firstName: 'Eve', lastName: '', username: 'eve' })).toBe('Eve');
  });

  it('falls back to username when no names', () => {
    expect(getUserDisplayName({ firstName: '', lastName: '', username: 'charlie99' })).toBe('charlie99');
  });

  it('ignores empty displayName field', () => {
    expect(getUserDisplayName({ displayName: '', firstName: 'Dave', lastName: '', username: 'dave' })).toBe('Dave');
  });
});

// ─── formatLastSeen ───────────────────────────────────────────────────────────

describe('formatLastSeen', () => {
  it('returns status.online for online user', () => {
    expect(formatLastSeen(makeUser({ isOnline: true }), t)).toBe('status.online');
  });

  it('returns status.neverSeen when lastActiveAt is null', () => {
    expect(formatLastSeen(makeUser({ isOnline: false, lastActiveAt: null }), t)).toBe('status.neverSeen');
  });

  it('returns status.justNow for < 1 minute ago', () => {
    const recent = new Date(Date.now() - 30000).toISOString();
    expect(formatLastSeen(makeUser({ lastActiveAt: recent }), t)).toBe('status.justNow');
  });

  it('returns N status.minutesAgo for < 60 minutes ago', () => {
    const past = new Date(Date.now() - 30 * 60000).toISOString();
    const result = formatLastSeen(makeUser({ lastActiveAt: past }), t);
    expect(result).toContain('status.minutesAgo');
    expect(result).toContain('30');
  });

  it('returns N status.hoursAgo for < 24 hours ago', () => {
    const past = new Date(Date.now() - 3 * 3600000).toISOString();
    const result = formatLastSeen(makeUser({ lastActiveAt: past }), t);
    expect(result).toContain('status.hoursAgo');
    expect(result).toContain('3');
  });

  it('returns N status.daysAgo for < 7 days ago', () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    const result = formatLastSeen(makeUser({ lastActiveAt: past }), t);
    expect(result).toContain('status.daysAgo');
    expect(result).toContain('3');
  });

  it('returns status.lastSeenDate for >= 7 days ago', () => {
    const past = new Date(Date.now() - 8 * 86400000).toISOString();
    const result = formatLastSeen(makeUser({ lastActiveAt: past }), t);
    // t stub returns 'date:{localeDate}' when params.date is present
    expect(result).toContain('date:');
  });
});
