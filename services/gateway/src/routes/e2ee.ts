/**
 * Routes de l'ANNUAIRE E2EE PAR APPAREIL et du RELAIS D'ENVELOPPES (#3706).
 * Spécification `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`
 * § 3.3 et § 4.3 ; décision passerelle du 2026-10-23.
 *
 * Préfixe `/api/v1/e2ee/`. Les routes `/signal/*` restent servies, inchangées,
 * aux clients publiés (#9223) ; aucun nouveau client ne les lit.
 *
 * Chaque appel exige un compte inscrit ET la session (`sid`) qui identifie
 * l'appareil : la publication des clés, la lecture des enveloppes et leur
 * accusé ne se font qu'au nom de l'appareil lié à cette session.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  containsPrivateKeyField,
  E2EE_ERROR_CODES,
  e2eeDeviceIdSchema,
  e2eeEnrollDeviceRequestSchema,
  e2eePublishKeysRequestSchema,
} from '@meeshy/shared/types/e2ee-directory';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendSuccess, sendUnauthorized } from '../utils/response.js';
import { enhancedLogger } from '../utils/logger-enhanced';
import { AUTH_ERROR_CODES } from '../utils/auth-error-codes';
import { createE2EEDirectory, E2EEDirectoryError, type E2EEDirectory } from '../services/e2ee/E2EEDirectory';
import { createE2EEEnvelopeRelay, type E2EEEnvelopeRelay } from '../services/e2ee/E2EEEnvelopeRelay';
import { E2eeRelayRefusedError } from '../services/e2ee/e2ee-relay-errors';
import { libsignalSignatureVerifier, loadLibsignal } from '../services/e2ee/signature-verifier';
import { mayReadKeysOf } from '../services/e2ee/key-access';
import { joinSessionSocketsToDeviceRoom } from '../services/e2ee/device-room';
import { currentE2EEIO } from '../services/e2ee/envelope-delivery';
import { invalidateSession } from '../services/SessionService';
import { disconnectSession } from '../socketio/disconnectSession';

const logger = enhancedLogger.child({ module: 'E2EERoutes' });

const objectIdParam = z.string().regex(/^[a-f0-9]{24}$/);
const deviceIdParam = z.coerce.number().pipe(e2eeDeviceIdSchema);
const deviceIdsQuery = z
  .string()
  .max(512)
  .transform((raw) => raw.split(',').map((part) => Number(part.trim())))
  .pipe(z.array(e2eeDeviceIdSchema).max(127));
const envelopeListQuery = z.object({ after: objectIdParam.optional(), limit: z.coerce.number().int().min(1).max(200).optional() });
const ackBody = z.object({ ids: z.array(objectIdParam).min(1).max(200) });

/** Lecture de bundles : 30 par minute et par couple (demandeur, cible). */
const bundleRateLimit = {
  max: 30,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => {
    const requester = (request as UnifiedAuthRequest).authContext?.userId ?? `ip:${request.ip}`;
    return `e2ee:keys:${requester}:${(request.params as { userId?: string }).userId ?? '-'}`;
  },
  errorResponseBuilder: () => ({ success: false, error: 'Trop de demandes de clés. Patientez avant de réessayer.', statusCode: 429 }),
};

/** Écritures de l'annuaire : 10 par minute et par compte (un appareil publie rarement). */
const directoryWriteRateLimit = {
  max: 10,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => `e2ee:write:${(request as UnifiedAuthRequest).authContext?.userId ?? `ip:${request.ip}`}`,
  errorResponseBuilder: () => ({ success: false, error: 'Trop de publications de clés. Patientez avant de réessayer.', statusCode: 429 }),
};

type Caller = { readonly userId: string; readonly sessionId: string };

export type E2EERouteDeps = {
  readonly auth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly directory: E2EEDirectory;
  readonly relay: E2EEEnvelopeRelay;
  readonly mayReadKeysOf: (requesterUserId: string, targetUserId: string) => Promise<boolean>;
  /**
   * Retirer un appareil depuis une AUTRE session ferme aussi la sienne (#13013) :
   * sans quoi un appareil volé, toujours connecté, se réenrôle aussitôt sous une
   * identité neuve et reçoit de nouveau les messages chiffrés.
   */
  readonly closeSession: (session: { readonly userId: string; readonly sessionId: string }) => Promise<void>;
  /** Après un enrôlement : les sockets déjà ouvertes de la session rejoignent la room de l'appareil. */
  readonly onEnrolled?: (enrolled: Caller & { readonly deviceId: number; readonly registrationId: number }) => Promise<void>;
};

function callerOf(request: FastifyRequest): Caller | null {
  const context = (request as UnifiedAuthRequest).authContext;
  if (!context?.isAuthenticated || context.isAnonymous || !context.userId || !context.sessionId) return null;
  return { userId: context.userId, sessionId: context.sessionId };
}

function sendRefusal(reply: FastifyReply, error: unknown): void {
  if (error instanceof E2EEDirectoryError || error instanceof E2eeRelayRefusedError) {
    return sendError(reply, error.status, error.message, { code: error.code });
  }
  logger.error('e2ee route failed', { error });
  return sendInternalError(reply, 'Erreur interne de l’annuaire chiffré');
}

type Handler = (request: FastifyRequest, reply: FastifyReply, caller: Caller) => Promise<void>;

const guarded = (handler: Handler) => async (request: FastifyRequest, reply: FastifyReply) => {
  const caller = callerOf(request);
  // Le middleware a déjà refusé tout appelant sans compte : il ne reste ici qu'un jeton sans session nommée (`sid`).
  if (!caller) return sendUnauthorized(reply, 'Un compte inscrit et une session d’appareil sont requis', { code: AUTH_ERROR_CODES.SESSION_INVALID });
  try {
    return await handler(request, reply, caller);
  } catch (error) {
    return sendRefusal(reply, error);
  }
};

const parsedOr400 = <T>(reply: FastifyReply, result: z.ZodSafeParseResult<T>): T | null => {
  if (result.success) return result.data;
  sendBadRequest(reply, 'Requête E2EE invalide', { code: E2EE_ERROR_CODES.ENVELOPES_INVALID });
  return null;
};

const withoutPrivateKeys = (reply: FastifyReply, body: unknown): boolean => {
  if (!containsPrivateKeyField(body)) return true;
  sendBadRequest(reply, 'Le serveur ne reçoit jamais de clé privée', { code: E2EE_ERROR_CODES.ENVELOPES_INVALID });
  return false;
};

function registerDeviceRoutes(fastify: FastifyInstance, deps: E2EERouteDeps): void {
  const preValidation = [deps.auth];
  const writes = { preValidation, config: { rateLimit: directoryWriteRateLimit } };

  fastify.post('/e2ee/devices', writes, guarded(async (request, reply, caller) => {
    if (!withoutPrivateKeys(reply, request.body)) return;
    const body = parsedOr400(reply, e2eeEnrollDeviceRequestSchema.safeParse(request.body));
    if (!body) return;
    const enrolled = await deps.directory.enrollDevice({ ...caller, request: body });
    await deps.onEnrolled?.({ ...caller, deviceId: enrolled.deviceId, registrationId: body.registrationId }).catch((error: unknown) =>
      logger.warn('e2ee device room not joined after enrolment', { error }),
    );
    return sendSuccess(reply, enrolled, { statusCode: enrolled.created ? 201 : 200 });
  }));

  fastify.put('/e2ee/devices/:deviceId/keys', writes, guarded(async (request, reply, caller) => {
    if (!withoutPrivateKeys(reply, request.body)) return;
    const deviceId = parsedOr400(reply, deviceIdParam.safeParse((request.params as { deviceId?: string }).deviceId));
    const body = deviceId === null ? null : parsedOr400(reply, e2eePublishKeysRequestSchema.safeParse(request.body));
    if (deviceId === null || !body) return;
    return sendSuccess(reply, await deps.directory.publishKeys({ ...caller, deviceId, request: body }));
  }));

  fastify.delete('/e2ee/devices/:deviceId', writes, guarded(async (request, reply, caller) => {
    const deviceId = parsedOr400(reply, deviceIdParam.safeParse((request.params as { deviceId?: string }).deviceId));
    if (deviceId === null) return;
    const { sessionId } = await deps.directory.retireDevice({ userId: caller.userId, deviceId });
    const signedOut = sessionId !== caller.sessionId;
    if (signedOut) await deps.closeSession({ userId: caller.userId, sessionId });
    return sendSuccess(reply, { deviceId, retired: true, signedOut });
  }));

  fastify.get('/e2ee/devices', { preValidation }, guarded(async (_request, reply, caller) =>
    sendSuccess(reply, { devices: await deps.directory.listOwnDevices(caller) }),
  ));

  fastify.get('/e2ee/devices/self/prekey-count', { preValidation }, guarded(async (_request, reply, caller) =>
    sendSuccess(reply, await deps.directory.prekeyStock(caller)),
  ));
}

function registerKeyRoutes(fastify: FastifyInstance, deps: E2EERouteDeps): void {
  const options = { preValidation: [deps.auth], config: { rateLimit: bundleRateLimit } };

  const authorizedTarget = async (request: FastifyRequest, reply: FastifyReply, caller: Caller): Promise<string | null> => {
    const target = parsedOr400(reply, objectIdParam.safeParse((request.params as { userId?: string }).userId));
    if (!target) return null;
    if (await deps.mayReadKeysOf(caller.userId, target)) return target;
    logger.warn('SECURITY: unauthorized e2ee key request', { requesterUserId: caller.userId, targetUserId: target });
    sendForbidden(reply, 'Vous ne pouvez pas lire les clés de cet utilisateur', { code: E2EE_ERROR_CODES.KEYS_FORBIDDEN });
    return null;
  };

  fastify.get('/e2ee/keys/:userId', options, guarded(async (request, reply, caller) => {
    const target = await authorizedTarget(request, reply, caller);
    if (!target) return;
    const raw = (request.query as { deviceIds?: string }).deviceIds;
    const deviceIds = raw === undefined ? undefined : parsedOr400(reply, deviceIdsQuery.safeParse(raw));
    if (deviceIds === null) return;
    const devices = await deps.directory.reserveBundles({ requesterUserId: caller.userId, targetUserId: target, deviceIds });
    return sendSuccess(reply, { userId: target, devices });
  }));

  fastify.get('/e2ee/keys/:userId/devices', { preValidation: [deps.auth] }, guarded(async (request, reply, caller) => {
    const target = await authorizedTarget(request, reply, caller);
    if (!target) return;
    return sendSuccess(reply, { userId: target, devices: await deps.directory.listDevices(target) });
  }));
}

function registerEnvelopeRoutes(fastify: FastifyInstance, deps: E2EERouteDeps): void {
  const preValidation = [deps.auth];

  fastify.get('/e2ee/envelopes', { preValidation }, guarded(async (request, reply, caller) => {
    const query = parsedOr400(reply, envelopeListQuery.safeParse(request.query ?? {}));
    if (!query) return;
    const envelopes = await deps.relay.listFor({ ...caller, ...query });
    return sendSuccess(reply, { envelopes, nextCursor: envelopes.at(-1)?.id ?? null });
  }));

  fastify.post('/e2ee/envelopes/ack', { preValidation }, guarded(async (request, reply, caller) => {
    const body = parsedOr400(reply, ackBody.safeParse(request.body));
    if (!body) return;
    return sendSuccess(reply, { deleted: await deps.relay.ack({ ...caller, ids: body.ids }) });
  }));
}

export function registerE2EERoutes(fastify: FastifyInstance, deps: E2EERouteDeps): void {
  registerDeviceRoutes(fastify, deps);
  registerKeyRoutes(fastify, deps);
  registerEnvelopeRoutes(fastify, deps);
}

export default async function e2eeRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  registerE2EERoutes(fastify, {
    auth: createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false }),
    directory: createE2EEDirectory({ prisma, verifier: libsignalSignatureVerifier(loadLibsignal) }),
    relay: createE2EEEnvelopeRelay({ prisma }),
    mayReadKeysOf: (requester, target) => mayReadKeysOf(prisma, requester, target),
    onEnrolled: (enrolled) => joinSessionSocketsToDeviceRoom(currentE2EEIO(), enrolled),
    closeSession: async ({ userId, sessionId }) => {
      await invalidateSession(sessionId, 'user_revoked');
      await disconnectSession({
        io: fastify.socketIOHandler?.getManager?.()?.getIO(),
        userId,
        sessionId,
        reason: 'user_revoke',
        onError: (error) => logger.warn('e2ee retired device socket not cut', { error }),
      });
    },
  });
}
