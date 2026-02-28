import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * Routes de gestion des liens de partage user-scoped
 */
export async function registerUserRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /links — Liste les liens de partage de l'utilisateur connecté
   */
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/links', {
    onRequest: [authRequired],
    schema: {
      description: 'List all share links created by the authenticated user with pagination. Returns link details including conversation metadata and usage statistics.',
      tags: ['links'],
      summary: 'List authenticated user\'s share links',
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'number', minimum: 0, default: 0, description: 'Number of links to skip' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50, description: 'Maximum number of links to return' }
        }
      },
      response: {
        200: {
          description: 'Share links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  linkId: { type: 'string' },
                  identifier: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  currentUses: { type: 'number' },
                  maxUses: { type: 'number', nullable: true },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  conversationTitle: { type: 'string', nullable: true }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' }
              }
            }
          }
        },
        403: {
          description: 'Registered user required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({ success: false, error: 'Utilisateur enregistré requis' });
      }

      const userId = request.authContext.registeredUser!.id;
      const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 100);
      const offset = parseInt((request.query as any).offset || '0', 10);

      const [links, total] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where: { createdBy: userId },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: { conversation: { select: { id: true, title: true, type: true } } },
        }),
        fastify.prisma.conversationShareLink.count({ where: { createdBy: userId } }),
      ]);

      const mapped = links.map((l) => ({
        id: l.id,
        linkId: l.linkId,
        identifier: l.identifier,
        name: l.name ?? null,
        isActive: l.isActive,
        currentUses: l.currentUses,
        maxUses: l.maxUses ?? null,
        expiresAt: l.expiresAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
        conversationTitle: l.conversation?.title ?? null,
      }));

      return reply.send({
        success: true,
        data: mapped,
        pagination: { total, offset, limit },
      });
    } catch (error) {
      logError(fastify.log, 'List user share links error:', error);
      return reply.status(500).send({ success: false, error: 'Erreur interne du serveur' });
    }
  });

  /**
   * GET /links/stats — Statistiques agrégées des liens de partage de l'utilisateur
   */
  fastify.get('/links/stats', {
    onRequest: [authRequired],
    schema: {
      description: 'Get aggregated statistics for all share links created by the authenticated user. Returns total link counts, active link counts, and total usage.',
      tags: ['links'],
      summary: 'Get user share link stats',
      response: {
        200: {
          description: 'Statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                totalLinks: { type: 'number', description: 'Total number of share links created by user' },
                activeLinks: { type: 'number', description: 'Number of currently active links' },
                totalUses: { type: 'number', description: 'Sum of all uses across user links' }
              }
            }
          }
        },
        403: {
          description: 'Registered user required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({ success: false, error: 'Utilisateur enregistré requis' });
      }

      const userId = request.authContext.registeredUser!.id;

      const [totalLinks, activeLinks, totalUsesAgg] = await Promise.all([
        fastify.prisma.conversationShareLink.count({ where: { createdBy: userId } }),
        fastify.prisma.conversationShareLink.count({ where: { createdBy: userId, isActive: true } }),
        fastify.prisma.conversationShareLink.aggregate({
          where: { createdBy: userId },
          _sum: { currentUses: true },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          totalLinks,
          activeLinks,
          totalUses: totalUsesAgg._sum.currentUses ?? 0,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Get user share link stats error:', error);
      return reply.status(500).send({ success: false, error: 'Erreur interne du serveur' });
    }
  });
}
