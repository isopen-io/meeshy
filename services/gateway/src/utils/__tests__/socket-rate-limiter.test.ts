/**
 * Unit tests for SocketRateLimiter
 *
 * Uses Jest fake timers to exercise the window-based counting logic without
 * wall-clock delays.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Logger mock ─────────────────────────────────────────────────────────────

jest.mock('../logger.js', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { SocketRateLimiter, checkSocketRateLimit, getSocketRateLimiter } from '../socket-rate-limiter';
import type { Socket } from 'socket.io';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<{ maxRequests: number; windowMs: number; keyPrefix: string }> = {}) {
  return {
    maxRequests: 3,
    windowMs: 10_000,
    keyPrefix: 'test:rl',
    ...overrides,
  };
}

function makeSocket(overrides: Record<string, unknown> = {}): Socket {
  return {
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

// ─── SocketRateLimiter ────────────────────────────────────────────────────────

describe('SocketRateLimiter', () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new SocketRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
    jest.useRealTimers();
  });

  describe('checkLimit', () => {
    it('allows first request for a new user', async () => {
      const config = makeConfig();
      expect(await limiter.checkLimit('user-a', config)).toBe(true);
    });

    it('allows up to maxRequests within the window', async () => {
      const config = makeConfig({ maxRequests: 3 });

      expect(await limiter.checkLimit('user-a', config)).toBe(true);
      expect(await limiter.checkLimit('user-a', config)).toBe(true);
      expect(await limiter.checkLimit('user-a', config)).toBe(true);
    });

    it('blocks the (maxRequests + 1)th request within the window', async () => {
      const config = makeConfig({ maxRequests: 3 });
      await limiter.checkLimit('user-a', config);
      await limiter.checkLimit('user-a', config);
      await limiter.checkLimit('user-a', config);

      expect(await limiter.checkLimit('user-a', config)).toBe(false);
    });

    it('resets after the window expires and allows requests again', async () => {
      const config = makeConfig({ maxRequests: 1, windowMs: 5_000 });
      await limiter.checkLimit('user-a', config);
      expect(await limiter.checkLimit('user-a', config)).toBe(false);

      // Advance past the window
      jest.advanceTimersByTime(5_001);

      expect(await limiter.checkLimit('user-a', config)).toBe(true);
    });

    it('tracks users independently', async () => {
      const config = makeConfig({ maxRequests: 1 });
      await limiter.checkLimit('user-a', config);

      // user-a is now blocked but user-b has a fresh window
      expect(await limiter.checkLimit('user-a', config)).toBe(false);
      expect(await limiter.checkLimit('user-b', config)).toBe(true);
    });

    it('uses keyPrefix:userId as the storage key (different prefixes are independent)', async () => {
      const configA = makeConfig({ maxRequests: 1, keyPrefix: 'scope:a' });
      const configB = makeConfig({ maxRequests: 1, keyPrefix: 'scope:b' });

      await limiter.checkLimit('user-a', configA);
      // Exhausted scope:a but scope:b is fresh
      expect(await limiter.checkLimit('user-a', configA)).toBe(false);
      expect(await limiter.checkLimit('user-a', configB)).toBe(true);
    });
  });

  describe('getRateLimitInfo', () => {
    it('returns full remaining count for an unseen user', () => {
      const config = makeConfig({ maxRequests: 5, windowMs: 10_000 });
      const info = limiter.getRateLimitInfo('unknown-user', config);

      expect(info.count).toBe(0);
      expect(info.remaining).toBe(5);
    });

    it('reflects the current count and remaining after some requests', async () => {
      const config = makeConfig({ maxRequests: 5, windowMs: 10_000 });
      await limiter.checkLimit('user-info', config);
      await limiter.checkLimit('user-info', config);

      const info = limiter.getRateLimitInfo('user-info', config);
      expect(info.count).toBe(2);
      expect(info.remaining).toBe(3);
    });

    it('clamps remaining to 0 when limit is exceeded', async () => {
      const config = makeConfig({ maxRequests: 2, windowMs: 10_000 });
      await limiter.checkLimit('user-x', config);
      await limiter.checkLimit('user-x', config);
      await limiter.checkLimit('user-x', config); // over limit

      const info = limiter.getRateLimitInfo('user-x', config);
      expect(info.remaining).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears the rate-limit entry so the next request is allowed again', async () => {
      const config = makeConfig({ maxRequests: 1 });
      await limiter.checkLimit('user-r', config);
      expect(await limiter.checkLimit('user-r', config)).toBe(false);

      limiter.reset('user-r', config);

      expect(await limiter.checkLimit('user-r', config)).toBe(true);
    });

    it('is a no-op for unknown users', () => {
      const config = makeConfig();
      expect(() => limiter.reset('unknown-user', config)).not.toThrow();
    });
  });

  describe('getTrackedCount', () => {
    it('returns 0 before any requests', () => {
      expect(limiter.getTrackedCount()).toBe(0);
    });

    it('increments as users are tracked', async () => {
      const config = makeConfig();
      await limiter.checkLimit('u1', config);
      await limiter.checkLimit('u2', config);
      expect(limiter.getTrackedCount()).toBe(2);
    });

    it('decrements after cleanup removes expired entries', async () => {
      const config = makeConfig({ maxRequests: 10, windowMs: 1_000 });
      await limiter.checkLimit('u1', config);
      await limiter.checkLimit('u2', config);
      expect(limiter.getTrackedCount()).toBe(2);

      jest.advanceTimersByTime(61_000); // trigger the 60s cleanup interval
      expect(limiter.getTrackedCount()).toBe(0);
    });
  });

  describe('destroy', () => {
    it('clears all tracked entries and stops the cleanup timer', () => {
      const config = makeConfig();
      // Enqueue some state
      limiter.checkLimit('u1', config);
      limiter.destroy();

      expect(limiter.getTrackedCount()).toBe(0);
    });

    it('can be called multiple times without throwing', () => {
      expect(() => {
        limiter.destroy();
        limiter.destroy();
      }).not.toThrow();
    });
  });
});

// ─── checkSocketRateLimit helper ─────────────────────────────────────────────

describe('checkSocketRateLimit', () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new SocketRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
    jest.useRealTimers();
  });

  it('returns true and does NOT emit when request is allowed', async () => {
    const socket = makeSocket();
    const config = makeConfig({ maxRequests: 5 });

    const allowed = await checkSocketRateLimit(socket, 'user-ok', config, limiter, 'error:event');

    expect(allowed).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('returns false and emits error event when rate limit exceeded', async () => {
    const socket = makeSocket();
    const config = makeConfig({ maxRequests: 1 });

    await checkSocketRateLimit(socket, 'user-block', config, limiter, 'custom:error');
    const result = await checkSocketRateLimit(socket, 'user-block', config, limiter, 'custom:error');

    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith(
      'custom:error',
      expect.objectContaining({
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('seconds'),
        retryAfter: expect.any(Number),
      })
    );
  });

  it('uses the default error event "call:error" when none specified', async () => {
    const socket = makeSocket();
    const config = makeConfig({ maxRequests: 1 });

    await checkSocketRateLimit(socket, 'user-def', config, limiter);
    await checkSocketRateLimit(socket, 'user-def', config, limiter);

    expect(socket.emit).toHaveBeenCalledWith('call:error', expect.any(Object));
  });
});

// ─── getSocketRateLimiter singleton ─────────────────────────────────────────

describe('getSocketRateLimiter', () => {
  it('returns the same instance on repeated calls (singleton)', () => {
    const a = getSocketRateLimiter();
    const b = getSocketRateLimiter();
    expect(a).toBe(b);
  });
});
