/**
 * Routes API Notifications
 *
 * Endpoints modernes utilisant NotificationService et NotificationFormatter
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NotificationFormatter } from '../services/notifications/NotificationFormatter';
import { visibleNotificationsWhere } from '../services/notifications/visibleNotificationsWhere';
import {
  notificationSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendNotFound, sendForbidden, sendInternalError } from '../utils/response';
import { decodeCursor, keysetBeforeClause } from '../utils/keyset-cursor';

/**
 * L'onglet choisi par le lecteur, traduit en clause — ou rien du tout.
 *
 * Un onglet de la cloche nomme plusieurs types BRUTS (« mentions » couvre
 * `user_mentioned` ET `mention`), d'où un ensemble et non une égalité. Le
 * groupement des alias appartient au client qui dessine les onglets ; le serveur
 * ne connaît que la liste qu'on lui donne, ce qui lui évite d'avoir à être
 * redéployé pour un onglet de plus.
 *
 * Une liste VIDE rend `{}`, jamais `{ type: { in: [] } }` : le second ne
 * ramènerait aucune ligne, et une chaîne mal formée viderait l'inbox au lieu de
 * la laisser entière. Le repli d'un filtre illisible est l'absence de filtre —
 * le même arbitrage que le curseur illisible juste en dessous.
 */
function notificationTypesClause(types: string | undefined): { type?: { in: string[] } } {
  const wanted = (types ?? '')
    .split(',')
    .map((type) => type.trim())
    .filter((type) => type.length > 0);

  return wanted.length === 0 ? {} : { type: { in: wanted } };
}

export async function notificationRoutes(fastify: FastifyInstance) {
  const notificationService = fastify.notificationService;

  // ============================================
  // GET /notifications - Liste paginée
  // ============================================

  fastify.get(
    '/notifications',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Retrieve paginated notifications (no title - built via i18n on frontend)',
        tags: ['notifications'],
        summary: 'Get user notifications',
        querystring: {
          type: 'object',
          properties: {
            offset: {
              type: 'number',
              description: 'Pagination offset',
              default: 0,
              minimum: 0,
            },
            limit: {
              type: 'number',
              description: 'Number of notifications per page',
              default: 20,
              minimum: 1,
              maximum: 100,
            },
            unreadOnly: {
              type: 'boolean',
              description: 'Filter only unread notifications',
              default: false,
            },
            cursor: {
              type: 'string',
              description:
                'Opaque keyset cursor (createdAt, id) returned as pagination.nextCursor. Takes precedence over offset.',
            },
            types: {
              type: 'string',
              description:
                'Comma-separated raw notification types to keep (e.g. user_mentioned,mention). Empty or absent = whole inbox.',
            },
          },
        },
        response: {
          200: {
            description: 'Notifications retrieved successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: notificationSchema,
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number', description: 'Offset mode only — not counted under a cursor' },
                  offset: { type: 'number', description: 'Offset mode only' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
                  nextCursor: {
                    type: ['string', 'null'],
                    description: 'Cursor mode only — pass back as ?cursor= for the next page',
                  },
                },
              },
              unreadCount: { type: 'number' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const { offset = 0, limit = 20, unreadOnly = false, cursor, types } = request.query as { offset?: number; limit?: number; unreadOnly?: boolean; cursor?: string; types?: string };

        // Récupérer les notifications BRUTES de Prisma (pas encore formatées).
        // Même prédicat que le compte non-lus rendu à côté (`getUnreadCount`) :
        // une liste et un badge qui ne s'accordent pas sur ce qui est visible
        // se contredisent à l'écran.
        const visibleWhere = {
          ...visibleNotificationsWhere({ userId, unreadOnly }),
          ...notificationTypesClause(types),
        };

        // Un curseur illisible vaut « pas de curseur » — le repli du reste du
        // dépôt (`PostFeedService`). Refuser la requête couperait le défilement
        // sur une erreur que le lecteur ne peut pas réparer ; re-servir la
        // première page lui laisse une liste cohérente.
        const cursorData = cursor ? decodeCursor(cursor) : null;
        const isCursorMode = cursorData !== null;

        const where = cursorData
          ? { AND: [visibleWhere, keysetBeforeClause(cursorData)] }
          : visibleWhere;

        const [rawNotifications, total, unreadCount] = await Promise.all([
          fastify.prisma.notification.findMany({
            where,
            // L'ordre TOTAL de l'inbox, et la clé exacte que le curseur
            // transporte. Sans `id` en second rang, deux notifications nées
            // dans la même milliseconde s'échangent leur place d'une lecture à
            // l'autre : la pagination en saute une et re-sert l'autre.
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            // Une ligne SONDE en mode curseur : elle dit `hasMore` sans
            // compter la table.
            take: isCursorMode ? limit + 1 : limit,
            ...(isCursorMode ? {} : { skip: offset }),
          }),
          isCursorMode ? Promise.resolve(0) : fastify.prisma.notification.count({ where }),
          notificationService.getUnreadCount(userId),
        ]);

        // Formatter UNE SEULE FOIS avec NotificationFormatter
        if (isCursorMode) {
          const hasMore = rawNotifications.length > limit;
          return NotificationFormatter.formatCursorPaginatedResponse({
            notifications: hasMore ? rawNotifications.slice(0, limit) : rawNotifications,
            limit,
            hasMore,
            unreadCount,
          });
        }

        return NotificationFormatter.formatPaginatedResponse({
          notifications: rawNotifications,
          total,
          offset,
          limit,
          unreadCount,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching notifications');
        return sendInternalError(reply, 'Failed to fetch notifications');
      }
    }
  );

  // ============================================
  // GET /notifications/counts - Totaux par type
  // ============================================

  fastify.get(
    '/notifications/counts',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Inbox-wide notification totals, grouped by raw type',
        tags: ['notifications'],
        summary: 'Get notification counts',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  unread: { type: 'number' },
                  // Une carte dont les CLÉS sont les types : `additionalProperties`
                  // est ce qui la laisse passer. Déclarée par `properties`, elle
                  // exigerait de réénumérer chaque type ici, et Fastify retirerait
                  // en silence tout type qu'on aurait oublié d'y écrire.
                  byType: {
                    type: 'object',
                    additionalProperties: { type: 'number' },
                  },
                },
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;

        // Le MÊME prédicat que la liste : un onglet qui annonce « 3 » et n'en
        // montre que deux (la troisième expirée) rejoue exactement la
        // contradiction cloche/liste que `visibleNotificationsWhere` supprime.
        const [groups, unread] = await Promise.all([
          fastify.prisma.notification.groupBy({
            by: ['type'],
            where: visibleNotificationsWhere({ userId }),
            _count: { _all: true },
          }),
          notificationService.getUnreadCount(userId),
        ]);

        // `total` se DÉDUIT du regroupement — un `count()` de plus répondrait à
        // la même question par une seconde lecture, donc à un autre instant, et
        // les deux chiffres pourraient se contredire à l'écran.
        const byType = Object.fromEntries(
          groups.map((group) => [group.type, group._count._all])
        );
        const total = Object.values(byType).reduce<number>((sum, count) => sum + count, 0);

        return sendSuccess(reply, { total, unread, byType });
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching notification counts');
        return sendInternalError(reply, 'Failed to fetch notification counts');
      }
    }
  );

  // ============================================
  // GET /notifications/unread-count - Compte non lus
  // ============================================

  fastify.get(
    '/notifications/unread-count',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get count of unread notifications',
        tags: ['notifications'],
        summary: 'Get unread count',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: { type: 'number' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const count = await notificationService.getUnreadCount(userId);

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching unread count');
        return sendInternalError(reply, 'Failed to fetch unread count');
      }
    }
  );

  // ============================================
  // POST /notifications/:id/read - Marquer comme lu
  // ============================================

  fastify.post(
    '/notifications/:id/read',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Mark notification as read',
        tags: ['notifications'],
        summary: 'Mark as read',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Notification ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: notificationSchema,
            },
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.user!.userId;

        // Vérifier que la notification appartient à l'utilisateur
        const notification = await fastify.prisma.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          return sendNotFound(reply, 'Notification not found');
        }

        if (notification.userId !== userId) {
          return sendForbidden(reply, 'Access denied');
        }

        const updated = await notificationService.markAsRead(id);

        return sendSuccess(reply, updated);
      } catch (error) {
        fastify.log.error({ error }, 'Error marking notification as read');
        return sendInternalError(reply, 'Failed to mark notification as read');
      }
    }
  );

  // ============================================
  // POST /notifications/read-all - Marquer tout comme lu
  // ============================================

  fastify.post(
    '/notifications/read-all',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Mark all notifications as read',
        tags: ['notifications'],
        summary: 'Mark all as read',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: {
                type: 'number',
                description: 'Number of notifications marked as read',
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const count = await notificationService.markAllAsRead(userId);

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error marking all notifications as read');
        return sendInternalError(reply, 'Failed to mark all notifications as read');
      }
    }
  );

  // ============================================
  // POST /notifications/conversation/:conversationId/read
  // Marque toutes les notifications d'une conversation comme lues.
  // Appelé à l'ouverture d'une conversation : le contenu étant consommé,
  // les notifications associées ne doivent plus apparaître comme non lues.
  // ============================================

  fastify.post(
    '/notifications/conversation/:conversationId/read',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Mark all notifications of a conversation as read (content consumed)",
        tags: ['notifications'],
        summary: 'Mark conversation notifications as read',
        params: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID' },
          },
          required: ['conversationId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: {
                type: 'number',
                description: 'Number of notifications marked as read',
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const { conversationId } = request.params as { conversationId: string };

        const count = await notificationService.markConversationNotificationsAsRead(
          userId,
          conversationId
        );

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error marking conversation notifications as read');
        return sendInternalError(reply, 'Failed to mark conversation notifications as read');
      }
    }
  );

  // ============================================
  // POST /notifications/post/:postId/read
  // Marque toutes les notifications liées à un post comme lues.
  // Appelé à l'ouverture d'une story / d'un post : le contenu étant consommé,
  // ses notifications ne doivent plus apparaître comme non lues.
  //
  // Distinct de l'appel opportuniste fait par `POST /posts/:postId/view`, qui
  // est borné à la PREMIÈRE vue : une notification arrivée après cette première
  // vue (nouveau commentaire, réaction) resterait non lue pour toujours, et le
  // « vu » client est coalescé donc la seconde ouverture ne repart même pas.
  // ============================================

  fastify.post(
    '/notifications/post/:postId/read',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Mark all notifications of a post (story, status, feed post) as read',
        tags: ['notifications'],
        summary: 'Mark post notifications as read',
        params: {
          type: 'object',
          properties: {
            postId: { type: 'string', description: 'Post / story ID' },
          },
          required: ['postId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: {
                type: 'number',
                description: 'Number of notifications marked as read',
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const { postId } = request.params as { postId: string };

        const count = await notificationService.markPostNotificationsAsRead(userId, postId);

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error marking post notifications as read');
        return sendInternalError(reply, 'Failed to mark post notifications as read');
      }
    }
  );

  // ============================================
  // POST /notifications/read-by-types
  // Marque comme lues toutes les notifications de l'utilisateur dont le type
  // est dans la liste fournie. Appelé quand un écran consomme une catégorie
  // entière (ex : l'écran des demandes d'ajout consomme friend_request /
  // contact_request / friend_accepted).
  // ============================================

  fastify.post(
    '/notifications/read-by-types',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Mark all notifications of the given types as read',
        tags: ['notifications'],
        summary: 'Mark notifications as read by type',
        body: {
          type: 'object',
          required: ['types'],
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 30,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: { type: 'number' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const { types } = request.body as { types: string[] };

        const count = await notificationService.markNotificationsByTypesAsRead(userId, types);

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error marking notifications by types as read');
        return sendInternalError(reply, 'Failed to mark notifications as read');
      }
    }
  );

  // ============================================
  // DELETE /notifications/read - Supprimer toutes les notifications lues
  // Route STATIQUE : elle gagne sur DELETE /notifications/:id dans find-my-way.
  // Sans elle, l'appel (déjà émis par le web) matchait :id avec id="read" → 404.
  // ============================================

  fastify.delete(
    '/notifications/read',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete all read notifications of the current user',
        tags: ['notifications'],
        summary: 'Delete read notifications',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: {
                type: 'number',
                description: 'Number of notifications deleted',
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const count = await notificationService.deleteAllRead(userId);

        return {
          success: true,
          count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error deleting read notifications');
        return sendInternalError(reply, 'Failed to delete read notifications');
      }
    }
  );

  // ============================================
  // DELETE /notifications/:id - Supprimer
  // ============================================

  fastify.delete(
    '/notifications/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete notification',
        tags: ['notifications'],
        summary: 'Delete notification',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Notification ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.user!.userId;

        // Vérifier que la notification appartient à l'utilisateur
        const notification = await fastify.prisma.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          return sendNotFound(reply, 'Notification not found');
        }

        if (notification.userId !== userId) {
          return sendForbidden(reply, 'Access denied');
        }

        const deleted = await notificationService.deleteNotification(id);

        if (!deleted) {
          return sendInternalError(reply, 'Failed to delete notification');
        }

        return sendSuccess(reply, undefined);
      } catch (error) {
        fastify.log.error({ error }, 'Error deleting notification');
        return sendInternalError(reply, 'Failed to delete notification');
      }
    }
  );

  // ============================================
  // DELETE /notifications/admin/clear-all - Nettoyer toutes les notifications (ADMIN ONLY)
  // ============================================

  fastify.delete(
    '/notifications/admin/clear-all',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete ALL notifications (admin only - for testing)',
        tags: ['notifications', 'admin'],
        summary: 'Clear all notifications',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              // `deletedCount` était déclaré à la RACINE alors que `sendSuccess`
              // l'enveloppe sous `data` (#4192) : la clé ne figurant pas dans
              // `data`, le sérialiseur vidait l'objet. L'administrateur voyait
              // « succès » sans jamais savoir combien de lignes il venait de
              // supprimer — sur un geste irréversible.
              data: {
                type: 'object',
                properties: {
                  deletedCount: { type: 'number' },
                },
              },
            },
          },
          403: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;

        // Vérification admin
        if (user.role !== 'ADMIN' && user.role !== 'BIGBOSS') {
          return sendForbidden(reply, 'Admin access required');
        }

        fastify.log.warn({ user }, 'Admin clearing all notifications');

        const result = await fastify.prisma.notification.deleteMany({});

        return sendSuccess(reply, { deletedCount: result.count });
      } catch (error) {
        fastify.log.error({ error }, 'Error clearing notifications');
        return sendInternalError(reply, 'Failed to clear notifications');
      }
    }
  );
}
