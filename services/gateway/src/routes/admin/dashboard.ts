import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';

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
   */
  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate, requireDashboardPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheKey = 'admin:dashboard:stats';
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Toutes les statistiques en un seul roundtrip MongoDB
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
        newAnonymousUsers
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
        fastify.prisma.participant.count({ where: { type: 'anonymous', joinedAt: { gte: last24Hours } } })
      ]);

      const topLanguages = [
        { language: 'fr', count: 0 },
        { language: 'en', count: 0 }
      ];

      // Statistiques par rôle et par type (simplifiées pour éviter les erreurs circulaires)
      const usersByRole: Record<string, number> = {};
      const messagesByType: Record<string, number> = {};

      // Récupérer les permissions de l'utilisateur
      const authContext = (request as UnifiedAuthRequest).authContext;
      const userPermissions = {
        role: authContext.registeredUser.role,
        canManageUsers: ['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role),
        canManageContent: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role),
        canViewAnalytics: ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(authContext.registeredUser.role),
        canManageReports: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role)
      };

      const responseBody = {
        success: true,
        data: {
          statistics: {
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
            messagesByType
          },
          recentActivity: {
            newUsers,
            newConversations,
            newMessages,
            newAnonymousUsers
          },
          userPermissions,
          timestamp: now.toISOString()
        }
      };

      getCacheStore().set(cacheKey, JSON.stringify(responseBody), 60).catch(() => {});
      return reply.send(responseBody);
    } catch (error) {
      logError(fastify.log, 'Error fetching admin dashboard stats:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  });
}
