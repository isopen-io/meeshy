import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SHARED_LOCATION_ERROR_CODES, type SharedLocationErrorCode } from '@meeshy/shared/types/shared-location';
import { sharedLocationRequestDepsOf } from '../../services/sharedLocation/sharedLocationDeps';
import { requestSharedLocation } from '../../services/sharedLocation/sharedLocationRequest';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, sendCoded, userIdParams } from './shared';

const STATUS: Record<SharedLocationErrorCode, number> = {
  [SHARED_LOCATION_ERROR_CODES.INVALID]: 400,
  [SHARED_LOCATION_ERROR_CODES.NOT_SHARING]: 409,
  [SHARED_LOCATION_ERROR_CODES.RATE_LIMITED]: 429,
  [SHARED_LOCATION_ERROR_CODES.UNAVAILABLE]: 503,
  [SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN]: 403,
  [SHARED_LOCATION_ERROR_CODES.REQUEST_TOO_SOON]: 429,
};

/**
 * « DEMANDER À PROLONGER » / « REDEMANDER » (#19204) : `POST /relations/:userId/location/request`
 * `{ kind: 'extend' | 'reask' }`, adressée à l'émetteur `:userId`. Dès Ami ; une par paire et par
 * fenêtre ; aucun effet automatique. La réponse est déclarée champ par champ : `requestedAt` seul.
 */
export function registerRelationLocationRequest(fastify: FastifyInstance): void {
  const writes = relationLimiter(fastify, 'rel:location-request:u', 30);

  fastify.post<{ Params: { userId: string } }>('/:userId/location/request', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Ask a link (from Friend up) to extend their location sharing, or to share again after it ended. One request per pair per window; nothing changes until they share themselves.',
      tags: ['relations'],
      summary: 'Request a location share',
      params: userIdParams,
      body: { type: 'object', properties: { kind: { type: 'string', enum: ['extend', 'reask'] } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { requestedAt: { type: 'string' } } } } },
        ...errorResponses,
        403: errorResponseSchema,
        503: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const emitterId = otherUserOf(request, reply);
    if (!emitterId) return reply;
    try {
      const deps = sharedLocationRequestDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });
      const ack = await requestSharedLocation(deps, { requesterId: request.user!.userId, emitterId, payload: request.body });
      return 'code' in ack ? sendCoded(reply, STATUS[ack.code], ack.error, ack.code) : sendSuccess(reply, ack.data);
    } catch (error) {
      logError(fastify.log, 'Shared location request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
