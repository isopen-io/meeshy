import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';

// Middleware pour vérifier les permissions dashboard
const requireDashboardPermission = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
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
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 1. Statistiques des utilisateurs
      const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers
      ] = await Promise.all([
        fastify.prisma.user.count(),
        fastify.prisma.user.count({ where: { isActive: true } }),
        fastify.prisma.user.count({ where: { isActive: false } }),
        fastify.prisma.user.count({ where: { role: { in: ['ADMIN', 'BIGBOSS'] } } })
      ]);

      // 2. Statistiques des utilisateurs anonymes
      const [
        totalAnonymousUsers,
        activeAnonymousUsers,
        inactiveAnonymousUsers
      ] = await Promise.all([
        fastify.prisma.anonymousParticipant.count(),
        fastify.prisma.anonymousParticipant.count({ where: { isActive: true } }),
        fastify.prisma.anonymousParticipant.count({ where: { isActive: false } })
      ]);

      // 3. Statistiques des messages
      const totalMessages = await fastify.prisma.message.count({
        where: { isDeleted: false }
      });

      // 4. Statistiques des communautés
      const totalCommunities = await fastify.prisma.community.count();

      // 5. Statistiques des traductions (compte des messages qui ont été traduits)
      const totalTranslations = await fastify.prisma.message.count({
        where: {
          translations: { not: null }
        }
      });

      // 6. Statistiques des liens de partage
      const [totalShareLinks, activeShareLinks] = await Promise.all([
        fastify.prisma.conversationShareLink.count(),
        fastify.prisma.conversationShareLink.count({ where: { isActive: true } })
      ]);

      // 7. Statistiques des signalements
      const totalReports = await fastify.prisma.report.count();

      // 8. Statistiques des invitations (utiliser le modèle communityMember comme proxy)
      const totalInvitations = await fastify.prisma.communityMember.count();

      // 9. Top langues utilisées (simplifiée)
      const topLanguages = [
        { language: 'fr', count: 0 },
        { language: 'en', count: 0 }
      ];

      // Activité récente (dernières 24 heures)
      const [newUsers, newConversations, newMessages, newAnonymousUsers] = await Promise.all([
        fastify.prisma.user.count({
          where: { createdAt: { gte: last24Hours } }
        }),
        fastify.prisma.conversation.count({
          where: { createdAt: { gte: last24Hours } }
        }),
        fastify.prisma.message.count({
          where: { createdAt: { gte: last24Hours }, isDeleted: false }
        }),
        fastify.prisma.anonymousParticipant.count({
          where: { joinedAt: { gte: last24Hours } }
        })
      ]);

      // Statistiques par rôle et par type (simplifiées pour éviter les erreurs circulaires)
      const usersByRole: Record<string, number> = {};
      const messagesByType: Record<string, number> = {};

      // Récupérer les permissions de l'utilisateur
      const authContext = (request as any).authContext;
      const userPermissions = {
        role: authContext.registeredUser.role,
        canManageUsers: ['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role),
        canManageContent: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role),
        canViewAnalytics: ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(authContext.registeredUser.role),
        canManageReports: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(authContext.registeredUser.role)
      };

      return reply.send({
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
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching admin dashboard stats:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  });
}
