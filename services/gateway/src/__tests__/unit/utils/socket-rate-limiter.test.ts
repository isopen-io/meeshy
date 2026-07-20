/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  SocketRateLimiter,
  SOCKET_RATE_LIMITS,
  checkSocketRateLimit,
  getSocketRateLimiter,
} from '../../../utils/socket-rate-limiter';

const FAST_CONFIG = { maxRequests: 3, windowMs: 60_000, keyPrefix: 'test:fast' };

function makeMockSocket() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }) as jest.Mock,
    emitted,
  };
}

describe('SOCKET_RATE_LIMITS', () => {
  it('has all required rate-limit configs', () => {
    expect(SOCKET_RATE_LIMITS.MESSAGE_SEND.maxRequests).toBe(20);
    expect(SOCKET_RATE_LIMITS.CALL_INITIATE.maxRequests).toBe(5);
    expect(SOCKET_RATE_LIMITS.CALL_JOIN.maxRequests).toBe(20);
    expect(SOCKET_RATE_LIMITS.CALL_SIGNAL.maxRequests).toBe(100);
    expect(SOCKET_RATE_LIMITS.CALL_LEAVE.maxRequests).toBe(20);
    expect(SOCKET_RATE_LIMITS.MEDIA_TOGGLE.maxRequests).toBe(50);
    expect(SOCKET_RATE_LIMITS.CALL_TRANSCRIPTION_SEGMENT.maxRequests).toBe(60);
  });

  it('uses correct time windows', () => {
    expect(SOCKET_RATE_LIMITS.MESSAGE_SEND.windowMs).toBe(60_000);
    expect(SOCKET_RATE_LIMITS.CALL_SIGNAL.windowMs).toBe(10_000);
    expect(SOCKET_RATE_LIMITS.CALL_TRANSCRIPTION_SEGMENT.windowMs).toBe(10_000);
  });
});

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
    it('allows first request', async () => {
      const result = await limiter.checkLimit('user1', FAST_CONFIG);
      expect(result).toBe(true);
    });

    it('allows requests up to maxRequests', async () => {
      for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
        const result = await limiter.checkLimit('user2', FAST_CONFIG);
        expect(result).toBe(true);
      }
    });

    it('blocks the request after maxRequests is exceeded', async () => {
      for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
        await limiter.checkLimit('user3', FAST_CONFIG);
      }
      const result = await limiter.checkLimit('user3', FAST_CONFIG);
      expect(result).toBe(false);
    });

    it('does not share buckets across different users', async () => {
      for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
        await limiter.checkLimit('userA', FAST_CONFIG);
      }
      const result = await limiter.checkLimit('userB', FAST_CONFIG);
      expect(result).toBe(true);
    });

    it('does not share buckets across different configs (different keyPrefix)', async () => {
      const configA = { maxRequests: 1, windowMs: 60_000, keyPrefix: 'pfxA' };
      const configB = { maxRequests: 1, windowMs: 60_000, keyPrefix: 'pfxB' };
      await limiter.checkLimit('shared', configA);
      const blocked = await limiter.checkLimit('shared', configA);
      expect(blocked).toBe(false);
      const allowed = await limiter.checkLimit('shared', configB);
      expect(allowed).toBe(true);
    });

    it('uses default keyPrefix when none provided', async () => {
      const configNoPrefix = { maxRequests: 1, windowMs: 60_000 } as any;
      const first = await limiter.checkLimit('userX', configNoPrefix);
      expect(first).toBe(true);
      const second = await limiter.checkLimit('userX', configNoPrefix);
      expect(second).toBe(false);
    });

    it('resets after window expires', async () => {
      for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
        await limiter.checkLimit('user4', FAST_CONFIG);
      }
      expect(await limiter.checkLimit('user4', FAST_CONFIG)).toBe(false);

      jest.advanceTimersByTime(FAST_CONFIG.windowMs + 1);
      expect(await limiter.checkLimit('user4', FAST_CONFIG)).toBe(true);
    });

    it('logs warning when rate limit exceeded', async () => {
      const { logger } = require('../../../utils/logger');
      for (let i = 0; i <= FAST_CONFIG.maxRequests; i++) {
        await limiter.checkLimit('user5', FAST_CONFIG);
      }
      expect(logger.warn).toHaveBeenCalledWith(
        'Socket.IO rate limit exceeded',
        expect.objectContaining({ userId: 'user5' })
      );
    });
  });

  describe('getRateLimitInfo', () => {
    it('returns zero count and full remaining for an unknown user', () => {
      const info = limiter.getRateLimitInfo('unknown-user', FAST_CONFIG);
      expect(info.count).toBe(0);
      expect(info.remaining).toBe(FAST_CONFIG.maxRequests);
      expect(info.resetIn).toBe(FAST_CONFIG.windowMs);
    });

    it('falls back to socket prefix when keyPrefix is absent', () => {
      const configNoPrefix = { maxRequests: 5, windowMs: 60_000 } as any;
      const info = limiter.getRateLimitInfo('u-no-prefix', configNoPrefix);
      expect(info.count).toBe(0);
      expect(info.remaining).toBe(5);
    });

    it('reflects the correct count and remaining after requests', async () => {
      await limiter.checkLimit('user6', FAST_CONFIG);
      await limiter.checkLimit('user6', FAST_CONFIG);
      const info = limiter.getRateLimitInfo('user6', FAST_CONFIG);
      expect(info.count).toBe(2);
      expect(info.remaining).toBe(FAST_CONFIG.maxRequests - 2);
    });

    it('clamps remaining to 0 when over limit', async () => {
      for (let i = 0; i <= FAST_CONFIG.maxRequests + 2; i++) {
        await limiter.checkLimit('user7', FAST_CONFIG);
      }
      const info = limiter.getRateLimitInfo('user7', FAST_CONFIG);
      expect(info.remaining).toBe(0);
    });

    it('returns fresh window info after entry expires', () => {
      jest.advanceTimersByTime(FAST_CONFIG.windowMs + 1);
      const info = limiter.getRateLimitInfo('expired-user', FAST_CONFIG);
      expect(info.count).toBe(0);
      expect(info.remaining).toBe(FAST_CONFIG.maxRequests);
    });
  });

  describe('reset', () => {
    it('clears rate limit entry so next request is allowed', async () => {
      for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
        await limiter.checkLimit('user8', FAST_CONFIG);
      }
      expect(await limiter.checkLimit('user8', FAST_CONFIG)).toBe(false);

      limiter.reset('user8', FAST_CONFIG);
      expect(await limiter.checkLimit('user8', FAST_CONFIG)).toBe(true);
    });

    it('is a no-op when no entry exists', () => {
      expect(() => limiter.reset('nonexistent', FAST_CONFIG)).not.toThrow();
    });

    it('falls back to socket prefix when keyPrefix is absent', async () => {
      const configNoPrefix = { maxRequests: 1, windowMs: 60_000 } as any;
      await limiter.checkLimit('u-reset-no-pfx', configNoPrefix);
      expect(await limiter.checkLimit('u-reset-no-pfx', configNoPrefix)).toBe(false);
      limiter.reset('u-reset-no-pfx', configNoPrefix);
      expect(await limiter.checkLimit('u-reset-no-pfx', configNoPrefix)).toBe(true);
    });
  });

  describe('getTrackedCount', () => {
    it('returns 0 when no users tracked', () => {
      expect(limiter.getTrackedCount()).toBe(0);
    });

    it('increments when new users make requests', async () => {
      await limiter.checkLimit('u1', FAST_CONFIG);
      await limiter.checkLimit('u2', FAST_CONFIG);
      expect(limiter.getTrackedCount()).toBe(2);
    });

    it('same user with same config counts as one entry', async () => {
      await limiter.checkLimit('u3', FAST_CONFIG);
      await limiter.checkLimit('u3', FAST_CONFIG);
      expect(limiter.getTrackedCount()).toBe(1);
    });
  });

  describe('cleanup (via timer)', () => {
    it('removes expired entries after 60s cleanup interval', async () => {
      const shortConfig = { maxRequests: 5, windowMs: 1_000, keyPrefix: 'cleanup-test' };
      await limiter.checkLimit('cu1', shortConfig);
      expect(limiter.getTrackedCount()).toBe(1);

      jest.advanceTimersByTime(2_000);
      jest.advanceTimersByTime(60_000);

      expect(limiter.getTrackedCount()).toBe(0);
    });

    it('does not log when nothing was cleaned', () => {
      const { logger } = require('../../../utils/logger');
      const debugCallsBefore = (logger.debug as jest.Mock).mock.calls.length;
      jest.advanceTimersByTime(60_000);
      const debugCallsAfter = (logger.debug as jest.Mock).mock.calls.length;
      expect(debugCallsAfter).toBe(debugCallsBefore);
    });

    it('keeps valid (non-expired) entries during cleanup', async () => {
      const longConfig = { maxRequests: 5, windowMs: 120_000, keyPrefix: 'long-lived' };
      await limiter.checkLimit('long-user', longConfig);
      expect(limiter.getTrackedCount()).toBe(1);

      jest.advanceTimersByTime(60_000);

      expect(limiter.getTrackedCount()).toBe(1);
    });
  });

  describe('destroy', () => {
    it('clears all tracked entries', async () => {
      await limiter.checkLimit('u9', FAST_CONFIG);
      limiter.destroy();
      expect(limiter.getTrackedCount()).toBe(0);
    });

    it('prevents further cleanup callbacks (no error after destroy)', () => {
      limiter.destroy();
      expect(() => jest.advanceTimersByTime(60_000)).not.toThrow();
    });
  });
});

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

  it('returns true and does not emit when request is allowed', async () => {
    const socket = makeMockSocket();
    const result = await checkSocketRateLimit(socket as any, 'u1', FAST_CONFIG, limiter);
    expect(result).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('returns false and emits call:error (default) when rate limited', async () => {
    const socket = makeMockSocket();
    for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
      await limiter.checkLimit('u2', FAST_CONFIG);
    }
    const result = await checkSocketRateLimit(socket as any, 'u2', FAST_CONFIG, limiter);
    expect(result).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith(
      'call:error',
      expect.objectContaining({
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('seconds'),
        retryAfter: expect.any(Number),
      })
    );
  });

  it('emits to a custom error event when specified', async () => {
    const socket = makeMockSocket();
    for (let i = 0; i < FAST_CONFIG.maxRequests; i++) {
      await limiter.checkLimit('u3', FAST_CONFIG);
    }
    await checkSocketRateLimit(socket as any, 'u3', FAST_CONFIG, limiter, 'message:error');
    expect(socket.emit).toHaveBeenCalledWith('message:error', expect.any(Object));
  });

  it('retryAfter is in whole seconds (ceiling)', async () => {
    const socket = makeMockSocket();
    const tightConfig = { maxRequests: 1, windowMs: 5_500, keyPrefix: 'retry-test' };
    await limiter.checkLimit('u4', tightConfig);
    await checkSocketRateLimit(socket as any, 'u4', tightConfig, limiter);
    const payload = socket.emit.mock.calls[0][1] as any;
    expect(Number.isInteger(payload.retryAfter)).toBe(true);
    expect(payload.retryAfter).toBeGreaterThan(0);
  });
});

describe('getSocketRateLimiter (singleton)', () => {
  it('returns a SocketRateLimiter instance', () => {
    const instance = getSocketRateLimiter();
    expect(instance).toBeInstanceOf(SocketRateLimiter);
    instance.destroy();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getSocketRateLimiter();
    const b = getSocketRateLimiter();
    expect(a).toBe(b);
    a.destroy();
  });
});
