import type { FastifyInstance, FastifyRequest } from 'fastify';
import { phoneCallEmitterSettingsUpdateSchema, phoneCallReportSchema } from '@meeshy/shared/types/phone-call';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { phoneCallRelayDepsOf } from '../../services/phoneCall/phoneCallDeps';
import { refreshPhoneCallAudience, reportPhoneCall } from '../../services/phoneCall/phoneCallRelay';
import { readPhoneCallEmitterSettings, writePhoneCallEmitterSettings } from '../../services/phoneCall/phoneCallSettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const sessionIdOfRequest = (request: FastifyRequest): string | null => (request as UnifiedAuthRequest).authContext?.sessionId ?? null;
const emitterSettingsSchema = { type: 'object', properties: { sharingEnabled: { type: 'boolean' } } } as const;

/**
 * « En appel » côté ÉMETTEUR (#18753) : le rapport du téléphone suivi (un booléen, jamais
 * l'interlocuteur) et la coupure globale. Un autre appareil reçoit `tracked: false` et rien ne
 * change. Couper efface l'état chez les Sangs et ferme la collecte.
 */
export default async function deviceCallMeRoutes(fastify: FastifyInstance): Promise<void> {
  const reports = relationLimiter(fastify, 'me:call:r', 30);
  const settingsLimiter = relationLimiter(fastify, 'me:call:s', 30);
  const relayOf = () => phoneCallRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.post('/device/call', {
    onRequest: [fastify.authenticate],
    preHandler: [reports.middleware()],
    schema: {
      description: 'My phone reports whether it is in a call — never with whom. Never a conversation message.',
      tags: ['me'],
      summary: 'Phone call report',
      response: { 200: envelope({ type: 'object', properties: { tracked: { type: 'boolean' } } }), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = phoneCallReportSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Rapport illisible');
    try {
      const tracked = await reportPhoneCall(relayOf(), { userId: request.user!.userId, sessionId: sessionIdOfRequest(request), active: parsed.data.active });
      return sendSuccess(reply, { tracked });
    } catch (error) {
      logError(fastify.log, 'Phone call report error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/device/call/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Whether my Blood links see that I am in a call (the per-person choice lives under /relations/:userId/phone-call/settings).',
      tags: ['me'],
      summary: 'My in-call sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await readPhoneCallEmitterSettings(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Phone call settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/device/call/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Turn my in-call sharing off or back on, for everyone at once.',
      tags: ['me'],
      summary: 'Update my in-call sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = phoneCallEmitterSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const userId = request.user!.userId;
      const settings = await writePhoneCallEmitterSettings(fastify.prisma, { userId, update: { sharingEnabled: parsed.data.sharingEnabled === true }, now: new Date() });
      await refreshPhoneCallAudience(relayOf(), userId).catch((error: unknown) => logError(fastify.log, 'Phone call not refreshed after global setting:', error));
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Phone call settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
