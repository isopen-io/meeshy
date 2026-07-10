/**
 * Unit tests for StatusService
 *
 * Covers the critical invariants:
 * - markDisconnected / markConnected guard logic
 * - ensureUserOnline: disconnect-guard short-circuit, throttle, Prisma call shape, presenceCallback
 * - updateUserLastSeen: disconnect-guard, in-memory throttle (Redis unavailable), fire-and-forget update
 * - updateUserLastActive: disconnect-guard, in-memory throttle
 * - clearOldCacheEntries: purges stale cache + disconnectedUsers entries
 *
 * Time-based tests manipulate internal cache timestamps directly so they run
 * in real time without fake-timer interference.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ──────────────────────────────────────────────────────────────────────────────
// Mock CacheStore (Redis unavailable → in-memory throttle path)
// ──────────────────────────────────────────────────────────────────────────────

const mockDel = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn().mockResolvedValue(null);

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    keys: jest.fn().mockResolvedValue([]),
    setnx: jest.fn().mockResolvedValue(true),
    expire: jest.fn().mockResolvedValue(true),
    publish: jest.fn().mockResolvedValue(0),
    info: jest.fn().mockResolvedValue(''),
    isAvailable: jest.fn().mockReturnValue(false),
    close: jest.fn().mockResolvedValue(undefined),
    getNativeClient: jest.fn().mockReturnValue(null), // forces in-memory throttle path
  })
}));

// ──────────────────────────────────────────────────────────────────────────────
// Mock logger
// ──────────────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Drain microtask queue without requiring fake timers. */
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

// ──────────────────────────────────────────────────────────────────────────────
// Import after mocks
// ──────────────────────────────────────────────────────────────────────────────

import { StatusService } from '../../../services/StatusService';

// ──────────────────────────────────────────────────────────────────────────────
// Prisma mock factory
// ──────────────────────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    user: {
      update: jest.fn().mockResolvedValue(undefined)
    },
    participant: {
      update: jest.fn().mockResolvedValue(undefined)
    }
  } as any;
}

/** Back-date an internal Map entry so throttle / guard windows appear to have elapsed. */
function backDate(map: Map<string, number>, key: string, offsetMs: number): void {
  map.set(key, Date.now() - offsetMs);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusService', () => {
  let service: StatusService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new StatusService(mockPrisma);
    mockDel.mockClear();
    mockSet.mockClear();
    mockGet.mockClear();
  });

  afterEach(() => {
    service.shutdown();
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // markDisconnected / markConnected
  // ────────────────────────────────────────────────────────────────────────

  describe('markDisconnected', () => {
    it('should delete the Redis presence key for a registered user', async () => {
      service.markDisconnected('user-1', false);
      await flushPromises();
      expect(mockDel).toHaveBeenCalledWith('presence:user:user-1');
    });

    it('should delete the Redis presence key for an anonymous user', async () => {
      service.markDisconnected('anon-1', true);
      await flushPromises();
      expect(mockDel).toHaveBeenCalledWith('presence:anon:anon-1');
    });

    it('should cause ensureUserOnline to short-circuit (no Prisma call)', async () => {
      service.markDisconnected('user-1', false);
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should cause updateUserLastSeen to skip for the disconnected user', async () => {
      service.markDisconnected('user-1', false);
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('markConnected', () => {
    it('should set a Redis presence key with TTL for a registered user', async () => {
      service.markConnected('user-1', false);
      await flushPromises();
      expect(mockSet).toHaveBeenCalledWith('presence:user:user-1', expect.any(String), 120);
    });

    it('should set a Redis presence key for an anonymous user', async () => {
      service.markConnected('anon-1', true);
      await flushPromises();
      expect(mockSet).toHaveBeenCalledWith('presence:anon:anon-1', expect.any(String), 120);
    });

    it('should lift the disconnect guard so ensureUserOnline proceeds', async () => {
      service.markDisconnected('user-1', false);
      service.markConnected('user-1', false);
      mockSet.mockClear();
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // ensureUserOnline
  // ────────────────────────────────────────────────────────────────────────

  describe('ensureUserOnline', () => {
    it('should update prisma.user with isOnline and lastActiveAt for registered user', async () => {
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isOnline: true, lastActiveAt: expect.any(Date) }
      });
    });

    it('should update prisma.participant for anonymous user', async () => {
      service.ensureUserOnline('anon-1', true);
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { isOnline: true, lastActiveAt: expect.any(Date) }
      });
    });

    it('should throttle: second call within 60s does not trigger another Prisma update', async () => {
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('should fire a second update once the 60s throttle window has elapsed', async () => {
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      // Back-date the onlineEnsureCache so the next call looks >60s later
      backDate((service as any).onlineEnsureCache, 'user-1', 61_000);
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('should invoke presenceCallback with (userId, true, isAnonymous)', async () => {
      const callback = jest.fn();
      service.setPresenceCallback(callback);
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      expect(callback).toHaveBeenCalledWith('user-1', true, false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateUserLastSeen
  // ────────────────────────────────────────────────────────────────────────

  describe('updateUserLastSeen', () => {
    it('should update prisma.user.lastActiveAt on first call', async () => {
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('should throttle: second call within 5s does not trigger Prisma again', async () => {
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('should allow a second update after the 5s throttle window has elapsed', async () => {
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      // Back-date activityCache so the next call looks >5s later
      backDate((service as any).activityCache, 'user-1', 6_000);
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateUserLastActive
  // ────────────────────────────────────────────────────────────────────────

  describe('updateUserLastActive', () => {
    it('should update prisma.user.lastActiveAt on first call', async () => {
      await service.updateUserLastActive('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('should throttle: second call within 60s does not trigger Prisma', async () => {
      await service.updateUserLastActive('user-1');
      await flushPromises();
      await service.updateUserLastActive('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('should skip update when user is in disconnected guard', async () => {
      service.markDisconnected('user-1', false);
      await service.updateUserLastActive('user-1');
      await flushPromises();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // clearOldCacheEntries
  // ────────────────────────────────────────────────────────────────────────

  describe('clearOldCacheEntries', () => {
    it('should remove disconnectedUsers entries older than 60s', async () => {
      service.markDisconnected('user-old', false);
      // Back-date the guard entry past the 60s max-age
      backDate((service as any).disconnectedUsers, 'user-old', 61_000);
      service.clearOldCacheEntries();
      // Guard removed: ensureUserOnline should now reach Prisma
      service.ensureUserOnline('user-old', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should keep recent disconnectedUsers entries (younger than 60s)', async () => {
      service.markDisconnected('user-recent', false);
      // Entry is ~0ms old — well within the 60s window
      service.clearOldCacheEntries();
      service.ensureUserOnline('user-recent', false);
      await flushPromises();
      // Guard still active: Prisma should not be called
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
