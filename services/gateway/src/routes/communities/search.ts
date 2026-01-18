/**
 * Search routes for communities
 */
import { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { validatePagination } from './types';

export async function registerSearchRoutes(fastify: FastifyInstance) {
  // Route pour rechercher des communautes PUBLIQUES accessibles a tous
  fastify.get('/communities/search', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Search for public communities by name, identifier, description, or member names. Only returns non-private communities. Results are paginated.',
      tags: ['communities'],
      summary: 'Search public communities',
      querystring: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            description: 'Search query (searches name, identifier, description, and member names)',
            minLength: 1
          },
          offset: {
            type: 'string',
            description: 'Number of items to skip for pagination',
            default: '0',
            pattern: '^[0-9]+$'
          },
          limit: {
            type: 'string',
            description: 'Maximum number of items to return (max 100)',
            default: '20',
            pattern: '^[0-9]+$'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully retrieved search results',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  identifier: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true },
                  isPrivate: { type: 'boolean' },
                  memberCount: { type: 'number' },
                  conversationCount: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' },
                  creator: { type: 'object' },
                  members: { type: 'array', items: { type: 'object' } }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { q, offset = '0', limit = '20' } = request.query as { q?: string; offset?: string; limit?: string };

      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
      }

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Build where clause for public communities
      const whereClause = {
        isPrivate: false,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { identifier: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
          {
            members: {
              some: {
                user: {
                  OR: [
                    { username: { contains: q, mode: 'insensitive' as const } },
                    { displayName: { contains: q, mode: 'insensitive' as const } },
                    { firstName: { contains: q, mode: 'insensitive' as const } },
                    { lastName: { contains: q, mode: 'insensitive' as const } }
                  ],
                  isActive: true
                }
              }
            }
          }
        ]
      };

      const [communities, totalCount] = await Promise.all([
        fastify.prisma.community.findMany({
          where: whereClause,
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            members: {
              take: 5,
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    isOnline: true
                  }
                }
              }
            },
            _count: {
              select: {
                members: true,
                Conversation: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.community.count({ where: whereClause })
      ]);

      // Transformer les donnees pour le frontend
      const communitiesWithCount = communities.map(community => ({
        id: community.id,
        name: community.name,
        identifier: community.identifier,
        description: community.description,
        avatar: community.avatar,
        isPrivate: community.isPrivate,
        memberCount: community._count.members,
        conversationCount: community._count.Conversation,
        createdAt: community.createdAt,
        creator: community.creator,
        members: community.members
      }));

      reply.send({
        success: true,
        data: communitiesWithCount,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });
    } catch (error) {
      console.error('[GATEWAY] Error searching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to search communities'
      });
    }
  });
}
