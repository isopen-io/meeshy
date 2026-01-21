import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { UserRoleEnum } from '@meeshy/shared/types';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  generateInitialLinkId,
  generateConversationIdentifier,
  generateFinalLinkId,
  ensureUniqueShareLinkIdentifier
} from './utils/link-helpers';
import {
  createLinkSchema,
  createLinkBodySchema,
  CreateLinkInput
} from './types';

export async function registerCreationRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Créer un lien - Les utilisateurs authentifiés peuvent créer des liens pour leurs conversations
  fastify.post('/links', {
    onRequest: [authRequired],
    schema: {
      description: 'Create a share link for an existing conversation or create a new conversation with a share link. Authenticated users can create links for conversations they are members of. For global conversations, only ADMIN and BIGBOSS roles can create links. Direct conversations cannot have share links. If conversationId is not provided, a new public conversation will be created.',
      tags: ['links'],
      summary: 'Create share link',
      body: createLinkBodySchema,
      response: {
        201: {
          description: 'Share link created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                linkId: { type: 'string', description: 'Generated link ID (mshy_*)', example: 'mshy_67890abcdef12345_a1b2c3d4' },
                conversationId: { type: 'string', description: 'Associated conversation ID' },
                shareLink: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Share link database ID' },
                    linkId: { type: 'string', description: 'Public link identifier' },
                    name: { type: 'string', nullable: true, description: 'Link display name' },
                    description: { type: 'string', nullable: true, description: 'Link description' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' },
                    isActive: { type: 'boolean', description: 'Link active status' }
                  }
                }
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
          description: 'Forbidden - insufficient permissions or invalid conversation type',
          ...errorResponseSchema
        },
        404: {
          description: 'Conversation not found',
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
      const body = createLinkSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis pour créer un lien'
        });
      }

      const user = request.authContext.registeredUser!;
      const userId = user.id;
      const userRole = user.role;

      let conversationId = body.conversationId;

      if (conversationId) {
        // Vérifier que l'utilisateur est membre de la conversation
        let member;

        if (conversationId === "meeshy") {
          const globalConversation = await fastify.prisma.conversation.findFirst({
            where: { identifier: "meeshy" }
          });

          if (globalConversation) {
            member = await fastify.prisma.conversationMember.findFirst({
              where: {
                conversationId: globalConversation.id,
                userId,
                isActive: true
              }
            });
          }
        } else {
          member = await fastify.prisma.conversationMember.findFirst({
            where: { conversationId, userId, isActive: true }
          });
        }

        if (!member) {
          return reply.status(403).send({
            success: false,
            message: "Vous n'êtes pas membre de cette conversation"
          });
        }

        // Récupérer les informations de la conversation pour vérifier le type
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, type: true, title: true }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            message: 'Conversation non trouvée'
          });
        }

        const conversationType = conversation.type;

        // Interdire la création de liens pour les conversations directes
        if (conversationType === 'direct') {
          return reply.status(403).send({
            success: false,
            message: 'Cannot create share links for direct conversations'
          });
        }

        // Pour les conversations globales, seuls les ADMIN et BIGBOSS peuvent créer des liens
        if (conversationType === 'global') {
          if (userRole !== UserRoleEnum.BIGBOSS && userRole !== UserRoleEnum.ADMIN) {
            return reply.status(403).send({
              success: false,
              message: 'You do not have the necessary rights to perform this operation'
            });
          }
        }
      } else if (body.newConversation) {
        // Créer une nouvelle conversation avec les données fournies
        const membersToCreate = [
          { userId, role: 'admin' }
        ];

        if (body.newConversation.memberIds && body.newConversation.memberIds.length > 0) {
          const uniqueMemberIds = [...new Set(body.newConversation.memberIds)]
            .filter(id => id && id !== userId && id.trim().length > 0);

          for (const memberId of uniqueMemberIds) {
            const userExists = await fastify.prisma.user.findUnique({
              where: { id: memberId }
            });

            if (userExists) {
              membersToCreate.push({
                userId: memberId,
                role: 'member'
              });
            }
          }
        }

        const conversationIdentifier = generateConversationIdentifier(body.newConversation.title);

        const conversation = await fastify.prisma.conversation.create({
          data: {
            identifier: conversationIdentifier,
            type: 'public',
            title: body.newConversation.title,
            description: body.newConversation.description || null,
            members: {
              create: membersToCreate
            }
          }
        });
        conversationId = conversation.id;

      } else {
        // Créer une nouvelle conversation de type public (legacy)
        const conversationIdentifier = generateConversationIdentifier(body.name || 'Shared Conversation');

        const conversation = await fastify.prisma.conversation.create({
          data: {
            identifier: conversationIdentifier,
            type: 'public',
            title: body.name || 'Conversation partagée',
            description: body.description,
            members: {
              create: [{
                userId,
                role: 'admin'
              }]
            }
          }
        });
        conversationId = conversation.id;
      }

      // Générer le linkId initial
      const initialLinkId = generateInitialLinkId();

      // Générer un identifiant unique
      let baseIdentifier: string;
      if (body.name) {
        baseIdentifier = `mshy_${body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      } else if (body.description) {
        baseIdentifier = `mshy_${body.description.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)}`;
      } else {
        const timestamp = Date.now().toString();
        const randomPart = Math.random().toString(36).substring(2, 8);
        baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
      }
      const uniqueIdentifier = await ensureUniqueShareLinkIdentifier(fastify.prisma, baseIdentifier);

      // Créer le lien de partage
      const shareLink = await fastify.prisma.conversationShareLink.create({
        data: {
          linkId: initialLinkId,
          conversationId: conversationId!,
          createdBy: userId,
          name: body.name,
          description: body.description,
          maxUses: body.maxUses,
          maxConcurrentUsers: body.maxConcurrentUsers,
          maxUniqueSessions: body.maxUniqueSessions,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          allowAnonymousMessages: body.allowAnonymousMessages ?? true,
          allowAnonymousFiles: body.allowAnonymousFiles ?? false,
          allowAnonymousImages: body.allowAnonymousImages ?? true,
          allowViewHistory: body.allowViewHistory ?? true,
          requireAccount: body.requireAccount ?? false,
          requireNickname: body.requireNickname ?? true,
          requireEmail: body.requireEmail ?? false,
          requireBirthday: body.requireBirthday ?? false,
          allowedCountries: body.allowedCountries ?? [],
          allowedLanguages: body.allowedLanguages ?? [],
          allowedIpRanges: body.allowedIpRanges ?? [],
          identifier: uniqueIdentifier
        }
      });

      // Mettre à jour avec le linkId final
      const finalLinkId = generateFinalLinkId(shareLink.id, initialLinkId);
      await fastify.prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { linkId: finalLinkId }
      });

      // Notifier les admins et le créateur de la création du lien
      try {
        const admins = await fastify.prisma.conversationMember.findMany({
          where: {
            conversationId: conversationId!,
            isActive: true,
            OR: [
              { role: 'admin' },
              { role: 'creator' }
            ],
            userId: { not: userId }
          },
          select: { userId: true }
        });

        const notificationService = (fastify as any).notificationService;
        if (notificationService && admins.length > 0) {
          const conversation = await fastify.prisma.conversation.findUnique({
            where: { id: conversationId! },
            select: { title: true }
          });

          for (const admin of admins) {
            await notificationService.createNotification({
              userId: admin.userId,
              type: 'system',
              title: 'Nouveau lien partagé',
              content: `Un lien de partage a été créé pour ${conversation?.title || 'la conversation'}${shareLink.name ? ` : ${shareLink.name}` : ''}`,
              priority: 'normal',
              senderId: userId,
              conversationId: conversationId!,
              data: {
                shareLinkId: shareLink.id,
                linkId: finalLinkId,
                linkName: shareLink.name,
                action: 'view_conversation'
              }
            });
          }
        }
      } catch (notifError) {
        fastify.log.error('Error sending share link notification:');
      }

      return reply.status(201).send({
        success: true,
        data: {
          linkId: finalLinkId,
          conversationId,
          shareLink: {
            id: shareLink.id,
            linkId: finalLinkId,
            name: shareLink.name,
            description: shareLink.description,
            expiresAt: shareLink.expiresAt,
            isActive: shareLink.isActive
          }
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
      logError(fastify.log, 'Create link error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
