import { describe, it, expect } from 'vitest';
import {
  getUserPresenceStatus,
  presenceTone,
  isPresenceActive,
  isPresencePulsing,
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_RECENT_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
  PRESENCE_HEX,
} from '../utils/user-presence';

const NOW = Date.UTC(2026, 6, 8, 12, 0, 0);
const secondsAgo = (s: number) => new Date(NOW - s * 1000);

describe('getUserPresenceStatus — décroissance temporelle sur lastActiveAt', () => {
  it('retourne offline sans source', () => {
    expect(getUserPresenceStatus(null, NOW)).toBe('offline');
    expect(getUserPresenceStatus(undefined, NOW)).toBe('offline');
  });

  it('activité <= 60s → online, même déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(60) }, NOW)).toBe('online');
  });

  it('61s à 5min → recent quand déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(61) }, NOW)).toBe('recent');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(300) }, NOW)).toBe('recent');
  });

  it('5min à 30min → away quand déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(301) }, NOW)).toBe('away');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(1800) }, NOW)).toBe('away');
  });

  it('> 30min → offline', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(1801) }, NOW)).toBe('offline');
  });
});

describe('getUserPresenceStatus — isOnline backend autoritatif', () => {
  it('isOnline=true force online même si lastActiveAt date de plusieurs minutes', () => {
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(61) }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(600) }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(1800) }, NOW)).toBe('online');
  });

  it('isOnline=true sans lastActiveAt → online', () => {
    expect(getUserPresenceStatus({ isOnline: true }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: null }, NOW)).toBe('online');
  });

  it('garde anti-stale : isOnline=true ignoré si lastActiveAt > 30min (donnée incohérente)', () => {
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(1801) }, NOW)).toBe('offline');
  });

  it('isOnline=false sans lastActiveAt → offline', () => {
    expect(getUserPresenceStatus({ isOnline: false }, NOW)).toBe('offline');
    expect(getUserPresenceStatus({ lastActiveAt: null }, NOW)).toBe('offline');
  });

  it('accepte lastActiveAt en string ISO et en epoch', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: new Date(NOW - 30_000).toISOString() }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: NOW - 400_000 }, NOW)).toBe('away');
  });
});

describe('presenceTone — mapping sémantique unique (vert / orange / gris)', () => {
  it('online et recent → success (vert)', () => {
    expect(presenceTone('online')).toBe('success');
    expect(presenceTone('recent')).toBe('success');
  });

  it('away → warning (orange)', () => {
    expect(presenceTone('away')).toBe('warning');
  });

  it('offline → muted (gris)', () => {
    expect(presenceTone('offline')).toBe('muted');
  });
});

describe('helpers', () => {
  it('isPresenceActive : vert pour online + recent uniquement', () => {
    expect(isPresenceActive('online')).toBe(true);
    expect(isPresenceActive('recent')).toBe(true);
    expect(isPresenceActive('away')).toBe(false);
    expect(isPresenceActive('offline')).toBe(false);
  });

  it('isPresencePulsing : seul online pulse', () => {
    expect(isPresencePulsing('online')).toBe(true);
    expect(isPresencePulsing('recent')).toBe(false);
  });

  it('les fenêtres restent 60s / 5min / 30min', () => {
    expect(PRESENCE_ONLINE_WINDOW_MS).toBe(60_000);
    expect(PRESENCE_RECENT_WINDOW_MS).toBe(300_000);
    expect(PRESENCE_AWAY_WINDOW_MS).toBe(1_800_000);
  });

  it('hex de référence cross-platform (identiques iOS/Android/web)', () => {
    expect(PRESENCE_HEX).toEqual({ success: '#34D399', warning: '#FBBF24', muted: '#9CA3AF' });
  });
});
