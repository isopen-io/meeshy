/**
 * Rate Limiter Unit Tests
 *
 * Comprehensive tests for rate limiting utility covering:
 * - MemoryStore (in-memory fallback)
 * - RedisStore (distributed rate limiting)
 * - RateLimiter class and middleware
 * - Factory functions for predefined limiters
 * - Window calculations and limit enforcement
 * - Custom key generators and skip functions
 *
 * Run with: npm test -- rate-limiter.test.ts
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock Redis client
class MockPipeline {
  private commands: Array<{ cmd: string; args: any[] }> = [];
  private mockResults: Array<[null | Error, any]> = [];

  constructor(private mockRedis: MockRedis) {}

  incr(key: string): this {
    this.commands.push({ cmd: 'incr', args: [key] });
    return this;
  }

  pttl(key: string): this {
    this.commands.push({ cmd: 'pttl', args: [key] });
    return this;
  }

  async exec(): Promise<Array<[null | Error, any]> | null> {
    if (this.mockRedis.shouldFailPipeline) {
      return null;
    }

    const key = this.commands[0]?.args[0] as string;
    const currentCount = this.mockRedis.incrementAndGetCount(key);
    const ttl = this.mockRedis.getPttl(key);

    return [
      [null, currentCount],
      [null, ttl]
    ];
  }
}

class MockRedis {
  private counters = new Map<string, { count: number; expiresAt: number }>();
  public shouldFailPipeline = false;
  public shouldFailPexpire = false;
  public shouldFailDel = false;
  public pexpireCalled = false;
  public deletedKeys: string[] = [];

  pipeline(): MockPipeline {
    return new MockPipeline(this);
  }

  incrementAndGetCount(key: string): number {
    const now = Date.now();
    const existing = this.counters.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count++;
      return existing.count;
    }

    // New key or expired
    this.counters.set(key, { count: 1, expiresAt: now + 60000 });
    return 1;
  }

  getPttl(key: string): number {
    const existing = this.counters.get(key);
    if (!existing) return -2; // Key doesn't exist
    const ttl = existing.expiresAt - Date.now();
    if (ttl <= 0) return -2;
    return ttl;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    if (this.shouldFailPexpire) {
      throw new Error('Redis pexpire error');
    }
    this.pexpireCalled = true;
    const existing = this.counters.get(key);
    if (existing) {
      existing.expiresAt = Date.now() + milliseconds;
      return 1;
    }
    return 0;
  }

  async del(key: string): Promise<number> {
    if (this.shouldFailDel) {
      throw new Error('Redis del error');
    }
    this.deletedKeys.push(key);
    if (this.counters.has(key)) {
      this.counters.delete(key);
      return 1;
    }
    return 0;
  }

  // Helper for tests
  setCounter(key: string, count: number, expiresAt: number): void {
    this.counters.set(key, { count, expiresAt });
  }

  clearCounters(): void {
    this.counters.clear();
  }
}

// Mock Fastify request and reply
function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    ip: '127.0.0.1',
    ...overrides
  } as FastifyRequest;
}

function createMockReply(): FastifyReply & {
  headers: Map<string, string>;
  statusCode: number;
  sentBody: any;
  statusCalled: boolean;
} {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let sentBody: any = null;
  let statusCalled = false;

  const reply = {
    headers,
    statusCode,
    sentBody,
    statusCalled,
    header(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    status(code: number) {
      statusCode = code;
      this.statusCode = code;
      statusCalled = true;
      this.statusCalled = true;
      return this;
    },
    send(body: any) {
      sentBody = body;
      this.sentBody = body;
      return this;
    }
  };

  return reply as any;
}

// Import the module under test
import {
  RateLimiter,
  createNotificationRateLimiter,
  createGlobalRateLimiter,
  createStrictRateLimiter,
  createBatchRateLimiter,
  createCustomRateLimiter
} from '../../../utils/rate-limiter';
import type { RateLimiterConfig } from '../../../utils/rate-limiter';

describe('RateLimiter', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor and Initialization', () => {
    it('should create a RateLimiter with default values', () => {
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 60000,
        keyPrefix: 'test'
      });

      expect(limiter).toBeDefined();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a RateLimiter with custom message', () => {
      const customMessage = 'Custom rate limit message';
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 60000,
        keyPrefix: 'test',
        message: customMessage
      });

      expect(limiter).toBeDefined();
    });

    it('should create a RateLimiter with Redis store when Redis is provided', () => {
      const mockRedis = new MockRedis();
      const limiter = new RateLimiter(
        {
          max: 100,
          windowMs: 60000,
          keyPrefix: 'test'
        },
        mockRedis as any
      );

      expect(limiter).toBeDefined();
    });

    it('should use MemoryStore when Redis is not provided', () => {
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 60000,
        keyPrefix: 'test'
      });

      expect(limiter).toBeDefined();
    });

    it('should accept custom skip function', () => {
      const skipFn = jest.fn(() => false);
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 60000,
        keyPrefix: 'test',
        skip: skipFn
      });

      expect(limiter).toBeDefined();
    });

    it('should accept custom keyGenerator function', () => {
      const keyGen = jest.fn(() => 'custom-key');
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 60000,
        keyPrefix: 'test',
        keyGenerator: keyGen
      });

      expect(limiter).toBeDefined();
    });
  });

  describe('MemoryStore - Increment Logic', () => {
    it('should increment count for new keys', async () => {
      const limiter = new RateLimiter({
        max: 10,
        windowMs: 60000,
        keyPrefix: 'memory-test'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '192.168.1.1' });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should increment count for existing keys within window', async () => {
      const limiter = new RateLimiter({
        max: 10,
        windowMs: 60000,
        keyPrefix: 'memory-test'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '192.168.1.2' });

      // First request
      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.headers.get('X-RateLimit-Remaining')).toBe('9');

      // Second request
      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('8');

      // Third request
      const reply3 = createMockReply();
      await middleware(request, reply3);
      expect(reply3.headers.get('X-RateLimit-Remaining')).toBe('7');
    });

    it('should reset count when window expires', async () => {
      const limiter = new RateLimiter({
        max: 10,
        windowMs: 1000, // 1 second window
        keyPrefix: 'memory-expire'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '192.168.1.3' });

      // First request
      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.headers.get('X-RateLimit-Remaining')).toBe('9');

      // Advance time past window
      jest.advanceTimersByTime(1500);

      // Should be a new window
      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should cleanup old entries', async () => {
      const limiter = new RateLimiter({
        max: 100,
        windowMs: 100, // Very short window
        keyPrefix: 'memory-cleanup'
      });

      const middleware = limiter.middleware();

      // Create multiple requests from different IPs
      for (let i = 0; i < 5; i++) {
        const request = createMockRequest({ ip: '192.168.2.' + i });
        const reply = createMockReply();
        await middleware(request, reply);
      }

      // Advance time to trigger cleanup
      jest.advanceTimersByTime(200);

      // New request should work fine (entries should be cleaned)
      const request = createMockRequest({ ip: '192.168.2.10' });
      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('99');
    });
  });

  describe('RedisStore - Increment Logic', () => {
    let mockRedis: MockRedis;

    beforeEach(() => {
      mockRedis = new MockRedis();
    });

    it('should increment count using Redis pipeline', async () => {
      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'redis-test'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '10.0.0.1' });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should set expiry on first request', async () => {
      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'redis-expiry'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '10.0.0.2' });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(mockRedis.pexpireCalled).toBe(true);
    });

    it('should throw error when pipeline fails', async () => {
      mockRedis.shouldFailPipeline = true;

      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'redis-fail'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '10.0.0.3' });
      const reply = createMockReply();

      // Should not throw - error is caught and logged
      await middleware(request, reply);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should calculate reset time from TTL', async () => {
      // Set existing counter with known TTL
      mockRedis.setCounter('ratelimit:redis-ttl:ip:10.0.0.4', 5, Date.now() + 30000);

      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'redis-ttl'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '10.0.0.4' });
      const reply = createMockReply();

      await middleware(request, reply);

      const reset = reply.headers.get('X-RateLimit-Reset');
      expect(reset).toBeDefined();
      expect(parseInt(reset!, 10)).toBeGreaterThan(0);
    });
  });

  describe('Middleware - Rate Limit Headers', () => {
    it('should set X-RateLimit-Limit header', async () => {
      const limiter = new RateLimiter({
        max: 50,
        windowMs: 60000,
        keyPrefix: 'header-test'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest();
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Limit')).toBe('50');
    });

    it('should set X-RateLimit-Remaining header', async () => {
      const limiter = new RateLimiter({
        max: 50,
        windowMs: 60000,
        keyPrefix: 'header-remaining'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest();
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('49');
    });

    it('should set X-RateLimit-Reset header', async () => {
      const limiter = new RateLimiter({
        max: 50,
        windowMs: 60000,
        keyPrefix: 'header-reset'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest();
      const reply = createMockReply();

      await middleware(request, reply);

      const reset = reply.headers.get('X-RateLimit-Reset');
      expect(reset).toBeDefined();
      expect(parseInt(reset!, 10)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should set remaining to 0 when limit reached', async () => {
      const limiter = new RateLimiter({
        max: 2,
        windowMs: 60000,
        keyPrefix: 'header-zero'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.0.1' });

      // First request
      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.headers.get('X-RateLimit-Remaining')).toBe('1');

      // Second request
      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('0');

      // Third request - exceeds limit
      const reply3 = createMockReply();
      await middleware(request, reply3);
      expect(reply3.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });

  describe('Middleware - Rate Limit Exceeded', () => {
    it('should return 429 status when limit exceeded', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'exceed-test'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.1.1' });

      // First request - within limit
      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.statusCalled).toBe(false);

      // Second request - exceeds limit
      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.statusCode).toBe(429);
    });

    it('should set Retry-After header when limit exceeded', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'retry-after'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.1.2' });

      // Exhaust limit
      const reply1 = createMockReply();
      await middleware(request, reply1);

      // Exceed limit
      const reply2 = createMockReply();
      await middleware(request, reply2);

      const retryAfter = reply2.headers.get('Retry-After');
      expect(retryAfter).toBeDefined();
      expect(parseInt(retryAfter!, 10)).toBeGreaterThan(0);
    });

    it('should return error body with success false', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'error-body'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.1.3' });

      // Exhaust limit
      const reply1 = createMockReply();
      await middleware(request, reply1);

      // Exceed limit
      const reply2 = createMockReply();
      await middleware(request, reply2);

      expect(reply2.sentBody).toEqual(
        expect.objectContaining({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED'
        })
      );
    });

    it('should include custom message in error body', async () => {
      const customMessage = 'Slow down, partner!';
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'custom-msg',
        message: customMessage
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.1.4' });

      // Exhaust limit
      const reply1 = createMockReply();
      await middleware(request, reply1);

      // Exceed limit
      const reply2 = createMockReply();
      await middleware(request, reply2);

      expect(reply2.sentBody.message).toBe(customMessage);
    });

    it('should include retryAfter and limit in error body', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'error-details'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.1.5' });

      // Exhaust limit
      const reply1 = createMockReply();
      await middleware(request, reply1);

      // Exceed limit
      const reply2 = createMockReply();
      await middleware(request, reply2);

      expect(reply2.sentBody).toEqual(
        expect.objectContaining({
          retryAfter: expect.any(Number),
          limit: 1
        })
      );
    });
  });

  describe('Middleware - Skip Function', () => {
    it('should skip rate limiting when skip returns true', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'skip-true',
        skip: () => true
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.2.1' });

      // Should skip all requests
      for (let i = 0; i < 5; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        // No headers set when skipped
        expect(reply.headers.size).toBe(0);
      }
    });

    it('should not skip rate limiting when skip returns false', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'skip-false',
        skip: () => false
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.2.2' });

      // First request - within limit
      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.headers.has('X-RateLimit-Limit')).toBe(true);

      // Second request - exceeds limit
      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.statusCode).toBe(429);
    });

    it('should handle async skip function', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'skip-async',
        skip: async () => {
          return Promise.resolve(true);
        }
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '172.16.2.3' });

      const reply = createMockReply();
      await middleware(request, reply);

      // Should skip - no headers set
      expect(reply.headers.size).toBe(0);
    });

    it('should skip based on request properties', async () => {
      const limiter = new RateLimiter({
        max: 1,
        windowMs: 60000,
        keyPrefix: 'skip-request',
        skip: (req) => req.ip === '127.0.0.1' // Skip localhost
      });

      const middleware = limiter.middleware();

      // Localhost should be skipped
      const request1 = createMockRequest({ ip: '127.0.0.1' });
      const reply1 = createMockReply();
      await middleware(request1, reply1);
      expect(reply1.headers.size).toBe(0);

      // Other IPs should not be skipped
      const request2 = createMockRequest({ ip: '8.8.8.8' });
      const reply2 = createMockReply();
      await middleware(request2, reply2);
      expect(reply2.headers.has('X-RateLimit-Limit')).toBe(true);
    });
  });

  describe('Middleware - Key Generator', () => {
    it('should use default key generator (IP-based)', async () => {
      const limiter = new RateLimiter({
        max: 5,
        windowMs: 60000,
        keyPrefix: 'key-default'
      });

      const middleware = limiter.middleware();

      // Different IPs should have different limits
      const request1 = createMockRequest({ ip: '1.1.1.1' });
      const reply1 = createMockReply();
      await middleware(request1, reply1);
      expect(reply1.headers.get('X-RateLimit-Remaining')).toBe('4');

      const request2 = createMockRequest({ ip: '2.2.2.2' });
      const reply2 = createMockReply();
      await middleware(request2, reply2);
      expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('4');
    });

    it('should use userId from request.user when available', async () => {
      const limiter = new RateLimiter({
        max: 5,
        windowMs: 60000,
        keyPrefix: 'key-user'
      });

      const middleware = limiter.middleware();

      // Create request with user
      const request = createMockRequest({ ip: '3.3.3.3' }) as any;
      request.user = { userId: 'user-123' };

      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
    });

    it('should use custom key generator', async () => {
      const limiter = new RateLimiter({
        max: 5,
        windowMs: 60000,
        keyPrefix: 'key-custom',
        keyGenerator: (req) => 'api-key:' + ((req as any).headers?.['x-api-key'] || 'none')
      });

      const middleware = limiter.middleware();

      // Create request with API key
      const request = createMockRequest() as any;
      request.headers = { 'x-api-key': 'my-api-key' };

      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
    });

    it('should fallback to "unknown" for missing IP', async () => {
      const limiter = new RateLimiter({
        max: 5,
        windowMs: 60000,
        keyPrefix: 'key-unknown'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: undefined as any });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
    });
  });

  describe('Middleware - Error Handling', () => {
    it('should log error and continue when store fails', async () => {
      const mockRedis = new MockRedis();
      mockRedis.shouldFailPipeline = true;

      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'error-handle'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '5.5.5.5' });
      const reply = createMockReply();

      // Should not throw
      await middleware(request, reply);

      expect(consoleErrorSpy).toHaveBeenCalled();
      // Request should continue without rate limit headers (error path)
    });

    it('should not block request when rate limiter fails', async () => {
      const mockRedis = new MockRedis();
      mockRedis.shouldFailPipeline = true;

      const limiter = new RateLimiter(
        {
          max: 1,
          windowMs: 60000,
          keyPrefix: 'error-continue'
        },
        mockRedis as any
      );

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '6.6.6.6' });

      // Multiple requests should all pass through when limiter fails
      for (let i = 0; i < 3; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        // Should not return 429 when limiter fails
        expect(reply.statusCode).not.toBe(429);
      }
    });
  });

  describe('reset() Method', () => {
    it('should reset rate limit for a specific key (MemoryStore)', async () => {
      const limiter = new RateLimiter({
        max: 2,
        windowMs: 60000,
        keyPrefix: 'reset-memory'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '7.7.7.7' });

      // Use up limit
      const reply1 = createMockReply();
      await middleware(request, reply1);
      const reply2 = createMockReply();
      await middleware(request, reply2);

      // Should be rate limited
      const reply3 = createMockReply();
      await middleware(request, reply3);
      expect(reply3.statusCode).toBe(429);

      // Reset the key
      await limiter.reset('ip:7.7.7.7');

      // Should work again
      const reply4 = createMockReply();
      await middleware(request, reply4);
      expect(reply4.statusCode).not.toBe(429);
      expect(reply4.headers.get('X-RateLimit-Remaining')).toBe('1');
    });

    it('should reset rate limit for a specific key (RedisStore)', async () => {
      const mockRedis = new MockRedis();
      const limiter = new RateLimiter(
        {
          max: 10,
          windowMs: 60000,
          keyPrefix: 'reset-redis'
        },
        mockRedis as any
      );

      await limiter.reset('user:123');

      expect(mockRedis.deletedKeys).toContain('ratelimit:reset-redis:user:123');
    });
  });
});

describe('Factory Functions', () => {
  describe('createNotificationRateLimiter', () => {
    it('should create a notification rate limiter with 100 req/min', () => {
      const limiter = createNotificationRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a notification rate limiter with Redis', () => {
      const mockRedis = new MockRedis();
      const limiter = createNotificationRateLimiter(mockRedis as any);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should use userId for key generation', async () => {
      const limiter = createNotificationRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest() as any;
      request.user = { userId: 'notification-user-1' };

      const reply = createMockReply();
      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Limit')).toBe('100');
    });

    it('should fallback to anonymous for missing userId', async () => {
      const limiter = createNotificationRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest() as any;
      request.user = {};

      const reply = createMockReply();
      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Limit')).toBe('100');
    });
  });

  describe('createGlobalRateLimiter', () => {
    it('should create a global rate limiter with 1000 req/min', () => {
      const limiter = createGlobalRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a global rate limiter with Redis', () => {
      const mockRedis = new MockRedis();
      const limiter = createGlobalRateLimiter(mockRedis as any);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should use IP for key generation', async () => {
      const limiter = createGlobalRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest({ ip: '8.8.8.8' });
      const reply = createMockReply();
      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Limit')).toBe('1000');
    });

    it('should fallback to unknown for missing IP', async () => {
      const limiter = createGlobalRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest({ ip: undefined as any });
      const reply = createMockReply();
      await middleware(request, reply);

      expect(reply.headers.get('X-RateLimit-Limit')).toBe('1000');
    });
  });

  describe('createStrictRateLimiter', () => {
    it('should create a strict rate limiter with 10 req/min', () => {
      const limiter = createStrictRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a strict rate limiter with Redis', () => {
      const mockRedis = new MockRedis();
      const limiter = createStrictRateLimiter(mockRedis as any);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should rate limit at 10 requests', async () => {
      jest.useFakeTimers();

      const limiter = createStrictRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest() as any;
      request.user = { userId: 'strict-user' };

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.statusCode).not.toBe(429);
      }

      // 11th request should be rate limited
      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.statusCode).toBe(429);

      jest.useRealTimers();
    });
  });

  describe('createBatchRateLimiter', () => {
    it('should create a batch rate limiter with 5 req/min', () => {
      const limiter = createBatchRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a batch rate limiter with Redis', () => {
      const mockRedis = new MockRedis();
      const limiter = createBatchRateLimiter(mockRedis as any);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should rate limit at 5 requests', async () => {
      jest.useFakeTimers();

      const limiter = createBatchRateLimiter();
      const middleware = limiter.middleware();

      const request = createMockRequest() as any;
      request.user = { userId: 'batch-user' };

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.statusCode).not.toBe(429);
      }

      // 6th request should be rate limited
      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.statusCode).toBe(429);

      jest.useRealTimers();
    });
  });

  describe('createCustomRateLimiter', () => {
    it('should create a custom rate limiter with provided config', () => {
      const config: RateLimiterConfig = {
        max: 50,
        windowMs: 30000,
        keyPrefix: 'custom'
      };

      const limiter = createCustomRateLimiter(config);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should create a custom rate limiter with Redis', () => {
      const mockRedis = new MockRedis();
      const config: RateLimiterConfig = {
        max: 50,
        windowMs: 30000,
        keyPrefix: 'custom'
      };

      const limiter = createCustomRateLimiter(config, mockRedis as any);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should respect custom configuration', async () => {
      jest.useFakeTimers();

      const limiter = createCustomRateLimiter({
        max: 3,
        windowMs: 10000,
        keyPrefix: 'custom-test',
        message: 'Custom limit exceeded'
      });

      const middleware = limiter.middleware();
      const request = createMockRequest({ ip: '9.9.9.9' });

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.headers.get('X-RateLimit-Limit')).toBe('3');
      }

      // 4th request should be rate limited with custom message
      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.statusCode).toBe(429);
      expect(reply.sentBody.message).toBe('Custom limit exceeded');

      jest.useRealTimers();
    });
  });
});

describe('RateLimiter - Integration Scenarios', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle concurrent requests from multiple users', async () => {
    const limiter = new RateLimiter({
      max: 3,
      windowMs: 60000,
      keyPrefix: 'concurrent'
    });

    const middleware = limiter.middleware();

    // Simulate 3 users making requests
    const users = ['user-a', 'user-b', 'user-c'];

    for (const userId of users) {
      const request = createMockRequest() as any;
      request.user = { userId };

      // Each user makes 3 requests (their limit)
      for (let i = 0; i < 3; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.statusCode).not.toBe(429);
      }

      // 4th request should be rate limited for each user
      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.statusCode).toBe(429);
    }
  });

  it('should reset limits after window expires', async () => {
    const limiter = new RateLimiter({
      max: 2,
      windowMs: 5000, // 5 seconds
      keyPrefix: 'window-reset'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '10.10.10.10' });

    // Use up limit
    for (let i = 0; i < 2; i++) {
      const reply = createMockReply();
      await middleware(request, reply);
    }

    // Should be rate limited
    const reply1 = createMockReply();
    await middleware(request, reply1);
    expect(reply1.statusCode).toBe(429);

    // Advance time past window
    jest.advanceTimersByTime(6000);

    // Should work again
    const reply2 = createMockReply();
    await middleware(request, reply2);
    expect(reply2.statusCode).not.toBe(429);
    expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('should handle API key-based rate limiting', async () => {
    const limiter = new RateLimiter({
      max: 5,
      windowMs: 60000,
      keyPrefix: 'api-key',
      keyGenerator: (req) => {
        const apiKey = (req as any).headers?.['x-api-key'];
        return apiKey ? 'api:' + apiKey : 'ip:' + req.ip;
      }
    });

    const middleware = limiter.middleware();

    // Request with API key
    const request1 = createMockRequest() as any;
    request1.headers = { 'x-api-key': 'premium-key' };

    const reply1 = createMockReply();
    await middleware(request1, reply1);
    expect(reply1.headers.get('X-RateLimit-Limit')).toBe('5');

    // Request without API key (falls back to IP)
    const request2 = createMockRequest({ ip: '11.11.11.11' }) as any;
    request2.headers = {};

    const reply2 = createMockReply();
    await middleware(request2, reply2);
    expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should skip rate limiting for whitelisted IPs', async () => {
    const whitelistedIPs = ['127.0.0.1', '10.0.0.0', '192.168.1.100'];

    const limiter = new RateLimiter({
      max: 1,
      windowMs: 60000,
      keyPrefix: 'whitelist',
      skip: (req) => whitelistedIPs.includes(req.ip)
    });

    const middleware = limiter.middleware();

    // Whitelisted IP should never be rate limited
    const request1 = createMockRequest({ ip: '127.0.0.1' });
    for (let i = 0; i < 5; i++) {
      const reply = createMockReply();
      await middleware(request1, reply);
      expect(reply.headers.size).toBe(0); // No rate limit headers
    }

    // Non-whitelisted IP should be rate limited after 1 request
    const request2 = createMockRequest({ ip: '8.8.4.4' });
    const reply1 = createMockReply();
    await middleware(request2, reply1);
    expect(reply1.statusCode).not.toBe(429);

    const reply2 = createMockReply();
    await middleware(request2, reply2);
    expect(reply2.statusCode).toBe(429);
  });

  it('should handle burst traffic correctly', async () => {
    const limiter = new RateLimiter({
      max: 10,
      windowMs: 1000, // 1 second window
      keyPrefix: 'burst'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '12.12.12.12' });

    // Burst of 15 requests
    const results: number[] = [];
    for (let i = 0; i < 15; i++) {
      const reply = createMockReply();
      await middleware(request, reply);
      results.push(reply.statusCode);
    }

    // First 10 should succeed (200), last 5 should be rate limited (429)
    const successful = results.filter((code) => code !== 429).length;
    const rateLimited = results.filter((code) => code === 429).length;

    expect(successful).toBe(10);
    expect(rateLimited).toBe(5);
  });
});

describe('RateLimiter - Edge Cases', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle very high max values', async () => {
    const limiter = new RateLimiter({
      max: 1000000,
      windowMs: 60000,
      keyPrefix: 'high-max'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '13.13.13.13' });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.headers.get('X-RateLimit-Limit')).toBe('1000000');
    expect(reply.headers.get('X-RateLimit-Remaining')).toBe('999999');
  });

  it('should handle very short window', async () => {
    const limiter = new RateLimiter({
      max: 2,
      windowMs: 100, // 100ms
      keyPrefix: 'short-window'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '14.14.14.14' });

    // Use up limit
    for (let i = 0; i < 2; i++) {
      const reply = createMockReply();
      await middleware(request, reply);
    }

    // Should be rate limited
    const reply1 = createMockReply();
    await middleware(request, reply1);
    expect(reply1.statusCode).toBe(429);

    // Advance time
    jest.advanceTimersByTime(150);

    // Should work again
    const reply2 = createMockReply();
    await middleware(request, reply2);
    expect(reply2.statusCode).not.toBe(429);
  });

  it('should handle IPv6 addresses', async () => {
    const limiter = new RateLimiter({
      max: 5,
      windowMs: 60000,
      keyPrefix: 'ipv6'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should handle empty user object', async () => {
    const limiter = new RateLimiter({
      max: 5,
      windowMs: 60000,
      keyPrefix: 'empty-user'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '15.15.15.15' }) as any;
    request.user = {};

    const reply = createMockReply();
    await middleware(request, reply);

    // Should fallback to IP-based key
    expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should handle special characters in key prefix', async () => {
    const limiter = new RateLimiter({
      max: 5,
      windowMs: 60000,
      keyPrefix: 'special:chars:prefix'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '16.16.16.16' });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should handle zero remaining correctly', async () => {
    const limiter = new RateLimiter({
      max: 1,
      windowMs: 60000,
      keyPrefix: 'zero-remaining'
    });

    const middleware = limiter.middleware();
    const request = createMockRequest({ ip: '17.17.17.17' });

    // First request uses up the limit
    const reply1 = createMockReply();
    await middleware(request, reply1);
    expect(reply1.headers.get('X-RateLimit-Remaining')).toBe('0');

    // Second request exceeds limit
    const reply2 = createMockReply();
    await middleware(request, reply2);
    expect(reply2.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(reply2.statusCode).toBe(429);
  });
});
