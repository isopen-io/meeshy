import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  sendMessageSchema,
  sendMessageBodySchema,
  messageSenderSchema,
  SendMessageInput
} from './types';

export async function registerMessageRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  const trackingLinkService = new TrackingLinkService(fastify.prisma);

  // Envoyer un message via un lien partagé (sessionToken uniquement)
  fastify.post('/links/:identifier/messages', {
    schema: {
      description: 'Send a message as an anonymous user via share link. Requires x-session-token header. The share link must be active, not expired, and allow anonymous messages. The anonymous participant must have message sending permissions. Message content or attachments are required. Automatically processes and tracks links in message content.',
      tags: ['links', 'messages'],
      summary: 'Send message (anonymous)',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId or database ID)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      headers: {
        type: 'object',
        required: ['x-session-token'],
        properties: {
          'x-session-token': {
            type: 'string',
            description: 'Anonymous session token'
          }
        }
      },
      body: sendMessageBodySchema,
      response: {
        201: {
          description: 'Message sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Created message ID' },
                message: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    content: { type: 'string' },
                    originalLanguage: { type: 'string' },
                    messageType: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    sender: { type: 'null' },
                    anonymousSender: { type: 'object', description: 'Anonymous sender information' }
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
          description: 'Session token required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - anonymous messages not allowed or insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Link expired or inactive',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };
      const body = sendMessageSchema.parse(request.body);

      const sessionToken = request.headers['x-session-token'] as string;

      if (!sessionToken) {
        return reply.status(401).send({
          success: false,
          message: 'Session token requis pour envoyer un message'
        });
      }

      const isLinkId = identifier.startsWith('mshy_');

      let shareLink;
      if (isLinkId) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier }
        });
      } else {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: identifier }
        });
      }

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      const anonymousParticipant = await fastify.prisma.anonymousParticipant.findFirst({
        where: {
          sessionToken,
          isActive: true,
          shareLinkId: shareLink.id
        },
        include: {
          shareLink: {
            select: {
              id: true,
              conversationId: true,
              isActive: true,
              allowAnonymousMessages: true,
              expiresAt: true
            }
          }
        }
      });

      if (!anonymousParticipant) {
        return reply.status(401).send({
          success: false,
          message: 'Session invalide ou non autorisée pour ce lien'
        });
      }

      if (!anonymousParticipant.shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien n\'est plus actif'
        });
      }

      if (anonymousParticipant.shareLink.expiresAt && new Date() > anonymousParticipant.shareLink.expiresAt) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a expiré'
        });
      }

      if (!anonymousParticipant.shareLink.allowAnonymousMessages) {
        return reply.status(403).send({
          success: false,
          message: 'Les messages anonymes ne sont pas autorisés pour ce lien'
        });
      }

      if (!anonymousParticipant.canSendMessages) {
        return reply.status(403).send({
          success: false,
          message: 'Vous n\'êtes pas autorisé à envoyer des messages'
        });
      }

      // Traiter les liens dans le message AVANT la sauvegarde
      const { processedContent, trackingLinks } = await trackingLinkService.processMessageLinks({
        content: body.content,
        conversationId: anonymousParticipant.shareLink.conversationId,
        createdBy: undefined
      });

      // Créer le message avec le contenu transformé
      const message = await fastify.prisma.message.create({
        data: {
          conversationId: anonymousParticipant.shareLink.conversationId,
          senderId: null,
          content: processedContent,
          originalLanguage: body.originalLanguage,
          messageType: body.messageType,
          anonymousSenderId: anonymousParticipant.id
        },
        include: {
          anonymousSender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              language: true
            }
          }
        }
      });

      // Mettre à jour les messageIds des TrackingLinks
      if (trackingLinks.length > 0) {
        const tokens = trackingLinks.map(link => link.token);
        await trackingLinkService.updateTrackingLinksMessageId(tokens, message.id);
      }

      // Émettre l'événement WebSocket
      const socketManager = (fastify as any).socketManager;
      if (socketManager) {
        socketManager.emitToConversation(anonymousParticipant.shareLink.conversationId, 'link:message:new', {
          message: {
            id: message.id,
            content: message.content,
            originalLanguage: message.originalLanguage,
            messageType: message.messageType,
            isEdited: message.isEdited,
            editedAt: message.editedAt,
            isDeleted: message.isDeleted,
            deletedAt: message.deletedAt,
            replyToId: message.replyToId,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            sender: null,
            anonymousSender: message.anonymousSender
          }
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          messageId: message.id,
          message: {
            id: message.id,
            content: message.content,
            originalLanguage: message.originalLanguage,
            messageType: message.messageType,
            isEdited: message.isEdited,
            editedAt: message.editedAt,
            isDeleted: message.isDeleted,
            deletedAt: message.deletedAt,
            replyToId: message.replyToId,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            sender: null,
            anonymousSender: message.anonymousSender
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
      logError(fastify.log, 'Send link message error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Envoyer un message via un lien partagé (utilisateurs authentifiés)
  fastify.post('/links/:identifier/messages/auth', {
    onRequest: [authRequired],
    schema: {
      description: 'Send a message as an authenticated user via share link. User must be a member of the associated conversation. For the global "meeshy" conversation, all authenticated users have access. The share link must be active and not expired. Automatically processes and tracks links in message content.',
      tags: ['links', 'messages'],
      summary: 'Send message (authenticated)',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId or database ID)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: sendMessageBodySchema,
      response: {
        201: {
          description: 'Message sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Created message ID' },
                message: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    content: { type: 'string' },
                    originalLanguage: { type: 'string' },
                    messageType: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    sender: { ...messageSenderSchema },
                    anonymousSender: { type: 'null' }
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
          description: 'Forbidden - not a member of this conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Link expired or inactive',
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
      const { identifier } = request.params as { identifier: string };
      const body = sendMessageSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return reply.status(403).send({
          error: 'Utilisateur enregistré requis'
        });
      }

      const userId = request.authContext.registeredUser!.id;

      const isLinkId = identifier.startsWith('mshy_');

      let shareLink;
      if (isLinkId) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier },
          include: {
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            }
          }
        });
      } else {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: identifier },
          include: {
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            }
          }
        });
      }

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de partage non trouvé'
        });
      }

      if (!shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien n\'est plus actif'
        });
      }

      if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a expiré'
        });
      }

      let isMember = false;

      if (shareLink.conversation.identifier === "meeshy") {
        isMember = true;
      } else {
        const member = await fastify.prisma.conversationMember.findFirst({
          where: {
            conversationId: shareLink.conversationId,
            userId: userId,
            isActive: true
          }
        });
        isMember = !!member;
      }

      if (!isMember) {
        return reply.status(403).send({
          success: false,
          message: 'Vous n\'êtes pas membre de cette conversation'
        });
      }

      // Traiter les liens dans le message AVANT la sauvegarde
      const { processedContent, trackingLinks } = await trackingLinkService.processMessageLinks({
        content: body.content,
        conversationId: shareLink.conversationId,
        createdBy: userId
      });

      // Créer le message avec le contenu transformé
      const message = await fastify.prisma.message.create({
        data: {
          conversationId: shareLink.conversationId,
          senderId: userId,
          content: processedContent,
          originalLanguage: body.originalLanguage,
          messageType: body.messageType,
          anonymousSenderId: null
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              systemLanguage: true
            }
          }
        }
      });

      // Mettre à jour les messageIds des TrackingLinks
      if (trackingLinks.length > 0) {
        const tokens = trackingLinks.map(link => link.token);
        await trackingLinkService.updateTrackingLinksMessageId(tokens, message.id);
      }

      // Émettre l'événement WebSocket
      const socketManager = (fastify as any).socketManager;
      if (socketManager) {
        socketManager.emitToConversation(shareLink.conversationId, 'link:message:new', {
          message: {
            id: message.id,
            content: message.content,
            originalLanguage: message.originalLanguage,
            messageType: message.messageType,
            isEdited: message.isEdited,
            editedAt: message.editedAt,
            isDeleted: message.isDeleted,
            deletedAt: message.deletedAt,
            replyToId: message.replyToId,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            sender: message.sender,
            anonymousSender: null
          }
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          messageId: message.id,
          message: {
            id: message.id,
            content: message.content,
            originalLanguage: message.originalLanguage,
            messageType: message.messageType,
            isEdited: message.isEdited,
            editedAt: message.editedAt,
            isDeleted: message.isDeleted,
            deletedAt: message.deletedAt,
            replyToId: message.replyToId,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            sender: message.sender,
            anonymousSender: null
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
      logError(fastify.log, 'Send authenticated link message error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
