import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { phoneCallPersonSettingsUpdateSchema } from '@meeshy/shared/types/phone-call';
import { phoneCallRelayDepsOf } from '../../services/phoneCall/phoneCallDeps';
import { phoneCallSnapshotFor, refreshPhoneCallBetween } from '../../services/phoneCall/phoneCallRelay';
import { readPhoneCallPersonSettings, writePhoneCallPersonSettings } from '../../services/phoneCall/phoneCallSettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

/** L'état servi, déclaré CHAMP PAR CHAMP : rien d'autre que ce que `PhoneCallState` porte ne quitte la passerelle. */
export const phoneCallStateSchema = {
  type: 'object',
  properties: { userId: { type: 'string' }, since: { type: 'string' }, expiresAt: { type: 'string' } },
} as const;

const personSettingsSchema = { type: 'object', properties: { userId: { type: 'string' }, shared: { type: 'boolean' } } } as const;
const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const phoneCallErrors = { ...errorResponses, 403: errorResponseSchema } as const;

/**
 * « EN APPEL » de mes Sangs (#18753) : le rattrapage des appels en cours, et ce que je partage du
 * mien à une personne. Le direct passe par `phone-call:started` / `phone-call:ended`.
 */
export function registerRelationPhoneCall(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:pcall:r', 120);
  const writes = relationLimiter(fastify, 'rel:pcall:w', 30);
  const relayOf = () => phoneCallRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.get('/phone-calls', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'The Blood links who share it with me and are in a call right now — never with whom.',
      tags: ['relations'],
      summary: 'Links in a call',
      response: { 200: envelope({ type: 'object', properties: { items: { type: 'array', items: phoneCallStateSchema } } }), ...phoneCallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await phoneCallSnapshotFor(relayOf(), request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Phone call snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/phone-call/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'Whether this person sees that I am in a call.',
      tags: ['relations'],
      summary: 'In-call sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...phoneCallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    try {
      return sendSuccess(reply, await readPhoneCallPersonSettings(fastify.prisma, { ownerId: request.user!.userId, otherId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'Phone call settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/phone-call/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Share or withdraw, with this person, that I am in a call.',
      tags: ['relations'],
      summary: 'Update in-call sharing for one link',
      params: userIdParams,
      response: { 200: envelope(personSettingsSchema), ...phoneCallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const otherId = otherUserOf(request, reply);
    if (!otherId) return reply;
    const parsed = phoneCallPersonSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const ownerId = request.user!.userId;
      const other = await fastify.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!other) return sendNotFound(reply, 'Personne introuvable');
      const settings = await writePhoneCallPersonSettings(fastify.prisma, { ownerId, otherId, update: { shared: parsed.data.shared === true }, now: new Date() });
      await refreshPhoneCallBetween(relayOf(), { userA: ownerId, userB: otherId })
        .catch((error: unknown) => logError(fastify.log, 'Phone call not refreshed after settings:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Phone call settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
