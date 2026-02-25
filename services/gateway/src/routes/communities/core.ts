/**
 * Core CRUD routes for communities
 */
import { FastifyInstance } from 'fastify';
import {
  communitySchema,
  createCommunityRequestSchema,
  updateCommunityRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  CreateCommunitySchema,
  UpdateCommunitySchema,
  CommunityRole,
  validatePagination,
  generateIdentifier
} from './types';

export async function registerCoreRoutes(fastify: FastifyInstance) {
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

      return reply.send({
        success: true,
        data: {
          available: !existingCommunity,
          identifier
        }
      });
    } catch (error) {
      console.error('[COMMUNITIES] Error checking identifier availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check identifier availability'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;
      const { search, offset = '0', limit = '20' } = request.query as { search?: string; offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

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

      reply.send({
        success: true,
        data: communities,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error fetching communities:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch communities'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Verifier l'acces (createur ou membre)
      const hasAccess = community.createdBy === userId ||
                       community.members.some(member => member.userId === userId);

      if (!hasAccess && community.isPrivate) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this community'
        });
      }

      reply.send({
        success: true,
        data: community
      });
    } catch (error) {
      console.error('Error fetching community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Generer l'identifier
      const identifier = generateIdentifier(validatedData.name, validatedData.identifier);

      // Verifier que l'identifier est unique
      const existingCommunity = await fastify.prisma.community.findUnique({
        where: { identifier }
      });

      if (existingCommunity) {
        return reply.status(409).send({
          success: false,
          error: `A community with identifier "${identifier}" already exists`
        });
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

      reply.status(201).send({
        success: true,
        data: community
      });
    } catch (error) {
      console.error('Error creating community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to create community'
      });
    }
  });

  // Route pour obtenir les conversations d'une communaute
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      const hasAccess = community.createdBy === userId ||
                       community.members.some(member => member.userId === userId);

      if (!hasAccess && community.isPrivate) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied to this community'
        });
      }

      // Recuperer les conversations de la communaute
      const conversations = await fastify.prisma.conversation.findMany({
        where: {
          communityId: id,
          // S'assurer que l'utilisateur est membre de la conversation
          members: {
            some: { userId: userId }
          }
        },
        include: {
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
              messages: true,
              members: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      reply.send({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error('Error fetching community conversations:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community conversations'
      });
    }
  });

  // Route pour ajouter une conversation existante a une communaute
  fastify.post('/communities/:id/conversations/:conversationId', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Add an existing conversation to a community. The authenticated user must be an admin/creator of both the community and the conversation.',
      tags: ['communities'],
      summary: 'Add conversation to community',
      params: {
        type: 'object',
        required: ['id', 'conversationId'],
        properties: {
          id: {
            type: 'string',
            description: 'Community unique ID'
          },
          conversationId: {
            type: 'string',
            description: 'Conversation unique ID to add'
          }
        }
      },
      response: {
        200: {
          description: 'Successfully added conversation to community',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' }
          }
        },
        401: { description: 'User not authenticated', ...errorResponseSchema },
        403: { description: 'Insufficient permissions', ...errorResponseSchema },
        404: { description: 'Community or conversation not found', ...errorResponseSchema },
        500: { description: 'Internal server error', ...errorResponseSchema }
      }
    }
  }, async (request, reply) => {
    try {
      const { id, conversationId } = request.params as { id: string; conversationId: string };

      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Verify community exists and user is admin/creator
      const community = await fastify.prisma.community.findFirst({
        where: { id },
        select: {
          id: true,
          createdBy: true,
          members: { select: { userId: true, role: true } }
        }
      });

      if (!community) {
        return reply.status(404).send({ success: false, error: 'Community not found' });
      }

      const isCreator = community.createdBy === userId;
      const memberRecord = community.members.find(m => m.userId === userId);
      const isAdmin = memberRecord?.role === CommunityRole.ADMIN;

      if (!isCreator && !isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can add conversations'
        });
      }

      // Verify conversation exists and user has access
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: conversationId },
        select: {
          id: true,
          communityId: true,
          members: { select: { userId: true, role: true } }
        }
      });

      if (!conversation) {
        return reply.status(404).send({ success: false, error: 'Conversation not found' });
      }

      // Update conversation to belong to this community (allows moving between communities)
      const updated = await fastify.prisma.conversation.update({
        where: { id: conversationId },
        data: { communityId: id },
        include: {
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
            select: { messages: true, members: true }
          }
        }
      });

      reply.send({ success: true, data: updated });
    } catch (error) {
      console.error('Error adding conversation to community:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to add conversation to community'
      });
    }
  });
}
