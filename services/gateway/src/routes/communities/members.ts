/**
 * Member management routes for communities
 */
import { FastifyInstance } from 'fastify';
import {
  communityMemberSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  AddMemberSchema,
  UpdateMemberRoleSchema,
  CommunityRole,
  validatePagination
} from './types';

export async function registerMemberRoutes(fastify: FastifyInstance) {
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

      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };
      const { offsetNum, limitNum } = validatePagination(offset, limit);

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

      reply.send({
        success: true,
        data: members,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + members.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error fetching community members:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch community members'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Verifier que l'utilisateur est admin (ou createur)
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can add members'
        });
      }

      // Verifier que l'utilisateur a ajouter existe
      const userToAdd = await fastify.prisma.user.findFirst({
        where: { id: validatedData.userId },
        select: { id: true }
      });

      if (!userToAdd) {
        return reply.status(404).send({
          success: false,
          error: 'User to add not found'
        });
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

      reply.send({
        success: true,
        data: member
      });
    } catch (error) {
      console.error('Error adding community member:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to add community member'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Verifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can update member roles'
        });
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

      reply.send({
        success: true,
        data: updatedMember
      });
    } catch (error) {
      console.error('[COMMUNITIES] Error updating member role:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update member role'
      });
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
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'User must be authenticated'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Community not found'
        });
      }

      // Verifier que l'utilisateur est admin
      const userMember = community.members[0];
      const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;

      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Only community admins can remove members'
        });
      }

      // Supprimer le membre
      await fastify.prisma.communityMember.deleteMany({
        where: {
          communityId: id,
          userId: memberId
        }
      });

      reply.send({
        success: true,
        data: { message: 'Member removed successfully' }
      });
    } catch (error) {
      console.error('Error removing community member:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to remove community member'
      });
    }
  });
}
