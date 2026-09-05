import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendPaginatedSuccess,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendInternalError
} from '../../utils/response.js';
import { validatePagination } from '../../utils/pagination';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { shareLinkSchema } from './types';
import { revokeShareLinkGuests } from '../../socketio/revokeShareLinkGuests';
import { depreciee } from '../../utils/deprecation';
// #4170 — le bloc « charger par linkId public + décider créateur/modérateur »
// vivait quatre fois (ici trois, plus le PATCH générique de `management.ts`) ;
// `loadShareLinkForManagement` en est désormais la source UNIQUE, partagée
// entre les deux fichiers. Voir son doc-comment pour ce que la duplication
// coûtait — c'est là qu'a vécu le premier écart de comportement (#4170,
// `PATCH` ne révoquait pas les invités là où `/toggle` le faisait déjà).
import { loadShareLinkForManagement, applyShareLinkUpdate } from './management';
import { apiPath } from '@meeshy/shared/api/prefix';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Route pour obtenir tous les liens créés par l'utilisateur
  //
  // #4170 — ALIAS DÉPRÉCIÉ. `GET /links` (`links/user.ts`) absorbe désormais
  // cette liste (mêmes lignes, mêmes bornes de pagination via `?offset=`) et
  // gagne `?expand=conversation,creator` pour la forme enrichie que cette
  // route rendait seule. Gardée VIVANTE, comportement INCHANGÉ : le web
  // l'appelait encore au moment de l'audit (`app/links/page.tsx:151`) — migré
  // dans le même lot — et rien ne prouve l'absence d'un déploiement web plus
  // ancien encore en circulation. Le retrait suit le compteur d'accès de
  // #4275, jamais une lecture de code client.
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/links/my-links', {
    onRequest: [authRequired, depreciee({ depuis: '2026-08-29', successeur: apiPath('/links') })],
    schema: {
      description: 'Get all share links created by the authenticated user with pagination. Returns links with conversation details, participant statistics, and language information. Maximum 50 links per request.',
      tags: ['links'],
      summary: 'List user\'s share links',
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            default: '20',
            description: 'Maximum number of links to return (max 50)',
            example: '20'
          },
          offset: {
            type: 'string',
            default: '0',
            description: 'Number of links to skip for pagination',
            example: '0'
          }
        }
      },
      response: {
        200: {
          description: 'Links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                allOf: [
                  shareLinkSchema,
                  {
                    type: 'object',
                    properties: {
                      conversation: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          type: { type: 'string' },
                          description: { type: 'string', nullable: true },
                          conversationUrl: { type: 'string', description: 'URL to conversation', example: '/conversations/:id' }
                        }
                      },
                      // Les deux émetteurs de cette route (`admin.ts:156` et le
                      // `select` Prisma de la bascule d'activation) rendent ces
                      // six champs exactement, et AUCUN champ de présence — la
                      // déclaration n'ouvre donc aucune porte à gater.
                      creator: {
                        type: 'object',
                        description: 'Link creator information',
                        properties: {
                          id: { type: 'string' },
                          username: { type: 'string' },
                          firstName: { type: 'string', nullable: true },
                          lastName: { type: 'string', nullable: true },
                          displayName: { type: 'string', nullable: true },
                          avatar: { type: 'string', nullable: true }
                        }
                      },
                      stats: {
                        type: 'object',
                        properties: {
                          totalParticipants: { type: 'number' },
                          memberCount: { type: 'number' },
                          anonymousCount: { type: 'number' },
                          languageCount: { type: 'number' },
                          spokenLanguages: { type: 'array', items: { type: 'string' } }
                        }
                      }
                    }
                  }
                ]
              }
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                offset: { type: 'number' },
                total: { type: 'number', description: 'Total number of links' },
                hasMore: { type: 'boolean', description: 'Whether more links are available' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const authContext = request.authContext;
      if (!authContext || !isRegisteredUser(authContext)) {
        return sendUnauthorized(reply, 'Utilisateur non autorisé');
      }

      // SSOT guard: `?limit`/`?offset` are plain strings, so a malformed value
      // would otherwise reach Prisma as `take: NaN`/negative → HTTP 500.
      const { limit, offset } = validatePagination((request.query as any).offset, (request.query as any).limit, { defaultLimit: 20, maxLimit: 50 });

      const totalCount = await fastify.prisma.conversationShareLink.count({
        where: {
          createdBy: authContext.registeredUser.id
        }
      });

      const links = await fastify.prisma.conversationShareLink.findMany({
        where: {
          createdBy: authContext.registeredUser.id
        },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              type: true,
              description: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit
      });

      const transformedLinks = links.map(link => ({
        ...link,
        conversation: {
          ...link.conversation,
          conversationUrl: `/conversations/${link.conversation.id}`
        },
        creator: {
          id: authContext.registeredUser.id,
          username: authContext.registeredUser.username,
          firstName: authContext.registeredUser.firstName,
          lastName: authContext.registeredUser.lastName,
          displayName: authContext.registeredUser.displayName,
          avatar: authContext.registeredUser.avatar
        },
        stats: {
          totalParticipants: link.currentUses ?? 0,
          memberCount: 0,
          anonymousCount: link.currentUses ?? 0,
          languageCount: link.allowedLanguages?.length || 0,
          spokenLanguages: link.allowedLanguages || []
        }
      }));

      return sendPaginatedSuccess(reply, transformedLinks, {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + links.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get user links error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des liens');
    }
  });

  // Route pour basculer l'état actif/inactif d'un lien
  //
  // #4170 — ALIAS DÉPRÉCIÉ. `PATCH /links/:linkId` accepte `isActive` depuis
  // l'origine et absorbe ce geste — Android (`LinkApi.kt: @PATCH
  // "links/{linkId}/toggle"`) reste le seul appelant mesuré (iOS et le web,
  // migré dans ce même lot, appellent déjà la porte générique) : gardée
  // VIVANTE tant que le compteur d'accès de #4275 ne prouve pas l'inverse.
  fastify.patch('/links/:linkId/toggle', {
    onRequest: [
      authRequired,
      depreciee({
        depuis: '2026-08-29',
        successeur: (request) => apiPath(`/links/${(request.params as { linkId: string }).linkId}`),
      }),
    ],
    schema: {
      description: 'Toggle a share link\'s active status (activate or deactivate). Only the link creator or conversation administrators/moderators can toggle. When deactivated, the link becomes inaccessible to new and existing anonymous users.',
      tags: ['links'],
      summary: 'Toggle link status',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: {
            type: 'boolean',
            description: 'New active status for the link',
            example: true
          }
        }
      },
      response: {
        200: {
          description: 'Link status toggled successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', description: 'Success message' }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };
      const { isActive } = request.body as { isActive: boolean };

      const loaded = await loadShareLinkForManagement(
        fastify, userId, request.authContext.registeredUser?.role, linkId
      );
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour modifier ce lien');
      }

      // #4351 — cet alias ne réécrit plus l'écriture : il délègue à
      // `applyShareLinkUpdate`, qui porte la projection ET la révocation des
      // invités déjà entrés. C'est là que vivait la seconde moitié de la
      // promesse de cette route — « the link becomes inaccessible to new AND
      // EXISTING anonymous users » : fermer la porte ne vide pas la salle, les
      // invités déjà entrés gardaient leur socket dans la room du fil, donc
      // chaque message, indéfiniment. Réactiver, en revanche, ne rend rien à
      // personne : une ligne `Participant` close ne se rouvre que par la porte
      // d'entrée.
      const updatedLink = await applyShareLinkUpdate(fastify, loaded.id, { isActive });

      return sendSuccess(reply, updatedLink, { message: isActive ? 'Lien activé avec succès' : 'Lien désactivé avec succès' });

    } catch (error) {
      logError(fastify.log, 'Toggle link status error:', error);
      return sendInternalError(reply, 'Erreur lors de la modification du statut du lien');
    }
  });

  // Route pour prolonger la durée d'un lien
  //
  // #4170 — ALIAS DÉPRÉCIÉ, même raison que `/toggle` ci-dessus : Android
  // (`LinkApi.kt: @PATCH "links/{linkId}/extend"`) en reste le seul appelant
  // mesuré une fois le web migré vers `PATCH /links/:linkId` dans ce lot.
  fastify.patch('/links/:linkId/extend', {
    onRequest: [
      authRequired,
      depreciee({
        depuis: '2026-08-29',
        successeur: (request) => apiPath(`/links/${(request.params as { linkId: string }).linkId}`),
      }),
    ],
    schema: {
      description: 'Extend a share link\'s expiration date. Only the link creator or conversation administrators/moderators can extend. Provide a new expiresAt timestamp in ISO 8601 format.',
      tags: ['links'],
      summary: 'Extend link expiration',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: {
        type: 'object',
        required: ['expiresAt'],
        properties: {
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'New expiration timestamp (ISO 8601)',
            example: '2024-12-31T23:59:59Z'
          }
        }
      },
      response: {
        200: {
          description: 'Link expiration extended successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', example: 'Lien prolongé avec succès' }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };
      const { expiresAt } = request.body as { expiresAt: string };

      const loaded = await loadShareLinkForManagement(
        fastify, userId, request.authContext.registeredUser?.role, linkId
      );
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour modifier ce lien');
      }

      // #4351 — même délégation que `/toggle` : une seule écriture, une seule
      // projection. Prolonger ne révoque personne (`isActive` n'est pas dans
      // le `data`), et c'est `applyShareLinkUpdate` qui en décide, pas cet
      // appelant.
      const updatedLink = await applyShareLinkUpdate(fastify, loaded.id, {
        expiresAt: new Date(expiresAt),
      });

      return sendSuccess(reply, updatedLink, { message: 'Lien prolongé avec succès' });

    } catch (error) {
      logError(fastify.log, 'Extend link duration error:', error);
      return sendInternalError(reply, 'Erreur lors de la prolongation du lien');
    }
  });

  // Route pour supprimer un lien
  // #4170 critère 5 — FERMETURE DOUCE : la ligne survit, seul `isActive`
  // bascule à `false`. Avant ce lot, `.delete()` détruisait la ligne du lien
  // — un modérateur qui rouvrait sa liste la voyait disparaître sans laisser
  // de trace, `currentUses`/les mesures agrégées de `GET /links?include=summary`
  // perdaient l'historique, et rien ne distinguait plus « ce lien n'a jamais
  // existé » de « ce lien a existé et a été retiré ». `isActive:false` est le
  // même état qu'une désactivation via `/toggle` : ce lot ne fait QUE cesser
  // de détruire la ligne, il ne fait naître aucun état nouveau. Un champ dédié
  // (`closedAt`) distinguerait proprement « fermé » de « simplement désactivé »
  // — colonne absente du schéma Prisma aujourd'hui, migration hors du
  // territoire de cette route, déclarée à l'intégrateur (voir le commit).
  fastify.delete('/links/:linkId', {
    onRequest: [authRequired],
    schema: {
      description: 'Close a share link (soft-close: the link becomes inactive but the row is preserved for audit and usage stats). Only the link creator or conversation administrators/moderators can close it. Immediately invalidates all anonymous participants using this link — a new join attempt via this linkId is refused, not silently accepted.',
      tags: ['links'],
      summary: 'Close share link (soft-close)',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      response: {
        200: {
          description: 'Link closed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Lien fermé avec succès' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions to close link',
          ...errorResponseSchema
        },
        404: {
          description: 'Link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const { linkId } = request.params as { linkId: string };

      const loaded = await loadShareLinkForManagement(
        fastify, userId, request.authContext.registeredUser?.role, linkId
      );
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour supprimer ce lien');
      }

      // AVANT la fermeture, et pas après — l'argument est désormais porté par
      // `applyShareLinkUpdate` (#4351), qui l'applique aux TROIS écritures :
      // `Participant.shareLinkId` est une colonne NUE, aucune cascade, et une
      // ligne de lien devenue inactive ne relie plus rien à un invité qui
      // resterait connecté par erreur. Cette route garde son propre couple
      // révocation + `update` NU parce que sa réponse ne porte que son
      // message : lui faire traverser `applyShareLinkUpdate` la ferait payer
      // la projection `include` que personne ne lit ici.
      await revokeShareLinkGuests({
        prisma: fastify.prisma,
        io: fastify.socketIOHandler?.getManager()?.getIO(),
        manager: fastify.socketIOHandler?.getManager(),
        shareLinkId: loaded.id,
      });

      await fastify.prisma.conversationShareLink.update({
        where: { id: loaded.id },
        data: { isActive: false },
      });

      return sendSuccess(reply, { message: 'Lien fermé avec succès' });

    } catch (error) {
      logError(fastify.log, 'Close link error:', error);
      return sendInternalError(reply, 'Erreur lors de la fermeture du lien');
    }
  });
}
