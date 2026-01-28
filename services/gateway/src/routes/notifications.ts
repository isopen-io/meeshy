/**
 * Routes API Notifications
 *
 * Endpoints modernes utilisant NotificationService et NotificationFormatter
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NotificationService } from '../services/notifications/NotificationService';
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
  const notificationService = new NotificationService(fastify.prisma, (fastify as any).io);

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
        const { userId } = request.user as any;
        const { offset = 0, limit = 20, unreadOnly = false } = request.query as any;

        const pagination = validatePagination(offset, limit, 100);

        const { notifications, total } = await notificationService.getUserNotifications({
          userId,
          limit: pagination.limit,
          offset: pagination.offset,
          unreadOnly,
        });

        const unreadCount = await notificationService.getUnreadCount(userId);

        return NotificationFormatter.formatPaginatedResponse({
          notifications,
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
        const { userId } = request.user as any;
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
        const { userId } = request.user as any;

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
        const { userId } = request.user as any;
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
        const { userId } = request.user as any;

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
}
