import type { FastifyInstance, FastifyRequest } from 'fastify';
import { batteryEmitterSettingsUpdateSchema } from '@meeshy/shared/types/battery';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { batteryRelayDepsOf } from '../../services/battery/batteryDeps';
import { captureBatteryAudience, forgetBatteryOf, refreshBatteryAudience, reportBattery } from '../../services/battery/batteryRelay';
import { readBatteryEmitterSettings, writeBatteryEmitterSettings } from '../../services/battery/batterySettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';
import { sendBatteryAck } from '../relations/battery';

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
/** La session NOMMÉE par le JWT, que le middleware unifié pose sur la requête. */
const sessionIdOfRequest = (request: FastifyRequest): string | null => (request as UnifiedAuthRequest).authContext?.sessionId ?? null;
const emitterSettingsSchema = { type: 'object', properties: { sharingEnabled: { type: 'boolean' } } } as const;

/**
 * La batterie côté ÉMETTEUR (#14147) : le relevé par REST — la MÊME charge et la MÊME porte que
 * `battery:report`, pour un téléphone réveillé sans socket — et la coupure globale du partage.
 * Seul le téléphone SUIVI (la session mobile la plus récemment active) fait avancer l'épisode :
 * un autre appareil reçoit `tracked: false` et rien ne change. La coupure globale ferme aussi la
 * collecte : l'état rangé s'efface, et un relevé reçu pendant la coupure rend `tracked: false`.
 */
export default async function deviceBatteryMeRoutes(fastify: FastifyInstance): Promise<void> {
  const reports = relationLimiter(fastify, 'me:battery:w', 12);
  const settingsLimiter = relationLimiter(fastify, 'me:battery:s', 30);
  const relayOf = () => batteryRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.post('/device/battery', {
    onRequest: [fastify.authenticate],
    preHandler: [reports.middleware()],
    schema: {
      description: 'Report my phone battery (level, charging, low power). Never a conversation message.',
      tags: ['me'],
      summary: 'Report my battery',
      response: { 200: envelope({ type: 'object', properties: { tracked: { type: 'boolean' } } }), ...errorResponses, 503: errorResponses[500] },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const sessionId = sessionIdOfRequest(request);
      const ack = await reportBattery(relayOf(), { emitterId: request.user!.userId, sessionId, payload: request.body });
      return sendBatteryAck(reply, ack);
    } catch (error) {
      logError(fastify.log, 'Battery report error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/device/battery/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Whether I share my battery at all (the per-person choice lives under /relations/:userId/battery/settings).',
      tags: ['me'],
      summary: 'My battery sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await readBatteryEmitterSettings(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Battery settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/device/battery/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Turn my battery sharing off or back on, for everyone at once.',
      tags: ['me'],
      summary: 'Update my battery sharing',
      response: { 200: envelope(emitterSettingsSchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = batteryEmitterSettingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const userId = request.user!.userId;
      const relay = relayOf();
      const before = await captureBatteryAudience(relay, userId);
      const settings = await writeBatteryEmitterSettings(fastify.prisma, { userId, update: parsed.data, now: new Date() });
      await refreshBatteryAudience(relay, { emitterId: userId, before })
        .catch((error: unknown) => logError(fastify.log, 'Battery not refreshed after global setting:', error));
      if (!settings.sharingEnabled) {
        await forgetBatteryOf(relay, userId).catch((error: unknown) => logError(fastify.log, 'Battery state not forgotten after global cut:', error));
      }
      return sendSuccess(reply, settings);
    } catch (error) {
      logError(fastify.log, 'Battery settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
