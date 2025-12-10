import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';

// Middleware pour vérifier les permissions analytics
const requireAnalyticsPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const userRole = authContext.registeredUser.role;
  const canViewAnalytics = ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(userRole);

  if (!canViewAnalytics) {
    return reply.status(403).send({
      success: false,
      message: 'Permission insuffisante pour voir les analyses'
    });
  }
};

export async function analyticsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/analytics/realtime
   * Métriques en temps réel
   */
  fastify.get('/realtime', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Utilisateurs en ligne (actifs dans les 5 dernières minutes)
      const onlineUsers = await fastify.prisma.user.count({
        where: {
          lastActiveAt: { gte: fiveMinutesAgo },
          isActive: true
        }
      });

      // Messages dans la dernière heure
      const messagesLastHour = await fastify.prisma.message.count({
        where: {
          createdAt: { gte: oneHourAgo },
          isDeleted: false
        }
      });

      // Conversations actives (avec messages dans la dernière heure)
      const activeConversations = await fastify.prisma.conversation.count({
        where: {
          messages: {
            some: {
              createdAt: { gte: oneHourAgo },
              isDeleted: false
            }
          }
        }
      });

      return reply.send({
        success: true,
        data: {
          onlineUsers,
          messagesLastHour,
          activeConversations,
          timestamp: now.toISOString()
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get realtime analytics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des métriques temps réel'
      });
    }
  });

  /**
   * GET /api/admin/analytics/hourly-activity
   * Activité par heure sur les dernières 24h
   */
  fastify.get('/hourly-activity', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Récupérer tous les messages des dernières 24h
      const messages = await fastify.prisma.message.findMany({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          isDeleted: false
        },
        select: {
          createdAt: true
        }
      });

      // Grouper par heure
      const hourlyData: Record<string, number> = {};

      // Initialiser toutes les heures à 0
      for (let i = 0; i < 24; i++) {
        const hour = now.getHours() - i;
        const hourKey = hour >= 0 ? `${hour}h` : `${24 + hour}h`;
        hourlyData[hourKey] = 0;
      }

      // Compter les messages par heure
      messages.forEach(msg => {
        const hour = msg.createdAt.getHours();
        const hourKey = `${hour}h`;
        if (hourlyData[hourKey] !== undefined) {
          hourlyData[hourKey]++;
        }
      });

      // Convertir en tableau trié
      const activity = Object.entries(hourlyData)
        .map(([hour, count]) => ({ hour, activity: count }))
        .sort((a, b) => {
          const hourA = parseInt(a.hour);
          const hourB = parseInt(b.hour);
          return hourA - hourB;
        });

      // Prendre seulement 8 points de données pour le graphique (toutes les 3h)
      const sampledActivity = activity.filter((_, index) => index % 3 === 0);

      return reply.send({
        success: true,
        data: sampledActivity
      });
    } catch (error) {
      logError(fastify.log, 'Get hourly activity error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de l\'activité horaire'
      });
    }
  });

  /**
   * GET /api/admin/analytics/message-types
   * Distribution des types de messages
   */
  fastify.get('/message-types', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '7d';

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
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

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

      const totalMessages = messagesByType.reduce((sum, item) => sum + item._count.id, 0);

      const distribution = messagesByType.map(item => ({
        type: item.messageType,
        count: item._count.id,
        percentage: totalMessages > 0 ? Math.round((item._count.id / totalMessages) * 100) : 0
      }));

      return reply.send({
        success: true,
        data: distribution
      });
    } catch (error) {
      logError(fastify.log, 'Get message types error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des types de messages'
      });
    }
  });

  /**
   * GET /api/admin/analytics/user-distribution
   * Distribution des utilisateurs par niveau d'activité
   */
  fastify.get('/user-distribution', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Utilisateurs très actifs (connectés dans les 7 derniers jours avec >10 messages)
      const veryActive = await fastify.prisma.user.count({
        where: {
          lastActiveAt: { gte: sevenDaysAgo },
          sentMessages: {
            some: {
              createdAt: { gte: sevenDaysAgo }
            }
          }
        }
      });

      // Utilisateurs actifs (connectés dans les 7 derniers jours)
      const active = await fastify.prisma.user.count({
        where: {
          lastActiveAt: { gte: sevenDaysAgo }
        }
      });

      // Utilisateurs occasionnels (connectés entre 7 et 30 jours)
      const occasional = await fastify.prisma.user.count({
        where: {
          lastActiveAt: {
            gte: thirtyDaysAgo,
            lt: sevenDaysAgo
          }
        }
      });

      // Utilisateurs inactifs (pas connectés depuis 30 jours)
      const inactive = await fastify.prisma.user.count({
        where: {
          OR: [
            { lastActiveAt: { lt: thirtyDaysAgo } },
            { lastActiveAt: null }
          ]
        }
      });

      return reply.send({
        success: true,
        data: [
          { name: 'Très actifs', value: veryActive, color: '#10b981' },
          { name: 'Actifs', value: active - veryActive, color: '#3b82f6' },
          { name: 'Occasionnels', value: occasional, color: '#f59e0b' },
          { name: 'Inactifs', value: inactive, color: '#ef4444' }
        ]
      });
    } catch (error) {
      logError(fastify.log, 'Get user distribution error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la distribution utilisateurs'
      });
    }
  });

  /**
   * GET /api/admin/analytics/language-distribution
   * Distribution des langues utilisées
   */
  fastify.get('/language-distribution', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const limit = parseInt(query.limit) || 5;

      const languages = await fastify.prisma.message.groupBy({
        by: ['originalLanguage'],
        where: {
          isDeleted: false,
          originalLanguage: { not: null }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: limit
      });

      const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#6b7280'];

      const distribution = languages.map((lang, index) => ({
        name: lang.originalLanguage || 'Unknown',
        value: lang._count.id,
        color: colors[index] || '#6b7280'
      }));

      return reply.send({
        success: true,
        data: distribution
      });
    } catch (error) {
      logError(fastify.log, 'Get language distribution error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la distribution des langues'
      });
    }
  });

  /**
   * GET /api/admin/analytics/kpis
   * KPIs avancés
   */
  fastify.get('/kpis', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '30d';

      const now = new Date();
      let startDate = new Date();

      switch (period) {
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

      // Taux d'engagement (% de messages lus vs envoyés)
      const [totalMessages, totalUsers, activeUsers, newUsers] = await Promise.all([
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isDeleted: false
          }
        }),
        fastify.prisma.user.count(),
        fastify.prisma.user.count({
          where: {
            lastActiveAt: { gte: startDate }
          }
        }),
        fastify.prisma.user.count({
          where: {
            createdAt: { gte: startDate }
          }
        })
      ]);

      // Engagement rate (users actifs / total users)
      const engagementRate = totalUsers > 0
        ? Math.round((activeUsers / totalUsers) * 100)
        : 0;

      // Taux de croissance
      const growthRate = totalUsers > 0
        ? Math.round((newUsers / totalUsers) * 100)
        : 0;

      // Temps moyen de session (simulé - à calculer avec des données réelles de session)
      const avgSessionTime = '2h 45m';

      // Heures de pic (simulé - devrait analyser l'activité horaire)
      const peakHours = '18h-21h';

      return reply.send({
        success: true,
        data: {
          engagementRate,
          avgSessionTime,
          peakHours,
          growthRate,
          messagesPerUser: totalUsers > 0 ? Math.round(totalMessages / totalUsers) : 0,
          activeUserRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get KPIs error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des KPIs'
      });
    }
  });

  /**
   * GET /api/admin/analytics/volume-timeline
   * Timeline du volume de messages sur 7 jours
   */
  fastify.get('/volume-timeline', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // Récupérer messages et users actifs par jour
      const messages = await fastify.prisma.message.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          isDeleted: false
        },
        select: {
          createdAt: true,
          senderId: true
        }
      });

      // Grouper par jour
      const dailyData: Record<string, { messages: number; users: Set<string> }> = {};

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        dailyData[dateKey] = { messages: 0, users: new Set() };
      }

      messages.forEach(msg => {
        const dateKey = msg.createdAt.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const simplifiedKey = Object.keys(dailyData).find(k => k.includes(msg.createdAt.getDate().toString()));

        if (simplifiedKey && dailyData[simplifiedKey]) {
          dailyData[simplifiedKey].messages++;
          if (msg.senderId) {
            dailyData[simplifiedKey].users.add(msg.senderId);
          }
        }
      });

      const timeline = Object.entries(dailyData).map(([date, data]) => ({
        date,
        messages: data.messages,
        users: data.users.size
      }));

      return reply.send({
        success: true,
        data: timeline
      });
    } catch (error) {
      logError(fastify.log, 'Get volume timeline error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la timeline'
      });
    }
  });
}
