import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { createUnifiedAuthMiddleware, isRegisteredUser, type UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { shareLinkStatsJsonSchema } from '@meeshy/shared/types/share-link-stats';
import { loadShareLinkForManagement } from './management';
import { computeShareLinkStats } from '../../services/conversations/shareLinkStats';

/**
 * `GET /links/:linkId/stats` — ce qu'un lien d'invitation a produit (#7797).
 *
 * Qui lit : exactement qui peut MODIFIER le lien (`PATCH /links/:linkId`) —
 * son auteur, un modérateur ou administrateur de la conversation, un
 * administrateur de la plateforme. La règle n'est pas recopiée : elle vient de
 * `loadShareLinkForManagement`, la source unique des quatre gestes de gestion.
 */
export async function registerLinkStatsRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  fastify.get('/links/:linkId/stats', {
    onRequest: [authRequired],
    schema: {
      description: 'Statistics of a conversation share link: visits of its public preview, arrivals (with and without an account), arrivals by language and by country, and the 20 most recent arrivals. Only the link creator or conversation moderators/administrators can read them.',
      tags: ['links'],
      summary: 'Get share link statistics',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Public link identifier (mshy_*)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkStatsJsonSchema,
          },
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const platformRole = request.authContext.registeredUser?.role;

      const loaded = await loadShareLinkForManagement(fastify, userId, platformRole, linkId);
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour lire les statistiques de ce lien');
      }

      return sendSuccess(reply, await computeShareLinkStats(fastify.prisma, loaded.id));
    } catch (error) {
      logError(fastify.log, 'Share link stats error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
