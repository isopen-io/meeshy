/**
 * Tests for user-status module.
 *
 * Regle produit (identique web / iOS / Android), decroissance temporelle sur lastActiveAt :
 *   delta <= 60s   -> 'online'  (orange, pulse)
 *   delta <= 5min  -> 'recent'  (orange)
 *   delta <= 30min -> 'away'    (gris)
 *   delta > 30min  -> 'offline' (aucun indicateur)
 *
 * isOnline ne sert que de fallback quand lastActiveAt est absent.
 */

import {
  getUserStatus,
  isPresenceVisible,
  isPresenceActive,
  isPresencePulsing,
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

    describe('No lastActiveAt (fallback on isOnline flag)', () => {
      it('returns online when isOnline true and no lastActiveAt', () => {
        expect(getUserStatus({ isOnline: true } as any)).toBe('online');
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

    describe('Time decay on lastActiveAt (drives the color regardless of isOnline)', () => {
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

    describe('Freshly disconnected users still decay by time (the reported bug fix)', () => {
      it('shows recent (orange) 3min after disconnect, not away', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(3) } as any)).toBe('recent');
      });
      it('shows away (gris) 10min after disconnect, not orange', () => {
        expect(getUserStatus({ isOnline: false, lastActiveAt: minutesAgo(10) } as any)).toBe('away');
      });
      it('shows offline (rien) 31min after disconnect', () => {
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
    it('isPresenceVisible: everything except offline', () => {
      expect(isPresenceVisible('online')).toBe(true);
      expect(isPresenceVisible('recent')).toBe(true);
      expect(isPresenceVisible('away')).toBe(true);
      expect(isPresenceVisible('offline')).toBe(false);
    });
    it('isPresenceActive (orange): online + recent only', () => {
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
  });

  describe('UserStatus type', () => {
    it('has the four canonical values', () => {
      const validStatuses: UserStatus[] = ['online', 'recent', 'away', 'offline'];
      expect(validStatuses).toHaveLength(4);
    });
  });
});
