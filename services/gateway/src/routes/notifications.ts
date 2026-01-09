import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { validatePagination } from '../utils/pagination';

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
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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

  // Récupérer les préférences de notification
  fastify.get('/notifications/preferences', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;

      // Récupérer les préférences ou créer avec valeurs par défaut
      let preferences = await fastify.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      // Si aucune préférence n'existe, créer avec valeurs par défaut
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
      logError(fastify.log, 'Get notification preferences error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Mettre à jour les préférences de notification
  fastify.put('/notifications/preferences', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updatePreferencesSchema.parse(request.body);
      const { userId } = request.user as any;

      // Vérifier si les préférences existent
      const existingPreferences = await fastify.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      let preferences;
      if (existingPreferences) {
        // Mettre à jour les préférences existantes
        preferences = await fastify.prisma.notificationPreference.update({
          where: { userId },
          data: body
        });
      } else {
        // Créer de nouvelles préférences
        preferences = await fastify.prisma.notificationPreference.create({
          data: {
            userId,
            ...body
          }
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Préférences mises à jour',
          preferences
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Données invalides',
          details: error.errors
        });
      }

      logError(fastify.log, 'Update notification preferences error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });

  // Créer une notification (pour les tests)
  fastify.post('/notifications/test', {
    onRequest: [fastify.authenticate]
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
    onRequest: [fastify.authenticate]
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
