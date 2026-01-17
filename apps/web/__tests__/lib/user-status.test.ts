/**
 * Tests for user-status module
 * Tests user online status calculation based on activity
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

    describe('isOnline property handling', () => {
      it('should return offline when isOnline is explicitly false', () => {
        const user = {
          id: '1',
          isOnline: false,
          lastActiveAt: new Date().toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return online when isOnline is true and no lastActiveAt', () => {
        const user = {
          id: '1',
          isOnline: true,
        };

        expect(getUserStatus(user as any)).toBe('online');
      });
    });

    describe('lastActiveAt based status', () => {
      it('should return online when active within last 5 minutes', () => {
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: twoMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return online when active exactly now', () => {
        const user = {
          id: '1',
          lastActiveAt: new Date().toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return online when active 4 minutes ago', () => {
        const now = new Date();
        const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: fourMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return away when inactive for 5-30 minutes', () => {
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: tenMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return away when inactive for exactly 5 minutes', () => {
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: fiveMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return away when inactive for 29 minutes', () => {
        const now = new Date();
        const twentyNineMinutesAgo = new Date(now.getTime() - 29 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: twentyNineMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('away');
      });

      it('should return offline when inactive for 30+ minutes', () => {
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: thirtyMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when inactive for hours', () => {
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: twoHoursAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when inactive for days', () => {
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: twoDaysAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });
    });

    describe('No lastActiveAt handling', () => {
      it('should return offline when no lastActiveAt and no isOnline', () => {
        const user = {
          id: '1',
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should return offline when lastActiveAt is null', () => {
        const user = {
          id: '1',
          lastActiveAt: null,
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });
    });

    describe('Edge cases', () => {
      it('should handle Date object for lastActiveAt', () => {
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

        const user = {
          id: '1',
          lastActiveAt: twoMinutesAgo,
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should handle timestamp number for lastActiveAt', () => {
        const now = new Date();
        const twoMinutesAgo = now.getTime() - 2 * 60 * 1000;

        const user = {
          id: '1',
          lastActiveAt: twoMinutesAgo,
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should handle AnonymousParticipant type', () => {
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

        const anonymousUser = {
          anonId: 'anon-123',
          lastActiveAt: twoMinutesAgo.toISOString(),
        };

        expect(getUserStatus(anonymousUser as any)).toBe('online');
      });

      it('should prioritize isOnline=false over recent activity', () => {
        const user = {
          id: '1',
          isOnline: false,
          lastActiveAt: new Date().toISOString(), // Just now
        };

        expect(getUserStatus(user as any)).toBe('offline');
      });

      it('should use lastActiveAt when isOnline is undefined', () => {
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

        const user = {
          id: '1',
          isOnline: undefined,
          lastActiveAt: tenMinutesAgo.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('away');
      });
    });

    describe('Boundary testing', () => {
      it('should return online at 4 minutes 59 seconds', () => {
        const now = new Date();
        const almostFiveMinutes = new Date(now.getTime() - (5 * 60 * 1000 - 1000));

        const user = {
          id: '1',
          lastActiveAt: almostFiveMinutes.toISOString(),
        };

        expect(getUserStatus(user as any)).toBe('online');
      });

      it('should return away at 29 minutes 59 seconds', () => {
        const now = new Date();
        const almostThirtyMinutes = new Date(now.getTime() - (30 * 60 * 1000 - 1000));

        const user = {
          id: '1',
          lastActiveAt: almostThirtyMinutes.toISOString(),
        };

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
