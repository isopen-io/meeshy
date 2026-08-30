import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response';
import { decoderIds, servirPresence, presenceResponseSchema, MAX_IDS_PAR_REQUETE } from '../directory/presence';

/**
 * `GET /users/presence?ids=…` — ALIAS de `GET /directory/presence` (#4164).
 *
 * Ce handler portait une branche FAIL-OPEN : une entrée absente de la carte de
 * visibilité retombait sur la présence runtime BRUTE, l'inverse exact de la
 * règle du 2026-08-25 (« une entrée absente vaut masquée sauf ADMIN/BIGBOSS »).
 * Il rejouait de plus la politique de repli à la main — `isGlobalAdmin` relu
 * localement — et pour les seuls participants anonymes.
 *
 * Il ne décide plus rien : la lecture, la loi et le repli vivent dans
 * `servirPresence`. L'adresse reste servie pour les versions déjà installées.
 *
 * Limites, inchangées : {@link MAX_IDS_PAR_REQUETE} ids par requête, auth
 * requise, `lastActiveAt` best-effort.
 */
export async function getUsersPresence(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { ids?: string } }>('/users/presence', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get runtime presence status for a list of userIds/participantIds',
      tags: ['users'],
      summary: 'Get users presence',
      querystring: {
        type: 'object',
        properties: {
          ids: { type: 'string', description: 'Comma-separated list of userIds or participantIds' }
        },
        required: ['ids']
      },
      response: {
        200: presenceResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { ids?: string } }>, reply: FastifyReply) => {
    const decode = decoderIds(request.query.ids);
    if ('refus' in decode) return sendBadRequest(reply, decode.refus);

    try {
      return sendSuccess(reply, { users: await servirPresence(fastify, request, decode.ids) });
    } catch (error) {
      fastify.log.error({ error }, '[users/presence] Failed to resolve presence');
      return sendInternalError(reply, 'Failed to resolve presence');
    }
  });
}
