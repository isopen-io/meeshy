/**
 * Search routes for communities
 */
import { FastifyInstance } from 'fastify';
import { communityMemberSchema, errorResponseSchema, userMinimalSchema } from '@meeshy/shared/types/api-schemas';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { validatePagination } from '../../utils/pagination';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendPaginatedSuccess, sendInternalError, createPaginationMeta } from '../../utils/response.js';
import { resolveCommunityMemberPresence } from '../../services/community-member-presence';

const logger = enhancedLogger.child({ module: 'CommunitySearchRoutes' });

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
                  // `{ type: 'object' }` sans `properties` n'est PAS un objet
                  // libre : fast-json-stringify applique
                  // `additionalProperties: false` par défaut et sérialisait
                  // `creator` et chaque `members[i]` en `{}`. iOS type
                  // `APICommunityUser.id`/`.username` non-optionnels — le `{}`
                  // faisait échouer le décodage de TOUTE la réponse.
                  creator: { ...userMinimalSchema, nullable: true, description: 'Community creator' },
                  members: {
                    type: 'array',
                    items: communityMemberSchema,
                    description: 'First members of the community (max 5)'
                  }
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
      /* istanbul ignore next -- AJV `default: '0'`/`default: '20'` on the querystring schema always fill these before the handler runs */
      const { q, offset = '0', limit = '20' } = request.query as { q?: string; offset?: string; limit?: string };

      if (!q || q.trim().length === 0) {
        return sendPaginatedSuccess(reply, [], createPaginationMeta(0, 0, 20, 0));
      }

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

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
              // Sans ce filtre, l'aperçu pouvait présenter comme membre
              // quelqu'un qui a quitté la communauté. Invisible tant que le
              // schéma vidait `members[]` en `{}` ; servi dès que la réponse
              // porte vraiment ses champs.
              where: { isActive: true },
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

      const memberVisibility = await resolveCommunityMemberPresence(fastify, request, communities);

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
        members: community.members.map(member =>
          member.user
            ? { ...member, user: applyPresenceVisibilityAsOffline(member.user, memberVisibility.get(member.user.id)) }
            : member
        )
      }));

      return sendPaginatedSuccess(reply, communitiesWithCount, createPaginationMeta(totalCount, offsetNum, limitNum, communities.length));
    } catch (error) {
      logger.error('Error searching communities', error as Error);
      return sendInternalError(reply, 'Failed to search communities');
    }
  });
}
