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

    it('should purge stale activityCache entries older than 10 minutes', () => {
      const cache = (service as any).activityCache as Map<string, number>;
      cache.set('stale-user', Date.now() - 700_000);
      cache.set('fresh-user', Date.now() - 60_000);
      service.clearOldCacheEntries();
      expect(cache.has('stale-user')).toBe(false);
      expect(cache.has('fresh-user')).toBe(true);
    });

    it('should purge stale connectionCache entries older than 10 minutes', () => {
      const cache = (service as any).connectionCache as Map<string, number>;
      cache.set('stale-conn', Date.now() - 700_000);
      cache.set('fresh-conn', Date.now() - 60_000);
      service.clearOldCacheEntries();
      expect(cache.has('stale-conn')).toBe(false);
      expect(cache.has('fresh-conn')).toBe(true);
    });

    it('should purge stale onlineEnsureCache entries older than 10 minutes', () => {
      const cache = (service as any).onlineEnsureCache as Map<string, number>;
      cache.set('stale-online', Date.now() - 700_000);
      cache.set('fresh-online', Date.now() - 60_000);
      service.clearOldCacheEntries();
      expect(cache.has('stale-online')).toBe(false);
      expect(cache.has('fresh-online')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateAnonymousLastSeen
  // ────────────────────────────────────────────────────────────────────────

  describe('updateAnonymousLastSeen', () => {
    it('should call prisma.participant.update on first call', async () => {
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('should throttle: second call within 5s does not trigger another Prisma update', async () => {
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledTimes(1);
    });

    it('should skip when the anonymous user is in the disconnect guard', async () => {
      service.markDisconnected('anon-1', true);
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
    });

    it('should allow update after throttle window has elapsed', async () => {
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      backDate((service as any).activityCache, 'anon_activity_anon-1', 6_000);
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledTimes(2);
    });

    it('should increment failedUpdates when Prisma rejects', async () => {
      mockPrisma.participant.update.mockRejectedValueOnce(new Error('DB error'));
      await service.updateAnonymousLastSeen('anon-1');
      await flushPromises();
      expect(service.getMetrics().failedUpdates).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateAnonymousLastActive
  // ────────────────────────────────────────────────────────────────────────

  describe('updateAnonymousLastActive', () => {
    it('should call prisma.participant.update on first call', async () => {
      await service.updateAnonymousLastActive('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('should throttle: second call within 60s does not trigger another update', async () => {
      await service.updateAnonymousLastActive('anon-1');
      await flushPromises();
      await service.updateAnonymousLastActive('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledTimes(1);
    });

    it('should skip when the disconnect guard is active for anonymous user', async () => {
      service.markDisconnected('anon-1', true);
      await service.updateAnonymousLastActive('anon-1');
      await flushPromises();
      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
    });

    it('should increment failedUpdates when Prisma rejects', async () => {
      mockPrisma.participant.update.mockRejectedValueOnce(new Error('DB error'));
      await service.updateAnonymousLastActive('anon-1');
      await flushPromises();
      expect(service.getMetrics().failedUpdates).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateLastSeen / updateLastActive (generic delegates)
  // ────────────────────────────────────────────────────────────────────────

  describe('updateLastSeen (generic)', () => {
    it('delegates to updateUserLastSeen when isAnonymous=false', async () => {
      await service.updateLastSeen('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
    });

    it('delegates to updateAnonymousLastSeen when isAnonymous=true', async () => {
      await service.updateLastSeen('anon-1', true);
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateLastActive (generic)', () => {
    it('delegates to updateUserLastActive when isAnonymous=false', async () => {
      await service.updateLastActive('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.participant.update).not.toHaveBeenCalled();
    });

    it('delegates to updateAnonymousLastActive when isAnonymous=true', async () => {
      await service.updateLastActive('anon-1', true);
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // forceUpdateLastSeen / forceUpdateLastActive / forceUpdateBoth
  // ────────────────────────────────────────────────────────────────────────

  describe('forceUpdateLastSeen', () => {
    it('calls prisma.user.update for registered user', async () => {
      await service.forceUpdateLastSeen('user-1', false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('calls prisma.participant.update for anonymous user', async () => {
      await service.forceUpdateLastSeen('anon-1', true);
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });
  });

  describe('forceUpdateLastActive', () => {
    it('calls prisma.user.update for registered user', async () => {
      await service.forceUpdateLastActive('user-1', false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('calls prisma.participant.update for anonymous user', async () => {
      await service.forceUpdateLastActive('anon-1', true);
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });
  });

  describe('forceUpdateBoth', () => {
    it('calls both user.update methods in parallel for registered user', async () => {
      await service.forceUpdateBoth('user-1', false);
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('calls both participant.update methods in parallel for anonymous user', async () => {
      await service.forceUpdateBoth('anon-1', true);
      expect(mockPrisma.participant.update).toHaveBeenCalledTimes(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getMetrics / resetMetrics
  // ────────────────────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('returns a snapshot of the current metrics', async () => {
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(1);
      expect(metrics.activityUpdates).toBeGreaterThanOrEqual(1);
      expect(typeof metrics.successfulUpdates).toBe('number');
    });
  });

  describe('resetMetrics', () => {
    it('resets all counters to zero', async () => {
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      service.resetMetrics();
      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulUpdates).toBe(0);
      expect(metrics.throttledRequests).toBe(0);
      expect(metrics.failedUpdates).toBe(0);
      expect(metrics.activityUpdates).toBe(0);
      expect(metrics.connectionUpdates).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // shutdown (detailed)
  // ────────────────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('clears the cleanup interval and all in-memory caches', () => {
      // Populate the caches
      (service as any).activityCache.set('u1', Date.now());
      (service as any).connectionCache.set('u1', Date.now());
      (service as any).onlineEnsureCache.set('u1', Date.now());
      (service as any).disconnectedUsers.set('u1', Date.now());

      service.shutdown();

      expect((service as any).activityCache.size).toBe(0);
      expect((service as any).connectionCache.size).toBe(0);
      expect((service as any).onlineEnsureCache.size).toBe(0);
      expect((service as any).disconnectedUsers.size).toBe(0);
      expect((service as any).cleanupInterval).toBeNull();
    });

    it('is safe to call shutdown twice (idempotent)', () => {
      service.shutdown();
      expect(() => service.shutdown()).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Redis NX path in updateUserLastSeen
  // ────────────────────────────────────────────────────────────────────────

  describe('updateUserLastSeen — Redis NX path', () => {
    it('throttles when Redis SET NX returns null (key already exists)', async () => {
      const mockRedis = { set: jest.fn().mockResolvedValue(null) };
      const getCacheStore = require('../../../services/CacheStore').getCacheStore;
      (getCacheStore as jest.Mock<any>).mockReturnValueOnce({
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
        getNativeClient: jest.fn().mockReturnValue(mockRedis),
      });
      const { StatusService: StatusServiceFresh } = await import('../../../services/StatusService');
      const prisma = createMockPrisma();
      const svc = new StatusServiceFresh(prisma as any);
      try {
        await svc.updateUserLastSeen('user-redis');
        await flushPromises();
        // SET NX returned null → throttled → no Prisma call
        expect(prisma.user.update).not.toHaveBeenCalled();
      } finally {
        svc.shutdown();
      }
    });

    it('allows update when Redis SET NX returns "OK" (new key set)', async () => {
      const mockRedis = { set: jest.fn().mockResolvedValue('OK') };
      const getCacheStore = require('../../../services/CacheStore').getCacheStore;
      (getCacheStore as jest.Mock<any>).mockReturnValueOnce({
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
        getNativeClient: jest.fn().mockReturnValue(mockRedis),
      });
      const { StatusService: StatusServiceFresh } = await import('../../../services/StatusService');
      const prisma = createMockPrisma();
      const svc = new StatusServiceFresh(prisma as any);
      try {
        await svc.updateUserLastSeen('user-redis');
        await flushPromises();
        expect(prisma.user.update).toHaveBeenCalled();
      } finally {
        svc.shutdown();
      }
    });

    it('falls back to in-memory throttle when Redis NX throws', async () => {
      const mockRedis = { set: jest.fn().mockRejectedValue(new Error('Redis down')) };
      const getCacheStore = require('../../../services/CacheStore').getCacheStore;
      (getCacheStore as jest.Mock<any>).mockReturnValueOnce({
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
        getNativeClient: jest.fn().mockReturnValue(mockRedis),
      });
      const { StatusService: StatusServiceFresh } = await import('../../../services/StatusService');
      const prisma = createMockPrisma();
      const svc = new StatusServiceFresh(prisma as any);
      try {
        // First call: Redis throws → in-memory cache used → no existing entry → proceed
        await svc.updateUserLastSeen('user-redis');
        await flushPromises();
        expect(prisma.user.update).toHaveBeenCalledTimes(1);
      } finally {
        svc.shutdown();
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // ensureUserOnline error path
  // ────────────────────────────────────────────────────────────────────────

  describe('ensureUserOnline — error path', () => {
    it('logs error when Prisma rejects without throwing (line 124)', async () => {
      mockPrisma.user.update.mockRejectedValueOnce(new Error('Prisma down'));
      service.ensureUserOnline('user-1', false);
      await flushPromises();
      // Test passes as long as no unhandled rejection escapes
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateUserLastSeen error path
  // ────────────────────────────────────────────────────────────────────────

  describe('updateUserLastSeen — error path', () => {
    it('increments failedUpdates when Prisma rejects (lines 222-224)', async () => {
      mockPrisma.user.update.mockRejectedValueOnce(new Error('Prisma down'));
      await service.updateUserLastSeen('user-1');
      await flushPromises();
      expect(service.getMetrics().failedUpdates).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateUserLastActive error path
  // ────────────────────────────────────────────────────────────────────────

  describe('updateUserLastActive — error path', () => {
    it('increments failedUpdates when Prisma rejects (lines 261-263)', async () => {
      mockPrisma.user.update.mockRejectedValueOnce(new Error('Prisma down'));
      await service.updateUserLastActive('user-1');
      await flushPromises();
      expect(service.getMetrics().failedUpdates).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // markDisconnected / markConnected Redis error paths
  // ────────────────────────────────────────────────────────────────────────

  describe('markDisconnected — Redis del error path (line 146)', () => {
    it('does not throw when cache.del rejects', async () => {
      mockDel.mockRejectedValueOnce(new Error('Redis del failed'));
      expect(() => service.markDisconnected('user-1', false)).not.toThrow();
      await flushPromises();
    });
  });

  describe('markConnected — Redis set error path (line 163)', () => {
    it('does not throw when cache.set rejects', async () => {
      mockSet.mockRejectedValueOnce(new Error('Redis set failed'));
      expect(() => service.markConnected('user-1', false)).not.toThrow();
      await flushPromises();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // noteHeartbeat — heartbeat socket refreshes lastActiveAt (throttle 60s)
  // so a passive-connected user stays 'online' under the 5min presence guard
  // ────────────────────────────────────────────────────────────────────────

  describe('noteHeartbeat', () => {
    it('refreshes lastActiveAt on the first beat for a registered user', async () => {
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
    });

    it('throttles subsequent beats within the 60s window (at most one write per minute)', async () => {
      service.noteHeartbeat('user-1', false);
      service.noteHeartbeat('user-1', false);
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('refreshes again once the 60s window has elapsed', async () => {
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      backDate((service as any).heartbeatCache, 'heartbeat_user-1', 61_000);
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('ignores beats from a disconnected user (race guard)', async () => {
      service.markDisconnected('user-1', false);
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('beats again after a reconnect (heartbeat throttle cleared on disconnect)', async () => {
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      service.markDisconnected('user-1', false);
      service.markConnected('user-1', false);
      service.noteHeartbeat('user-1', false);
      await flushPromises();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('refreshes participant lastActiveAt for an anonymous user', async () => {
      service.noteHeartbeat('anon-1', true);
      await flushPromises();
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        data: { lastActiveAt: expect.any(Date) }
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
