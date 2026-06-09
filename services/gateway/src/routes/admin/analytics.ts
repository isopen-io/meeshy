import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendPaginatedSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validateQuery } from '../../validation/helpers.js';
import { AnalyticsMessageTypesQuerySchema, AnalyticsLanguageDistQuerySchema, AnalyticsKpisQuerySchema } from '../../validation/admin-schemas.js';
import { getCacheStore } from '../../services/CacheStore';

const CACHE_TTL = {
  realtime: 60,         // 1 min — "real-time" freshness
  hourly: 300,          // 5 min — 3h buckets change slowly
  daily: 600,           // 10 min — daily aggregates
  distribution: 300,    // 5 min
  kpis: 300,            // 5 min
} as const;

// Middleware pour vérifier les permissions analytics
const requireAnalyticsPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
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
   * Métriques en temps réel — 3 counts en parallèle, cache 60s
   */
  fastify.get('/realtime', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheKey = 'admin:analytics:realtime';
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const [onlineUsers, messagesLastHour, activeConversationsGroups] = await Promise.all([
        fastify.prisma.user.count({
          where: { lastActiveAt: { gte: fiveMinutesAgo }, isActive: true }
        }),
        fastify.prisma.message.count({
          where: { createdAt: { gte: oneHourAgo }, deletedAt: null }
        }),
        // groupBy is far cheaper than conversation.count where messages.some{} subquery
        fastify.prisma.message.groupBy({
          by: ['conversationId'],
          where: { createdAt: { gte: oneHourAgo }, deletedAt: null }
        }),
      ]);

      const responseBody = {
        success: true,
        data: {
          onlineUsers,
          messagesLastHour,
          activeConversations: activeConversationsGroups.length,
          timestamp: now.toISOString()
        }
      };

      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.realtime).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * 8 buckets de 3h sur les 24 dernières heures — 8 COUNT en parallèle, cache 5 min
   * Remplace findMany (charge tous les messages en mémoire) par des COUNT par tranche.
   */
  fastify.get('/hourly-activity', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheKey = 'admin:analytics:hourly-activity';
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();

      // 8 buckets of 3h each = 24h, parallel COUNT queries
      const buckets = await Promise.all(
        Array.from({ length: 8 }, (_, i) => {
          const bucketEnd = new Date(now.getTime() - i * 3 * 60 * 60 * 1000);
          const bucketStart = new Date(bucketEnd.getTime() - 3 * 60 * 60 * 1000);
          const label = `${String(bucketStart.getHours()).padStart(2, '0')}h`;
          return fastify.prisma.message.count({
            where: { createdAt: { gte: bucketStart, lt: bucketEnd }, deletedAt: null }
          }).then(activity => ({ hour: label, activity }));
        })
      );

      const sampledActivity = buckets.reverse();

      const responseBody = { success: true, data: sampledActivity };
      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.hourly).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * Distribution des types de messages — groupBy natif, cache 5 min
   */
  fastify.get('/message-types', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission],
    preHandler: [validateQuery(AnalyticsMessageTypesQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '7d';

      const cacheKey = `admin:analytics:message-types:${period}`;
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();
      const startDate = new Date();
      switch (period) {
        case '24h': startDate.setHours(startDate.getHours() - 24); break;
        case '7d':  startDate.setDate(startDate.getDate() - 7);  break;
        case '30d': startDate.setDate(startDate.getDate() - 30); break;
        default:    startDate.setDate(startDate.getDate() - 7);
      }

      const messagesByType = await fastify.prisma.message.groupBy({
        by: ['messageType'],
        where: { createdAt: { gte: startDate }, deletedAt: null },
        _count: { id: true }
      });

      const totalMessages = messagesByType.reduce((sum, item) => sum + item._count.id, 0);
      const distribution = messagesByType.map(item => ({
        type: item.messageType,
        count: item._count.id,
        percentage: totalMessages > 0 ? Math.round((item._count.id / totalMessages) * 100) : 0
      }));

      const responseBody = { success: true, data: distribution };
      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.distribution).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * Distribution par niveau d'activité — 4 counts en parallèle, cache 5 min
   */
  fastify.get('/user-distribution', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheKey = 'admin:analytics:user-distribution';
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [veryActive, active, occasional, inactive] = await Promise.all([
        fastify.prisma.user.count({
          where: {
            lastActiveAt: { gte: sevenDaysAgo },
            participations: {
              some: { sentMessages: { some: { createdAt: { gte: sevenDaysAgo } } } }
            }
          }
        }),
        fastify.prisma.user.count({ where: { lastActiveAt: { gte: sevenDaysAgo } } }),
        fastify.prisma.user.count({
          where: { lastActiveAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo } }
        }),
        fastify.prisma.user.count({
          where: { OR: [{ lastActiveAt: { lt: thirtyDaysAgo } }, { lastActiveAt: null }] }
        }),
      ]);

      const responseBody = {
        success: true,
        data: [
          { name: 'Très actifs',  value: veryActive,            color: '#10b981' },
          { name: 'Actifs',       value: active - veryActive,   color: '#3b82f6' },
          { name: 'Occasionnels', value: occasional,             color: '#f59e0b' },
          { name: 'Inactifs',     value: inactive,               color: '#ef4444' }
        ]
      };

      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.distribution).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * Distribution des langues — groupBy natif, cache 5 min
   */
  fastify.get('/language-distribution', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission],
    preHandler: [validateQuery(AnalyticsLanguageDistQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const limit = parseInt(query.limit) || 5;

      const cacheKey = `admin:analytics:language-distribution:${limit}`;
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const languages = await fastify.prisma.message.groupBy({
        by: ['originalLanguage'],
        where: { deletedAt: null, originalLanguage: { not: '' } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#6b7280'];
      const distribution = languages.map((lang, index) => ({
        name: lang.originalLanguage || 'Unknown',
        value: lang._count.id,
        color: colors[index] || '#6b7280'
      }));

      const responseBody = { success: true, data: distribution };
      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.distribution).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * KPIs avancés — cache 5 min
   */
  fastify.get('/kpis', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission],
    preHandler: [validateQuery(AnalyticsKpisQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '30d';

      const cacheKey = `admin:analytics:kpis:${period}`;
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();
      const startDate = new Date();
      switch (period) {
        case '7d':  startDate.setDate(startDate.getDate() - 7);  break;
        case '30d': startDate.setDate(startDate.getDate() - 30); break;
        case '90d': startDate.setDate(startDate.getDate() - 90); break;
        default:    startDate.setDate(startDate.getDate() - 30);
      }

      const [totalMessages, totalUsers, activeUsers, newUsers] = await Promise.all([
        fastify.prisma.message.count({ where: { createdAt: { gte: startDate }, deletedAt: null } }),
        fastify.prisma.user.count(),
        fastify.prisma.user.count({ where: { lastActiveAt: { gte: startDate } } }),
        fastify.prisma.user.count({ where: { createdAt: { gte: startDate } } })
      ]);

      const engagementRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
      const growthRate     = totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100)    : 0;

      const responseBody = {
        success: true,
        data: {
          engagementRate,
          avgSessionTime: '2h 45m',
          peakHours: '18h-21h',
          growthRate,
          messagesPerUser: totalUsers > 0 ? Math.round(totalMessages / totalUsers) : 0,
          activeUserRate:  totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100)  : 0
        }
      };

      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.kpis).catch(() => {});
      return sendSuccess(reply, responseBody.data);
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
   * 7 jours de volume — 7 COUNT en parallèle, cache 10 min
   * Remplace findMany+join (charge tous les messages en mémoire) par des COUNT par jour.
   */
  fastify.get('/volume-timeline', {
    onRequest: [fastify.authenticate, requireAnalyticsPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheKey = 'admin:analytics:volume-timeline';
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();

      const timeline = await Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const dayStart = new Date(now);
          dayStart.setDate(dayStart.getDate() - (6 - i));
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);
          const dateLabel = dayStart.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

          return fastify.prisma.message.count({
            where: { createdAt: { gte: dayStart, lte: dayEnd }, deletedAt: null }
          }).then(messages => ({ date: dateLabel, messages }));
        })
      );

      const responseBody = { success: true, data: timeline };
      getCacheStore().set(cacheKey, JSON.stringify(responseBody), CACHE_TTL.daily).catch(() => {});
      return sendSuccess(reply, responseBody.data);
    } catch (error) {
      logError(fastify.log, 'Get volume timeline error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la timeline'
      });
    }
  });
}
