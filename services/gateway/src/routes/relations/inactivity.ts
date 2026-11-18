import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { inactivityCheckPersonSettingsUpdateSchema } from '@meeshy/shared/types/inactivity-check';
import { inactivityRelayDepsOf } from '../../services/inactivityCheck/inactivityDeps';
import { inactivitySnapshotFor, refreshInactivityBetween } from '../../services/inactivityCheck/inactivityRelay';
import { readInactivityPersonSettings, writeInactivityPersonSettings } from '../../services/inactivityCheck/inactivitySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

const instant = { type: 'string' } as const;

/**
 * L'alerte servie à un Sang, déclarée CHAMP PAR CHAMP : le sérialiseur retire tout champ non
 * déclaré, et rien d'autre que ce que `InactivityAlertState` porte ne quitte la passerelle.
 */
export const inactivityAlertStateSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    inactiveSince: instant,
    alertedAt: instant,
    lastPosition: {
      type: 'object',
      properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, accuracy: { type: 'number' }, recordedAt: instant },
    },
    lastBattery: { type: 'object', properties: { level: { type: 'integer' }, measuredAt: instant } },
  },
} as const;

const personSettingsSchema = { type: 'object', properties: { userId: { type: 'string' }, shared: { type: 'boolean' } } } as const;
const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const inactivityErrors = { ...errorResponses, 403: errorResponseSchema } as const;

/**
 * L'ALERTE D'INACTIVITÉ de mes Sangs (#18738) : le rattrapage des alertes en cours, et ce que je
 * partage de la mienne à une personne. Le direct passe par `inactivity:alert` / `inactivity:cleared`.
 */
export function registerRelationInactivity(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:inact:r', 120);
  const writes = relationLimiter(fastify, 'rel:inact:w', 30);
  const relayOf = () => inactivityRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.get('/inactivity', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The ongoing inactivity alerts of the Blood links who share it with me.',
      tags: ['relations'],
      summary: 'Inactivity alerts of my links',
      response: { 200: envelope({ type: 'object', properties: { items: { type: 'array', items: inactivityAlertStateSchema } } }), ...inactivityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await inactivitySnapshotFor(relayOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Inactivity snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/inactivity/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether this person is alerted when I do not answer "Are you OK?".',
      tags: ['relations'],
      summary: 'Inactivity alert sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...inactivityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, await readInactivityPersonSettings(fastify.prisma, { ownerId: request.user!.userId, otherId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'Inactivity settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/inactivity/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Share or withdraw, with this person, my inactivity alert.',
      tags: ['relations'],
      summary: 'Update inactivity alert sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...inactivityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    const parsed = inactivityCheckPersonSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const ownerId = request.user!.userId;
      const other = await fastify.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!other) return sendNotFound(reply, 'Personne introuvable');
      const settings = await writeInactivityPersonSettings(fastify.prisma, { ownerId, otherId, update: parsed.data, now: new Date() });
      await refreshInactivityBetween(relayOf(), { userA: ownerId, userB: otherId })
        .catch((error: unknown) => logError(fastify.log, 'Inactivity not refreshed after settings:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Inactivity settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
