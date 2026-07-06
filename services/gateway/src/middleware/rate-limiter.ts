/**
 * Rate Limiting Middleware for Meeshy Gateway
 *
 * Protects against:
 * - Message spam (max 20 messages/minute)
 * - Mention abuse (max 50 mentions/message, max 5 mentions/minute per recipient)
 * - API abuse (max 300 requests/minute)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { isLocalIp } from '../utils/rate-limiter';
import { UnifiedAuthRequest } from './auth';
import { getCacheStore } from '../services/CacheStore';

/**
 * Rate limiter pour les messages
 * Max 20 messages par minute par utilisateur
 */
export async function registerMessageRateLimiter(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    // RedisStore natif du plugin via l'option `redis`. NE PAS passer une
    // instance à `store` : @fastify/rate-limit fait `new Store(opts)` dessus
    // (index.js) → `new <instance>()` crashe au boot dès que Redis est présent
    // (ex. staging ; en dev sans Redis `makeRedisStore` renvoyait undefined,
    // donc ça ne pétait pas). `skipOnError: true` = fail-open (Redis KO → on
    // laisse passer), comme l'ancien store custom.
    redis: getCacheStore().getNativeClient() ?? undefined,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      // Rate limit par utilisateur
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (authContext && authContext.userId) {
        return `msg:${authContext.userId}`;
      }
      // Fallback sur IP si pas d'auth
      return `msg:ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: 'Trop de messages envoyés. Veuillez patienter avant de réessayer.',
        retryAfter: context.ttl,
        statusCode: 429
      };
    },
    // Ne pas ajouter les headers X-RateLimit-* dans la réponse
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  });
}

/**
 * Rate limiter global pour toutes les routes API
 * Max 300 requêtes par minute par IP (augmenté pour permettre l'édition de liens)
 */
export async function registerGlobalRateLimiter(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    global: true,
    max: 300, // Augmenté de 100 à 300 pour l'édition de liens
    timeWindow: '1 minute',
    // RedisStore natif via `redis` (cf. registerMessageRateLimiter). Passer une
    // instance à `store` crashait le boot en staging (plugin fait `new store()`).
    redis: getCacheStore().getNativeClient() ?? undefined,
    keyGenerator: (request: FastifyRequest) => {
      return `global:${request.ip}`;
    },
    // fail-open sur erreur Redis (availability) — alignement avec l'ancien
    // store custom qui laissait passer en cas d'erreur Redis.
    skipOnError: true,
    skip: (request: FastifyRequest) => {
      const path = request.url.split('?')[0];
      if (path === '/health' || path === '/healthz' || path === '/ready') return true;
      if (isLocalIp(request.ip)) return true;
      return false;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: 'Trop de requêtes. Veuillez réessayer plus tard.',
        retryAfter: context.ttl,
        statusCode: 429
      };
    }
  } as any); // Type cast pour contourner limitation typage @fastify/rate-limit
}

/**
 * Valide qu'un message ne contient pas trop de mentions
 * Max 50 mentions par message
 */
export function validateMentionCount(content: string): { valid: boolean; error?: string } {
  const MAX_MENTIONS_PER_MESSAGE = 50;

  // Extraire les mentions (tiret inclus : charset username /^[a-zA-Z0-9_-]+$/)
  const mentionMatches = content.match(/@([\w-]+)/g);
  const mentionCount = mentionMatches ? mentionMatches.length : 0;

  if (mentionCount > MAX_MENTIONS_PER_MESSAGE) {
    return {
      valid: false,
      error: `Trop de mentions (${mentionCount}/${MAX_MENTIONS_PER_MESSAGE}). Veuillez réduire le nombre de mentions.`
    };
  }

  return { valid: true };
}

/**
 * Hook pour valider le contenu du message avant traitement
 */
export async function messageValidationHook(
  request: FastifyRequest<{ Body: { content?: string } }>,
  reply: FastifyReply
) {
  const { content } = request.body;

  if (!content) {
    return; // Sera géré par la validation de route
  }

  // Valider le nombre de mentions
  const validation = validateMentionCount(content);
  if (!validation.valid) {
    return reply.status(400).send({
      success: false,
      error: validation.error
    });
  }
}

/**
 * Rate-limit configs pour les routes Posts/Stories.
 *
 * Avant : aucune limite par route → un utilisateur authentifie pouvait spammer
 * /posts (creation), /:id/like, /:id/view, /:id/comments via plusieurs sessions
 * en restant sous le plafond global de 300 req/min/IP. Plus important : chaque
 * creation de story declenche 10 requetes ZMQ vers le translator (1 par langue
 * cible hardcodee), donc 10 stories/min = 100 requetes ZMQ/min/utilisateur.
 *
 * Limites :
 * - POST /posts (create) : 10/min — un utilisateur normal poste rarement
 * - POST /posts/:id/like : 30/min — accommoder le toggle rapide
 * - POST /posts/:id/view : 60/min — un viewer parcourt vite plusieurs stories
 * - POST /posts/:id/comments : 20/min
 * - POST /posts/impressions/batch : 10/min — par lot de 50 ids max
 */
export function createPostRouteRateLimitConfig(
  type: 'create' | 'like' | 'view' | 'comment' | 'impression' | 'engagement'
): object {
  const configs = {
    create: { max: 10, label: 'create' },
    like: { max: 30, label: 'like' },
    view: { max: 60, label: 'view' },
    comment: { max: 20, label: 'comment' },
    impression: { max: 10, label: 'impression' },
    engagement: { max: 20, label: 'engagement' },
  };
  const cfg = configs[type];
  return {
    max: cfg.max,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `posts:${cfg.label}:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requetes (posts/${cfg.label}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

/**
 * Rate limiter pour les endpoints Signal Protocol
 *
 * SECURITY: Protège contre:
 * - Key scraping (limite la récupération de bundles de clés)
 * - Session flooding (limite la création de sessions)
 * - Pre-key exhaustion attacks (limite la génération de clés)
 *
 * Limites:
 * - GET /keys/:userId: 30/minute (lookup keys)
 * - POST /keys: 5/minute (generate bundle - rare operation)
 * - POST /session/establish: 20/minute (session creation)
 */
export function createSignalProtocolRateLimitConfig(
  type: 'keys_get' | 'keys_post' | 'session_establish'
): object {
  const configs = {
    keys_get: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:keys:get:${authContext.userId}`;
        }
        return `signal:keys:get:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many key lookup requests. Please wait before trying again.',
        statusCode: 429
      })
    },
    keys_post: {
      max: 5,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:keys:post:${authContext.userId}`;
        }
        return `signal:keys:post:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many key generation requests. Key bundles should only be generated occasionally.',
        statusCode: 429
      })
    },
    session_establish: {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:session:${authContext.userId}`;
        }
        return `signal:session:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many session establishment requests. Please wait before trying again.',
        statusCode: 429
      })
    }
  };

  return configs[type];
}
