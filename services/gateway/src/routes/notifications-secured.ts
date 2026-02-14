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
import {
  notificationSchema,
  notificationPreferenceSchema,
  updateNotificationPreferencesRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

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
    preHandler: validateQuery(GetNotificationsQuerySchema),
    schema: {
      description: 'Retrieve paginated list of notifications for the authenticated user with comprehensive IDOR protection. Automatically removes expired notifications before fetching. Supports advanced filtering by read status, notification type, priority, and date range.',
      tags: ['notifications'],
      summary: 'Get user notifications (secured)',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'number',
            description: 'Pagination offset',
            default: 0,
            minimum: 0
          },
          limit: {
            type: 'number',
            description: 'Number of notifications per page',
            default: 20,
            minimum: 1,
            maximum: 100
          },
          unread: {
            type: 'boolean',
            description: 'Filter by read status (true = only unread)',
            default: false
          },
          type: {
            type: 'string',
            enum: ['all', 'new_conversation', 'new_message', 'message_edited', 'friend_request', 'friend_accepted', 'missed_call', 'mention', 'reaction', 'member_joined', 'system'],
            description: 'Filter by notification type',
            default: 'all'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: 'Filter by notification priority',
            nullable: true
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter notifications created after this date (ISO 8601)',
            nullable: true
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter notifications created before this date (ISO 8601)',
            nullable: true
          }
        }
      },
      response: {
        200: {
          description: 'Notifications retrieved successfully with IDOR protection',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: notificationSchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of notifications matching filter' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            },
            unreadCount: { type: 'number', description: 'Total unread notifications count for user' }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (100 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const { userId } = request.user as any;
      const query = request.query as z.infer<typeof GetNotificationsQuerySchema>;

      const { offset, limit, unread, type, priority, startDate, endDate } = query;

      const offsetNum = offset;
      const limitNum = limit;

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
      const [notifications, totalCount, unreadCountResult] = await Promise.all([
        fastify.prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
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
        }),
        fastify.prisma.notification.count({ where: whereClause }),
        fastify.prisma.notification.count({ where: { userId, isRead: false } })
      ]);

      const duration = Date.now() - startTime;

      notificationLogger.info('Fetched notifications', {
        userId,
        total: totalCount,
        unread: unreadCountResult,
        returned: notifications.length,
        durationMs: duration
      });

      // Normalize delivery field for old notifications missing pushSent/emailSent
      const normalizedNotifications = notifications.map((n: any) => ({
        ...n,
        delivery: {
          emailSent: false,
          pushSent: false,
          ...(typeof n.delivery === 'object' && n.delivery !== null ? n.delivery : {}),
        },
      }));

      return reply.send({
        success: true,
        data: normalizedNotifications,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + notifications.length < totalCount
        },
        unreadCount: unreadCountResult
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      notificationLogger.error('Get notifications error', error instanceof Error ? error : new Error(errorMessage), {
        userId: (request.user as any)?.userId,
        query: request.query
      });

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
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
    preHandler: validateParams(MarkAsReadParamSchema),
    schema: {
      description: 'Mark a specific notification as read. Uses atomic updateMany operation with IDOR protection to ensure users can only mark their own notifications. Logs potential IDOR attempts for security monitoring.',
      tags: ['notifications'],
      summary: 'Mark notification as read (secured)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Notification unique identifier',
            pattern: '^[a-f0-9]{24}$'
          }
        }
      },
      response: {
        200: {
          description: 'Notification marked as read successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Notification marked as read' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Notification not found or does not belong to user (IDOR protection)',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (100 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
          error: 'Notification not found'
        });
      }

      notificationLogger.info('Notification marked as read', {
        notificationId: id,
        userId
      });

      return reply.send({
        success: true,
        data: { message: 'Notification marked as read' }
      });

    } catch (error) {
      notificationLogger.error('Mark notification as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
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
    ],
    schema: {
      description: 'Mark all unread notifications as read for the authenticated user. Returns the count of notifications that were updated. Uses atomic updateMany with strict IDOR protection and aggressive rate limiting to prevent abuse.',
      tags: ['notifications'],
      summary: 'Mark all notifications as read (secured)',
      response: {
        200: {
          description: 'All notifications marked as read successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'All notifications marked as read' },
                count: { type: 'number', description: 'Number of notifications updated', example: 15 }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (10 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
        data: {
          message: 'All notifications marked as read',
          count: result.count
        }
      });

    } catch (error) {
      notificationLogger.error('Mark all notifications as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
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
    preHandler: validateParams(DeleteNotificationParamSchema),
    schema: {
      description: 'Delete a specific notification. This action is permanent and cannot be undone. Uses atomic deleteMany operation with IDOR protection to ensure users can only delete their own notifications. Logs potential IDOR attempts.',
      tags: ['notifications'],
      summary: 'Delete notification (secured)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Notification unique identifier',
            pattern: '^[a-f0-9]{24}$'
          }
        }
      },
      response: {
        200: {
          description: 'Notification deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Notification deleted' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Notification not found or does not belong to user (IDOR protection)',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (100 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
          error: 'Notification not found'
        });
      }

      notificationLogger.info('Notification deleted', {
        notificationId: id,
        userId
      });

      return reply.send({
        success: true,
        data: { message: 'Notification deleted' }
      });

    } catch (error) {
      notificationLogger.error('Delete notification error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
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
    ],
    schema: {
      description: 'Delete all read notifications for the authenticated user. This action is permanent and cannot be undone. Unread notifications will not be affected. Uses atomic deleteMany with strict IDOR protection and aggressive rate limiting.',
      tags: ['notifications'],
      summary: 'Delete all read notifications (secured)',
      response: {
        200: {
          description: 'Read notifications deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Read notifications deleted' },
                count: { type: 'number', description: 'Number of notifications deleted', example: 23 }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (10 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
        data: {
          message: 'Read notifications deleted',
          count: result.count
        }
      });

    } catch (error) {
      notificationLogger.error('Delete read notifications error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
  /**
   * LEGACY ROUTES REMOVED
   * Les routes /notifications/preferences ont été supprimées.
   *
   * Migration: Utiliser /me/preferences/notification à la place (nouveau système unifié UserPreferences).
   * - GET  /me/preferences/notification
   * - PUT  /me/preferences/notification
   * - PATCH /me/preferences/notification
   * - DELETE /me/preferences/notification
   *
   * Le nouveau système utilise UserPreferences.notification (JSON) au lieu du modèle NotificationPreference obsolète.
   */


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
    ],
    schema: {
      description: 'Retrieve notification statistics for the authenticated user, including total count, unread count, and breakdown by notification type. Uses aggregation with IDOR protection to ensure users can only view their own statistics.',
      tags: ['notifications'],
      summary: 'Get notification statistics (secured)',
      response: {
        200: {
          description: 'Notification statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                total: {
                  type: 'number',
                  description: 'Total number of notifications',
                  example: 42
                },
                unread: {
                  type: 'number',
                  description: 'Number of unread notifications',
                  example: 7
                },
                byType: {
                  type: 'object',
                  description: 'Count of notifications grouped by type',
                  additionalProperties: { type: 'number' },
                  example: {
                    'new_message': 25,
                    'friend_request': 5,
                    'missed_call': 3,
                    'system': 9
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (100 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
        error: 'Internal server error'
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
    preHandler: validateBody(BatchMarkAsReadSchema),
    schema: {
      description: 'Mark multiple notifications as read in a single batch operation. Maximum 100 notifications per batch. Uses atomic updateMany with IDOR protection to ensure users can only mark their own notifications. Very strict rate limiting (5 req/min) to prevent abuse.',
      tags: ['notifications'],
      summary: 'Batch mark notifications as read (secured)',
      body: {
        type: 'object',
        required: ['notificationIds'],
        properties: {
          notificationIds: {
            type: 'array',
            description: 'Array of notification IDs to mark as read',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'string',
              pattern: '^[a-f0-9]{24}$',
              description: 'MongoDB ObjectId'
            },
            example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
          }
        }
      },
      response: {
        200: {
          description: 'Notifications marked as read successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: '15 notifications marked as read',
                  description: 'Success message with count'
                },
                count: {
                  type: 'number',
                  description: 'Actual number of notifications updated (may be less than requested if some do not belong to user)',
                  example: 15
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid request data - validation failed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error message' }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - rate limit exceeded (5 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
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
        data: {
          message: `${result.count} notifications marked as read`,
          count: result.count
        }
      });

    } catch (error) {
      notificationLogger.error('Batch mark as read error', error instanceof Error ? error : new Error(String(error)));

      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}
