import type { FastifyInstance, FastifyRequest } from 'fastify';
import { phoneReachabilityEmitterSettingsUpdateSchema } from '@meeshy/shared/types/phone-reachability';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { phoneReachabilityRelayDepsOf } from '../../services/phoneReachability/phoneReachabilityDeps';
import {
  capturePhoneReachabilityAudience,
  forgetPhoneReachabilityOf,
  notePhoneAlive,
  refreshPhoneReachabilityAudience,
} from '../../services/phoneReachability/phoneReachabilityRelay';
import { readPhoneReachabilityEmitterSettings, writePhoneReachabilityEmitterSettings } from '../../services/phoneReachability/phoneReachabilitySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const sessionIdOfRequest = (request: FastifyRequest): string | null => (request as UnifiedAuthRequest).authContext?.sessionId ?? null;
const emitterSettingsSchema = { type: 'object', properties: { sharingEnabled: { type: 'boolean' } } } as const;

/**
 * Le téléphone injoignable côté ÉMETTEUR (#18737) : le SIGNE DE VIE que le téléphone renvoie quand
 * une sonde silencieuse (`device_probe`) le réveille, et la coupure globale (le fantôme). Seul le
 * téléphone SUIVI compte : un autre appareil reçoit `tracked: false` et rien ne change. La coupure
 * globale ferme aussi la collecte : l'horloge rangée s'efface, et le téléphone n'est plus sondé.
 */
export default async function deviceReachabilityMeRoutes(fastify: FastifyInstance): Promise<void> {
  const alive = relationLimiter(fastify, 'me:reach:a', 12);
  const settingsLimiter = relationLimiter(fastify, 'me:reach:s', 30);
  const relayOf = () => phoneReachabilityRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.post('/device/alive', {
    onRequest: [fastify.authenticate],
    preHandler: [alive.middleware()],
    schema: {
      description: 'My phone answers a silent probe: it is reachable. Never a conversation message.',
      tags: ['me'],
      summary: 'Phone sign of life',
      response: { 200: envelope({ type: 'object', properties: { tracked: { type: 'boolean' } } }), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const tracked = await notePhoneAlive(relayOf(), { userId: request.user!.userId, sessionId: sessionIdOfRequest(request), answer: true });
      return sendSuccess(reply, { tracked });
    } catch (error) {
      logError(fastify.log, 'Phone sign of life error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/device/reachability/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Whether my Close and Blood links learn that my phone is unreachable (the per-person choice lives under /relations/:userId/phone-reachability/settings).',
      tags: ['me'],
      summary: 'My unreachable-phone sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await readPhoneReachabilityEmitterSettings(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Phone reachability settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/device/reachability/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Turn my unreachable-phone sharing off or back on, for everyone at once.',
      tags: ['me'],
      summary: 'Update my unreachable-phone sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = phoneReachabilityEmitterSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const userId = request.user!.userId;
      const relay = relayOf();
      const before = await capturePhoneReachabilityAudience(relay, userId);
      const settings = await writePhoneReachabilityEmitterSettings(fastify.prisma, { userId, update: parsed.data, now: new Date() });
      await refreshPhoneReachabilityAudience(relay, { emitterId: userId, before })
        .catch((error: unknown) => logError(fastify.log, 'Phone reachability not refreshed after global setting:', error));
      if (!settings.sharingEnabled) {
        await forgetPhoneReachabilityOf(relay, userId).catch((error: unknown) => logError(fastify.log, 'Phone reachability not forgotten after global cut:', error));
      }
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Phone reachability settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
