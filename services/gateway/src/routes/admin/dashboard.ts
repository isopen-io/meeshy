import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendInternalError } from '../../utils/response.js';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';

const DASHBOARD_CACHE_KEY = 'admin:dashboard:stats';
const DASHBOARD_CACHE_TTL = 600; // 10 minutes

// Middleware pour vérifier les permissions dashboard
const requireDashboardPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const userRole = authContext.registeredUser.role;
  const canViewDashboard = ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(userRole);

  if (!canViewDashboard) {
    return reply.status(403).send({
      success: false,
      message: 'Permission insuffisante pour voir le tableau de bord'
    });
  }
};

export async function dashboardRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/dashboard
   * Récupère les statistiques complètes du tableau de bord administrateur
   * Cache Redis 10 min — les stats dashboard n'ont pas besoin d'être en temps réel.
   */
  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate, requireDashboardPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const cacheStore = getCacheStore();

      const cached = await cacheStore.get(DASHBOARD_CACHE_KEY);
      if (cached) {
        const authContext = (request as UnifiedAuthRequest).authContext;
        const userPermissions = {
          role: authContext.registeredUser.role,
          canManageUsers: ['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role),
          canManageContent: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role),
          canViewAnalytics: ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(authContext.registeredUser.role),
          canManageReports: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role)
        };
        reply.header('Cache-Control', 'private, max-age=600');
        return sendSuccess(reply, { ...JSON.parse(cached), userPermissions, timestamp: now.toISOString() });
      }

      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Toutes les queries en un seul Promise.all pour minimiser la latence totale
      const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers,
        totalAnonymousUsers,
        activeAnonymousUsers,
        inactiveAnonymousUsers,
        totalMessages,
        totalCommunities,
        totalTranslations,
        totalShareLinks,
        activeShareLinks,
        totalReports,
        totalInvitations,
        newUsers,
        newConversations,
        newMessages,
        newAnonymousUsers,
      ] = await Promise.all([
        fastify.prisma.user.count(),
        fastify.prisma.user.count({ where: { isActive: true } }),
        fastify.prisma.user.count({ where: { isActive: false } }),
        fastify.prisma.user.count({ where: { role: { in: ['ADMIN', 'BIGBOSS'] } } }),
        fastify.prisma.participant.count({ where: { type: 'anonymous' } }),
        fastify.prisma.participant.count({ where: { type: 'anonymous', isActive: true } }),
        fastify.prisma.participant.count({ where: { type: 'anonymous', isActive: false } }),
        fastify.prisma.message.count({ where: { deletedAt: null } }),
        fastify.prisma.community.count(),
        fastify.prisma.message.count({ where: { translations: { not: { equals: null } } } }),
        fastify.prisma.conversationShareLink.count(),
        fastify.prisma.conversationShareLink.count({ where: { isActive: true } }),
        fastify.prisma.report.count(),
        fastify.prisma.communityMember.count(),
        fastify.prisma.user.count({ where: { createdAt: { gte: last24Hours } } }),
        fastify.prisma.conversation.count({ where: { createdAt: { gte: last24Hours } } }),
        fastify.prisma.message.count({ where: { createdAt: { gte: last24Hours }, deletedAt: null } }),
        fastify.prisma.participant.count({ where: { type: 'anonymous', joinedAt: { gte: last24Hours } } }),
      ]);

      const topLanguages = [
        { language: 'fr', count: 0 },
        { language: 'en', count: 0 }
      ];
      const usersByRole: Record<string, number> = {};
      const messagesByType: Record<string, number> = {};

      const statistics = {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers,
        totalAnonymousUsers,
        activeAnonymousUsers,
        inactiveAnonymousUsers,
        totalMessages,
        totalCommunities,
        totalTranslations,
        totalShareLinks,
        activeShareLinks,
        totalReports,
        totalInvitations,
        topLanguages,
        usersByRole,
        messagesByType,
      };
      const recentActivity = { newUsers, newConversations, newMessages, newAnonymousUsers };

      // Mettre en cache les stats (sans les permissions qui sont par-utilisateur)
      await cacheStore.set(DASHBOARD_CACHE_KEY, JSON.stringify({ statistics, recentActivity }), DASHBOARD_CACHE_TTL);

      const authContext = (request as UnifiedAuthRequest).authContext;
      const userPermissions = {
        role: authContext.registeredUser.role,
        canManageUsers: ['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role),
        canManageContent: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role),
        canViewAnalytics: ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(authContext.registeredUser.role),
        canManageReports: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role)
      };

      reply.header('Cache-Control', 'private, max-age=600');
      return sendSuccess(reply, { statistics, recentActivity, userPermissions, timestamp: now.toISOString() });
    } catch (error) {
      logError(fastify.log, 'Error fetching admin dashboard stats:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  });

  /**
   * POST /api/admin/dashboard/invalidate-cache
   * Force l'invalidation du cache dashboard (BIGBOSS/ADMIN uniquement)
   */
  fastify.post('/dashboard/invalidate-cache', {
    onRequest: [fastify.authenticate, requireDashboardPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role)) {
      return sendForbidden(reply, 'BIGBOSS ou ADMIN requis');
    }
    try {
      await getCacheStore().del(DASHBOARD_CACHE_KEY);
      return sendSuccess(reply, undefined, { message: 'Cache dashboard invalidé' });
    } catch (error) {
      logError(fastify.log, 'Error invalidating dashboard cache:', error);
      return sendInternalError(reply, 'Erreur invalidation cache');
    }
  });
}
