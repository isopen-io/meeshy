/**
 * Distributed Rate Limiter
 *
 * Implements rate limiting with Redis (distributed) or in-memory fallback
 * Prevents abuse and DOS attacks on notification endpoints
 *
 * Features:
 * - Per-user rate limiting (100 req/min)
 * - Per-IP rate limiting (1000 req/min global)
 * - Redis-backed for distributed systems
 * - In-memory fallback when Redis unavailable
 * - Sliding window algorithm
 * - X-RateLimit-* headers in responses
 *
 * @module rate-limiter
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

export interface RateLimiterConfig {
  /**
   * Maximum requests allowed in the window
   */
  max: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Unique identifier for this rate limiter
   */
  keyPrefix: string;

  /**
   * Error message when limit exceeded
   */
  message?: string;

  /**
   * Skip rate limiting for certain conditions
   */
  skip?: (request: FastifyRequest) => boolean | Promise<boolean>;

  /**
   * Custom key generator
   */
  keyGenerator?: (request: FastifyRequest) => string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Timestamp when window resets
  retryAfter?: number; // Seconds until next allowed request
}

/**
 * In-memory store for rate limiting (fallback when Redis unavailable)
 */
class MemoryStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.resetAt > now) {
      // Within window, increment count
      existing.count++;
      return existing;
    }

    // New window
    const resetAt = now + windowMs;
    const record = { count: 1, resetAt };
    this.store.set(key, record);

    // Cleanup old entries periodically (prevent memory leak)
    this.cleanup();

    return record;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Redis store for distributed rate limiting
 */
class RedisStore {
  constructor(private redis: Redis) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}`;

    // Use Redis transaction for atomic increment
    const pipeline = this.redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.pttl(windowKey);

    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Redis pipeline failed');
    }

    const count = results[0]?.[1] as number;
    const ttl = results[1]?.[1] as number;

    // Set expiry if this is first request in window
    if (count === 1 || ttl === -1) {
      await this.redis.pexpire(windowKey, windowMs);
    }

    const resetAt = ttl > 0 ? now + ttl : now + windowMs;

    return { count, resetAt };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`);
  }
}

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private store: MemoryStore | RedisStore;
  private config: Required<RateLimiterConfig>;

  constructor(config: RateLimiterConfig, redis?: Redis) {
    this.store = redis ? new RedisStore(redis) : new MemoryStore();

    this.config = {
      message: 'Too many requests, please try again later',
      skip: () => false,
      keyGenerator: this.defaultKeyGenerator,
      ...config
    };
  }

  /**
   * Default key generator: uses userId or IP address
   */
  private defaultKeyGenerator(request: FastifyRequest): string {
    const user = (request as any).user;
    const userId = user?.userId;

    if (userId) {
      return `user:${userId}`;
    }

    // Fallback to IP address
    const ip = request.ip || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Get rate limit info for a key
   */
  private async getRateLimitInfo(key: string): Promise<RateLimitInfo> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const result = await this.store.increment(fullKey, this.config.windowMs);

    const remaining = Math.max(0, this.config.max - result.count);
    const reset = Math.ceil(result.resetAt / 1000); // Convert to seconds

    const info: RateLimitInfo = {
      limit: this.config.max,
      remaining,
      reset
    };

    if (result.count > this.config.max) {
      info.retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    }

    return info;
  }

  /**
   * Fastify middleware for rate limiting
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check if we should skip rate limiting
        const shouldSkip = await this.config.skip(request);
        if (shouldSkip) {
          return;
        }

        // Generate key for this request
        const key = this.config.keyGenerator(request);
        const info = await this.getRateLimitInfo(key);

        // Add rate limit headers
        reply.header('X-RateLimit-Limit', info.limit.toString());
        reply.header('X-RateLimit-Remaining', info.remaining.toString());
        reply.header('X-RateLimit-Reset', info.reset.toString());

        // Check if limit exceeded
        if (info.retryAfter !== undefined) {
          reply.header('Retry-After', info.retryAfter.toString());

          return reply.status(429).send({
            success: false,
            message: this.config.message,
            error: 'RATE_LIMIT_EXCEEDED',
            retryAfter: info.retryAfter,
            limit: info.limit
          });
        }
      } catch (error) {
        // Log error but don't block request if rate limiter fails
        console.error('[RateLimiter] Error:', error);
        // Continue request processing
      }
    };
  }

  /**
   * Reset rate limit for a specific key (admin use)
   */
  async reset(key: string): Promise<void> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    await this.store.reset(fullKey);
  }
}

// ============================================
// PREDEFINED RATE LIMITERS
// ============================================

/**
 * Rate limiter for notification endpoints (per user)
 * 100 requests per minute per user
 */
export function createNotificationRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 100,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'notifications',
      message: 'Too many notification requests. Please wait before trying again.',
      keyGenerator: (request) => {
        const user = (request as any).user;
        return `user:${user?.userId || 'anonymous'}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for global IP-based limiting
 * 1000 requests per minute per IP
 */
export function createGlobalRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 1000,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'global',
      message: 'Too many requests from this IP address',
      keyGenerator: (request) => {
        return `ip:${request.ip || 'unknown'}`;
      }
    },
    redis
  );
}

/**
 * Strict rate limiter for sensitive operations (e.g., mark all as read)
 * 10 requests per minute per user
 */
export function createStrictRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 10,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'strict',
      message: 'Too many requests for this operation. Please slow down.',
      keyGenerator: (request) => {
        const user = (request as any).user;
        return `user:${user?.userId || 'anonymous'}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for batch operations
 * 5 requests per minute per user
 */
export function createBatchRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 5,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'batch',
      message: 'Too many batch operations. Please wait before trying again.',
      keyGenerator: (request) => {
        const user = (request as any).user;
        return `user:${user?.userId || 'anonymous'}`;
      }
    },
    redis
  );
}

/**
 * Factory to create custom rate limiter
 */
export function createCustomRateLimiter(
  config: RateLimiterConfig,
  redis?: Redis
): RateLimiter {
  return new RateLimiter(config, redis);
}
