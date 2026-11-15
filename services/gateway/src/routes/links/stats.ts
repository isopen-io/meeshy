import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { createUnifiedAuthMiddleware, isRegisteredUser, type UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  SHARE_LINK_ARRIVALS_PAGE_DEFAULT,
  SHARE_LINK_ARRIVALS_PAGE_MAX,
  shareLinkArrivalsPageJsonSchema,
  shareLinkStatsJsonSchema,
} from '@meeshy/shared/types/share-link-stats';
import { loadShareLinkForManagement } from './management';
import { computeShareLinkStats } from '../../services/conversations/shareLinkStats';
import { decodeArrivalsCursor, listShareLinkArrivals } from '../../services/conversations/shareLinkArrivals';

const linkIdParams = {
  type: 'object',
  required: ['linkId'],
  properties: {
    linkId: { type: 'string', description: 'Public link identifier (mshy_*)' },
  },
} as const;

/**
 * `GET /links/:linkId/stats` — ce qu'un lien d'invitation a produit (#7797) —
 * et `GET /links/:linkId/arrivals`, la liste complète de ses arrivées (#7813).
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
      params: linkIdParams,
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

  /**
   * `GET /links/:linkId/arrivals` — TOUTES les arrivées du lien, page par page
   * (#7813). Mêmes lecteurs que les statistiques, même source de la règle.
   * Une arrivée n'y porte que nom, badge sans compte, pays, langue et date ;
   * le schéma de réponse ferme chaque ligne (`additionalProperties: false`).
   */
  fastify.get('/links/:linkId/arrivals', {
    onRequest: [authRequired],
    schema: {
      description: 'Every arrival through a conversation share link, newest first, cursor-paginated. Each arrival carries only its display name, whether it joined without an account, its country, its language and its date. Only the link creator or conversation moderators/administrators can read them.',
      tags: ['links'],
      summary: 'List share link arrivals',
      params: linkIdParams,
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string', maxLength: 128, description: 'Opaque cursor returned as nextCursor by the previous page' },
          limit: { type: 'integer', minimum: 1, maximum: SHARE_LINK_ARRIVALS_PAGE_MAX, default: SHARE_LINK_ARRIVALS_PAGE_DEFAULT },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkArrivalsPageJsonSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const { cursor: rawCursor, limit } = request.query as { cursor?: string; limit: number };

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const cursor = rawCursor === undefined || rawCursor === '' ? null : decodeArrivalsCursor(rawCursor);
      if (cursor === null && rawCursor !== undefined && rawCursor !== '') {
        return sendBadRequest(reply, 'Curseur illisible');
      }

      const userId = request.authContext.registeredUser!.id;
      const platformRole = request.authContext.registeredUser?.role;

      const loaded = await loadShareLinkForManagement(fastify, userId, platformRole, linkId);
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour lire les arrivées de ce lien');
      }

      return sendSuccess(reply, await listShareLinkArrivals(fastify.prisma, { shareLinkId: loaded.id, cursor, limit }));
    } catch (error) {
      logError(fastify.log, 'Share link arrivals error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
