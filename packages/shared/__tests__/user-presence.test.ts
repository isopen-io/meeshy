import { describe, it, expect } from 'vitest';
import {
  getUserPresenceStatus,
  presenceTone,
  isPresenceActive,
  isPresencePulsing,
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
  PRESENCE_IDLE_WINDOW_MS,
  PRESENCE_HEX,
} from '../utils/user-presence';

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0);
const secondsAgo = (s: number) => new Date(NOW - s * 1000);

describe('getUserPresenceStatus — décroissance temporelle 1/3/5 sur lastActiveAt', () => {
  it('retourne offline sans source', () => {
    expect(getUserPresenceStatus(null, NOW)).toBe('offline');
    expect(getUserPresenceStatus(undefined, NOW)).toBe('offline');
  });

  it('activité <= 60s → online, même déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(0) }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(60) }, NOW)).toBe('online');
  });

  it('61s à 3min → away (orange) quand déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(61) }, NOW)).toBe('away');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(180) }, NOW)).toBe('away');
  });

  it('3min à 5min → idle (gris AFFICHÉ) quand déconnecté', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(181) }, NOW)).toBe('idle');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(300) }, NOW)).toBe('idle');
  });

  it('> 5min → offline (aucun dot)', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(301) }, NOW)).toBe('offline');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(1800) }, NOW)).toBe('offline');
  });

  it('lastActiveAt dans le futur (horloge en avance) → online', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: secondsAgo(-30) }, NOW)).toBe('online');
  });
});

describe('getUserPresenceStatus — isOnline backend autoritatif, garde anti-stale 5min', () => {
  it('isOnline=true force online tant que lastActiveAt <= 5min', () => {
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(61) }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(299) }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(300) }, NOW)).toBe('online');
  });

  it('isOnline=true sans lastActiveAt → online', () => {
    expect(getUserPresenceStatus({ isOnline: true }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: null }, NOW)).toBe('online');
  });

  it('garde anti-stale : isOnline=true ignoré si lastActiveAt > 5min → décroissance (offline)', () => {
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(301) }, NOW)).toBe('offline');
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: secondsAgo(1800) }, NOW)).toBe('offline');
  });

  it('isOnline=false sans lastActiveAt → offline', () => {
    expect(getUserPresenceStatus({ isOnline: false }, NOW)).toBe('offline');
    expect(getUserPresenceStatus({ lastActiveAt: null }, NOW)).toBe('offline');
  });

  it('accepte lastActiveAt en string ISO et en epoch', () => {
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: new Date(NOW - 30_000).toISOString() }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: NOW - 200_000 }, NOW)).toBe('idle');
  });

  it('lastActiveAt malformé (non-null) traité comme absent, pas comme NaN — parité avec Android isoToEpochMillisOrNull', () => {
    // new Date('garbage').getTime() est NaN ; toute comparaison `elapsed <= X`
    // avec NaN vaut false, donc sans garde explicite la fonction retombe sur
    // 'offline' même si isOnline=true — divergence avec Android, qui traite un
    // timestamp illisible comme absent (null) et retombe sur isOnline.
    expect(getUserPresenceStatus({ isOnline: true, lastActiveAt: 'not-a-date' }, NOW)).toBe('online');
    expect(getUserPresenceStatus({ isOnline: false, lastActiveAt: 'not-a-date' }, NOW)).toBe('offline');
  });
});

describe('presenceTone — mapping sémantique unique (vert / orange / gris)', () => {
  it('online → success (vert)', () => {
    expect(presenceTone('online')).toBe('success');
  });

  it('away → warning (orange)', () => {
    expect(presenceTone('away')).toBe('warning');
  });

  it('idle → muted (gris affiché)', () => {
    expect(presenceTone('idle')).toBe('muted');
  });

  it('offline → muted (gris, jamais rendu en dot)', () => {
    expect(presenceTone('offline')).toBe('muted');
  });
});

describe('helpers', () => {
  it('isPresenceActive : tout état < 5min (online + away + idle), faux offline', () => {
    expect(isPresenceActive('online')).toBe(true);
    expect(isPresenceActive('away')).toBe(true);
    expect(isPresenceActive('idle')).toBe(true);
    expect(isPresenceActive('offline')).toBe(false);
  });

  it('isPresencePulsing : seul online pulse', () => {
    expect(isPresencePulsing('online')).toBe(true);
    expect(isPresencePulsing('away')).toBe(false);
    expect(isPresencePulsing('idle')).toBe(false);
    expect(isPresencePulsing('offline')).toBe(false);
  });

  it('les fenêtres sont 60s / 3min / 5min', () => {
    expect(PRESENCE_ONLINE_WINDOW_MS).toBe(60_000);
    expect(PRESENCE_AWAY_WINDOW_MS).toBe(180_000);
    expect(PRESENCE_IDLE_WINDOW_MS).toBe(300_000);
  });

  it('hex de référence cross-platform (identiques iOS/Android/web)', () => {
    expect(PRESENCE_HEX).toEqual({ success: '#34D399', warning: '#FBBF24', muted: '#9CA3AF' });
  });
});
