import type { FastifyInstance } from 'fastify';
import { LIVE_ACTIVITY_TOKEN_ERROR_CODES, liveActivityTokenRegistrationSchema } from '@meeshy/shared/types/shared-location-live-activity';
import { sharedLocationRelayDepsOf } from '../../services/sharedLocation/sharedLocationDeps';
import { registerSharedLocationLiveActivityToken } from '../../services/sharedLocation/sharedLocationLiveActivity';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

/**
 * Le jeton d'une Activité en direct de partage de position (#19463) : l'appareil qui l'affiche le
 * confie à la passerelle, qui lui poussera `event: end` si le partage finit avant son terme. Accepté
 * pour un partage qui SERT le lecteur (ce qu'il sait déjà) ; sinon `404 LIVE_ACTIVITY_NOT_SHARED`.
 * Le jeton ne revient jamais dans une réponse.
 */
export default async function liveActivityTokensMeRoutes(fastify: FastifyInstance): Promise<void> {
  const limiter = relationLimiter(fastify, 'me:la:t', 30);

  fastify.post('/live-activity-tokens', {
    onRequest: [fastify.authenticate],
    preHandler: [limiter.middleware()],
    schema: {
      description: 'Register the push token of a Live Activity showing a position shared with me, so the gateway can end it when the share ends early.',
      tags: ['me'],
      summary: 'Register a Live Activity token',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { expiresAt: { type: 'string', format: 'date-time' } } } } },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = liveActivityTokenRegistrationSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Jeton illisible', { code: LIVE_ACTIVITY_TOKEN_ERROR_CODES.INVALID });
    try {
      const deps = sharedLocationRelayDepsOf({ prisma: fastify.prisma, io: undefined });
      const registered = await registerSharedLocationLiveActivityToken(deps, { readerId: request.user!.userId, registration: parsed.data });
      if (!registered) return sendNotFound(reply, 'Aucun partage en cours', { code: LIVE_ACTIVITY_TOKEN_ERROR_CODES.NOT_SHARED });
      return sendSuccess(reply, registered);
    } catch (error) {
      logError(fastify.log, 'Live Activity token registration error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
