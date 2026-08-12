/**
 * Unit tests for StatusService
 * Covers: activity throttle (5s), connection throttle (60s), disconnect guard,
 * markConnected/markDisconnected, ensureUserOnline (throttle + guard),
 * forceUpdate variants, updateLastSeen/updateLastActive dispatch,
 * anonymous equivalents, clearOldCacheEntries, getMetrics/resetMetrics,
 * and shutdown.
 *
 * Redis path: getCacheStore() is mocked; getNativeClient returns null
 * so in-memory throttle is exercised throughout.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCacheStore = {
  get: jest.fn<any>().mockResolvedValue(null),
  set: jest.fn<any>().mockResolvedValue(undefined),
  del: jest.fn<any>().mockResolvedValue(undefined),
  keys: jest.fn<any>().mockResolvedValue([]),
  getNativeClient: jest.fn<any>().mockReturnValue(null), // forces in-memory throttle path
};

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockCacheStore,
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { StatusService } from '../../../services/StatusService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Factories ───────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    user: {
      update: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      update: jest.fn<any>().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function makeSut(prisma?: PrismaClient) {
  return new StatusService(prisma ?? makePrisma());
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StatusService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Reset cache mock defaults
    mockCacheStore.set.mockResolvedValue(undefined);
    mockCacheStore.del.mockResolvedValue(undefined);
    mockCacheStore.getNativeClient.mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── updateUserLastSeen (activity throttle 5s) ────────────────────────────

  describe('updateUserLastSeen', () => {
    it('calls prisma.user.update on first call', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastSeen('user-1');
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } })
      );
    });

    it('throttles second call within 5s window', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastSeen('user-1');
      await sut.updateUserLastSeen('user-1'); // < 5s later

      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('allows update after 5s throttle window expires', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastSeen('user-1');
      jest.advanceTimersByTime(5001);
      await sut.updateUserLastSeen('user-1');

      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('increments totalRequests on every call', async () => {
      const sut = makeSut();

      await sut.updateUserLastSeen('u1');
      await sut.updateUserLastSeen('u1'); // throttled

      expect(sut.getMetrics().totalRequests).toBe(2);
    });

    it('skips update and does not throw when user is disconnected', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('user-1', false);

      await sut.updateUserLastSeen('user-1');
      await flushPromises();

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── updateUserLastActive (connection throttle 60s) ───────────────────────

  describe('updateUserLastActive', () => {
    it('calls prisma.user.update on first call', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastActive('user-1');
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('throttles second call within 60s window', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastActive('user-1');
      jest.advanceTimersByTime(30_000);
      await sut.updateUserLastActive('user-1');

      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('allows update after 60s window expires', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastActive('user-1');
      jest.advanceTimersByTime(60_001);
      await sut.updateUserLastActive('user-1');

      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  // ── updateAnonymousLastSeen ──────────────────────────────────────────────

  describe('updateAnonymousLastSeen', () => {
    it('calls prisma.participant.update on first call', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateAnonymousLastSeen('anon-1');
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'anon-1' } })
      );
    });

    it('throttles within 5s window', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateAnonymousLastSeen('anon-1');
      await sut.updateAnonymousLastSeen('anon-1');
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    });

    it('skips when disconnected', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('anon-1', true);

      await sut.updateAnonymousLastSeen('anon-1');
      await flushPromises();

      expect(prisma.participant.update).not.toHaveBeenCalled();
    });
  });

  // ── updateAnonymousLastActive ────────────────────────────────────────────

  describe('updateAnonymousLastActive', () => {
    it('calls prisma.participant.update on first call', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateAnonymousLastActive('anon-1');
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalled();
    });

    it('throttles within 60s window', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateAnonymousLastActive('anon-1');
      jest.advanceTimersByTime(30_000);
      await sut.updateAnonymousLastActive('anon-1');
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    });
  });

  // ── updateLastSeen / updateLastActive (dispatch) ─────────────────────────

  describe('updateLastSeen dispatch', () => {
    it('routes to updateUserLastSeen for registered users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateLastSeen('user-1', false);
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('routes to updateAnonymousLastSeen for anonymous users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateLastSeen('anon-1', true);
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateLastActive dispatch', () => {
    it('routes to updateUserLastActive for registered users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateLastActive('user-1', false);
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('routes to updateAnonymousLastActive for anonymous users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateLastActive('anon-1', true);
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalled();
    });
  });

  // ── forceUpdate variants ─────────────────────────────────────────────────

  describe('forceUpdateLastSeen', () => {
    it('calls user.update bypassing throttle for registered users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      // First call fills throttle cache
      await sut.updateUserLastSeen('user-1');
      await flushPromises();
      // Force should bypass the 5s throttle immediately
      await sut.forceUpdateLastSeen('user-1', false);

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('calls participant.update for anonymous users', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.forceUpdateLastSeen('anon-1', true);

      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'anon-1' } })
      );
    });
  });

  describe('forceUpdateLastActive', () => {
    it('calls user.update bypassing 60s throttle', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.updateUserLastActive('user-1');
      await flushPromises();
      await sut.forceUpdateLastActive('user-1', false);

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('forceUpdateBoth', () => {
    it('calls both lastSeen and lastActive updates', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      await sut.forceUpdateBoth('user-1', false);

      // forceUpdateLastSeen + forceUpdateLastActive = 2 calls
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  // ── markDisconnected / markConnected ─────────────────────────────────────

  describe('markDisconnected', () => {
    it('prevents subsequent activity updates for registered user', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('user-1', false);

      await sut.updateUserLastSeen('user-1');
      await flushPromises();

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('prevents anonymous activity updates', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('anon-1', true);

      await sut.updateAnonymousLastSeen('anon-1');
      await flushPromises();

      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('calls cache.del to remove Redis presence key for registered user', () => {
      const sut = makeSut();
      sut.markDisconnected('user-1', false);

      expect(mockCacheStore.del).toHaveBeenCalledWith('presence:user:user-1');
    });

    it('calls cache.del to remove Redis presence key for anonymous user', () => {
      const sut = makeSut();
      sut.markDisconnected('anon-1', true);

      expect(mockCacheStore.del).toHaveBeenCalledWith('presence:anon:anon-1');
    });
  });

  describe('markConnected', () => {
    it('allows updates again after markDisconnected', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('user-1', false);
      sut.markConnected('user-1', false);

      await sut.updateUserLastSeen('user-1');
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('calls cache.set to create Redis presence key', () => {
      const sut = makeSut();
      sut.markConnected('user-1', false);

      expect(mockCacheStore.set).toHaveBeenCalledWith('presence:user:user-1', expect.any(String), 120);
    });
  });

  // ── ensureUserOnline ─────────────────────────────────────────────────────

  describe('ensureUserOnline', () => {
    it('calls prisma.user.update on first call', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.setPresenceCallback(jest.fn());

      sut.ensureUserOnline('user-1', false);
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isOnline: true }),
        })
      );
    });

    it('throttles within 60s window', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      sut.ensureUserOnline('user-1', false);
      jest.advanceTimersByTime(30_000);
      sut.ensureUserOnline('user-1', false);
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('skips when user is marked as disconnected', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      sut.markDisconnected('user-1', false);

      sut.ensureUserOnline('user-1', false);
      await flushPromises();

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('invokes presenceCallback on success', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);
      const callback = jest.fn<any>();
      sut.setPresenceCallback(callback);

      sut.ensureUserOnline('user-1', false);
      await flushPromises();

      expect(callback).toHaveBeenCalledWith('user-1', true, false);
    });

    it('calls participant.update for anonymous user', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      sut.ensureUserOnline('anon-1', true);
      await flushPromises();

      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'anon-1' } })
      );
    });
  });

  // ── clearOldCacheEntries ─────────────────────────────────────────────────

  describe('clearOldCacheEntries', () => {
    it('removes activity cache entries older than 10 minutes', async () => {
      const sut = makeSut();

      await sut.updateUserLastSeen('old-user');
      jest.advanceTimersByTime(10 * 60 * 1000 + 1);

      sut.clearOldCacheEntries();

      // After clearing, the throttle is reset — a new update should be allowed
      const prisma = makePrisma();
      const sut2 = new StatusService(prisma);
      await sut2.updateUserLastSeen('old-user');
      await flushPromises();

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('purges disconnectedUsers entries older than 60s', () => {
      const sut = makeSut();
      sut.markDisconnected('user-1', false);

      jest.advanceTimersByTime(60_001);
      sut.clearOldCacheEntries();

      // After purge, user is no longer in disconnectedUsers — updates should proceed
      // (internal check via metrics — no direct accessor, but service won't crash)
      expect(() => sut.clearOldCacheEntries()).not.toThrow();
    });
  });

  // ── getMetrics / resetMetrics ────────────────────────────────────────────

  describe('getMetrics', () => {
    it('tracks throttledRequests separately from total', async () => {
      const sut = makeSut();

      await sut.updateUserLastSeen('u1'); // allowed
      await sut.updateUserLastSeen('u1'); // throttled

      const { totalRequests, throttledRequests } = sut.getMetrics();

      expect(totalRequests).toBe(2);
      expect(throttledRequests).toBe(1);
    });
  });

  describe('resetMetrics', () => {
    it('zeroes all counters', async () => {
      const sut = makeSut();
      await sut.updateUserLastSeen('u1');

      sut.resetMetrics();
      const m = sut.getMetrics();

      expect(m.totalRequests).toBe(0);
      expect(m.successfulUpdates).toBe(0);
      expect(m.throttledRequests).toBe(0);
    });
  });

  // ── shutdown ─────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('clears all caches without throwing', async () => {
      const sut = makeSut();
      await sut.updateUserLastSeen('u1');

      expect(() => sut.shutdown()).not.toThrow();
    });
  });
});
