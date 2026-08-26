/**
 * Adhésion à une communauté : la liste de l'appelant, et les trois transitions
 * qu'il peut déclencher lui-même — rejoindre, quitter, inviter.
 *
 * Séparé de `members.ts`, qui porte les opérations d'ADMINISTRATION sur le
 * membre d'un autre (ajouter, changer de rôle, retirer).
 */
import { FastifyInstance } from 'fastify';
import {
  communityMemberSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  sendSuccess,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendInternalError
} from '../../utils/response.js';
import { CommunityRole } from './types';
import { gateCoMemberPresence } from './member-presence';
import { viewerFromRequest } from '../users/presence-gate';

const logger = enhancedLogger.child({ module: 'CommunityMembershipRoutes' });

export async function registerMembershipRoutes(fastify: FastifyInstance) {
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
      logger.error('Error fetching user communities', error as Error);
      return sendInternalError(reply, 'Failed to fetch user communities');
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

      // Pas de gate ici : le membre rendu est l'APPELANT lui-même, et une
      // préférence de visibilité ne se cache pas à celui qui l'a posée.
      return sendSuccess(reply, member);
    } catch (error) {
      logger.error('Error joining community', error as Error);
      return sendInternalError(reply, 'Failed to join community');
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

      return sendSuccess(reply, { message: 'Successfully left community' });
    } catch (error) {
      logger.error('Error leaving community', error as Error);
      return sendInternalError(reply, 'Failed to leave community');
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
              isOnline: true,
              deactivatedAt: true
            }
          }
        }
      });

      // Critère STRICT avec le viewer réel (l'inviteur) — être membre de la
      // même communauté que l'invité ne vaut plus d'accès à sa présence.
      return sendSuccess(reply, await gateCoMemberPresence(fastify.prisma, viewerFromRequest(request), member));
    } catch (error) {
      logger.error('Error inviting to community', error as Error);
      return sendInternalError(reply, 'Failed to invite user to community');
    }
  });
}
