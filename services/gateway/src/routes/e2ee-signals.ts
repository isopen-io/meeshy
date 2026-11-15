/**
 * LA ROUTE UNIQUE DES SIGNAUX CHIFFRÉS (#13142) :
 * `POST /api/v1/e2ee/conversations/:conversationId/signals`.
 *
 * Réaction, frappe, accusé, progression de lecture, modification, suppression
 * pour tous, vue unique, épinglage : dans une conversation e2ee, la passerelle
 * n'a plus qu'une porte, et elle ne sait pas quel signal la franchit. La charge
 * ne porte que des enveloppes libsignal ; tout autre champ est retiré par Zod,
 * jamais rangé. Même appelant que les autres routes `/e2ee` : un compte inscrit
 * et la session de l'appareil émetteur.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { containsPrivateKeyField, E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { e2eeSignalRelayRequestSchema } from '@meeshy/shared/types/e2ee-signals';
import { createE2EESignalRelay, type E2EESignalRelay } from '../services/e2ee/E2EESignalRelay';
import { wakeE2EEDevices } from '../services/e2ee/e2ee-wake';
import { E2eeRelayRefusedError } from '../services/e2ee/e2ee-relay-errors';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { AUTH_ERROR_CODES } from '../utils/auth-error-codes';
import { enhancedLogger } from '../utils/logger-enhanced';
import { sendBadRequest, sendError, sendInternalError, sendSuccess, sendUnauthorized } from '../utils/response.js';

const logger = enhancedLogger.child({ module: 'E2EESignalRoutes' });

const conversationIdParam = z.string().regex(/^[a-f0-9]{24}$/);

/**
 * La frappe et les accusés sont regroupés côté client (cadence bornée, lots) :
 * 240 signaux par minute et par compte couvrent une conversation vive sans
 * laisser un appareil inonder ses correspondants.
 */
const signalRateLimit = {
  max: 240,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => `e2ee:signals:${(request as UnifiedAuthRequest).authContext?.userId ?? `ip:${request.ip}`}`,
  errorResponseBuilder: () => ({ success: false, error: 'Trop de signaux chiffrés. Patientez avant de réessayer.', statusCode: 429 }),
};

export type E2EESignalRouteDeps = {
  readonly auth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly signals: E2EESignalRelay;
};

const invalid = (reply: FastifyReply) => sendBadRequest(reply, 'Signal chiffré invalide', { code: E2EE_ERROR_CODES.ENVELOPES_INVALID });

function sendRefusal(reply: FastifyReply, error: unknown): void {
  if (error instanceof E2eeRelayRefusedError) {
    return sendError(reply, error.status, error.message, {
      code: error.code,
      ...(error.mismatch ? { details: { ...error.mismatch } } : {}),
    });
  }
  logger.error('e2ee signal relay failed', { error });
  return sendInternalError(reply, 'Erreur interne du relais chiffré');
}

export function registerE2EESignalRoutes(fastify: FastifyInstance, deps: E2EESignalRouteDeps): void {
  fastify.post(
    '/e2ee/conversations/:conversationId/signals',
    { preValidation: [deps.auth], config: { rateLimit: signalRateLimit } },
    async (request, reply) => {
      const context = (request as UnifiedAuthRequest).authContext;
      if (!context?.isAuthenticated || context.isAnonymous || !context.userId || !context.sessionId) {
        return sendUnauthorized(reply, 'Un compte inscrit et une session d’appareil sont requis', { code: AUTH_ERROR_CODES.SESSION_INVALID });
      }
      const conversationId = conversationIdParam.safeParse((request.params as { conversationId?: string }).conversationId);
      if (!conversationId.success || containsPrivateKeyField(request.body)) return invalid(reply);
      const body = e2eeSignalRelayRequestSchema.safeParse(request.body);
      if (!body.success) return invalid(reply);
      try {
        const relayed = await deps.signals.relay({
          conversationId: conversationId.data,
          senderUserId: context.userId,
          sessionId: context.sessionId,
          request: body.data,
        });
        return sendSuccess(reply, relayed);
      } catch (error) {
        return sendRefusal(reply, error);
      }
    },
  );
}

export default async function e2eeSignalRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  registerE2EESignalRoutes(fastify, {
    auth: createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false }),
    signals: createE2EESignalRelay({ prisma, wake: wakeE2EEDevices(prisma) }),
  });
}
