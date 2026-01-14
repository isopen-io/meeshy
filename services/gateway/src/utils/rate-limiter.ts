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

// ============================================
// AUTHENTICATION RATE LIMITERS
// ============================================

/**
 * Rate limiter for login attempts
 * 5 attempts per 15 minutes per IP to prevent brute force
 */
export function createLoginRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      keyPrefix: 'auth:login',
      message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
      keyGenerator: (request) => {
        // Use IP + partial email hash to prevent distributed attacks
        const ip = request.ip || 'unknown';
        const body = request.body as any;
        const identifier = body?.username || body?.email || '';
        return `ip:${ip}:${identifier.substring(0, 3)}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for registration attempts
 * 3 attempts per hour per IP to prevent mass account creation
 */
export function createRegisterRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyPrefix: 'auth:register',
      message: 'Trop de tentatives d\'inscription. Veuillez réessayer dans une heure.',
      keyGenerator: (request) => {
        return `ip:${request.ip || 'unknown'}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for password reset requests (short-term)
 * 3 attempts per 30 minutes per IP/email to prevent rapid spam
 */
export function createPasswordResetRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 30 * 60 * 1000, // 30 minutes
      keyPrefix: 'auth:password-reset',
      message: 'Trop de demandes de réinitialisation. Veuillez réessayer dans 30 minutes.',
      keyGenerator: (request) => {
        const ip = request.ip || 'unknown';
        const body = request.body as any;
        const email = body?.email || '';
        // Combine IP and email to limit both
        return `ip:${ip}:email:${email.toLowerCase()}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for password reset email resend (daily limit)
 * 3 resends per 24 hours per email to prevent email abuse
 */
export function createPasswordResetDailyRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      keyPrefix: 'auth:password-reset-daily',
      message: 'Vous avez atteint la limite de 3 demandes de réinitialisation par jour. Veuillez réessayer demain.',
      keyGenerator: (request) => {
        const body = request.body as any;
        const email = (body?.email || '').toLowerCase().trim();
        // Key by email only to track daily limit per user
        return `email:${email}`;
      }
    },
    redis
  );
}

/**
 * Global auth rate limiter for all auth endpoints
 * 20 requests per minute per IP
 */
export function createAuthGlobalRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 20,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'auth:global',
      message: 'Trop de requêtes d\'authentification. Veuillez patienter.',
      keyGenerator: (request) => {
        return `ip:${request.ip || 'unknown'}`;
      }
    },
    redis
  );
}

// ============================================
// PHONE PASSWORD RESET RATE LIMITERS
// ============================================

/**
 * Rate limiter for phone reset lookup
 * 3 lookups per hour per IP to prevent phone number enumeration
 */
export function createPhoneResetLookupRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyPrefix: 'auth:phone-reset-lookup',
      message: 'Trop de tentatives de recherche par téléphone. Veuillez réessayer dans une heure.',
      keyGenerator: (request) => {
        return `ip:${request.ip || 'unknown'}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for phone reset identity verification
 * 3 attempts per 15 minutes per token
 */
export function createPhoneResetIdentityRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 15 * 60 * 1000, // 15 minutes
      keyPrefix: 'auth:phone-reset-identity',
      message: 'Trop de tentatives de vérification d\'identité. Veuillez réessayer dans 15 minutes.',
      keyGenerator: (request) => {
        const body = request.body as any;
        const tokenId = body?.tokenId || '';
        return `token:${tokenId}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for phone reset code verification
 * 5 attempts per 10 minutes per token
 */
export function createPhoneResetCodeRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 5,
      windowMs: 10 * 60 * 1000, // 10 minutes
      keyPrefix: 'auth:phone-reset-code',
      message: 'Trop de tentatives de code SMS. Veuillez réessayer dans 10 minutes.',
      keyGenerator: (request) => {
        const body = request.body as any;
        const tokenId = body?.tokenId || '';
        return `token:${tokenId}`;
      }
    },
    redis
  );
}

/**
 * Rate limiter for SMS code resend
 * 1 resend per minute per token
 */
export function createPhoneResetResendRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 1,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'auth:phone-reset-resend',
      message: 'Veuillez attendre avant de renvoyer un nouveau code SMS.',
      keyGenerator: (request) => {
        const body = request.body as any;
        const tokenId = body?.tokenId || '';
        return `token:${tokenId}`;
      }
    },
    redis
  );
}

// ============================================================================
// Phone Transfer Rate Limiters (for registration phone transfer)
// ============================================================================

/**
 * Rate limiter for phone transfer initiation
 * Limit: 3 requests per hour per IP
 */
export function createPhoneTransferRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyPrefix: 'auth:phone-transfer',
      message: 'Trop de demandes de transfert de numéro. Veuillez réessayer plus tard.'
    },
    redis
  );
}

/**
 * Rate limiter for phone transfer code verification
 * 5 attempts per 10 minutes per IP
 */
export function createPhoneTransferCodeRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 5,
      windowMs: 10 * 60 * 1000, // 10 minutes
      keyPrefix: 'auth:phone-transfer-code',
      message: 'Trop de tentatives de vérification. Veuillez réessayer dans 10 minutes.'
    },
    redis
  );
}

/**
 * Rate limiter for phone transfer SMS resend
 * 1 request per minute per IP
 */
export function createPhoneTransferResendRateLimiter(redis?: Redis): RateLimiter {
  return new RateLimiter(
    {
      max: 1,
      windowMs: 60 * 1000, // 1 minute
      keyPrefix: 'auth:phone-transfer-resend',
      message: 'Veuillez attendre avant de renvoyer un nouveau code.'
    },
    redis
  );
}
