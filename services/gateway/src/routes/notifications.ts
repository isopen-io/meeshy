import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { validatePagination } from '../utils/pagination';
import {
  notificationSchema,
  notificationPreferenceSchema,
  updateNotificationPreferencesRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

// Schémas de validation
const createNotificationSchema = z.object({
  type: z.string(),
  title: z.string(),
  content: z.string(),
  data: z.string().optional()
});

const updatePreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  newMessageEnabled: z.boolean().optional(),
  missedCallEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
  conversationEnabled: z.boolean().optional(),
  dndEnabled: z.boolean().optional(),
  dndStartTime: z.string().optional(),
  dndEndTime: z.string().optional()
});

export async function notificationRoutes(fastify: FastifyInstance) {
  // Récupérer les notifications de l'utilisateur
  fastify.get('/notifications', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve paginated list of notifications for the authenticated user. Automatically removes expired notifications before fetching. Supports filtering by read status and notification type.',
      tags: ['notifications'],
      summary: 'Get user notifications',
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
            type: 'string',
            enum: ['true', 'false'],
            description: 'Filter by read status (true = only unread)',
            default: 'false'
          },
          type: {
            type: 'string',
            enum: ['all', 'new_conversation', 'new_message', 'message_edited', 'friend_request', 'friend_accepted', 'missed_call', 'mention', 'reaction', 'member_joined', 'system'],
            description: 'Filter by notification type',
            default: 'all'
          }
        }
      },
      response: {
        200: {
          description: 'Notifications retrieved successfully',
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
                total: { type: 'number', description: 'Total number of notifications' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            },
            unreadCount: { type: 'number', description: 'Total unread notifications count' }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
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
      const { offset, limit, unread = 'false', type } = request.query as any;

      const pagination = validatePagination(offset, limit, 100);

      const whereClause: any = { userId };
      if (unread === 'true') {
        whereClause.isRead = false;
      }

      // Filtre par type de notification
      if (type && type !== 'all') {
        whereClause.type = type;
      }

      // Supprimer les notifications expirées
      await fastify.prisma.notification.deleteMany({
        where: {
          userId,
          expiresAt: {
            lt: new Date()
          }
        }
      });

      const [notifications, totalCount, unreadCount] = await Promise.all([
        fastify.prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip: pagination.offset,
          take: pagination.limit,
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

      fastify.log.info(`[BACKEND] Chargement notifications: userId=${userId}, total=${totalCount}, unread=${unreadCount}, returned=${notifications.length}`);

      // Log détaillé des états isRead
      const readStats = notifications.reduce((acc, n) => {
        acc[n.isRead ? 'read' : 'unread']++;
        return acc;
      }, { read: 0, unread: 0 });

      fastify.log.info(`[BACKEND] États des notifications retournées: lues=${readStats.read}, non lues=${readStats.unread}`);

      return reply.send({
        success: true,
        data: notifications,
        pagination: {
          total: totalCount,
          limit: pagination.limit,
          offset: pagination.offset,
          hasMore: pagination.offset + notifications.length < totalCount
        },
        unreadCount
      });

    } catch (error) {
      // Log détaillé pour diagnostiquer l'erreur 500
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';

      fastify.log.error({
        error: errorMessage,
        stack: errorStack,
        userId: (request.user as any)?.userId,
        query: request.query
      }, 'Get notifications error');

      logError(fastify.log, 'Get notifications error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Marquer une notification comme lue
  fastify.patch('/notifications/:id/read', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Mark a specific notification as read. Only the notification owner can mark it as read.',
      tags: ['notifications'],
      summary: 'Mark notification as read',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Notification unique identifier'
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
                message: { type: 'string', example: 'Notification marquée comme lue' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Notification not found or does not belong to user',
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

      fastify.log.info(`[BACKEND] Requête marquage notification comme lue: notificationId=${id}, userId=${userId}`);

      const notification = await fastify.prisma.notification.findFirst({
        where: { id, userId }
      });

      if (!notification) {
        fastify.log.warn(`[BACKEND] Notification non trouvée: notificationId=${id}, userId=${userId}`);
        return reply.status(404).send({
          success: false,
          error: 'Notification non trouvée'
        });
      }

      fastify.log.info(`[BACKEND] Notification trouvée, isRead actuel: ${notification.isRead}`);

      await fastify.prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      fastify.log.info(`[BACKEND] Notification ${id} marquée comme lue dans MongoDB`);

      return reply.send({
        success: true,
        data: { message: 'Notification marquée comme lue' }
      });

    } catch (error) {
      logError(fastify.log, 'Mark notification as read error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Marquer toutes les notifications comme lues
  fastify.patch('/notifications/read-all', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Mark all unread notifications as read for the authenticated user. Returns the count of notifications that were updated.',
      tags: ['notifications'],
      summary: 'Mark all notifications as read',
      response: {
        200: {
          description: 'All notifications marked as read successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Toutes les notifications marquées comme lues' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
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

      fastify.log.info(`[BACKEND] Requête marquage de TOUTES les notifications comme lues: userId=${userId}`);

      // Compter d'abord le nombre de notifications non lues
      const unreadCount = await fastify.prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      fastify.log.info(`[BACKEND] Nombre de notifications non lues à marquer: ${unreadCount}`);

      const result = await fastify.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: { isRead: true }
      });

      fastify.log.info(`[BACKEND] ${result.count} notifications marquées comme lues dans MongoDB`);

      return reply.send({
        success: true,
        data: { message: 'Toutes les notifications marquées comme lues' }
      });

    } catch (error) {
      logError(fastify.log, 'Mark all notifications as read error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Supprimer une notification
  fastify.delete('/notifications/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a specific notification. Only the notification owner can delete it. This action is permanent and cannot be undone.',
      tags: ['notifications'],
      summary: 'Delete notification',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Notification unique identifier'
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
                message: { type: 'string', example: 'Notification supprimée' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Notification not found or does not belong to user',
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

      const notification = await fastify.prisma.notification.findFirst({
        where: { id, userId }
      });

      if (!notification) {
        return reply.status(404).send({
          success: false,
          error: 'Notification non trouvée'
        });
      }

      await fastify.prisma.notification.delete({
        where: { id }
      });

      return reply.send({
        success: true,
        data: { message: 'Notification supprimée' }
      });

    } catch (error) {
      logError(fastify.log, 'Delete notification error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Supprimer toutes les notifications lues
  fastify.delete('/notifications/read', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete all read notifications for the authenticated user. This action is permanent and cannot be undone. Unread notifications will not be affected.',
      tags: ['notifications'],
      summary: 'Delete all read notifications',
      response: {
        200: {
          description: 'Read notifications deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Notifications lues supprimées' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
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

      await fastify.prisma.notification.deleteMany({
        where: {
          userId,
          isRead: true
        }
      });

      return reply.send({
        success: true,
        data: { message: 'Notifications lues supprimées' }
      });

    } catch (error) {
      logError(fastify.log, 'Delete read notifications error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Note: Les routes /notifications/preferences ont été supprimées.
  // Utiliser /me/preferences/notification à la place (nouveau système unifié).

  // Créer une notification (pour les tests)
  fastify.post('/notifications/test', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Create a test notification for the authenticated user. This endpoint is primarily for testing and development purposes.',
      tags: ['notifications'],
      summary: 'Create test notification',
      body: {
        type: 'object',
        required: ['type', 'title', 'content'],
        properties: {
          type: {
            type: 'string',
            description: 'Notification type',
            example: 'system'
          },
          title: {
            type: 'string',
            description: 'Notification title',
            example: 'Test Notification'
          },
          content: {
            type: 'string',
            description: 'Notification content',
            example: 'This is a test notification'
          },
          data: {
            type: 'string',
            description: 'Additional data as JSON string (optional)',
            example: '{"key":"value"}'
          }
        }
      },
      response: {
        201: {
          description: 'Test notification created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: notificationSchema
          }
        },
        400: {
          description: 'Invalid request data',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Validation error message' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'array', items: { type: 'string' } },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - authentication required',
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
      const body = createNotificationSchema.parse(request.body);
      const { userId } = request.user as any;

      const notification = await fastify.prisma.notification.create({
        data: {
          userId,
          type: body.type,
          title: body.title,
          content: body.content,
          data: body.data
        }
      });

      return reply.status(201).send({
        success: true,
        data: notification
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Données invalides',
          details: error.errors
        });
      }

      logError(fastify.log, 'Create test notification error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Statistiques des notifications
  fastify.get('/notifications/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve notification statistics for the authenticated user, including total count, unread count, and breakdown by notification type.',
      tags: ['notifications'],
      summary: 'Get notification statistics',
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
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

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
      logError(fastify.log, 'Get notification stats error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });
}
