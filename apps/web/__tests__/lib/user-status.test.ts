/**
 * Tests for user-status module (façade web de @meeshy/shared/utils/user-presence).
 *
 * Regle produit (identique web / iOS / Android) :
 *   isOnline === true (backend, actif < 1min) -> 'online' (VERT, pulse) — autoritatif
 *   delta <= 60s   -> 'online'  (vert, pulse)
 *   delta <= 5min  -> 'recent'  (vert)
 *   delta <= 30min -> 'away'    (orange)
 *   delta > 30min  -> 'offline' (gris)
 *
 * Garde anti-stale : isOnline=true avec lastActiveAt > 30min est une donnée
 * incohérente -> la décroissance temporelle l'emporte (offline).
 */

import {
  getUserStatus,
  isPresenceActive,
  isPresencePulsing,
  presenceTone,
  presenceTextClass,
  PRESENCE_DOT_CLASS,
  PRESENCE_BADGE_CLASS,
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_RECENT_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
  type UserStatus,
} from '../../lib/user-status';

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

// Horloge figée : les tests de bornes inclusives ("away à exactement 30min")
// fabriquent une date puis appellent getUserStatus — sans fake timers les
// millisecondes écoulées entre les deux font basculer la borne (flaky).
beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-07-08T12:00:00Z') });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('User Status Module', () => {
  describe('window constants', () => {
    it('exposes the canonical windows (60s / 5min / 30min)', () => {
      expect(PRESENCE_ONLINE_WINDOW_MS).toBe(60 * 1000);
      expect(PRESENCE_RECENT_WINDOW_MS).toBe(5 * 60 * 1000);
      expect(PRESENCE_AWAY_WINDOW_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('getUserStatus', () => {
    describe('Null and undefined handling', () => {
      it('returns offline for null user', () => {
        expect(getUserStatus(null)).toBe('offline');
      });
      it('returns offline for undefined user', () => {
        expect(getUserStatus(undefined)).toBe('offline');
      });
    });

    describe('isOnline backend flag is authoritative for online', () => {
      it('returns online when isOnline true and no lastActiveAt', () => {
        expect(getUserStatus({ isOnline: true } as any)).toBe('online');
      });
      it('returns online when isOnline true even with minutes-old lastActiveAt', () => {
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(3) } as any)).toBe('online');
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(10) } as any)).toBe('online');
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(30) } as any)).toBe('online');
      });
      it('anti-stale guard: ignores isOnline when lastActiveAt is beyond 30min', () => {
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(31) } as any)).toBe('offline');
      });
      it('returns offline when isOnline false and no lastActiveAt', () => {
        expect(getUserStatus({ isOnline: false } as any)).toBe('offline');
      });
      it('returns offline when isOnline undefined and no lastActiveAt', () => {
        expect(getUserStatus({ id: '1' } as any)).toBe('offline');
      });
      it('returns offline when lastActiveAt is null', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: null } as any)).toBe('offline');
      });
    });

    describe('Time decay on lastActiveAt when disconnected', () => {
      it('returns online when active in the last 60 seconds', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(10) } as any)).toBe('online');
      });
      it('returns online exactly at now', () => {
        expect(getUserStatus({ lastActiveAt: new Date().toISOString() } as any)).toBe('online');
      });
      it('returns recent between 60s and 5min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(3) } as any)).toBe('recent');
      });
      it('returns away between 5min and 30min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(10) } as any)).toBe('away');
      });
      it('returns offline beyond 30min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(31) } as any)).toBe('offline');
      });
      it('returns offline for hours-old activity', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(180) } as any)).toBe('offline');
      });
    });

    describe('Freshly disconnected users still decay by time', () => {
      it('shows recent (vert) 3min after disconnect, not away', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(3) } as any)).toBe('recent');
      });
      it('shows away (orange) 10min after disconnect', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(10) } as any)).toBe('away');
      });
      it('shows offline (gris) 31min after disconnect', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(31) } as any)).toBe('offline');
      });
    });

    describe('Boundary testing (inclusive upper bound of each window)', () => {
      it('online at exactly 60s', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(60) } as any)).toBe('online');
      });
      it('recent just after 60s', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(61) } as any)).toBe('recent');
      });
      it('recent at exactly 5min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(5) } as any)).toBe('recent');
      });
      it('away just after 5min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(5 * 60 + 1) } as any)).toBe('away');
      });
      it('away at exactly 30min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(30) } as any)).toBe('away');
      });
      it('offline just after 30min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(30 * 60 + 1) } as any)).toBe('offline');
      });
    });

    describe('Input shapes', () => {
      it('handles Date object', () => {
        expect(getUserStatus({ lastActiveAt: new Date(Date.now() - 10 * 1000) } as any)).toBe('online');
      });
      it('handles timestamp number', () => {
        expect(getUserStatus({ lastActiveAt: Date.now() - 3 * 60 * 1000 } as any)).toBe('recent');
      });
      it('handles Participant type', () => {
        const participant = { id: 'p-123', type: 'anonymous', lastActiveAt: minutesAgo(10) };
        expect(getUserStatus(participant as any)).toBe('away');
      });
    });
  });

  describe('presence helpers', () => {
    it('isPresenceActive (vert): online + recent only', () => {
      expect(isPresenceActive('online')).toBe(true);
      expect(isPresenceActive('recent')).toBe(true);
      expect(isPresenceActive('away')).toBe(false);
      expect(isPresenceActive('offline')).toBe(false);
    });
    it('isPresencePulsing: online only', () => {
      expect(isPresencePulsing('online')).toBe(true);
      expect(isPresencePulsing('recent')).toBe(false);
      expect(isPresencePulsing('away')).toBe(false);
      expect(isPresencePulsing('offline')).toBe(false);
    });
    it('presenceTone: vert (success) actif, orange (warning) away, gris (muted) offline', () => {
      expect(presenceTone('online')).toBe('success');
      expect(presenceTone('recent')).toBe('success');
      expect(presenceTone('away')).toBe('warning');
      expect(presenceTone('offline')).toBe('muted');
    });
  });

  describe('central color maps (single source for every presence component)', () => {
    it('dot: vert emerald pour online/recent, orange amber pour away, gris pour offline', () => {
      expect(PRESENCE_DOT_CLASS.online).toBe('bg-emerald-400 animate-pulse');
      expect(PRESENCE_DOT_CLASS.recent).toBe('bg-emerald-400');
      expect(PRESENCE_DOT_CLASS.away).toBe('bg-amber-400');
      expect(PRESENCE_DOT_CLASS.offline).toBe('bg-gray-400');
    });
    it('only online pulses', () => {
      const pulsing = (Object.keys(PRESENCE_DOT_CLASS) as UserStatus[]).filter(s =>
        PRESENCE_DOT_CLASS[s].includes('animate-pulse')
      );
      expect(pulsing).toEqual(['online']);
    });
    it('badge variant follows the same palette', () => {
      expect(PRESENCE_BADGE_CLASS.online).toContain('bg-emerald-400');
      expect(PRESENCE_BADGE_CLASS.recent).toContain('bg-emerald-400');
      expect(PRESENCE_BADGE_CLASS.away).toContain('bg-amber-400');
      expect(PRESENCE_BADGE_CLASS.offline).toContain('bg-gray-400');
    });
    it('presenceTextClass maps status to tone text classes', () => {
      expect(presenceTextClass('online')).toContain('emerald');
      expect(presenceTextClass('recent')).toContain('emerald');
      expect(presenceTextClass('away')).toContain('amber');
      expect(presenceTextClass('offline')).toContain('gray');
    });
  });

  describe('UserStatus type', () => {
    it('has the four canonical values', () => {
      const validStatuses: UserStatus[] = ['online', 'recent', 'away', 'offline'];
      expect(validStatuses).toHaveLength(4);
    });
  });
});
