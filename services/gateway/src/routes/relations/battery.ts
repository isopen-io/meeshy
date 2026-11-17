import type { FastifyInstance, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  BATTERY_ERROR_CODES,
  BATTERY_RECEIVE_MODES,
  BATTERY_SERVED_PHASES,
  batteryPersonSettingsUpdateSchema,
  type BatteryErrorCode,
} from '@meeshy/shared/types/battery';
import { batteryPullDepsOf, batteryRelayDepsOf } from '../../services/battery/batteryDeps';
import { requestBatteryPull } from '../../services/battery/batteryPull';
import { batterySnapshotFor, batteryStateFor, captureBatteryAccess, refreshBatteryBetween } from '../../services/battery/batteryRelay';
import { readBatteryPersonSettings, writeBatteryPersonSettings } from '../../services/battery/batterySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, sendCoded, userIdParams } from './shared';

/**
 * L'état servi à un lecteur, déclaré CHAMP PAR CHAMP : le sérialiseur retire tout champ non
 * déclaré, et rien d'autre que ce que `BatteryReaderState` porte ne quitte la passerelle.
 */
export const batteryStateSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    phase: { type: 'string', enum: [...BATTERY_SERVED_PHASES] },
    level: { type: 'number' },
    charging: { type: 'boolean' },
    lowPower: { type: 'boolean' },
    estimatedMinutes: { type: 'number' },
    measuredAt: { type: 'string' },
    deviceLabel: { type: 'string' },
  },
} as const;

const personSettingsSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    shared: { type: 'boolean' },
    receive: { type: 'string', enum: [...BATTERY_RECEIVE_MODES] },
  },
} as const;

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

const batteryErrors = { ...errorResponses, 403: errorResponseSchema, 503: errorResponseSchema } as const;

const PULL_STATUS: Record<BatteryErrorCode, number> = {
  [BATTERY_ERROR_CODES.INVALID]: 400,
  [BATTERY_ERROR_CODES.RATE_LIMITED]: 429,
  [BATTERY_ERROR_CODES.UNAVAILABLE]: 503,
  [BATTERY_ERROR_CODES.PULL_FORBIDDEN]: 403,
  [BATTERY_ERROR_CODES.PULL_TOO_SOON]: 429,
};

/** Un accusé de la batterie rendu par REST : sa donnée, ou son refus sous le statut que son code dit. */
export const sendBatteryAck = <T>(
  reply: FastifyReply,
  ack: { readonly success: true; readonly data: T } | { readonly success: false; readonly error: string; readonly code: BatteryErrorCode },
) => ('code' in ack ? sendCoded(reply, PULL_STATUS[ack.code], ack.error, ack.code) : sendSuccess(reply, ack.data));

/**
 * LA BATTERIE de mes Proches et de mes Sangs (#14147) : le rattrapage de tous les épisodes en
 * cours, l'état d'une personne, le relevé à la demande (Sang seulement, une fois toutes les
 * 5 min), et mes réglages pour une personne (ce que je lui partage, ce que je reçois d'elle).
 * Le direct passe par `battery:changed` / `battery:cleared`.
 */
export function registerRelationBattery(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:battery:r', 120);
  const writes = relationLimiter(fastify, 'rel:battery:w', 30);
  const relayOf = () => batteryRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.get('/battery', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The battery episodes in progress of the Close and Blood links who share it with me.',
      tags: ['relations'],
      summary: 'Battery of my links',
      response: { 200: envelope({ type: 'object', properties: { items: { type: 'array', items: batteryStateSchema } } }), ...batteryErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await batterySnapshotFor(relayOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Battery snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/battery', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The battery state of one person, as served to me (null outside an episode or when not shared).',
      tags: ['relations'],
      summary: 'Battery of one link',
      params: userIdParams,
      response: { 200: envelope({ type: 'object', properties: { state: { ...batteryStateSchema, nullable: true } } }), ...batteryErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, { state: await batteryStateFor(relayOf(), { readerId: request.user!.userId, emitterId: otherId }) });
    } catch (error) {
      logError(fastify.log, 'Battery state error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.post<{ Params: { userId: string } }>('/:userId/battery/pull', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Ask a Blood link\'s phone to read its battery now (once every 5 minutes per pair; the request does not say who asks). The reading comes back only if it opens or continues an episode (episodeOnly).',
      tags: ['relations'],
      summary: 'Request a battery reading',
      params: userIdParams,
      response: { 200: envelope({ type: 'object', properties: { requestedAt: { type: 'string' }, episodeOnly: { type: 'boolean' } } }), ...batteryErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      const ack = await requestBatteryPull(batteryPullDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) }), { readerId: request.user!.userId, payload: { userId: otherId } });
      return sendBatteryAck(reply, ack);
    } catch (error) {
      logError(fastify.log, 'Battery pull error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/battery/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether my battery is shared with this person, and what I receive of theirs (all, critical, pill, none).',
      tags: ['relations'],
      summary: 'Battery settings for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...batteryErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, await readBatteryPersonSettings(fastify.prisma, { ownerId: request.user!.userId, otherId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'Battery settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/battery/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Share or withdraw my battery with this person, and/or choose what I receive of theirs.',
      tags: ['relations'],
      summary: 'Update battery settings for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...batteryErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    const parsed = batteryPersonSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const ownerId = request.user!.userId;
      const other = await fastify.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!other) return sendNotFound(reply, 'Personne introuvable');
      const relay = relayOf();
      const before = await captureBatteryAccess(relay, { userA: ownerId, userB: otherId });
      const settings = await writeBatteryPersonSettings(fastify.prisma, { ownerId, otherId, update: parsed.data, now: new Date() });
      await refreshBatteryBetween(relay, { userA: ownerId, userB: otherId, before })
        .catch((error: unknown) => logError(fastify.log, 'Battery not refreshed after settings:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Battery settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
