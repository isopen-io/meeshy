/**
 * `GET /admin/users/:userId/stats` — les compteurs d'un membre sur sa fiche
 * d'administration (#7845 C). Le calcul vit dans
 * `services/admin/admin-user-stats.ts` ; ce module ne porte que la porte.
 *
 * Seuil : `canViewUserDetails`, celui de la fiche elle-même
 * (`GET /admin/users/:userId`). Ce ne sont que des AGRÉGATS — aucun contenu,
 * aucune adresse, aucune liste d'identifiants — donc rien qui demande
 * `canViewSensitiveData` : un modérateur qui instruit un signalement a besoin
 * de savoir que le compte en a reçu douze, pas de lire lesquels.
 *
 * Les trois compteurs de signalements suivent le seuil de `Report`
 * (`canModerateContent`) et valent `null` en deçà — voir
 * `admin-user-stats.ts` § « Les signalements ont LEUR seuil ».
 *
 * Aucune ligne d'audit : ouvrir la fiche écrit déjà `VIEW_USER`, et un panneau
 * de chiffres n'est pas une seconde consultation.
 */
import type { FastifyInstance } from 'fastify';
import { UserRoleEnum } from '@meeshy/shared/types';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { requirePermission } from '../../middleware/authorize';
import { computeAdminUserStats } from '../../services/admin/admin-user-stats';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { REPORT_PERMISSION_LA_PLUS_HAUTE } from './user-reports';
import { sendSuccess, sendNotFound, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import { userStatsSuccess, adminErrorResponses, userIdParams } from './user-admin-response-schemas';

type Deps = {
  /** L'horloge — injectée pour que « ban actif » et « session vivante » se témoignent. */
  readonly now?: () => Date;
};

export function registerAdminUserStatsRoute(fastify: FastifyInstance, deps: Deps = {}): void {
  const now = deps.now ?? (() => new Date());

  fastify.get<{ Params: { userId: string } }>('/admin/users/:userId/stats', {
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewUserDetails')],
    schema: {
      description: "Compteurs d'un membre (activité, social, modération, sécurité) — agrégats seuls. #7845.",
      tags: ['admin'],
      summary: "Read a member's statistics (admin)",
      params: userIdParams,
      response: { 200: userStatsSuccess, ...adminErrorResponses },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const existe = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!existe) return sendNotFound(reply, 'Utilisateur non trouvé');

      const role = (request as UnifiedAuthRequest).authContext.registeredUser?.role;
      const canReadReports =
        role !== undefined && permissionsService.hasPermission(role as UserRoleEnum, REPORT_PERMISSION_LA_PLUS_HAUTE);
      const stats = await computeAdminUserStats(fastify.prisma, userId, now(), { canReadReports });
      return sendSuccess(reply, { userId, ...stats });
    } catch (error) {
      logError(fastify.log, 'Error computing admin user stats', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to compute user stats' });
    }
  });
}
