/**
 * POST /auth/verification/status — L'ÉCRAN DU CODE APPREND QUE L'ADRESSE A ÉTÉ
 * PROUVÉE AILLEURS (#8083).
 *
 * Recette : lien de l'e-mail ouvert sur l'ordinateur, écran du code figé sur le
 * téléphone. Décision porteur « si et seulement si » : le téléphone ne se
 * connecte que par le code saisi sur lui ou le lien ouvert sur lui — cette
 * route ne rend donc qu'un ÉTAT (`pending` / `proven`), pour que l'écran puisse
 * dire « Adresse confirmée — saisissez le code reçu ». Jamais une session,
 * jamais l'adresse (`services/auth/email-verification-watch.ts`).
 *
 * Débit : l'écran interroge toutes les ~3 s au premier plan (20 par minute) —
 * 40 par minute et par jeton laisse le double de marge, 120 par minute et par
 * IP couvre quelques appareils derrière une même sortie réseau tout en bornant
 * celui qui tournerait les jetons. La clé de débit porte l'EMPREINTE du jeton,
 * jamais le jeton.
 *
 * @module routes/auth/verification-status
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  errorResponseSchema,
  verificationStatusRequestSchema,
  verificationStatusResponseSchema,
} from '@meeshy/shared/types';

import type { AuthRouteContext } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { sendGone, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response';
import {
  emailVerificationWatchHash,
  readEmailVerificationWatch,
} from '../../services/auth/email-verification-watch';

const logger = enhancedLogger.child({ module: 'VerificationStatus' });

const MINUTE_MS = 60 * 1000;
export const VERIFICATION_STATUS_READS_PER_TOKEN_PER_MINUTE = 40;
export const VERIFICATION_STATUS_READS_PER_IP_PER_MINUTE = 120;

const tokenOf = (request: FastifyRequest): string => {
  const body = request.body as { pendingSessionToken?: unknown } | undefined;
  return typeof body?.pendingSessionToken === 'string' ? body.pendingSessionToken.trim() : '';
};

export function registerVerificationStatusRoute(context: Pick<AuthRouteContext, 'fastify' | 'prisma' | 'redis'>) {
  const { fastify } = context;

  const ipLimiter = createCustomRateLimiter(
    {
      max: VERIFICATION_STATUS_READS_PER_IP_PER_MINUTE,
      windowMs: MINUTE_MS,
      keyPrefix: 'auth:verification-status:ip',
      message: 'Trop de demandes. Veuillez réessayer dans une minute.',
      keyGenerator: (request) => `ip:${request.ip || 'unknown'}`,
    },
    context.redis ?? undefined,
  );
  const tokenLimiter = createCustomRateLimiter(
    {
      max: VERIFICATION_STATUS_READS_PER_TOKEN_PER_MINUTE,
      windowMs: MINUTE_MS,
      keyPrefix: 'auth:verification-status:watch',
      message: 'Trop de demandes. Veuillez réessayer dans une minute.',
      keyGenerator: (request) => `watch:${emailVerificationWatchHash(tokenOf(request))}`,
    },
    context.redis ?? undefined,
  );

  fastify.post('/verification/status', {
    schema: {
      description:
        'Has the address been proven (code or link, on any device) since THIS device received `pendingSessionToken` with its `verification-required` response? Returns `pending` or `proven` — never a session, never the address (#8083): the device still signs in only with the code typed on it or the link opened on it. Unknown token: 401 `PENDING_TOKEN_INVALID`; expired: 410 `PENDING_TOKEN_EXPIRED`. Rate limited per token and per IP.',
      tags: ['auth'],
      summary: 'Email verification status for a pending device',
      body: verificationStatusRequestSchema,
      response: {
        200: verificationStatusResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        410: errorResponseSchema,
        429: {
          description: 'Too many status reads',
          ...errorResponseSchema,
          properties: { ...errorResponseSchema.properties, retryAfter: { type: 'number' } },
        },
        500: errorResponseSchema,
      },
      security: [],
    },
    preHandler: [ipLimiter.middleware(), tokenLimiter.middleware()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await readEmailVerificationWatch(context.prisma, tokenOf(request));

      if (status.kind === 'unknown') {
        logger.warn('attente inconnue');
        return sendUnauthorized(reply, "Jeton d'attente invalide.", { code: 'PENDING_TOKEN_INVALID' });
      }
      if (status.kind === 'expired') {
        return sendGone(reply, "Jeton d'attente expiré.", { code: 'PENDING_TOKEN_EXPIRED' });
      }
      return sendSuccess(reply, { status: status.kind });
    } catch (error) {
      logger.error('lecture de l’attente impossible', error as Error);
      return sendInternalError(reply, 'Erreur lors de la lecture de la vérification');
    }
  });
}
