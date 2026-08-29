import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendForbidden, sendInternalError } from '../../utils/response.js';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { requirePermission } from '../../middleware/authorize';
import { permissionsService } from '../../services/admin/permissions.service';
import { UserRoleEnum } from '@meeshy/shared/types';

const DASHBOARD_CACHE_KEY = 'admin:dashboard:stats';
const DASHBOARD_CACHE_TTL = 600; // 10 minutes

// Middleware pour vérifier les permissions dashboard
// `requireDashboardPermission` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
//
// #4157 — `canViewAnalytics` admettait ANALYST (qui n'a PAS `canAccessAdmin`
// dans la matrice centrale) et EXCLUAIT MODERATOR (qui l'a) : une contradiction
// dans les DEUX sens sur la même route. Le tableau de bord est la PORTE
// D'ENTRÉE de l'administration, pas une vue analytique parmi d'autres — sa
// garde est donc `canAccessAdmin`, le laissez-passer que la matrice donne
// exactement à BIGBOSS/ADMIN/MODERATOR/AUDIT, ni plus ni moins.
const requireDashboardPermission = requirePermission('canAccessAdmin');

/**
 * Les quatre drapeaux que le tableau de bord affiche — DÉRIVÉS de la matrice.
 *
 * C'étaient une CINQUIÈME et une SIXIÈME copie des permissions, composées à
 * partir de listes de rôles en dur, à deux endroits de ce fichier, et servies
 * au client à côté des statistiques (#4153).
 *
 * Elles échappaient à la garde de #4152 parce qu'elles ne nomment pas
 * `canAccessAdmin` : elles inventent leur propre vocabulaire
 * (`canManageContent`, `canManageReports`) pour des droits que la matrice
 * porte déjà sous d'autres noms. C'est la forme la plus discrète du défaut —
 * une copie qui ne ressemble pas à l'original.
 */
function dashboardPermissions(role: string) {
  const central = permissionsService.getPermissions(role as UserRoleEnum);
  return {
    role,
    canManageUsers: central.canUpdateUsers,
    canManageContent: central.canModerateContent,
    canViewAnalytics: central.canViewAnalytics,
    canManageReports: central.canModerateContent,
  };
}

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
        const userPermissions = dashboardPermissions(authContext.registeredUser.role);
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
      const userPermissions = dashboardPermissions(authContext.registeredUser.role);

      reply.header('Cache-Control', 'private, max-age=600');
      return sendSuccess(reply, { statistics, recentActivity, userPermissions, timestamp: now.toISOString() });
    } catch (error) {
      logError(fastify.log, 'Error fetching admin dashboard stats:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des statistiques');
    }
  });

  /**
   * POST /api/admin/dashboard/invalidate-cache
   * Force l'invalidation du cache dashboard (BIGBOSS/ADMIN uniquement)
   */
  fastify.post('/dashboard/invalidate-cache', {
    onRequest: [fastify.authenticate, requireDashboardPermission]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Vider le cache est une ÉCRITURE : elle demande plus que la lecture du
    // tableau de bord, et elle le demande par le NOM de la permission plutôt
    // que par une liste de rôles réécrite ici (#4153).
    const refus = await requirePermission('canManageNotifications')(request, reply);
    void refus;
    if (reply.sent) return reply;

    try {
      await getCacheStore().del(DASHBOARD_CACHE_KEY);
      return sendSuccess(reply, undefined, { message: 'Cache dashboard invalidé' });
    } catch (error) {
      logError(fastify.log, 'Error invalidating dashboard cache:', error);
      return sendInternalError(reply, 'Erreur invalidation cache');
    }
  });
}
