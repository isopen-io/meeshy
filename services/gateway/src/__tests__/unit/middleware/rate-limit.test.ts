/**
 * Tests for middleware/rate-limit.ts
 *
 * Covers: RATE_LIMITS constants, createRateLimitConfig, ROUTE_RATE_LIMITS,
 * registerRateLimiting (disabled path + enabled path with callbacks).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../utils/logger', () => ({ logger: mockLogger }));

jest.mock('@fastify/rate-limit', () => jest.fn());

jest.mock('../../../utils/rate-limiter', () => ({
  isLocalIp: jest.fn((ip: string) => ip === '127.0.0.1'),
}));

import {
  RATE_LIMITS,
  createRateLimitConfig,
  ROUTE_RATE_LIMITS,
  registerRateLimiting,
} from '../../../middleware/rate-limit';

import { isLocalIp } from '../../../utils/rate-limiter';

function makeMockFastify(redis: unknown = null) {
  return {
    register: jest.fn().mockResolvedValue(undefined),
    redis,
  };
}

describe('RATE_LIMITS', () => {
  it('INITIATE_CALL has max=5 and timeWindow=1 minute', () => {
    expect(RATE_LIMITS.INITIATE_CALL.max).toBe(5);
    expect(RATE_LIMITS.INITIATE_CALL.timeWindow).toBe('1 minute');
  });

  it('JOIN_CALL has max=20', () => {
    expect(RATE_LIMITS.JOIN_CALL.max).toBe(20);
  });

  it('CALL_OPERATIONS has max=10', () => {
    expect(RATE_LIMITS.CALL_OPERATIONS.max).toBe(10);
  });

  it('DEFAULT has numeric max and timeWindow', () => {
    expect(typeof RATE_LIMITS.DEFAULT.max).toBe('number');
    expect(typeof RATE_LIMITS.DEFAULT.timeWindow).toBe('number');
  });
});

describe('createRateLimitConfig', () => {
  it('wraps max and timeWindow in the expected shape', () => {
    const cfg = createRateLimitConfig(10, '1 minute');
    expect(cfg).toEqual({
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    });
  });

  it('works with numeric timeWindow', () => {
    const cfg = createRateLimitConfig(50, 30_000);
    expect(cfg.config.rateLimit.timeWindow).toBe(30_000);
    expect(cfg.config.rateLimit.max).toBe(50);
  });
});

describe('ROUTE_RATE_LIMITS', () => {
  it('initiateCall uses INITIATE_CALL limits', () => {
    const { config } = ROUTE_RATE_LIMITS.initiateCall as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.INITIATE_CALL.max);
    expect(config.rateLimit.timeWindow).toBe(RATE_LIMITS.INITIATE_CALL.timeWindow);
  });

  it('joinCall uses JOIN_CALL limits', () => {
    const { config } = ROUTE_RATE_LIMITS.joinCall as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.JOIN_CALL.max);
  });

  it('callOperations uses CALL_OPERATIONS limits', () => {
    const { config } = ROUTE_RATE_LIMITS.callOperations as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.CALL_OPERATIONS.max);
  });
});

describe('registerRateLimiting', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns without registering when ENABLE_RATE_LIMITING=false', async () => {
    process.env.ENABLE_RATE_LIMITING = 'false';
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('DISABLED'),
    );
  });

  it('registers the plugin when rate limiting is enabled', async () => {
    process.env.ENABLE_RATE_LIMITING = 'true';
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('enabled'),
      expect.any(Object),
    );
  });

  it('registers the plugin when ENABLE_RATE_LIMITING is not set', async () => {
    delete process.env.ENABLE_RATE_LIMITING;
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
  });

  describe('registered plugin options callbacks', () => {
    async function getOptions() {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const fastify = makeMockFastify();
      await registerRateLimiting(fastify as any);
      return (fastify.register as jest.Mock).mock.calls[0][1] as Record<string, any>;
    }

    it('allowList returns true for local IPs', async () => {
      const opts = await getOptions();
      (isLocalIp as jest.Mock).mockReturnValueOnce(true);
      expect(opts.allowList({ ip: '127.0.0.1' })).toBe(true);
    });

    it('allowList returns false for non-local IPs', async () => {
      const opts = await getOptions();
      (isLocalIp as jest.Mock).mockReturnValueOnce(false);
      expect(opts.allowList({ ip: '8.8.8.8' })).toBe(false);
    });

    it('keyGenerator uses userId when auth context present', async () => {
      const opts = await getOptions();
      const req = { authContext: { userId: 'user-123' }, ip: '8.8.8.8' };
      const key = opts.keyGenerator(req);
      expect(key).toBe('user:user-123');
    });

    it('keyGenerator falls back to IP when no auth context', async () => {
      const opts = await getOptions();
      const req = { ip: '1.2.3.4' };
      const key = opts.keyGenerator(req);
      expect(key).toBe('1.2.3.4');
    });

    it('keyGenerator returns unknown when IP is missing', async () => {
      const opts = await getOptions();
      const req = {};
      const key = opts.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('errorResponseBuilder returns structured 429 response', async () => {
      const opts = await getOptions();
      const req = { ip: '5.6.7.8', url: '/api/v1/test' };
      const ctx = { max: 100, after: '30s' };
      const body = opts.errorResponseBuilder(req, ctx);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.error.message).toContain('30s');
    });

    it('onExceeding logs a debug message with key and path', async () => {
      const opts = await getOptions();
      const req = { ip: '5.6.7.8', url: '/api/test' };
      opts.onExceeding(req, 'some-key');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limit warning',
        expect.objectContaining({ key: 'some-key' }),
      );
    });

    it('passes redis option when fastify.redis is set', async () => {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const mockRedis = { get: jest.fn() };
      const fastify = makeMockFastify(mockRedis);
      await registerRateLimiting(fastify as any);
      const opts = (fastify.register as jest.Mock).mock.calls[0][1];
      expect(opts.redis).toBe(mockRedis);
    });

    it('passes undefined redis when fastify.redis is null', async () => {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const fastify = makeMockFastify(null);
      await registerRateLimiting(fastify as any);
      const opts = (fastify.register as jest.Mock).mock.calls[0][1];
      expect(opts.redis).toBeUndefined();
    });
  });
});
