import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { PHONE_UNREACHABLE_CAUSES, phoneReachabilityPersonSettingsUpdateSchema } from '@meeshy/shared/types/phone-reachability';
import { phoneReachabilityRelayDepsOf } from '../../services/phoneReachability/phoneReachabilityDeps';
import {
  capturePhoneReachabilityAccess,
  phoneReachabilitySnapshotFor,
  phoneReachabilityStateFor,
  refreshPhoneReachabilityBetween,
} from '../../services/phoneReachability/phoneReachabilityRelay';
import { readPhoneReachabilityPersonSettings, writePhoneReachabilityPersonSettings } from '../../services/phoneReachability/phoneReachabilitySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

/**
 * L'état servi à un lecteur, déclaré CHAMP PAR CHAMP : le sérialiseur retire tout champ non
 * déclaré, et rien d'autre que ce que `PhoneReachabilityState` porte ne quitte la passerelle.
 */
export const phoneReachabilityStateSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    unreachableSince: { type: 'string' },
    cause: { type: 'string', enum: [...PHONE_UNREACHABLE_CAUSES] },
  },
} as const;

const personSettingsSchema = { type: 'object', properties: { userId: { type: 'string' }, shared: { type: 'boolean' } } } as const;
const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const reachabilityErrors = { ...errorResponses, 403: errorResponseSchema } as const;

/**
 * LE TÉLÉPHONE INJOIGNABLE de mes Proches et de mes Sangs (#18737) : le rattrapage des téléphones
 * injoignables, l'état d'une personne, et ce que je lui partage du mien. Le direct passe par
 * `phone:unreachable` / `phone:reachable`.
 */
export function registerRelationPhoneReachability(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:reach:r', 120);
  const writes = relationLimiter(fastify, 'rel:reach:w', 30);
  const relayOf = () => phoneReachabilityRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.get('/phone-reachability', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The unreachable phones of the Close and Blood links who share it with me.',
      tags: ['relations'],
      summary: 'Unreachable phones of my links',
      response: { 200: envelope({ type: 'object', properties: { items: { type: 'array', items: phoneReachabilityStateSchema } } }), ...reachabilityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await phoneReachabilitySnapshotFor(relayOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Phone reachability snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/phone-reachability', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether this person\'s phone is unreachable, as served to me (null when reachable or not shared).',
      tags: ['relations'],
      summary: 'Unreachable phone of one link',
      params: userIdParams,
      response: { 200: envelope({ type: 'object', properties: { state: { ...phoneReachabilityStateSchema, nullable: true } } }), ...reachabilityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, { state: await phoneReachabilityStateFor(relayOf(), { readerId: request.user!.userId, emitterId: otherId }) });
    } catch (error) {
      logError(fastify.log, 'Phone reachability state error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/phone-reachability/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether this person learns that my phone is unreachable.',
      tags: ['relations'],
      summary: 'Unreachable-phone sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...reachabilityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, await readPhoneReachabilityPersonSettings(fastify.prisma, { ownerId: request.user!.userId, otherId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'Phone reachability settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/phone-reachability/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Share or withdraw, with this person, the news that my phone is unreachable.',
      tags: ['relations'],
      summary: 'Update unreachable-phone sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...reachabilityErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    const parsed = phoneReachabilityPersonSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const ownerId = request.user!.userId;
      const other = await fastify.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!other) return sendNotFound(reply, 'Personne introuvable');
      const relay = relayOf();
      const before = await capturePhoneReachabilityAccess(relay, { userA: ownerId, userB: otherId });
      const settings = await writePhoneReachabilityPersonSettings(fastify.prisma, { ownerId, otherId, update: parsed.data, now: new Date() });
      await refreshPhoneReachabilityBetween(relay, { userA: ownerId, userB: otherId, before })
        .catch((error: unknown) => logError(fastify.log, 'Phone reachability not refreshed after settings:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Phone reachability settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
