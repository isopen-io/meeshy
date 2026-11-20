import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { fallPersonSettingsUpdateSchema } from '@meeshy/shared/types/fall-detection';
import { fallRelayDepsOf } from '../../services/fallDetection/fallDeps';
import { fallSnapshotFor, refreshFallBetween } from '../../services/fallDetection/fallRelay';
import { readFallPersonSettings, writeFallPersonSettings } from '../../services/fallDetection/fallSettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

const positionSchema = {
  type: 'object',
  properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, accuracy: { type: 'number' }, recordedAt: { type: 'string' } },
} as const;
const batterySchema = { type: 'object', properties: { level: { type: 'number' }, measuredAt: { type: 'string' } } } as const;

/** L'état servi, déclaré CHAMP PAR CHAMP : rien d'autre que ce que `FallState` porte ne quitte la passerelle. */
export const fallStateSchema = {
  type: 'object',
  properties: { userId: { type: 'string' }, detectedAt: { type: 'string' }, expiresAt: { type: 'string' }, lastPosition: positionSchema, lastBattery: batterySchema },
} as const;

const personSettingsSchema = { type: 'object', properties: { userId: { type: 'string' }, shared: { type: 'boolean' } } } as const;
const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const fallErrors = { ...errorResponses, 403: errorResponseSchema } as const;

/**
 * LA CHUTE DÉTECTÉE de mes Sangs (#18748) : le rattrapage des alertes en cours (la SyncPill au retour),
 * et ce que je partage de la mienne à une personne. Le direct passe par `fall:detected` / `fall:cleared`.
 */
export function registerRelationFall(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:fall:r', 120);
  const writes = relationLimiter(fastify, 'rel:fall:w', 30);
  const relayOf = () => fallRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.get('/falls', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The fall alerts in progress among the Blood links who share them with me.',
      tags: ['relations'],
      summary: 'Fall alerts in progress',
      response: { 200: envelope({ type: 'object', properties: { items: { type: 'array', items: fallStateSchema } } }), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await fallSnapshotFor(relayOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Fall snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/fall/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether this person is alerted when a fall is detected on my watch.',
      tags: ['relations'],
      summary: 'Fall alert sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, await readFallPersonSettings(fastify.prisma, { ownerId: request.user!.userId, otherId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'Fall settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/fall/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Alert this person, or stop alerting them, when a fall is detected on my watch.',
      tags: ['relations'],
      summary: 'Update fall alert sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    const parsed = fallPersonSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const ownerId = request.user!.userId;
      const other = await fastify.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!other) return sendNotFound(reply, 'Personne introuvable');
      const settings = await writeFallPersonSettings(fastify.prisma, { ownerId, otherId, update: { shared: parsed.data.shared === true }, now: new Date() });
      await refreshFallBetween(relayOf(), { userA: ownerId, userB: otherId })
        .catch((error: unknown) => logError(fastify.log, 'Fall alert not refreshed after settings:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Fall settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
