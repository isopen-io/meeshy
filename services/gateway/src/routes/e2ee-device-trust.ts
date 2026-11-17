/**
 * LE RELAIS DE LA CONFIRMATION D'UN APPAREIL PAR CODE (#19156), sous `/api/v1` :
 *
 * | Méthode | Chemin | Rôle |
 * |---|---|---|
 * | `POST` | `/e2ee/devices/self/verifications` | `{ to: "others" \| { deviceId, registrationId }, message }` → `{ ids, recipients }` |
 * | `GET` | `/e2ee/devices/self/verifications?after=` | les messages non expirés adressés à la génération de CET appareil |
 * | `POST` | `/e2ee/devices/self/verifications/ack` | `{ ids }` : retire, parmi eux, ceux de la génération de l'appelant |
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 5.2.
 * Même appelant que les autres routes `/e2ee` : un compte inscrit et la session (`sid`) de
 * l'appareil. Même juge que la socket `e2ee:send-verification` (`E2EEDeviceVerificationRelay`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DEVICE_VERIFICATION_ERROR_CODES, deviceVerificationAckSchema, deviceVerificationListQuerySchema } from '@meeshy/shared/types/e2ee-device-trust';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { AUTH_ERROR_CODES } from '../utils/auth-error-codes';
import { enhancedLogger } from '../utils/logger-enhanced';
import { sendBadRequest, sendError, sendInternalError, sendSuccess, sendUnauthorized } from '../utils/response.js';
import { DeviceVerificationRefusedError, type E2EEDeviceVerificationRelay, type VerificationCaller } from '../services/e2ee/E2EEDeviceVerificationRelay';
import { deviceTrustRuntime } from '../services/e2ee/device-trust-runtime';

const logger = enhancedLogger.child({ module: 'E2EEDeviceTrustRoutes' });

export type E2EEDeviceTrustRouteDeps = {
  readonly auth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly relay: E2EEDeviceVerificationRelay;
};

function callerOf(request: FastifyRequest): VerificationCaller | null {
  const context = (request as UnifiedAuthRequest).authContext;
  if (!context?.isAuthenticated || context.isAnonymous || !context.userId || !context.sessionId) return null;
  return { userId: context.userId, sessionId: context.sessionId };
}

function sendRefusal(reply: FastifyReply, error: unknown): void {
  if (error instanceof DeviceVerificationRefusedError) {
    if (error.retryAfter !== undefined) reply.header('Retry-After', String(error.retryAfter));
    return sendError(reply, error.status, error.message, { code: error.code });
  }
  logger.error('e2ee device verification route failed', { error });
  return sendInternalError(reply, 'Erreur interne du relais de confirmation');
}

type Handler = (request: FastifyRequest, reply: FastifyReply, caller: VerificationCaller) => Promise<void>;

const guarded = (handler: Handler) => async (request: FastifyRequest, reply: FastifyReply) => {
  const caller = callerOf(request);
  if (!caller) return sendUnauthorized(reply, 'Un compte inscrit et une session d’appareil sont requis', { code: AUTH_ERROR_CODES.SESSION_INVALID });
  try {
    return await handler(request, reply, caller);
  } catch (error) {
    return sendRefusal(reply, error);
  }
};

const invalid = (reply: FastifyReply) => sendBadRequest(reply, 'Requête de confirmation invalide', { code: DEVICE_VERIFICATION_ERROR_CODES.INVALID });

export function registerE2EEDeviceTrustRoutes(fastify: FastifyInstance, deps: E2EEDeviceTrustRouteDeps): void {
  const preValidation = [deps.auth];

  fastify.post('/e2ee/devices/self/verifications', { preValidation }, guarded(async (request, reply, caller) =>
    sendSuccess(reply, await deps.relay.send({ caller, payload: request.body }), { statusCode: 201 }),
  ));

  fastify.get('/e2ee/devices/self/verifications', { preValidation }, guarded(async (request, reply, caller) => {
    const query = deviceVerificationListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalid(reply);
    const verifications = await deps.relay.list({ caller, after: query.data.after });
    return sendSuccess(reply, { verifications, nextCursor: verifications.at(-1)?.id ?? null });
  }));

  fastify.post('/e2ee/devices/self/verifications/ack', { preValidation }, guarded(async (request, reply, caller) => {
    const body = deviceVerificationAckSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return sendSuccess(reply, { acknowledged: await deps.relay.ack({ caller, ids: body.data.ids }) });
  }));
}

export default async function e2eeDeviceTrustRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  registerE2EEDeviceTrustRoutes(fastify, {
    auth: createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false }),
    relay: deviceTrustRuntime(prisma).relay,
  });
}
