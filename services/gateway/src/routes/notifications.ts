/**
 * Routes API Notifications
 *
 * Endpoints modernes utilisant NotificationService et NotificationFormatter
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NotificationFormatter } from '../services/notifications/NotificationFormatter';
import { validatePagination } from '../utils/pagination';
import {
  notificationSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';

// Schemas de validation Zod
const markAsReadSchema = z.object({
  notificationId: z.string(),
});

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
                  total: { type: 'number' },
                  offset: { type: 'number' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
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
        const { offset = 0, limit = 20, unreadOnly = false } = request.query as any;

        const pagination = validatePagination(offset, limit, 100);

        // Récupérer les notifications BRUTES de Prisma (pas encore formatées)
        const where: any = { userId };
        if (unreadOnly) {
          where.isRead = false;
        }

        const [rawNotifications, total, unreadCount] = await Promise.all([
          fastify.prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: pagination.limit,
            skip: pagination.offset,
          }),
          fastify.prisma.notification.count({ where }),
          notificationService.getUnreadCount(userId),
        ]);

        // Formatter UNE SEULE FOIS avec NotificationFormatter
        return NotificationFormatter.formatPaginatedResponse({
          notifications: rawNotifications,
          total,
          offset: pagination.offset,
          limit: pagination.limit,
          unreadCount,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching notifications');
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch notifications',
        });
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
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch unread count',
        });
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
        const { id } = request.params as any;
        const userId = request.user!.userId;

        // Vérifier que la notification appartient à l'utilisateur
        const notification = await fastify.prisma.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          return reply.code(404).send({
            success: false,
            error: 'Notification not found',
          });
        }

        if (notification.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied',
          });
        }

        const updated = await notificationService.markAsRead(id);

        return {
          success: true,
          data: updated,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error marking notification as read');
        return reply.code(500).send({
          success: false,
          error: 'Failed to mark notification as read',
        });
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
        return reply.code(500).send({
          success: false,
          error: 'Failed to mark all notifications as read',
        });
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
        const { conversationId } = request.params as any;

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
        return reply.code(500).send({
          success: false,
          error: 'Failed to mark conversation notifications as read',
        });
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
        return reply.code(500).send({
          success: false,
          error: 'Failed to mark notifications as read',
        });
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
        const { id } = request.params as any;
        const userId = request.user!.userId;

        // Vérifier que la notification appartient à l'utilisateur
        const notification = await fastify.prisma.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          return reply.code(404).send({
            success: false,
            error: 'Notification not found',
          });
        }

        if (notification.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied',
          });
        }

        const success = await notificationService.deleteNotification(id);

        if (!success) {
          return reply.code(500).send({
            success: false,
            error: 'Failed to delete notification',
          });
        }

        return {
          success: true,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error deleting notification');
        return reply.code(500).send({
          success: false,
          error: 'Failed to delete notification',
        });
      }
    }
  );

  // ============================================
  // DELETE /notifications/test/clear-all - Nettoyer toutes les notifications (TEMP - NO AUTH CHECK)
  // ============================================

  fastify.delete(
    '/notifications/test/clear-all',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        fastify.log.warn('TEMP: Clearing all notifications (no admin check)');

        const result = await fastify.prisma.notification.deleteMany({});

        return {
          success: true,
          deletedCount: result.count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error clearing notifications');
        return reply.code(500).send({
          success: false,
          error: 'Failed to clear notifications',
        });
      }
    }
  );

  // ============================================
  // POST /notifications/test/create - Créer une notification de test
  // ============================================

  fastify.post(
    '/notifications/test/create',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const body = request.body as any;

        const notification = await notificationService.createMessageNotification({
          recipientUserId: body.recipientUserId || userId,
          senderId: userId,
          messageId: 'test-msg-' + Date.now(),
          conversationId: body.conversationId || 'test-conv-' + Date.now(),
          messagePreview: body.message || 'Test notification depuis API',
        });

        return {
          success: true,
          notification,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error creating test notification');
        return reply.code(500).send({
          success: false,
          error: 'Failed to create test notification',
        });
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
              deletedCount: { type: 'number' },
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
          return reply.code(403).send({
            success: false,
            error: 'Admin access required',
            debug: { user },
          });
        }

        fastify.log.warn({ user }, 'Admin clearing all notifications');

        const result = await fastify.prisma.notification.deleteMany({});

        return {
          success: true,
          deletedCount: result.count,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error clearing notifications');
        return reply.code(500).send({
          success: false,
          error: 'Failed to clear notifications',
        });
      }
    }
  );
}
