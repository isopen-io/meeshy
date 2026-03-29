import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { messageValidationHook } from '../../middleware/rate-limiter';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type {
  ConversationParams,
  EditMessageBody
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';

const EditMessageBodySchema = z.object({
  content: CommonSchemas.messageContent,
  originalLanguage: CommonSchemas.language.optional(),
});
// Logger dédié pour messages-advanced
const logger = enhancedLogger.child({ module: 'messages-advanced' });


/**
 * Enregistre les routes avancées de gestion des messages (edit, delete, reactions, status)
 */
export function registerMessagesAdvancedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = (fastify as any).socketIOHandler;
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);

  fastify.put<{
    Params: ConversationParams & { messageId: string };
    Body: EditMessageBody;
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Edit an existing message in a conversation (only by message sender)',
      tags: ['conversations', 'messages'],
      summary: 'Edit message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 },
          originalLanguage: { type: 'string', description: 'Language code', default: 'fr' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const bodyResult = EditMessageBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message });
      }

      const { id, messageId } = request.params;
      const { content, originalLanguage = 'fr' } = bodyResult.data;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        include: {
          sender: {
            select: { id: true, userId: true, role: true }
          }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // Vérifier la restriction temporelle (24 heures max pour les utilisateurs normaux)
      const isAuthor = existingMessage.sender?.userId === userId;
      const messageAge = Date.now() - new Date(existingMessage.createdAt).getTime();
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

      if (isAuthor && messageAge > twentyFourHoursInMs) {
        // Vérifier si l'utilisateur a des privilèges spéciaux
        const userRole = existingMessage.sender.role;
        const hasSpecialPrivileges = userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'BIGBOSS';

        if (!hasSpecialPrivileges) {
          return sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)');
        }
      }

      // Vérifier les permissions : l'auteur peut modifier, ou les modérateurs/admins/créateurs
      let canModify = isAuthor;

      if (!canModify) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.participant.findFirst({
          where: {
            conversationId: conversationId,
            userId: userId,
            isActive: true
          },
          include: {
            user: {
              select: { role: true }
            }
          }
        });

        if (membership) {
          const userRole = membership.user.role;
          canModify = userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'BIGBOSS';
        }
      }

      if (!canModify) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier ce message');
      }

      // Validation du contenu
      if (!content || content.trim().length === 0) {
        return sendBadRequest(reply, 'Message content cannot be empty');
      }

      // ÉTAPE: Traiter les liens [[url]] et <url> AVANT de sauvegarder le message
      let processedContent = content.trim();
        logger.info(`Processing tracking links in edited message messageId=${messageId}`);

      try {
        logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====');
        logger.info(`Processing tracking links in edited message messageId=${messageId}`);
        const { processedContent: contentWithLinks, trackingLinks } = await trackingLinkService.processExplicitLinksInContent({
          content: content.trim(),
          conversationId: conversationId,
          messageId: messageId,
          createdBy: userId
        });
        processedContent = contentWithLinks;
        logger.info(`Edit - Processed content after links processedContent=${processedContent}`);

        if (trackingLinks.length > 0) {
          logger.info(`✅ ${trackingLinks.length} tracking link(s) created/reused in edited message`);
        }
      } catch (linkError) {
        logger.error('Error processing tracking links in edit', linkError);
        // Continue with unprocessed content if tracking links fail
      }

      // Mettre à jour le message avec le contenu traité
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: processedContent,
          originalLanguage,
          isEdited: true,
          editedAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              type: true,
              role: true,
              language: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  language: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      logger.info('===== POST MESSAGE UPDATE - BEFORE MENTIONS =====');
      logger.info(`Message updated successfully, ID messageId=${messageId}`);
      // ÉTAPE: Traitement des mentions @username lors de l'édition
      logger.info('===== STARTING MENTION PROCESSING BLOCK =====');
      try {
        logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const mentionService = (fastify as any).mentionService;
        logger.info(`Edit - MentionService available !!mentionService=${!!mentionService}`);

        if (mentionService) {
          logger.info(`Edit - Processing mentions for edited message messageId=${messageId}`);

          // Supprimer les anciennes mentions
          await prisma.mention.deleteMany({
            where: { messageId: messageId }
          });

          // Extraire les nouvelles mentions du contenu traité (avec tracking links déjà remplacés)
          const mentionedUsernames = mentionService.extractMentions(processedContent);
          logger.info(`Edit - Extracting mentions from processedContent=${processedContent}`);
          logger.info('Edit - Mentions extracted:', mentionedUsernames);
          logger.info('Edit - Number of mentions:', mentionedUsernames.length);

          if (mentionedUsernames.length > 0) {
            // Résoudre les usernames en utilisateurs réels
            const userMap = await mentionService.resolveUsernames(mentionedUsernames);
            logger.info('UserMap size:', userMap.size);
            const mentionedUserIds = Array.from(userMap.values()).map((user: any) => user.id);

            if (mentionedUserIds.length > 0) {
              // Valider les permissions de mention
              const validationResult = await mentionService.validateMentionPermissions(
                conversationId,
                mentionedUserIds,
                userId
              );
              logger.info(`Validation result: isValid=${validationResult.isValid}, validUserIdsCount=${validationResult.validUserIds.length}`);

              if (validationResult.validUserIds.length > 0) {
                // Créer les nouvelles entrées de mention
                await mentionService.createMentions(
                  messageId,
                  validationResult.validUserIds
                );

                // Extraire les usernames validés
                const validatedUsernames = Array.from(userMap.entries())
                  .filter(([_, user]) => validationResult.validUserIds.includes(user.id))
                  .map(([username, _]) => username);

                logger.info('Mise à jour avec validatedMentions:', validatedUsernames);

                // Mettre à jour le message avec les usernames validés
                await prisma.message.update({
                  where: { id: messageId },
                  data: { validatedMentions: validatedUsernames }
                });

                // IMPORTANT: Mettre à jour l'objet en mémoire
                updatedMessage.validatedMentions = validatedUsernames;

                logger.info(`✅ ${validationResult.validUserIds.length} mention(s) mise(s) à jour`);
                logger.info(`updatedMessage.validatedMentions =`, updatedMessage.validatedMentions);

                // Déclencher les notifications de mention pour les utilisateurs mentionnés
                const notificationService = (fastify as any).notificationService;
                if (notificationService) {
                  try {
                    // Récupérer les informations de l'expéditeur
                    const sender = await prisma.user.findUnique({
                      where: { id: userId },
                      select: {
                        username: true,
                        avatar: true
                      }
                    });

                    if (sender) {
                      // Récupérer les informations de la conversation
                      const conversationInfo = await prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: {
                          title: true,
                          type: true,
                          participants: {
                            where: { isActive: true },
                            select: { userId: true }
                          }
                        }
                      });

                      if (conversationInfo) {
                        const memberIds = conversationInfo.participants.map((m: { userId: string | null }) => m.userId).filter(Boolean);

                        // PERFORMANCE: Créer toutes les notifications de mention en batch
                        const count = await notificationService.createMentionNotificationsBatch(
                          validationResult.validUserIds,
                          {
                            senderId: userId,
                            senderUsername: sender.username,
                            senderAvatar: sender.avatar || undefined,
                            messageContent: processedContent,
                            conversationId,
                            conversationTitle: conversationInfo.title,
                            messageId
                          },
                          memberIds
                        );
                        logger.info(`📩 ${count} notifications de mention créées en batch`);
                      }
                    }
                  } catch (notifError) {
                    logger.error('Erreur notifications mentions', notifError);
                  }
                }
              }
            } else {
              logger.info('Aucun utilisateur trouvé pour les mentions');
              // Mettre à jour avec un tableau vide
              await prisma.message.update({
                where: { id: messageId },
                data: { validatedMentions: [] }
              });
              updatedMessage.validatedMentions = [];
            }
          } else {
            logger.info('Aucune mention dans le message édité');
            // Mettre à jour avec un tableau vide
            await prisma.message.update({
              where: { id: messageId },
              data: { validatedMentions: [] }
            });
            updatedMessage.validatedMentions = [];
          }
        } else {
          logger.warn('Edit - MentionService NOT AVAILABLE - mentions will not be processed!');
          // Clear mentions if service not available
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        }
      } catch (mentionError) {
        logger.error('Edit - Error processing mentions', mentionError);
        logger.error('Edit - Stack trace', mentionError.stack);
        // Ne pas faire échouer l'édition si les mentions échouent
        // Clear mentions on error to avoid stale data
        try {
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        } catch (e) {
          logger.error('Edit - Error clearing mentions', e);
        }
      }

      // Déclencher la retraduction automatique du message modifié
      try {
        logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====');
        // Utiliser les instances déjà disponibles dans le contexte Fastify
        const translationService: MessageTranslationService = (fastify as any).translationService;

        // Invalider les traductions existantes (vider le JSON translations)
        await prisma.message.update({
          where: { id: messageId },
          data: { translations: null }
        });

        // Créer un objet message pour la retraduction (avec contenu traité incluant tracking links)
        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: originalLanguage,
          conversationId: conversationId,
          senderId: existingMessage.senderId
        };

        // Déclencher la retraduction via la méthode privée existante
        await (translationService as any)._processRetranslationAsync(messageId, messageForRetranslation);
        logger.info(`Edit - Retranslation queued for message ${messageId}`);

      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Invalider et recalculer les stats pour refléter l'édition
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        id,
        () => []
      );

      // Construire la réponse avec mentions validées (PAS de traductions - elles arriveront via socket)
      const messageResponse = {
        ...updatedMessage,
        conversationId,
        validatedMentions: updatedMessage.validatedMentions || [],
        meta: { conversationStats: stats }
      };

      logger.info(`Edit - Response includes ${(updatedMessage.validatedMentions || []).length} validated mentions`);

      // Diffuser la mise à jour via Socket.IO
      try {
        logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = ROOMS.conversation(conversationId);
          (socketIOManager as any).io.to(room).emit(SERVER_EVENTS.MESSAGE_EDITED, messageResponse);
          logger.info(`Edit - Broadcasted message:edited to room ${room}`);
        }
      } catch (socketError) {
        logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', socketError);
        // Ne pas faire échouer l'édition si la diffusion échoue
      }

      return sendSuccess(reply, messageResponse);

    } catch (error) {
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


  fastify.delete<{
    Params: ConversationParams & { messageId: string };
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Delete a message from a conversation (soft delete - marks as deleted)',
      tags: ['conversations', 'messages'],
      summary: 'Delete message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to delete' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Message supprimé avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        include: {
          sender: {
            select: { id: true, userId: true }
          },
          attachments: {
            select: { id: true }
          }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // Vérifier les permissions : l'auteur peut supprimer, ou les modérateurs/admins/créateurs
      const isAuthor = existingMessage.sender?.userId === userId;
      let canDelete = isAuthor;

      if (!canDelete) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.participant.findFirst({
          where: {
            conversationId: conversationId,
            userId: userId,
            isActive: true
          },
          include: {
            user: {
              select: { role: true }
            }
          }
        });

        if (membership) {
          const userRole = membership.user.role;
          canDelete = userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'BIGBOSS';
        }
      }

      if (!canDelete) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer ce message');
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (existingMessage.attachments && existingMessage.attachments.length > 0) {
        for (const attachment of existingMessage.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            logger.error(`❌ [CONVERSATIONS] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // Supprimer les traductions du message (vider le JSON)
      await prisma.message.update({
        where: { id: messageId },
        data: { translations: null }
      });

      // Soft delete du message
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date()
        }
      });

      // Invalider et recalculer les stats
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        conversationId,
        () => []
      );

      // Diffuser la suppression via Socket.IO
      try {
        logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = ROOMS.conversation(conversationId);
          (socketIOManager as any).io.to(room).emit(SERVER_EVENTS.MESSAGE_DELETED, {
            messageId,
            conversationId
          });
        }
      } catch (socketError) {
        logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', socketError);
        // Ne pas faire échouer la suppression si la diffusion échoue
      }

      return sendSuccess(reply, { messageId, deleted: true, meta: { conversationStats: stats } });

    } catch (error) {
      logger.error('Error deleting message', error);
      sendInternalError(reply, 'Erreur lors de la suppression du message');
    }
  });

  // NOTE: ancienne route /conversations/create-link supprimée (remplacée par /links)


  fastify.patch<{
    Params: { messageId: string };
    Body: { content: string };
  }>('/messages/:messageId', {
    schema: {
      description: 'Edit a message by message ID (alternative to PUT /conversations/:id/messages/:messageId)',
      tags: ['messages'],
      summary: 'Edit message by ID',
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et appartient à l'utilisateur
      const message = await prisma.message.findFirst({
        where: { id: messageId },
        include: {
          sender: {
            select: { userId: true }
          },
          conversation: {
            include: {
              participants: {
                where: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message introuvable');
      }

      // Vérifier que l'utilisateur est l'auteur du message
      if (message.sender?.userId !== userId) {
        return sendForbidden(reply, 'Vous ne pouvez modifier que vos propres messages');
      }

      // Vérifier que l'utilisateur est membre de la conversation
      // Pour la conversation globale "meeshy", l'accès est autorisé
      if (message.conversation.identifier !== "meeshy") {
        const membership = await prisma.participant.findFirst({
          where: {
            conversationId: message.conversationId,
            userId: userId,
            isActive: true
          }
        });

        if (!membership) {
          return sendForbidden(reply, 'Unauthorized access to this conversation');
        }
      }

      // Mettre à jour le contenu du message
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: content.trim(),
          isEdited: true,
          editedAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              role: true,
              user: { select: { username: true } }
            }
          }
        }
      });

      // Note: Les traductions existantes restent inchangées
      // Le service de traduction sera notifié si nécessaire via WebSocket

      return sendSuccess(reply, updatedMessage);

    } catch (error) {
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/reactions', {
    schema: {
      description: 'Get all reactions from all messages in a conversation. Returns reactions grouped by message ID with emoji counts and user information. Useful for loading full conversation context at once.',
      tags: ['conversations', 'reactions'],
      summary: 'Get all conversation reactions',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                reactions: {
                  type: 'array',
                  description: 'All reactions grouped by message'
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer toutes les réactions de tous les messages de la conversation
      const reactions = await prisma.reaction.findMany({
        where: {
          message: {
            conversationId: conversationId,
            deletedAt: null
          }
        },
        include: {
          participant: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
              type: true,
              user: { select: { username: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Grouper les réactions par messageId et emoji
      const reactionsByMessage = new Map<string, any>();

      for (const reaction of reactions) {
        if (!reactionsByMessage.has(reaction.messageId)) {
          reactionsByMessage.set(reaction.messageId, {});
        }

        const messageReactions = reactionsByMessage.get(reaction.messageId);
        if (!messageReactions[reaction.emoji]) {
          messageReactions[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: []
          };
        }

        messageReactions[reaction.emoji].count++;
        messageReactions[reaction.emoji].users.push({
          participantId: reaction.participantId,
          isAnonymous: reaction.participant.type === 'anonymous',
          user: { ...reaction.participant, username: reaction.participant.user?.username }
        });
      }

      // Convertir en tableau
      const reactionsArray = Array.from(reactionsByMessage.entries()).map(([messageId, emojis]) => ({
        messageId,
        reactions: Object.values(emojis)
      }));

      return sendSuccess(reply, {
        reactions: reactionsArray,
        total: reactions.length
      });

    } catch (error) {
      logger.error('Error fetching conversation reactions', error);
      return sendInternalError(reply, 'Error retrieving reactions');
    }
  });

  /**
   * POST /conversations/:id/messages/:messageId/reactions
   * Add an emoji reaction to a specific message within a conversation.
   * Reuses the existing ReactionService for consistency with Socket.IO handlers.
   */
  fastify.post<{
    Params: ConversationParams & { messageId: string };
    Body: { emoji: string };
  }>('/conversations/:id/messages/:messageId/reactions', {
    schema: {
      description: 'Add an emoji reaction to a message in a conversation. Reuses the same logic as the Socket.IO reaction:add handler. The reaction will be broadcast to all conversation participants via Socket.IO.',
      tags: ['conversations', 'reactions'],
      summary: 'Add reaction to message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to react to' }
        }
      },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: {
          emoji: { type: 'string', minLength: 1, maxLength: 10, description: 'Emoji character to add as reaction' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                added: { type: 'boolean', description: 'Whether the reaction was added' },
                emoji: { type: 'string', description: 'The emoji that was added' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const { emoji } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const isAnonymous = authRequest.authContext.isAnonymous;
      const sessionToken = authRequest.authContext.sessionToken;

      // Validate emoji
      if (!emoji) {
        return sendBadRequest(reply, 'emoji is required');
      }

      // Resolve conversation ID
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Verify access to conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Verify message belongs to the conversation
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!message) {
        return sendNotFound(reply, 'Message not found in this conversation');
      }

      // Resolve participantId for the current user
      const currentParticipant = isAnonymous
        ? { id: authRequest.authContext.participantId }
        : await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true },
          });

      if (!currentParticipant?.id) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      // Use ReactionService to add the reaction
      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(prisma);

      const reaction = await reactionService.addReaction({
        messageId,
        emoji,
        participantId: currentParticipant.id,
      });

      if (!reaction) {
        return sendInternalError(reply, 'Failed to add reaction');
      }

      // Broadcast via Socket.IO to all conversation participants
      try {
        const updateEvent = await reactionService.createUpdateEvent(
          messageId,
          emoji,
          'add',
          currentParticipant.id,
          conversationId,
        );

        if (socketIOHandler) {
          const socketIOManager = socketIOHandler.getManager?.();
          const io = socketIOManager?.io || (socketIOHandler as any).io;
          if (io) {
            io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);
          }
        }
      } catch (socketError) {
        logger.warn('[REACTION-REST] Error broadcasting reaction via Socket.IO', socketError);
        // Do not fail the response if broadcast fails
      }

      return sendSuccess(reply, { added: true, emoji });

    } catch (error: any) {
      logger.error('Error adding reaction via REST', error);

      // Handle specific error messages from ReactionService
      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }
      if (error.message === 'Message not found') {
        return sendNotFound(reply, 'Message not found');
      }
      if (error.message?.includes('not a member') || error.message?.includes('not a participant')) {
        return sendForbidden(reply, 'Access denied to this conversation');
      }
      if (error.message?.includes('Maximum')) {
        return sendBadRequest(reply, error.message);
      }

      return sendInternalError(reply, 'Failed to add reaction');
    }
  });

  /**
   * DELETE /conversations/:id/messages/:messageId/reactions
   * Remove an emoji reaction from a specific message within a conversation.
   * Reuses the existing ReactionService for consistency with Socket.IO handlers.
   */
  fastify.delete<{
    Params: ConversationParams & { messageId: string };
    Body: { emoji: string };
  }>('/conversations/:id/messages/:messageId/reactions', {
    schema: {
      description: 'Remove an emoji reaction from a message in a conversation. Users can only remove their own reactions. The removal will be broadcast to all conversation participants via Socket.IO.',
      tags: ['conversations', 'reactions'],
      summary: 'Remove reaction from message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to remove reaction from' }
        }
      },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: {
          emoji: { type: 'string', minLength: 1, maxLength: 10, description: 'Emoji character to remove' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                removed: { type: 'boolean', description: 'Whether the reaction was removed' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const { emoji } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const isAnonymous = authRequest.authContext.isAnonymous;
      const sessionToken = authRequest.authContext.sessionToken;

      // Validate emoji
      if (!emoji) {
        return sendBadRequest(reply, 'emoji is required');
      }

      // Resolve conversation ID
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Verify access to conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participantId for the current user
      const currentParticipant = isAnonymous
        ? { id: authRequest.authContext.participantId }
        : await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true },
          });

      if (!currentParticipant?.id) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      // Use ReactionService to remove the reaction
      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(prisma);

      const removed = await reactionService.removeReaction({
        messageId,
        emoji,
        participantId: currentParticipant.id,
      });

      if (!removed) {
        return sendNotFound(reply, 'Reaction not found');
      }

      // Broadcast via Socket.IO to all conversation participants
      try {
        const updateEvent = await reactionService.createUpdateEvent(
          messageId,
          emoji,
          'remove',
          currentParticipant.id,
          conversationId,
        );

        if (socketIOHandler) {
          const socketIOManager = socketIOHandler.getManager?.();
          const io = socketIOManager?.io || (socketIOHandler as any).io;
          if (io) {
            io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.REACTION_REMOVED, updateEvent);
          }
        }
      } catch (socketError) {
        logger.warn('[REACTION-REST] Error broadcasting reaction removal via Socket.IO', socketError);
        // Do not fail the response if broadcast fails
      }

      return sendSuccess(reply, { removed: true });

    } catch (error: any) {
      logger.error('Error removing reaction via REST', error);

      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }

      return sendInternalError(reply, 'Failed to remove reaction');
    }
  });

  /**
   * GET /conversations/:id/status
   * Récupère les statuts de lecture de tous les messages d'une conversation
   */
  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/status', {
    schema: {
      description: 'Get read/delivery status for all messages in a conversation. Returns aggregated counts and detailed per-user status for each message. Useful for displaying message receipts and read indicators.',
      tags: ['conversations', 'status'],
      summary: 'Get all conversation message statuses',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                statuses: {
                  type: 'array',
                  description: 'Status information for all messages'
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer tous les messages avec leurs statuts dénormalisés
      const messages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          deletedAt: null
        },
        select: {
          id: true,
          senderId: true,
          deliveredCount: true,
          readCount: true,
          deliveredToAllAt: true,
          readByAllAt: true,
          createdAt: true,
          statusEntries: {
            select: {
              participantId: true,
              deliveredAt: true,
              readAt: true,
              participant: {
                select: {
                  id: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  user: { select: { username: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Formater les statuts
      const statuses = messages.map(message => ({
        messageId: message.id,
        senderId: message.senderId,
        summary: {
          deliveredCount: message.deliveredCount || 0,
          readCount: message.readCount || 0,
          deliveredToAllAt: message.deliveredToAllAt,
          readByAllAt: message.readByAllAt
        },
        entries: message.statusEntries.map(entry => ({
          participantId: entry.participantId,
          isAnonymous: entry.participant.type === 'anonymous',
          deliveredAt: entry.deliveredAt,
          readAt: entry.readAt,
          user: { ...entry.participant, username: entry.participant.user?.username }
        }))
      }));

      return sendSuccess(reply, {
        statuses,
        total: messages.length
      });

    } catch (error) {
      logger.error('Error fetching conversation statuses', error);
      return sendInternalError(reply, 'Error retrieving statuses');
    }
  });


}
