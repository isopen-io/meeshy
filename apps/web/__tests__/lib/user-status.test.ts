/**
 * Tests for user-status module
 * Tests user online status calculation combining isOnline + lastActiveAt
 */

import { getUserStatus, type UserStatus } from '../../lib/user-status';

describe('User Status Module', () => {
  describe('getUserStatus', () => {
    describe('Null and undefined handling', () => {
      it('should return offline for null user', () => {
        expect(getUserStatus(null)).toBe('offline');
      });

      it('should return offline for undefined user', () => {
        expect(getUserStatus(undefined)).toBe('offline');
      });
    });

    describe('isOnline === false (explicit disconnect)', () => {
      it('should return away when isOnline false but lastActiveAt is recent', () => {
        const user = {
          id: '1',
          isOnline: false,
          lastActiveAt: new Date().toISOString(),
        };
        // Disconnected but was just active => away
        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return away when isOnline false and active 10min ago', () => {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const user = { id: '1', isOnline: false, lastActiveAt: tenMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return offline when isOnline false and active 30+ min ago', () => {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const user = { id: '1', isOnline: false, lastActiveAt: thirtyMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when isOnline false and no lastActiveAt', () => {
        const user = { id: '1', isOnline: false };
        expect(getUserStatus(user as any)).toBe('offline');
      });
    });

    describe('isOnline === true (connected via socket)', () => {
      it('should return online when isOnline true and no lastActiveAt', () => {
        const user = { id: '1', isOnline: true };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return online when isOnline true and recently active', () => {
        const user = { id: '1', isOnline: true, lastActiveAt: new Date().toISOString() };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return away when isOnline true but inactive 10+ min', () => {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const user = { id: '1', isOnline: true, lastActiveAt: tenMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return away when isOnline true but inactive 30+ min', () => {
        const thirtyMinAgo = new Date(Date.now() - 35 * 60 * 1000);
        const user = { id: '1', isOnline: true, lastActiveAt: thirtyMinAgo.toISOString() };
        // Connected but idle for 35 min => away (not offline since socket is connected)
        expect(getUserStatus(user as any)).toBe('away');
      });
    });

    describe('isOnline undefined (no socket info, time-based only)', () => {
      it('should return online when active within last 5 minutes', () => {
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        const user = { id: '1', lastActiveAt: twoMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return online when active exactly now', () => {
        const user = { id: '1', lastActiveAt: new Date().toISOString() };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return away when inactive for 5-30 minutes', () => {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const user = { id: '1', lastActiveAt: tenMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return away when inactive for exactly 5 minutes', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const user = { id: '1', lastActiveAt: fiveMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return offline when inactive for 30+ minutes', () => {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const user = { id: '1', lastActiveAt: thirtyMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when inactive for hours', () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const user = { id: '1', lastActiveAt: twoHoursAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when no lastActiveAt', () => {
        const user = { id: '1' };
        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when lastActiveAt is null', () => {
        const user = { id: '1', lastActiveAt: null };
        expect(getUserStatus(user as any)).toBe('offline');
      });
    });

    describe('Edge cases', () => {
      it('should handle Date object for lastActiveAt', () => {
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        const user = { id: '1', lastActiveAt: twoMinAgo };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should handle timestamp number for lastActiveAt', () => {
        const twoMinAgo = Date.now() - 2 * 60 * 1000;
        const user = { id: '1', lastActiveAt: twoMinAgo };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should handle Participant type', () => {
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        const participant = { id: 'p-123', type: 'anonymous', lastActiveAt: twoMinAgo.toISOString() };
        expect(getUserStatus(participant as any)).toBe('online');
      });

      it('should use time-based status when isOnline is undefined', () => {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const user = { id: '1', isOnline: undefined, lastActiveAt: tenMinAgo.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });
    });

    describe('Boundary testing', () => {
      it('should return online at 4 minutes 59 seconds', () => {
        const almostFiveMin = new Date(Date.now() - (5 * 60 * 1000 - 1000));
        const user = { id: '1', lastActiveAt: almostFiveMin.toISOString() };
        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return away at 29 minutes 59 seconds', () => {
        const almostThirtyMin = new Date(Date.now() - (30 * 60 * 1000 - 1000));
        const user = { id: '1', lastActiveAt: almostThirtyMin.toISOString() };
        expect(getUserStatus(user as any)).toBe('away');
      });
    });
  });

  describe('UserStatus type', () => {
    it('should have valid status values', () => {
      const validStatuses: UserStatus[] = ['online', 'away', 'offline'];
      expect(validStatuses).toHaveLength(3);
    });
  });
});
