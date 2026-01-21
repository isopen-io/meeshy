import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { UserRoleEnum, MemberRole } from '@meeshy/shared/types';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  updateLinkSchema,
  updateLinkBodySchema,
  shareLinkSchema
} from './types';

export async function registerManagementRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Mettre à jour un lien (seuls les admins de conversation ou créateur du lien)
  fastify.put('/links/:conversationShareLinkId', {
    onRequest: [authRequired],
    schema: {
      description: 'Update a share link configuration by database ID. Only the link creator or conversation administrators/moderators can update. All fields in the request body are optional and will only update if provided.',
      tags: ['links'],
      summary: 'Update share link (by database ID)',
      params: {
        type: 'object',
        required: ['conversationShareLinkId'],
        properties: {
          conversationShareLinkId: {
            type: 'string',
            description: 'Share link database ID (ObjectId)',
            example: '507f1f77bcf86cd799439011'
          }
        }
      },
      body: updateLinkBodySchema,
      response: {
        200: {
          description: 'Share link updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                shareLink: shareLinkSchema
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - only link creator or conversation admin can update',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
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
      const { conversationShareLinkId } = request.params as { conversationShareLinkId: string };
      const body = updateLinkSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const shareLink = await fastify.prisma.conversationShareLink.findUnique({
        where: { id: conversationShareLinkId },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId, isActive: true }
              }
            }
          }
        }
      });

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      const isCreator = shareLink.createdBy === userId;
      const member = shareLink.conversation.members[0];
      const isConversationAdmin = member && (
        member.role === MemberRole.ADMIN ||
        member.role === MemberRole.CREATOR
      );

      if (!isCreator && !isConversationAdmin) {
        return reply.status(403).send({
          success: false,
          message: 'Seuls les créateurs du lien ou les administrateurs de la conversation peuvent le modifier'
        });
      }

      const updatedLink = await fastify.prisma.conversationShareLink.update({
        where: { id: conversationShareLinkId },
        data: {
          name: body.name,
          description: body.description,
          maxUses: body.maxUses,
          maxConcurrentUsers: body.maxConcurrentUsers,
          maxUniqueSessions: body.maxUniqueSessions,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          isActive: body.isActive,
          allowAnonymousMessages: body.allowAnonymousMessages,
          allowAnonymousFiles: body.allowAnonymousFiles,
          allowAnonymousImages: body.allowAnonymousImages,
          allowViewHistory: body.allowViewHistory,
          requireAccount: body.requireAccount,
          requireNickname: body.requireNickname,
          requireEmail: body.requireEmail,
          requireBirthday: body.requireBirthday,
          allowedCountries: body.allowedCountries,
          allowedLanguages: body.allowedLanguages,
          allowedIpRanges: body.allowedIpRanges
        }
      });

      return reply.send({
        success: true,
        data: {
          shareLink: updatedLink
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Données invalides',
          errors: error.errors
        });
      }
      logError(fastify.log, 'Update link error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Route PATCH pour mettre à jour un lien (compatible avec le frontend)
  fastify.patch('/links/:linkId', {
    onRequest: [authRequired],
    schema: {
      description: 'Update a share link configuration by linkId. Only the link creator or conversation administrators/moderators can update. All fields in the request body are optional and will only update if provided. Returns full link details with conversation and creator information.',
      tags: ['links'],
      summary: 'Update share link (by linkId)',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: updateLinkBodySchema,
      response: {
        200: {
          description: 'Share link updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', example: 'Lien mis à jour avec succès' }
          }
        },
        400: {
          description: 'Bad request - invalid data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
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
      const { linkId } = request.params as { linkId: string };
      const body = updateLinkSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const shareLink = await fastify.prisma.conversationShareLink.findFirst({
        where: { linkId },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId, isActive: true }
              }
            }
          }
        }
      });

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      const isCreator = shareLink.createdBy === userId;
      const isConversationAdmin = shareLink.conversation.members.some(member =>
        member.role === 'ADMIN' || member.role === 'MODERATOR'
      );

      if (!isCreator && !isConversationAdmin) {
        return reply.status(403).send({
          success: false,
          message: 'Permissions insuffisantes pour modifier ce lien'
        });
      }

      const updateData: any = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.maxUses !== undefined) updateData.maxUses = body.maxUses;
      if (body.maxConcurrentUsers !== undefined) updateData.maxConcurrentUsers = body.maxConcurrentUsers;
      if (body.maxUniqueSessions !== undefined) updateData.maxUniqueSessions = body.maxUniqueSessions;
      if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      if (body.allowAnonymousMessages !== undefined) updateData.allowAnonymousMessages = body.allowAnonymousMessages;
      if (body.allowAnonymousFiles !== undefined) updateData.allowAnonymousFiles = body.allowAnonymousFiles;
      if (body.allowAnonymousImages !== undefined) updateData.allowAnonymousImages = body.allowAnonymousImages;
      if (body.allowViewHistory !== undefined) updateData.allowViewHistory = body.allowViewHistory;
      if (body.requireAccount !== undefined) updateData.requireAccount = body.requireAccount;
      if (body.requireNickname !== undefined) updateData.requireNickname = body.requireNickname;
      if (body.requireEmail !== undefined) updateData.requireEmail = body.requireEmail;
      if (body.requireBirthday !== undefined) updateData.requireBirthday = body.requireBirthday;
      if (body.allowedCountries !== undefined) updateData.allowedCountries = body.allowedCountries;
      if (body.allowedLanguages !== undefined) updateData.allowedLanguages = body.allowedLanguages;
      if (body.allowedIpRanges !== undefined) updateData.allowedIpRanges = body.allowedIpRanges;

      const updatedLink = await fastify.prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: updateData,
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              isActive: true,
              createdAt: true,
              updatedAt: true
            }
          },
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          }
        }
      });

      return reply.send({
        success: true,
        data: updatedLink,
        message: 'Lien mis à jour avec succès'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Données invalides',
          errors: error.errors
        });
      }
      logError(fastify.log, 'Update link error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
