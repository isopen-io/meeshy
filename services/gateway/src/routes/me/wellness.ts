import type { FastifyInstance, FastifyRequest } from 'fastify';
import { INACTIVITY_DELAY_HOURS, inactivityCheckSettingsUpdateSchema } from '@meeshy/shared/types/inactivity-check';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { inactivityRelayDepsOf } from '../../services/inactivityCheck/inactivityDeps';
import { noteInactivityActivity, refreshInactivityAudience } from '../../services/inactivityCheck/inactivityRelay';
import { readInactivitySettings, writeInactivitySettings } from '../../services/inactivityCheck/inactivitySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const sessionIdOfRequest = (request: FastifyRequest): string | null => (request as UnifiedAuthRequest).authContext?.sessionId ?? null;
const settingsSchema = { type: 'object', properties: { delayHours: { type: 'integer', enum: [...INACTIVITY_DELAY_HOURS], nullable: true } } } as const;

/**
 * La vérification d'inactivité côté PERSONNE (#18738) : la réponse « Je vais bien » à « Tout va
 * bien ? » — de n'importe lequel de ses appareils —, et le délai ou la coupure pour tous. Couper
 * efface l'alerte en cours chez les Sangs et oublie l'état.
 */
export default async function wellnessMeRoutes(fastify: FastifyInstance): Promise<void> {
  const ok = relationLimiter(fastify, 'me:well:o', 12);
  const settingsLimiter = relationLimiter(fastify, 'me:well:s', 30);
  const relayOf = () => inactivityRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.post('/wellness/ok', {
    onRequest: [fastify.authenticate],
    preHandler: [ok.middleware()],
    schema: {
      description: 'I answer "Are you OK?": I am fine. My Blood who were alerted learn it. Never a conversation message.',
      tags: ['me'],
      summary: 'I am OK',
      response: { 200: envelope({ type: 'object', properties: { tracked: { type: 'boolean' } } }), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const tracked = await noteInactivityActivity(relayOf(), { userId: request.user!.userId, sessionId: sessionIdOfRequest(request), anyDevice: true });
      return sendSuccess(reply, { tracked });
    } catch (error) {
      logError(fastify.log, 'Wellness answer error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/wellness/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'How long my phone may stay inactive before "Are you OK?" (null: the check is off). The per-person choice lives under /relations/:userId/inactivity/settings.',
      tags: ['me'],
      summary: 'My inactivity check',
      response: { 200: envelope(settingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await readInactivitySettings(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Inactivity settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/wellness/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Choose 6, 12 or 24 hours, or turn my inactivity check off for everyone.',
      tags: ['me'],
      summary: 'Update my inactivity check',
      response: { 200: envelope(settingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = inactivityCheckSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const userId = request.user!.userId;
      const settings = await writeInactivitySettings(fastify.prisma, { userId, update: { delayHours: parsed.data.delayHours ?? null }, now: new Date() });
      await refreshInactivityAudience(relayOf(), userId).catch((error: unknown) => logError(fastify.log, 'Inactivity not refreshed after global setting:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Inactivity settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
