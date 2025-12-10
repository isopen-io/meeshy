/**
 * Rate Limiting Middleware - Protects REST endpoints from DoS attacks
 *
 * CVE-002 Fix: Implements configurable rate limiting using @fastify/rate-limit
 * to prevent denial-of-service attacks via excessive requests
 */

import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { logger } from '../utils/logger.js';

/**
 * Rate limit configuration per endpoint
 */
export const RATE_LIMITS = {
  // Call initiation - strict limit to prevent spam
  INITIATE_CALL: {
    max: 5,
    timeWindow: '1 minute',
    description: 'POST /api/calls'
  },

  // Join call - moderate limit
  JOIN_CALL: {
    max: 20,
    timeWindow: '1 minute',
    description: 'GET /api/calls/:callId, POST /api/calls/:callId/participants'
  },

  // General call operations
  CALL_OPERATIONS: {
    max: 10,
    timeWindow: '1 minute',
    description: 'Other call-related endpoints'
  },

  // Default for all other endpoints
  DEFAULT: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000')
  }
};

/**
 * Register global rate limiting plugin
 *
 * @param fastify - Fastify instance
 */
export async function registerRateLimiting(fastify: FastifyInstance): Promise<void> {
  // Check if rate limiting is enabled
  const isEnabled = process.env.ENABLE_RATE_LIMITING !== 'false';

  if (!isEnabled) {
    logger.warn('⚠️ Rate limiting is DISABLED - not recommended for production');
    return;
  }

  // Register rate limit plugin with Redis for distributed rate limiting
  await fastify.register(rateLimit, {
    global: true,
    max: RATE_LIMITS.DEFAULT.max,
    timeWindow: RATE_LIMITS.DEFAULT.timeWindow,
    cache: 10000, // Cache size for in-memory store
    allowList: [], // IPs to exclude from rate limiting
    redis: (fastify as any).redis, // Use Redis for distributed rate limiting (if available)
    skipOnError: true, // Don't block requests if Redis is down
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP address
      const userId = (request as any).authContext?.userId;
      if (userId) {
        return `user:${userId}`;
      }
      return request.ip || 'unknown';
    },
    errorResponseBuilder: (request, context) => {
      logger.warn('Rate limit exceeded', {
        ip: request.ip,
        userId: (request as any).authContext?.userId,
        path: request.url,
        limit: context.max,
        after: context.after
      });

      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again after ${context.after}`,
          retryAfter: context.after
        }
      };
    },
    onExceeding: (request, key) => {
      logger.debug('Rate limit warning', {
        key,
        ip: request.ip,
        path: request.url
      });
    }
  });

  logger.info('✅ Rate limiting enabled', {
    defaultMax: RATE_LIMITS.DEFAULT.max,
    defaultWindow: RATE_LIMITS.DEFAULT.timeWindow,
    redisEnabled: !!( fastify as any).redis
  });
}

/**
 * Creates a custom rate limiter for specific endpoints
 *
 * @param max - Maximum requests allowed
 * @param timeWindow - Time window in ms or string (e.g., '1 minute')
 * @returns Rate limit configuration
 */
export function createRateLimitConfig(max: number, timeWindow: number | string) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow
      }
    }
  };
}

/**
 * Route-specific rate limit configurations
 */
export const ROUTE_RATE_LIMITS = {
  initiateCall: createRateLimitConfig(
    RATE_LIMITS.INITIATE_CALL.max,
    RATE_LIMITS.INITIATE_CALL.timeWindow
  ),
  joinCall: createRateLimitConfig(
    RATE_LIMITS.JOIN_CALL.max,
    RATE_LIMITS.JOIN_CALL.timeWindow
  ),
  callOperations: createRateLimitConfig(
    RATE_LIMITS.CALL_OPERATIONS.max,
    RATE_LIMITS.CALL_OPERATIONS.timeWindow
  )
};
