/**
 * Tests for user-status module (façade web de @meeshy/shared/utils/user-presence).
 *
 * Regle produit 1/3/5 (identique web / iOS / Android) :
 *   isOnline === true (backend, lastActiveAt <= 5min) -> 'online' (VERT, pulse) — autoritatif
 *   delta <= 60s  -> 'online'  (vert, pulse)
 *   delta <= 3min -> 'away'    (orange)
 *   delta <= 5min -> 'idle'    (gris AFFICHÉ)
 *   delta > 5min  -> 'offline' (AUCUN dot)
 *
 * Garde anti-stale : isOnline=true avec lastActiveAt > 5min est une donnée
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
  PRESENCE_AWAY_WINDOW_MS,
  PRESENCE_IDLE_WINDOW_MS,
  type UserStatus,
} from '../../lib/user-status';

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

// Horloge figée : les tests de bornes inclusives ("idle à exactement 5min")
// fabriquent une date puis appellent getUserStatus — sans fake timers les
// millisecondes écoulées entre les deux font basculer la borne (flaky).
beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-07-20T12:00:00Z') });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('User Status Module', () => {
  describe('window constants', () => {
    it('exposes the canonical windows (60s / 3min / 5min)', () => {
      expect(PRESENCE_ONLINE_WINDOW_MS).toBe(60 * 1000);
      expect(PRESENCE_AWAY_WINDOW_MS).toBe(3 * 60 * 1000);
      expect(PRESENCE_IDLE_WINDOW_MS).toBe(5 * 60 * 1000);
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

    describe('isOnline backend flag is authoritative for online (within the 5min guard)', () => {
      it('returns online when isOnline true and no lastActiveAt', () => {
        expect(getUserStatus({ isOnline: true } as any)).toBe('online');
      });
      it('returns online when isOnline true with lastActiveAt within 5min', () => {
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(3) } as any)).toBe('online');
        expect(getUserStatus({ isOnline: true, lastActiveAt: secondsAgo(299) } as any)).toBe('online');
      });
      it('anti-stale guard: ignores isOnline when lastActiveAt is beyond 5min', () => {
        expect(getUserStatus({ isOnline: true, lastActiveAt: secondsAgo(301) } as any)).toBe('offline');
        expect(getUserStatus({ isOnline: true, lastActiveAt: minutesAgo(10) } as any)).toBe('offline');
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
      it('returns away between 60s and 3min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(2) } as any)).toBe('away');
      });
      it('returns idle between 3min and 5min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(4) } as any)).toBe('idle');
      });
      it('returns offline beyond 5min', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(6) } as any)).toBe('offline');
      });
      it('returns offline for hours-old activity', () => {
        expect(getUserStatus({ lastActiveAt: minutesAgo(180) } as any)).toBe('offline');
      });
    });

    describe('Freshly disconnected users still decay by time', () => {
      it('shows away (orange) 2min after disconnect', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(2) } as any)).toBe('away');
      });
      it('shows idle (gris) 4min after disconnect', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(4) } as any)).toBe('idle');
      });
      it('shows offline (rien) 6min after disconnect', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(6) } as any)).toBe('offline');
      });
    });

    describe('Boundary testing (inclusive upper bound of each window)', () => {
      it('online at exactly 60s', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(60) } as any)).toBe('online');
      });
      it('away just after 60s', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(61) } as any)).toBe('away');
      });
      it('away at exactly 3min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(180) } as any)).toBe('away');
      });
      it('idle just after 3min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(181) } as any)).toBe('idle');
      });
      it('idle at exactly 5min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(300) } as any)).toBe('idle');
      });
      it('offline just after 5min', () => {
        expect(getUserStatus({ lastActiveAt: secondsAgo(301) } as any)).toBe('offline');
      });
    });

    describe('Input shapes', () => {
      it('handles Date object', () => {
        expect(getUserStatus({ lastActiveAt: new Date(Date.now() - 10 * 1000) } as any)).toBe('online');
      });
      it('handles timestamp number', () => {
        expect(getUserStatus({ lastActiveAt: Date.now() - 2 * 60 * 1000 } as any)).toBe('away');
      });
      it('handles Participant type', () => {
        const participant = { id: 'p-123', type: 'anonymous', lastActiveAt: minutesAgo(4) };
        expect(getUserStatus(participant as any)).toBe('idle');
      });
    });
  });

  describe('presence helpers', () => {
    it('isPresenceActive: every state below 5min (online + away + idle), never offline', () => {
      expect(isPresenceActive('online')).toBe(true);
      expect(isPresenceActive('away')).toBe(true);
      expect(isPresenceActive('idle')).toBe(true);
      expect(isPresenceActive('offline')).toBe(false);
    });
    it('isPresencePulsing: online only', () => {
      expect(isPresencePulsing('online')).toBe(true);
      expect(isPresencePulsing('away')).toBe(false);
      expect(isPresencePulsing('idle')).toBe(false);
      expect(isPresencePulsing('offline')).toBe(false);
    });
    it('presenceTone: vert (success) online, orange (warning) away, gris (muted) idle + offline', () => {
      expect(presenceTone('online')).toBe('success');
      expect(presenceTone('away')).toBe('warning');
      expect(presenceTone('idle')).toBe('muted');
      expect(presenceTone('offline')).toBe('muted');
    });
  });

  describe('central color maps (single source for every presence component)', () => {
    it('dot: vert emerald pour online, orange amber pour away, gris pour idle (affiché) et offline (labellisé)', () => {
      expect(PRESENCE_DOT_CLASS.online).toBe('bg-emerald-400 animate-pulse');
      expect(PRESENCE_DOT_CLASS.away).toBe('bg-amber-400');
      expect(PRESENCE_DOT_CLASS.idle).toBe('bg-gray-400');
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
      expect(PRESENCE_BADGE_CLASS.away).toContain('bg-amber-400');
      expect(PRESENCE_BADGE_CLASS.idle).toContain('bg-gray-400');
      expect(PRESENCE_BADGE_CLASS.offline).toContain('bg-gray-400');
    });
    it('presenceTextClass maps status to tone text classes', () => {
      expect(presenceTextClass('online')).toContain('emerald');
      expect(presenceTextClass('away')).toContain('amber');
      expect(presenceTextClass('idle')).toContain('gray');
      expect(presenceTextClass('offline')).toContain('gray');
    });
  });

  describe('UserStatus type', () => {
    it('has the four canonical values', () => {
      const validStatuses: UserStatus[] = ['online', 'away', 'idle', 'offline'];
      expect(validStatuses).toHaveLength(4);
    });
  });
});
