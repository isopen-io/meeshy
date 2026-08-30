/**
 * Rate Limiting Middleware - Protects REST endpoints from DoS attacks
 *
 * CVE-002 Fix: Implements configurable rate limiting using @fastify/rate-limit
 * to prevent denial-of-service attacks via excessive requests
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { logger } from '../utils/logger.js';
import { UnifiedAuthRequest } from './auth';

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
    cache: 10000,
    // Pas d'`allowList` fondée sur la forme de l'adresse. Elle valait
    // `(req) => isLocalIp(req.ip)`, ce qui, derrière Traefik sur un réseau
    // Docker (`request.ip` en 172.16.0.0/12 pour tout le monde), exemptait la
    // planète entière. Cette fonction n'est aujourd'hui montée nulle part —
    // raison de plus pour ne pas y laisser le piège en attendant : la remonter
    // telle quelle aurait rouvert le défaut de #4137 sans qu'aucun témoin ne
    // rougisse.
    redis: fastify.redis ?? undefined, // Use Redis for distributed rate limiting (if available)
    skipOnError: true, // Don't block requests if Redis is down
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP address
      const userId = (request as UnifiedAuthRequest).authContext?.userId;
      if (userId) {
        return `user:${userId}`;
      }
      return request.ip || 'unknown';
    },
    errorResponseBuilder: (request, context) => {
      logger.warn('Rate limit exceeded', {
        ip: request.ip,
        userId: (request as UnifiedAuthRequest).authContext?.userId,
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
    redisEnabled: !!fastify.redis
  });
}

/**
 * Creates a custom rate limiter for specific endpoints
 *
 * CVE-002 follow-up (dette keygen-calls) : sans `keyGenerator` explicite, une
 * config de route ne remplace que `max`/`timeWindow` — elle HERITE du
 * `keyGenerator` du plugin global enregistre par ailleurs (`global:${request.ip}`,
 * cf. middleware/rate-limiter.ts#registerGlobalRateLimiter). Le gateway tourne
 * avec `trustProxy` depuis #4137 : `request.ip` est l'adresse de l'appelant,
 * IDENTIQUE pour TOUS les utilisateurs. Une limite "5/min" par route devenait
 * donc un seau plateforme unique partage par tout le monde.
 *
 * Meme pattern que createPostRouteRateLimitConfig / createSoundRouteRateLimitConfig
 * / createSignalProtocolRateLimitConfig (middleware/rate-limiter.ts) : cle PAR
 * UTILISATEUR (authContext.userId), repli IP, namespace par label pour que
 * chaque route calls ait son propre seau.
 *
 * @param max - Maximum requests allowed
 * @param timeWindow - Time window in ms or string (e.g., '1 minute')
 * @param label - Route namespace (evite les collisions de seau entre routes)
 * @returns Rate limit configuration
 */
export function createRateLimitConfig(
  max: number,
  timeWindow: number | string,
  label: string
) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow,
        keyGenerator: (request: FastifyRequest) => {
          const userId = (request as UnifiedAuthRequest).authContext?.userId;
          const id = userId ?? `ip:${request.ip}`;
          return `calls:${label}:${id}`;
        },
        errorResponseBuilder: () => ({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests (calls/${label}). Please try again later.`
          }
        })
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
    RATE_LIMITS.INITIATE_CALL.timeWindow,
    'initiate'
  ),
  joinCall: createRateLimitConfig(
    RATE_LIMITS.JOIN_CALL.max,
    RATE_LIMITS.JOIN_CALL.timeWindow,
    'join'
  ),
  callOperations: createRateLimitConfig(
    RATE_LIMITS.CALL_OPERATIONS.max,
    RATE_LIMITS.CALL_OPERATIONS.timeWindow,
    'operations'
  )
};
