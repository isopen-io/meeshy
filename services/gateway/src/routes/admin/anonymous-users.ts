import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { validatePagination, type AnonymousUserListQuery } from './types';

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

export async function anonymousUsersAdminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/anonymous-users
   * Liste des participants anonymes avec pagination et filtres
   */
  fastify.get('/anonymous-users', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { offset = '0', limit = '20', search, status } = request.query as AnonymousUserListQuery;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      const [anonymousUsers, totalCount] = await Promise.all([
        fastify.prisma.anonymousParticipant.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            sessionToken: true,
            ipAddress: true,
            country: true,
            language: true,
            isActive: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            leftAt: true,
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            shareLink: {
              select: {
                id: true,
                linkId: true,
                identifier: true,
                name: true,
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true
                  }
                }
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
        fastify.prisma.anonymousParticipant.count({ where })
      ]);

      return reply.send({
        success: true,
        data: {
          anonymousUsers,
          pagination: {
            total: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + anonymousUsers.length < totalCount
          }
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get admin anonymous users error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la recuperation des utilisateurs anonymes'
      });
    }
  });
}
