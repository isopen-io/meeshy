/**
 * Notification Routes - SECURED VERSION
 *
 * Security improvements:
 * - IDOR protection with userId verification BEFORE database queries
 * - Strict Zod validation on all inputs
 * - Rate limiting on all endpoints
 * - Input sanitization
 * - NoSQL injection prevention
 * - Security audit logging
 *
 * @module routes/notifications
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { notificationLogger, securityLogger } from '../utils/logger-enhanced';
import { SecuritySanitizer } from '../utils/sanitize';
import {
  GetNotificationsQuerySchema,
  CreateNotificationSchema,
  UpdateNotificationPreferencesSchema,
  MarkAsReadParamSchema,
  DeleteNotificationParamSchema,
  BatchMarkAsReadSchema,
  validateQuery,
  validateBody,
  validateParams
} from '../validation/notification-schemas';
import {
  createNotificationRateLimiter,
  createStrictRateLimiter,
  createBatchRateLimiter
} from '../utils/rate-limiter';

// Initialize rate limiters (Redis will be injected if available)
let notificationRateLimiter: ReturnType<typeof createNotificationRateLimiter>;
let strictRateLimiter: ReturnType<typeof createStrictRateLimiter>;
let batchRateLimiter: ReturnType<typeof createBatchRateLimiter>;

export async function notificationRoutes(fastify: FastifyInstance) {
  // Initialize rate limiters with Redis if available
  const redis = (fastify as any).redis; // Assuming Redis is attached to Fastify instance
  notificationRateLimiter = createNotificationRateLimiter(redis);
  strictRateLimiter = createStrictRateLimiter(redis);
  batchRateLimiter = createBatchRateLimiter(redis);

  /**
   * GET /notifications
   * Récupérer les notifications de l'utilisateur avec pagination
   *
   * Security:
   * - Rate limited: 100 req/min per user
   * - IDOR protected: only returns user's own notifications
   * - Validated query parameters
   */
  fastify.get('/notifications', {
    onRequest: [
      fastify.authenticate,
      notificationRateLimiter.middleware()
    ],
    preHandler: validateQuery(GetNotificationsQuerySchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const { userId } = request.user as any;
      const query = request.query as z.infer<typeof GetNotificationsQuerySchema>;

      const { page, limit, unread, type, priority, startDate, endDate } = query;

      const pageNum = page;
      const limitNum = limit;
      const offset = (pageNum - 1) * limitNum;

      // SECURITY: Build WHERE clause with userId first (IDOR protection)
      const whereClause: any = { userId };

      if (unread) {
        whereClause.isRead = false;
      }

      if (type && type !== 'all') {
        whereClause.type = type;
      }

      if (priority) {
        whereClause.priority = priority;
      }

      // Date range filtering
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt.lte = new Date(endDate);
        }
      }

      // SECURITY: Delete expired notifications atomically
      await fastify.prisma.notification.deleteMany({
        where: {
          userId, // IDOR protection
          expiresAt: {
            lt: new Date()
          }
        }
      });

      // Fetch notifications with IDOR protection (userId in WHERE clause)
      const notifications = await fastify.prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limitNum,
        include: {
          message: {
            include: {
              attachments: {
                select: {
                  id: true,
                  messageId: true,
                  fileName: true,
                  originalName: true,
                  mimeType: true,
                  fileSize: true,
                  fileUrl: true,
                  thumbnailUrl: true,
                  width: true,
                  height: true,
                  duration: true,
                  bitrate: true,
                  sampleRate: true,
                  codec: true,
                  channels: true,
                  fps: true,
                  videoCodec: true,
                  pageCount: true,
                  lineCount: true,
                  metadata: true,
                  uploadedBy: true,
                  isAnonymous: true,
                  createdAt: true
                }
              }
            }
          }
        }
      });

      const totalCount = await fastify.prisma.notification.count({
        where: whereClause
      });

      const unreadCount = await fastify.prisma.notification.count({
        where: {
          userId, // IDOR protection
          isRead: false
        }
      });

      const duration = Date.now() - startTime;

      notificationLogger.info('Fetched notifications', {
        userId,
        total: totalCount,
        unread: unreadCount,
        returned: notifications.length,
        durationMs: duration
      });

      return reply.send({
        success: true,
        data: {
          notifications: notifications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            hasMore: offset + notifications.length < totalCount
          },
          unreadCount
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      notificationLogger.error('Get notifications error', error instanceof Error ? error : new Error(errorMessage), {
        userId: (request.user as any)?.userId,
        query: request.query
      });

      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  });

  /**
   * PATCH /notifications/:id/read
   * Marquer une notification comme lue
   *
   * Security:
   * - Rate limited: 100 req/min per user
   * - IDOR protected: verifies userId BEFORE update
   * - Atomic updateMany operation
   */
  fastify.patch('/notifications/:id/read', {
    onRequest: [
      fastify.authenticate,
      notificationRateLimiter.middleware()
    ],
    preHandler: validateParams(MarkAsReadParamSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { userId } = request.user as any;

      notificationLogger.info('Marking notification as read', {
        notificationId: id,
        userId
      });

      // SECURITY: IDOR protection - updateMany with userId in WHERE clause
      // This ensures users can only update their own notifications
      const result = await fastify.prisma.notification.updateMany({
        where: {
          id,
          userId // CRITICAL: userId must be in WHERE clause
        },
        data: {
          isRead: true
        }
      });

      if (result.count === 0) {
        // Notification not found or not owned by user
        securityLogger.logAttempt('IDOR_ATTEMPT_NOTIFICATION_READ', {
          userId,
          notificationId: id,
          ip: request.ip
        });

        return reply.status(404).send({
          success: false,
          message: 'Notification not found'
        });
      }

      notificationLogger.info('Notification marked as read', {
        notificationId: id,
        userId
      });

      return reply.send({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      notificationLogger.error('Mark notification as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /notifications/read-all
   * Marquer toutes les notifications comme lues
   *
   * Security:
   * - Strict rate limited: 10 req/min per user
   * - IDOR protected: userId in WHERE clause
   * - Atomic updateMany operation
   */
  fastify.patch('/notifications/read-all', {
    onRequest: [
      fastify.authenticate,
      strictRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      notificationLogger.info('Marking all notifications as read', { userId });

      // Count unread first
      const unreadCount = await fastify.prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      // SECURITY: IDOR protection - updateMany with userId in WHERE clause
      const result = await fastify.prisma.notification.updateMany({
        where: {
          userId, // CRITICAL: userId must be in WHERE clause
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      notificationLogger.info('All notifications marked as read', {
        userId,
        count: result.count,
        unreadCount
      });

      return reply.send({
        success: true,
        message: 'All notifications marked as read',
        count: result.count
      });

    } catch (error) {
      notificationLogger.error('Mark all notifications as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * DELETE /notifications/:id
   * Supprimer une notification
   *
   * Security:
   * - Rate limited: 100 req/min per user
   * - IDOR protected: verifies userId BEFORE delete
   * - Atomic deleteMany operation
   */
  fastify.delete('/notifications/:id', {
    onRequest: [
      fastify.authenticate,
      notificationRateLimiter.middleware()
    ],
    preHandler: validateParams(DeleteNotificationParamSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { userId } = request.user as any;

      // SECURITY: IDOR protection - deleteMany with userId in WHERE clause
      const result = await fastify.prisma.notification.deleteMany({
        where: {
          id,
          userId // CRITICAL: userId must be in WHERE clause
        }
      });

      if (result.count === 0) {
        // Notification not found or not owned by user
        securityLogger.logAttempt('IDOR_ATTEMPT_NOTIFICATION_DELETE', {
          userId,
          notificationId: id,
          ip: request.ip
        });

        return reply.status(404).send({
          success: false,
          message: 'Notification not found'
        });
      }

      notificationLogger.info('Notification deleted', {
        notificationId: id,
        userId
      });

      return reply.send({
        success: true,
        message: 'Notification deleted'
      });

    } catch (error) {
      notificationLogger.error('Delete notification error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * DELETE /notifications/read
   * Supprimer toutes les notifications lues
   *
   * Security:
   * - Strict rate limited: 10 req/min per user
   * - IDOR protected: userId in WHERE clause
   * - Atomic deleteMany operation
   */
  fastify.delete('/notifications/read', {
    onRequest: [
      fastify.authenticate,
      strictRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      // SECURITY: IDOR protection - deleteMany with userId in WHERE clause
      const result = await fastify.prisma.notification.deleteMany({
        where: {
          userId, // CRITICAL: userId must be in WHERE clause
          isRead: true
        }
      });

      notificationLogger.info('Read notifications deleted', {
        userId,
        count: result.count
      });

      return reply.send({
        success: true,
        message: 'Read notifications deleted',
        count: result.count
      });

    } catch (error) {
      notificationLogger.error('Delete read notifications error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * GET /notifications/preferences
   * Récupérer les préférences de notification
   *
   * Security:
   * - Rate limited: 100 req/min per user
   * - IDOR protected: userId in WHERE clause
   */
  fastify.get('/notifications/preferences', {
    onRequest: [
      fastify.authenticate,
      notificationRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      // SECURITY: IDOR protection - userId in WHERE clause
      let preferences = await fastify.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      // Create default preferences if none exist
      if (!preferences) {
        preferences = await fastify.prisma.notificationPreference.create({
          data: {
            userId,
            pushEnabled: true,
            emailEnabled: true,
            soundEnabled: true,
            newMessageEnabled: true,
            missedCallEnabled: true,
            systemEnabled: true,
            conversationEnabled: true,
            dndEnabled: false
          }
        });
      }

      return reply.send({
        success: true,
        data: preferences
      });

    } catch (error) {
      notificationLogger.error('Get notification preferences error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * PUT /notifications/preferences
   * Mettre à jour les préférences de notification
   *
   * Security:
   * - Strict rate limited: 10 req/min per user
   * - IDOR protected: userId in WHERE clause
   * - Validated with Zod schema
   * - Sanitized inputs
   */
  fastify.put('/notifications/preferences', {
    onRequest: [
      fastify.authenticate,
      strictRateLimiter.middleware()
    ],
    preHandler: validateBody(UpdateNotificationPreferencesSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as z.infer<typeof UpdateNotificationPreferencesSchema>;
      const { userId } = request.user as any;

      // Check if preferences exist
      const existingPreferences = await fastify.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      let preferences;
      if (existingPreferences) {
        // SECURITY: IDOR protection - update with userId in WHERE clause
        preferences = await fastify.prisma.notificationPreference.update({
          where: { userId },
          data: body
        });
      } else {
        // Create new preferences
        preferences = await fastify.prisma.notificationPreference.create({
          data: {
            userId,
            ...body
          }
        });
      }

      notificationLogger.info('Notification preferences updated', {
        userId,
        changes: Object.keys(body)
      });

      return reply.send({
        success: true,
        message: 'Preferences updated',
        data: preferences
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      notificationLogger.error('Update notification preferences error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * GET /notifications/stats
   * Statistiques des notifications
   *
   * Security:
   * - Rate limited: 100 req/min per user
   * - IDOR protected: userId in WHERE clause
   */
  fastify.get('/notifications/stats', {
    onRequest: [
      fastify.authenticate,
      notificationRateLimiter.middleware()
    ]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      // SECURITY: IDOR protection - userId in WHERE clause
      const stats = await fastify.prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: {
          id: true
        }
      });

      const totalCount = await fastify.prisma.notification.count({
        where: { userId }
      });

      const unreadCount = await fastify.prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      return reply.send({
        success: true,
        data: {
          total: totalCount,
          unread: unreadCount,
          byType: stats.reduce((acc: any, stat: any) => {
            acc[stat.type] = stat._count.id;
            return acc;
          }, {} as Record<string, number>)
        }
      });

    } catch (error) {
      notificationLogger.error('Get notification stats error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  /**
   * POST /notifications/batch/mark-read
   * Marquer plusieurs notifications comme lues en batch
   *
   * Security:
   * - Batch rate limited: 5 req/min per user
   * - IDOR protected: userId in WHERE clause
   * - Limited to 100 notifications per batch
   */
  fastify.post('/notifications/batch/mark-read', {
    onRequest: [
      fastify.authenticate,
      batchRateLimiter.middleware()
    ],
    preHandler: validateBody(BatchMarkAsReadSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { notificationIds } = request.body as z.infer<typeof BatchMarkAsReadSchema>;
      const { userId } = request.user as any;

      // SECURITY: IDOR protection - updateMany with userId AND notificationIds in WHERE clause
      const result = await fastify.prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId // CRITICAL: userId must be in WHERE clause
        },
        data: {
          isRead: true
        }
      });

      notificationLogger.info('Batch mark as read', {
        userId,
        requested: notificationIds.length,
        updated: result.count
      });

      return reply.send({
        success: true,
        message: `${result.count} notifications marked as read`,
        count: result.count
      });

    } catch (error) {
      notificationLogger.error('Batch mark as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });
}
