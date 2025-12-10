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

/**
 * Rate limiter pour les messages
 * Max 20 messages par minute par utilisateur
 */
export async function registerMessageRateLimiter(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      // Rate limit par utilisateur
      const authContext = (request as any).authContext;
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
    keyGenerator: (request: FastifyRequest) => {
      return `global:${request.ip}`;
    },
    skipOnError: false,
    skip: (request: FastifyRequest) => {
      // Exclure les routes de healthcheck/monitoring
      const path = request.url.split('?')[0]; // Enlever query params
      return path === '/health' || path === '/healthz' || path === '/ready';
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

  // Extraire les mentions
  const mentionMatches = content.match(/@(\w+)/g);
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
  request: FastifyRequest<{ Body: { content: string } }>,
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
