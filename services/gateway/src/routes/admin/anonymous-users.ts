import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendForbidden, sendInternalError } from '../../utils/response.js';
import { type AnonymousUserListQuery } from './types';
import { validatePagination } from '../../utils/pagination';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validateQuery } from '../../validation/helpers.js';
import { AnonymousUsersQuerySchema } from '../../validation/admin-schemas.js';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { requirePermission } from '../../middleware/authorize';

// `requireAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireAdmin = requirePermission('canViewUsers');

export async function anonymousUsersAdminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/anonymous-users
   * Liste des participants anonymes avec pagination et filtres
   */
  fastify.get('/anonymous-users', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(AnonymousUsersQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Directive produit 2026-08-25 : `requireAdmin` laisse passer
      // MODERATOR/AUDIT, qui n'ont plus le droit de voir la présence — seuil
      // `canViewPresence` (ADMIN/BIGBOSS uniquement).
      const viewerRole = (request as UnifiedAuthRequest).authContext!.registeredUser!.role as UserRoleEnum;
      const canSeePresence = permissionsService.canViewPresence(viewerRole);

      /* istanbul ignore next -- Zod AnonymousUsersQuerySchema always provides offset and limit with defaults */
      const { offset = '0', limit = '20', search, status } = request.query as AnonymousUserListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const where: any = { type: 'anonymous' };

      if (search) {
        where.OR = [
          { displayName: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      const [anonymousUsers, totalCount] = await Promise.all([
        fastify.prisma.participant.findMany({
          where,
          select: {
            id: true,
            displayName: true,
            avatar: true,
            language: true,
            isActive: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            leftAt: true,
            permissions: true,
            anonymousSession: true,
            sessionTokenHash: true,
            conversationId: true,
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true
              }
            },
            _count: {
              select: {
                sentMessages: true
              }
            }
          },
          orderBy: { joinedAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.participant.count({ where })
      ]);

      const data = canSeePresence
        ? anonymousUsers
        : anonymousUsers.map((p) => ({ ...p, isOnline: false, lastActiveAt: null }));

      return sendSuccess(reply, {
          anonymousUsers: data,
          pagination: {
            total: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + anonymousUsers.length < totalCount
          }
        });
    } catch (error) {
      logError(fastify.log, 'Get admin anonymous users error:', error);
      return sendInternalError(reply, 'Erreur lors de la recuperation des utilisateurs anonymes');
    }
  });
}
