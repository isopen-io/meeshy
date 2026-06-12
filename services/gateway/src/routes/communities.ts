/**
 * Routes Communautes
 *
 * Ce module regroupe les endpoints lies a la gestion des communautes.
 * Une communaute est un conteneur logique permettant de rassembler des membres,
 * d'organiser des permissions et d'agreger des conversations associees.
 *
 * Points cles:
 * - Les routes sont prefixees par `/communities`.
 * - Les conversations d'une communaute sont exposees via `GET /communities/:id/conversations`.
 * - Le schema Prisma definit une relation Community -> Conversation.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  communitySchema,
  communityMinimalSchema,
  communityMemberSchema,
  createCommunityRequestSchema,
  updateCommunityRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../middleware/auth';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../utils/response';
import { validatePagination } from '../utils/pagination';

const logger = enhancedLogger.child({ module: 'CommunitiesRoutes' });

// Enum des roles de communaute (aligne avec shared/types/community.ts)
enum CommunityRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member'
}

// Schemas de validation
const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  isPrivate: z.boolean().default(true)
});

const UpdateCommunitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  isPrivate: z.boolean().optional()
});

// Fonction pour generer un identifier a partir du nom
function generateIdentifier(name: string, customIdentifier?: string): string {
  if (customIdentifier) {
    // Si l'identifiant personnalise commence deja par mshy_, ne pas le rajouter
    if (customIdentifier.startsWith('mshy_')) {
      return customIdentifier;
    }
    return `mshy_${customIdentifier}`;
  }

  // Convertir le nom en identifier valide
  const baseIdentifier = name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_@]/g, '-') // Remplacer les caracteres invalides par des tirets
    .replace(/--+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ''); // Supprimer les tirets en debut et fin

  return `mshy_${baseIdentifier}`;
}

const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER]).optional().default(CommunityRole.MEMBER)
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER])
});


type CommunityWithCount = {
  _count: { members: number; Conversation: number };
  members?: unknown;
  [key: string]: unknown;
};

/**
 * Flatten a Prisma community's `_count` aggregate into the flat
 * `memberCount` / `conversationCount` fields declared by `communitySchema`.
 *
 * Every route that returns a community MUST call this before `reply.send`:
 * Fastify `fast-json-stringify` serialises strictly against the response
 * schema and silently strips the undeclared raw `_count` object — without
 * the flatten the client always reads 0. `members` is dropped here too (it
 * is not in `communitySchema` and is stripped anyway).
 */
function flattenCommunityCounts(community: CommunityWithCount) {
  const { _count, members, ...rest } = community;
  return {
    ...rest,
    memberCount: _count.members,
    conversationCount: _count.Conversation
  };
}

/**
 * Enregistre les routes de gestion des communautes.
 * @param fastify Instance Fastify injectee par le serveur
 */
export async function communityRoutes(fastify: FastifyInstance) {

  // Route pour verifier la disponibilite d'un identifiant de communaute
  fastify.get('/communities/check-identifier/:identifier', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Check if a community identifier is available for use. Returns whether the identifier is already taken by another community.',
      tags: ['communities'],
      summary: 'Check identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Community identifier to check (e.g., "mshy_mycommunity")',
            minLength: 1
          }
        }
      },
      response: {
        200: {
          description: 'Successfully checked identifier availability',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                available: { type: 'boolean', description: 'Whether the identifier is available' },
                identifier: { type: 'string', description: 'The checked identifier' }
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
      const { identifier } = request.params as { identifier: string };

      // Verifier si l'identifiant existe deja
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });

      return sendSuccess(reply, {
        available: !existingCommunity,
        identifier
      });
    } catch (error) {
      logger.error('Error checking identifier availability', error as Error);
      return sendInternalError(reply, 'Failed to check identifier availability');
    }
  });

  // Route pour obtenir toutes les communautes de l'utilisateur connecte
  fastify.get('/communities', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve all communities that the authenticated user is a member of or created. Supports pagination and search filtering by name or identifier.',
      tags: ['communities'],
      summary: 'Get user communities',
      querystring: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search query to filter communities by name or identifier (minimum 2 characters)',
            minLength: 2
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
          description: 'Successfully retrieved communities',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: communitySchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of communities matching the query' },
                limit: { type: 'number', description: 'Number of items per page' },
                offset: { type: 'number', description: 'Number of items skipped' },
                hasMore: { type: 'boolean', description: 'Whether there are more items to fetch' }
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
      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;
      const { search, offset = '0', limit = '20' } = request.query as { search?: string; offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Build where clause with optional search
      const whereClause: any = {
        OR: [
          { createdBy: userId },
          { members: { some: { userId: userId } } }
        ]
      };

      // Add search filter if provided (search by name or identifier)
      if (search && search.length >= 2) {
        whereClause.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { identifier: { contains: search, mode: 'insensitive' } }
            ]
          }
        ];
      }

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

      sendPaginatedSuccess(reply, communities.map(flattenCommunityCounts), {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + communities.length < totalCount
      });
    } catch (error) {
      logger.error('Error fetching communities', error as Error);
      sendInternalError(reply, 'Failed to fetch communities');
    }
  });

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
        return sendPaginatedSuccess(reply, [], { total: 0, limit: 20, offset: 0, hasMore: false });
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

      sendPaginatedSuccess(reply, communitiesWithCount, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + communities.length < totalCount
      });
    } catch (error) {
      logger.error('Error searching communities', error as Error);
      sendInternalError(reply, 'Failed to search communities');
    }
  });

  // Route pour obtenir les communautes de l'utilisateur courant
  fastify.get('/communities/mine', {
    onRequest: [fastify.authenticate],
    schema: {
      description: "Returns communities where the authenticated user is a member. Optionally filter by role (comma-separated: admin,moderator,member).",
      tags: ['communities'],
      summary: "Get current user's communities",
      querystring: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'Comma-separated list of roles to filter by (admin,moderator,member)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  identifier: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true },
                  isPrivate: { type: 'boolean' },
                  role: { type: 'string' }
                }
              }
            }
          }
        },
        401: { description: 'User not authenticated', ...errorResponseSchema },
        500: { description: 'Internal server error', ...errorResponseSchema }
      }
    }
  }, async (request, reply) => {
    try {
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;
      const { role } = request.query as { role?: string };

      const roleFilter = role
        ? role.split(',').map(r => r.trim()).filter(r => Object.values(CommunityRole).includes(r as CommunityRole))
        : undefined;

      const memberships = await fastify.prisma.communityMember.findMany({
        where: {
          userId,
          ...(roleFilter && roleFilter.length > 0 ? { role: { in: roleFilter } } : {})
        },
        include: {
          community: {
            select: {
              id: true,
              name: true,
              identifier: true,
              avatar: true,
              isPrivate: true
            }
          }
        }
      });

      const data = memberships.map(m => ({
        ...m.community,
        role: m.role
      }));

      return sendSuccess(reply, data);
    } catch (error) {
      logger.error('Error fetching community', error as Error);
      return sendInternalError(reply, 'Failed to fetch user communities');
    }
  });

  // Route pour obtenir une communaute par ID ou identifier
  fastify.get('/communities/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve a specific community by its unique ID or human-readable identifier. Access is restricted to community members for private communities. Public communities can be viewed by any authenticated user.',
      tags: ['communities'],
      summary: 'Get a community by ID or identifier',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID or identifier (e.g., "mshy_mycommunity")'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully retrieved community',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communitySchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - user is not a member of this private community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
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
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Chercher d'abord par ID, puis par identifier si pas trouve
      let community = await fastify.prisma.community.findFirst({
        where: { id },
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
        }
      });

      // Si pas trouve par ID, essayer par identifier
      if (!community) {
        community = await fastify.prisma.community.findFirst({
          where: { identifier: id },
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
          }
        });
      }

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      // Verifier l'acces (createur ou membre)
      const hasAccess = community.createdBy === userId ||
                       community.members.some(member => member.userId === userId);

      if (!hasAccess && community.isPrivate) {
        return sendForbidden(reply, 'Access denied to this community');
      }

      sendSuccess(reply, flattenCommunityCounts(community));
    } catch (error) {
      logger.error('Error fetching community', error as Error);
      sendInternalError(reply, 'Failed to fetch community');
    }
  });

  // Route pour creer une nouvelle communaute
  fastify.post('/communities', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Create a new community. The authenticated user becomes the creator and is automatically added as an admin member. The identifier is auto-generated from the name with a "mshy_" prefix unless a custom identifier is provided.',
      tags: ['communities'],
      summary: 'Create a community',
      body: createCommunityRequestSchema,
      response: {
        201: {
          description: 'Community successfully created',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communitySchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        409: {
          description: 'Community identifier already exists',
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
      const validatedData = CreateCommunitySchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Generer l'identifier
      const identifier = generateIdentifier(validatedData.name, validatedData.identifier);

      // Verifier que l'identifier est unique
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });

      if (existingCommunity) {
        return sendConflict(reply, `A community with identifier "${identifier}" already exists`);
      }

      // Creer la communaute ET automatiquement ajouter le createur comme membre ADMIN
      const community = await fastify.prisma.community.create({
        data: {
          name: validatedData.name,
          identifier: identifier,
          description: validatedData.description,
          avatar: validatedData.avatar,
          isPrivate: validatedData.isPrivate ?? true,
          createdBy: userId,
          // Automatiquement ajouter le createur comme membre avec le role ADMIN
          members: {
            create: {
              userId: userId,
              role: CommunityRole.ADMIN as string
            }
          }
        },
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
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
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
        }
      });

      sendSuccess(reply, flattenCommunityCounts(community), { statusCode: 201 });
    } catch (error) {
      logger.error('Error creating community', error as Error);
      sendInternalError(reply, 'Failed to create community');
    }
  });

  // Route pour obtenir les membres d'une communaute
  fastify.get('/communities/:id/members', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve all members of a community with pagination. Access is restricted to community members for private communities. Returns user details including online status and role.',
      tags: ['communities'],
      summary: 'Get community members',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
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
          description: 'Successfully retrieved community members',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: communityMemberSchema
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
        403: {
          description: 'Access denied - user is not a member of this private community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
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
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier l'acces a la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          isPrivate: true,
          members: { select: { userId: true } }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      const hasAccess = community.createdBy === userId ||
                       community.members.some(member => member.userId === userId);

      if (!hasAccess && community.isPrivate) {
        return sendForbidden(reply, 'Access denied to this community');
      }

      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const [members, totalCount] = await Promise.all([
        fastify.prisma.communityMember.findMany({
          where: { communityId: id },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            }
          },
          orderBy: { joinedAt: 'asc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.communityMember.count({ where: { communityId: id } })
      ]);

      sendPaginatedSuccess(reply, members, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + members.length < totalCount
      });
    } catch (error) {
      logger.error('Error fetching community members', error as Error);
      sendInternalError(reply, 'Failed to fetch community members');
    }
  });

  // Route pour ajouter un membre a la communaute
  fastify.post('/communities/:id/members', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Add a new member to a community. Only community admins can add members. The member is assigned the specified role (defaults to "member").',
      tags: ['communities'],
      summary: 'Add a member to community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to add as member'
          },
          role: {
            type: 'string',
            enum: ['admin', 'moderator', 'member'],
            default: 'member',
            description: 'Role to assign to the new member'
          }
        }
      },
      response: {
        200: {
          description: 'Member successfully added',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communityMemberSchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only community admins can add members',
          ...errorResponseSchema
        },
        404: {
          description: 'Community or user not found',
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
      const { id } = request.params as { id: string };
      const validatedData = AddMemberSchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      // Verifier que l'utilisateur est admin (ou createur)
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return sendForbidden(reply, 'Only community admins can add members');
      }

      // Verifier que l'utilisateur a ajouter existe
      const userToAdd = await fastify.prisma.user.findFirst({
        where: { id: validatedData.userId },
        select: { id: true }
      });

      if (!userToAdd) {
        return sendNotFound(reply, 'User to add not found');
      }

      // Verifier si le membre existe deja
      const existingMember = await fastify.prisma.communityMember.findFirst({
        where: {
          communityId: id,
          userId: validatedData.userId
        }
      });

      let member;
      if (existingMember) {
        member = existingMember;
      } else {
        // Ajouter le membre avec le role specifie (par defaut: MEMBER)
        member = await fastify.prisma.communityMember.create({
          data: {
            communityId: id,
            userId: validatedData.userId,
            role: (validatedData.role || CommunityRole.MEMBER) as string
          },
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
        });
      }

      sendSuccess(reply, member);
    } catch (error) {
      logger.error('Error adding community member', error as Error);
      sendInternalError(reply, 'Failed to add community member');
    }
  });

  // Route pour mettre a jour le role d'un membre
  fastify.patch('/communities/:id/members/:memberId/role', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update the role of a community member. Only community admins can update member roles.',
      tags: ['communities'],
      summary: 'Update member role',
      params: {
        type: 'object',
        required: ['id', 'memberId'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          },
          memberId: {
            type: 'string',
            description: 'Member unique ID'
          }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: ['admin', 'moderator', 'member'],
            description: 'New role for the member'
          }
        }
      },
      response: {
        200: {
          description: 'Member role successfully updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communityMemberSchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only community admins can update member roles',
          ...errorResponseSchema
        },
        404: {
          description: 'Community or member not found',
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
      const { id, memberId } = request.params as { id: string; memberId: string };
      const validatedData = UpdateMemberRoleSchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      // Verifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return sendForbidden(reply, 'Only community admins can update member roles');
      }

      // Mettre a jour le role du membre
      const updatedMember = await fastify.prisma.communityMember.update({
        where: { id: memberId },
        data: { role: validatedData.role as string },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      });

      sendSuccess(reply, updatedMember);
    } catch (error) {
      logger.error('Error updating member role', error as Error);
      sendInternalError(reply, 'Failed to update member role');
    }
  });

  // Route pour retirer un membre de la communaute
  fastify.delete('/communities/:id/members/:memberId', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Remove a member from a community. Only community admins can remove members.',
      tags: ['communities'],
      summary: 'Remove a member from community',
      params: {
        type: 'object',
        required: ['id', 'memberId'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          },
          memberId: {
            type: 'string',
            description: 'User ID of the member to remove'
          }
        }
      },
      response: {
        200: {
          description: 'Member successfully removed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Member removed successfully' }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only community admins can remove members',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
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
      const { id, memberId } = request.params as { id: string; memberId: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier que la communaute existe et que l'utilisateur est admin
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      // Verifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return sendForbidden(reply, 'Only community admins can remove members');
      }

      // Supprimer le membre
      await fastify.prisma.communityMember.deleteMany({
        where: {
          communityId: id,
          userId: memberId
        }
      });

      sendSuccess(reply, { message: 'Member removed successfully' });
    } catch (error) {
      logger.error('Error removing community member', error as Error);
      sendInternalError(reply, 'Failed to remove community member');
    }
  });

  // Route pour mettre a jour une communaute
  fastify.put('/communities/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update a community. Only the community creator can update community details. All fields are optional. If a new identifier is provided, it will be validated for uniqueness.',
      tags: ['communities'],
      summary: 'Update a community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      body: updateCommunityRequestSchema,
      response: {
        200: {
          description: 'Community successfully updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communitySchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only the community creator can update the community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
          ...errorResponseSchema
        },
        409: {
          description: 'New identifier already exists',
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
      const { id } = request.params as { id: string };
      const validatedData = UpdateCommunitySchema.parse(request.body);

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true, identifier: true }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      if (community.createdBy !== userId) {
        return sendForbidden(reply, 'Only community creator can update community');
      }

      // Preparer les donnees de mise a jour
      const updateData: any = {
        name: validatedData.name,
        description: validatedData.description,
        avatar: validatedData.avatar,
        isPrivate: validatedData.isPrivate
      };

      // Gerer l'identifier si fourni
      if (validatedData.identifier !== undefined) {
        const newIdentifier = generateIdentifier(validatedData.name || '', validatedData.identifier);

        // Verifier que le nouvel identifier est unique (sauf si c'est le meme)
        if (newIdentifier !== community.identifier) {
          const existingCommunity = await fastify.prisma.community.findUnique({
            where: { identifier: newIdentifier }
          });

          if (existingCommunity) {
            return sendConflict(reply, `A community with identifier "${newIdentifier}" already exists`);
          }
        }

        updateData.identifier = newIdentifier;
      }

      const updatedCommunity = await fastify.prisma.community.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          _count: {
            select: {
              members: true,
              Conversation: true
            }
          }
        }
      });

      sendSuccess(reply, flattenCommunityCounts(updatedCommunity));
    } catch (error) {
      logger.error('Error updating community', error as Error);
      sendInternalError(reply, 'Failed to update community');
    }
  });

  // Route pour supprimer une communaute
  fastify.delete('/communities/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a community permanently. Only the community creator can delete the community. This will also cascade delete all associated members and conversations.',
      tags: ['communities'],
      summary: 'Delete a community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      response: {
        200: {
          description: 'Community successfully deleted',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Community deleted successfully' }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only the community creator can delete the community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
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
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier que l'utilisateur est le createur de la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { createdBy: true }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      if (community.createdBy !== userId) {
        return sendForbidden(reply, 'Only community creator can delete community');
      }

      await fastify.prisma.community.delete({
        where: { id }
      });

      sendSuccess(reply, { message: 'Community deleted successfully' });
    } catch (error) {
      logger.error('Error deleting community', error as Error);
      sendInternalError(reply, 'Failed to delete community');
    }
  });

  // Conversations d'une communaute
  fastify.get('/communities/:id/conversations', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Retrieve all conversations within a community. Only returns conversations where the authenticated user is a member. Results are sorted by most recently updated.',
      tags: ['communities'],
      summary: 'Get community conversations',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully retrieved community conversations',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  communityId: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  members: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        userId: { type: 'string' },
                        user: { type: 'object' }
                      }
                    }
                  },
                  _count: {
                    type: 'object',
                    properties: {
                      messages: { type: 'number' },
                      members: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - user is not a member of this private community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
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
      const { id } = request.params as { id: string };

      // Utiliser le nouveau systeme d'authentification unifie
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      // Verifier l'acces a la communaute
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          createdBy: true,
          isPrivate: true,
          members: { select: { userId: true } }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      const hasAccess = community.createdBy === userId ||
                       community.members.some(member => member.userId === userId);

      if (!hasAccess && community.isPrivate) {
        return sendForbidden(reply, 'Access denied to this community');
      }

      // Recuperer les conversations de la communaute
      const conversations = await fastify.prisma.conversation.findMany({
        where: {
          communityId: id,
          participants: {
            some: { userId: userId }
          }
        },
        include: {
          participants: {
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
              messages: true,
              participants: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      sendSuccess(reply, conversations);
    } catch (error) {
      logger.error('Error fetching community conversations', error as Error);
      sendInternalError(reply, 'Failed to fetch community conversations');
    }
  });

  // Route pour rejoindre une communaute publique
  fastify.post('/communities/:id/join', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Join a public community. The authenticated user is added as a member with the "member" role. Private communities cannot be joined directly - use an invite instead.',
      tags: ['communities'],
      summary: 'Join a public community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully joined community',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communityMemberSchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Cannot join private community without an invite',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found',
          ...errorResponseSchema
        },
        409: {
          description: 'User is already a member of this community',
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
      const { id } = request.params as { id: string };

      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { id: true, isPrivate: true }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      if (community.isPrivate) {
        return sendForbidden(reply, 'Cannot join a private community without an invite');
      }

      const existingMember = await fastify.prisma.communityMember.findFirst({
        where: { communityId: id, userId }
      });

      if (existingMember) {
        return sendConflict(reply, 'You are already a member of this community');
      }

      const member = await fastify.prisma.communityMember.create({
        data: {
          communityId: id,
          userId,
          role: CommunityRole.MEMBER as string
        },
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
      });

      sendSuccess(reply, member);
    } catch (error) {
      logger.error('Error joining community', error as Error);
      sendInternalError(reply, 'Failed to join community');
    }
  });

  // Route pour quitter une communaute
  fastify.post('/communities/:id/leave', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Leave a community. The authenticated user is removed from the community members. The community creator cannot leave their own community.',
      tags: ['communities'],
      summary: 'Leave a community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully left community',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Successfully left community' }
              }
            }
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Community creator cannot leave their own community',
          ...errorResponseSchema
        },
        404: {
          description: 'Community not found or user is not a member',
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
      const { id } = request.params as { id: string };

      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: { id: true, createdBy: true }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      if (community.createdBy === userId) {
        return sendForbidden(reply, 'Community creator cannot leave their own community. Transfer ownership or delete the community instead.');
      }

      const deleted = await fastify.prisma.communityMember.deleteMany({
        where: { communityId: id, userId }
      });

      if (deleted.count === 0) {
        return sendNotFound(reply, 'You are not a member of this community');
      }

      sendSuccess(reply, { message: 'Successfully left community' });
    } catch (error) {
      logger.error('Error leaving community', error as Error);
      sendInternalError(reply, 'Failed to leave community');
    }
  });

  // Route pour inviter un utilisateur a une communaute
  fastify.post('/communities/:id/invite', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Invite a user to join a community. For private communities, only admins and moderators can invite. For public communities, any member can invite.',
      tags: ['communities'],
      summary: 'Invite user to community',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to invite'
          }
        }
      },
      response: {
        200: {
          description: 'User successfully invited and added to community',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: communityMemberSchema
          }
        },
        401: {
          description: 'User not authenticated',
          ...errorResponseSchema
        },
        403: {
          description: 'Insufficient permissions to invite members',
          ...errorResponseSchema
        },
        404: {
          description: 'Community or user not found',
          ...errorResponseSchema
        },
        409: {
          description: 'User is already a member',
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
      const { id } = request.params as { id: string };
      const { userId: inviteeId } = request.body as { userId: string };

      const authContext = (request as unknown as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User must be authenticated');
      }

      const userId = authContext.userId;

      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          id: true,
          isPrivate: true,
          createdBy: true,
          members: {
            where: { userId },
            select: { role: true }
          }
        }
      });

      if (!community) {
        return sendNotFound(reply, 'Community not found');
      }

      const inviterMember = community.members[0];
      if (!inviterMember) {
        return sendForbidden(reply, 'You must be a member to invite others');
      }

      if (community.isPrivate) {
        const canInvite = inviterMember.role === CommunityRole.ADMIN || inviterMember.role === CommunityRole.MODERATOR;
        if (!canInvite) {
          return sendForbidden(reply, 'Only admins and moderators can invite to private communities');
        }
      }

      const userToInvite = await fastify.prisma.user.findFirst({
        where: { id: inviteeId },
        select: { id: true }
      });

      if (!userToInvite) {
        return sendNotFound(reply, 'User to invite not found');
      }

      const existingMember = await fastify.prisma.communityMember.findFirst({
        where: { communityId: id, userId: inviteeId }
      });

      if (existingMember) {
        return sendConflict(reply, 'User is already a member of this community');
      }

      const member = await fastify.prisma.communityMember.create({
        data: {
          communityId: id,
          userId: inviteeId,
          role: CommunityRole.MEMBER as string
        },
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
      });

      sendSuccess(reply, member);
    } catch (error) {
      logger.error('Error inviting to community', error as Error);
      sendInternalError(reply, 'Failed to invite user to community');
    }
  });
}
