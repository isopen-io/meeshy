import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';

// Middleware pour vérifier les permissions admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const userRole = authContext.registeredUser.role;
  const canView = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT'].includes(userRole);

  if (!canView) {
    return reply.status(403).send({
      success: false,
      message: 'Permission insuffisante'
    });
  }
};

export async function messagesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/messages/stats
   * Statistiques détaillées des messages
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '30d';

      // Calculer la date de début
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Total messages
      const [totalMessages, deletedMessages, editedMessages] = await Promise.all([
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: true
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isEdited: true,
            isDeleted: false
          }
        })
      ]);

      // Messages par type
      const messagesByType = await fastify.prisma.message.groupBy({
        by: ['messageType'],
        where: {
          createdAt: { gte: startDate },
          isDeleted: false
        },
        _count: {
          id: true
        }
      });

      const typeDistribution = messagesByType.reduce((acc, item) => {
        acc[item.messageType] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Messages par période (timeline)
      const messages = await fastify.prisma.message.findMany({
        where: {
          createdAt: { gte: startDate },
          isDeleted: false
        },
        select: {
          createdAt: true,
          content: true
        }
      });

      // Grouper par jour
      const dailyMessages: Record<string, number> = {};
      const days = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMessages[dateKey] = 0;
      }

      messages.forEach(msg => {
        const dateKey = msg.createdAt.toISOString().split('T')[0];
        if (dailyMessages[dateKey] !== undefined) {
          dailyMessages[dateKey]++;
        }
      });

      const messagesByPeriod = Object.entries(dailyMessages).map(([date, count]) => ({
        date,
        count
      }));

      // Longueur moyenne des messages
      const messageLengths = messages
        .map(msg => msg.content?.length || 0)
        .filter(len => len > 0);

      const averageLength = messageLengths.length > 0
        ? Math.round(
            messageLengths.reduce((sum, len) => sum + len, 0) / messageLengths.length
          )
        : 0;

      // Messages traduits (ont au moins une traduction dans le JSON)
      const messagesWithTranslations = await fastify.prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          translations: {
            not: null
          }
        }
      });

      const translatedPercentage = totalMessages > 0
        ? Math.round((messagesWithTranslations / totalMessages) * 100)
        : 0;

      // Top utilisateurs les plus actifs (envoi de messages)
      const topSenders = await fastify.prisma.message.groupBy({
        by: ['senderId'],
        where: {
          createdAt: { gte: startDate },
          isDeleted: false,
          senderId: { not: null }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      const topSendersData = await Promise.all(
        topSenders.map(async (sender) => {
          const user = await fastify.prisma.user.findUnique({
            where: { id: sender.senderId! },
            select: {
              id: true,
              username: true,
              displayName: true
            }
          });

          return {
            userId: sender.senderId,
            username: user?.username || 'Unknown',
            displayName: user?.displayName,
            messageCount: sender._count.id
          };
        })
      );

      // Messages avec pièces jointes
      const messagesWithAttachments = await fastify.prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          isDeleted: false,
          attachments: {
            some: {}
          }
        }
      });

      return reply.send({
        success: true,
        data: {
          totalMessages,
          deletedMessages,
          editedMessages,
          messagesByType: typeDistribution,
          messagesByPeriod,
          averageLength,
          translatedMessages: messagesWithTranslations,
          translatedPercentage,
          topSenders: topSendersData,
          messagesWithAttachments,
          attachmentRate: totalMessages > 0
            ? Math.round((messagesWithAttachments / totalMessages) * 100)
            : 0,
          period
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get message stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques des messages'
      });
    }
  });

  /**
   * GET /api/admin/messages/trends
   * Tendances des messages (heure de pointe, jours actifs, etc.)
   */
  fastify.get('/trends', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Récupérer tous les messages des 7 derniers jours
      const messages = await fastify.prisma.message.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          isDeleted: false
        },
        select: {
          createdAt: true
        }
      });

      // Analyser par heure
      const hourlyActivity: Record<number, number> = {};
      for (let i = 0; i < 24; i++) {
        hourlyActivity[i] = 0;
      }

      // Analyser par jour de semaine
      const weekdayActivity: Record<number, number> = {};
      for (let i = 0; i < 7; i++) {
        weekdayActivity[i] = 0;
      }

      messages.forEach(msg => {
        const hour = msg.createdAt.getHours();
        const weekday = msg.createdAt.getDay();

        hourlyActivity[hour]++;
        weekdayActivity[weekday]++;
      });

      // Trouver l'heure de pointe
      const peakHour = Object.entries(hourlyActivity).reduce((max, [hour, count]) => {
        return count > max.count ? { hour: parseInt(hour), count } : max;
      }, { hour: 0, count: 0 });

      // Trouver le jour le plus actif
      const weekdayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const peakWeekday = Object.entries(weekdayActivity).reduce((max, [day, count]) => {
        return count > max.count ? { day: parseInt(day), count } : max;
      }, { day: 0, count: 0 });

      return reply.send({
        success: true,
        data: {
          peakHour: {
            hour: peakHour.hour,
            label: `${peakHour.hour}h`,
            count: peakHour.count
          },
          peakWeekday: {
            day: peakWeekday.day,
            label: weekdayNames[peakWeekday.day],
            count: peakWeekday.count
          },
          hourlyActivity: Object.entries(hourlyActivity).map(([hour, count]) => ({
            hour: `${hour}h`,
            count
          })),
          weekdayActivity: Object.entries(weekdayActivity).map(([day, count]) => ({
            day: weekdayNames[parseInt(day)],
            count
          }))
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get message trends error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des tendances'
      });
    }
  });

  /**
   * GET /api/admin/messages/engagement
   * Métriques d'engagement (réactions, réponses, etc.)
   */
  fastify.get('/engagement', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '7d';

      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const [
        totalMessages,
        messagesWithReactions,
        messagesWithReplies,
        totalReactions,
        totalReplies
      ] = await Promise.all([
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false,
            reactions: {
              some: {}
            }
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false,
            replies: {
              some: {}
            }
          }
        }),
        fastify.prisma.reaction.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false,
            replyToId: { not: null }
          }
        })
      ]);

      // Engagement rates
      const reactionRate = totalMessages > 0
        ? Math.round((messagesWithReactions / totalMessages) * 100)
        : 0;

      const replyRate = totalMessages > 0
        ? Math.round((messagesWithReplies / totalMessages) * 100)
        : 0;

      return reply.send({
        success: true,
        data: {
          totalMessages,
          messagesWithReactions,
          messagesWithReplies,
          totalReactions,
          totalReplies,
          reactionRate,
          replyRate,
          avgReactionsPerMessage: totalMessages > 0
            ? Math.round((totalReactions / totalMessages) * 10) / 10
            : 0,
          avgRepliesPerMessage: totalMessages > 0
            ? Math.round((totalReplies / totalMessages) * 10) / 10
            : 0
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get message engagement error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de l\'engagement'
      });
    }
  });
}
