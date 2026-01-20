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
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import type {
  ConversationParams,
  EditMessageBody
} from './types';

/**
 * Résout l'ID de conversation réel à partir d'un identifiant
 */
async function resolveConversationId(prisma: PrismaClient, identifier: string): Promise<string | null> {
  if (isValidMongoId(identifier)) {
    return identifier;
  }
  const conversation = await prisma.conversation.findFirst({
    where: { identifier: identifier }
  });
  return conversation ? conversation.id : null;
}

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
      const { id, messageId } = request.params;
      const { content, originalLanguage = 'fr' } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          isDeleted: false
        },
        include: {
          sender: {
            select: { id: true, role: true }
          }
        }
      });

      if (!existingMessage) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier la restriction temporelle (24 heures max pour les utilisateurs normaux)
      const isAuthor = existingMessage.senderId === userId;
      const messageAge = Date.now() - new Date(existingMessage.createdAt).getTime();
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

      if (isAuthor && messageAge > twentyFourHoursInMs) {
        // Vérifier si l'utilisateur a des privilèges spéciaux
        const userRole = existingMessage.sender.role;
        const hasSpecialPrivileges = userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'BIGBOSS';

        if (!hasSpecialPrivileges) {
          return reply.status(403).send({
            success: false,
            error: 'Vous ne pouvez plus modifier ce message (délai de 24 heures dépassé)'
          });
        }
      }

      // Vérifier les permissions : l'auteur peut modifier, ou les modérateurs/admins/créateurs
      let canModify = isAuthor;

      if (!canModify) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.conversationMember.findFirst({
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
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à modifier ce message'
        });
      }

      // Validation du contenu
      if (!content || content.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Le contenu du message ne peut pas être vide'
        });
      }

      // ÉTAPE: Traiter les liens [[url]] et <url> AVANT de sauvegarder le message
      let processedContent = content.trim();
      console.log('[GATEWAY] Edit - Original content:', content.trim());

      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        console.log('[GATEWAY] Processing tracking links in edited message:', messageId);
        const { processedContent: contentWithLinks, trackingLinks } = await trackingLinkService.processExplicitLinksInContent({
          content: content.trim(),
          conversationId: conversationId,
          messageId: messageId,
          createdBy: userId
        });
        processedContent = contentWithLinks;
        console.log('[GATEWAY] Edit - Processed content after links:', processedContent);

        if (trackingLinks.length > 0) {
          console.log(`[GATEWAY] ✅ ${trackingLinks.length} tracking link(s) created/reused in edited message`);
        }
      } catch (linkError) {
        console.error('[GATEWAY] Error processing tracking links in edit:', linkError);
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
              username: true,
              displayName: true,
              avatar: true,
              role: true
            }
          },
          anonymousSender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              language: true
            }
          },
          replyTo: {
            include: {
              sender: {
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
      });

      console.log('[GATEWAY] ===== POST MESSAGE UPDATE - BEFORE MENTIONS =====');
      console.log('[GATEWAY] Message updated successfully, ID:', messageId);
      // ÉTAPE: Traitement des mentions @username lors de l'édition
      console.log('[GATEWAY] ===== STARTING MENTION PROCESSING BLOCK =====');
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const mentionService = (fastify as any).mentionService;
        console.log('[GATEWAY] Edit - MentionService available:', !!mentionService);

        if (mentionService) {
          console.log('[GATEWAY] Edit - Processing mentions for edited message:', messageId);

          // Supprimer les anciennes mentions
          await prisma.mention.deleteMany({
            where: { messageId: messageId }
          });

          // Extraire les nouvelles mentions du contenu traité (avec tracking links déjà remplacés)
          const mentionedUsernames = mentionService.extractMentions(processedContent);
          console.log('[GATEWAY] Edit - Extracting mentions from:', processedContent);
          console.log('[GATEWAY] Edit - Mentions extracted:', mentionedUsernames);
          console.log('[GATEWAY] Edit - Number of mentions:', mentionedUsernames.length);

          if (mentionedUsernames.length > 0) {
            // Résoudre les usernames en utilisateurs réels
            const userMap = await mentionService.resolveUsernames(mentionedUsernames);
            console.log('[GATEWAY] UserMap size:', userMap.size);
            const mentionedUserIds = Array.from(userMap.values()).map((user: any) => user.id);

            if (mentionedUserIds.length > 0) {
              // Valider les permissions de mention
              const validationResult = await mentionService.validateMentionPermissions(
                conversationId,
                mentionedUserIds,
                userId
              );
              console.log('[GATEWAY] Validation result:', {
                isValid: validationResult.isValid,
                validUserIdsCount: validationResult.validUserIds.length
              });

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

                console.log('[GATEWAY] Mise à jour avec validatedMentions:', validatedUsernames);

                // Mettre à jour le message avec les usernames validés
                await prisma.message.update({
                  where: { id: messageId },
                  data: { validatedMentions: validatedUsernames }
                });

                // IMPORTANT: Mettre à jour l'objet en mémoire
                updatedMessage.validatedMentions = validatedUsernames;

                console.log(`[GATEWAY] ✅ ${validationResult.validUserIds.length} mention(s) mise(s) à jour`);
                console.log(`[GATEWAY] updatedMessage.validatedMentions =`, updatedMessage.validatedMentions);

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
                          members: {
                            where: { isActive: true },
                            select: { userId: true }
                          }
                        }
                      });

                      if (conversationInfo) {
                        const memberIds = conversationInfo.members.map((m: any) => m.userId);

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
                        console.log(`[GATEWAY] 📩 ${count} notifications de mention créées en batch`);
                      }
                    }
                  } catch (notifError) {
                    console.error('[GATEWAY] Erreur notifications mentions:', notifError);
                  }
                }
              }
            } else {
              console.log('[GATEWAY] Aucun utilisateur trouvé pour les mentions');
              // Mettre à jour avec un tableau vide
              await prisma.message.update({
                where: { id: messageId },
                data: { validatedMentions: [] }
              });
              updatedMessage.validatedMentions = [];
            }
          } else {
            console.log('[GATEWAY] Aucune mention dans le message édité');
            // Mettre à jour avec un tableau vide
            await prisma.message.update({
              where: { id: messageId },
              data: { validatedMentions: [] }
            });
            updatedMessage.validatedMentions = [];
          }
        } else {
          console.warn('[GATEWAY] Edit - MentionService NOT AVAILABLE - mentions will not be processed!');
          // Clear mentions if service not available
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        }
      } catch (mentionError) {
        console.error('[GATEWAY] Edit - Error processing mentions:', mentionError);
        console.error('[GATEWAY] Edit - Stack trace:', mentionError.stack);
        // Ne pas faire échouer l'édition si les mentions échouent
        // Clear mentions on error to avoid stale data
        try {
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        } catch (e) {
          console.error('[GATEWAY] Edit - Error clearing mentions:', e);
        }
      }

      // Déclencher la retraduction automatique du message modifié
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        // Utiliser les instances déjà disponibles dans le contexte Fastify
        const translationService: MessageTranslationService = (fastify as any).translationService;

        // Invalider les traductions existantes en base de données
        const deletedCount = await prisma.messageTranslation.deleteMany({
          where: {
            messageId: messageId
          }
        });

        // Créer un objet message pour la retraduction (avec contenu traité incluant tracking links)
        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: originalLanguage,
          conversationId: conversationId,
          senderId: userId
        };

        // Déclencher la retraduction via la méthode privée existante
        await (translationService as any)._processRetranslationAsync(messageId, messageForRetranslation);
        console.log(`[GATEWAY] Edit - Retranslation queued for message ${messageId}`);

      } catch (translationError) {
        console.error('[GATEWAY] Erreur lors de la retraduction:', translationError);
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

      console.log(`[GATEWAY] Edit - Response includes ${(updatedMessage.validatedMentions || []).length} validated mentions`);

      // Diffuser la mise à jour via Socket.IO
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:edited', messageResponse);
          console.log(`[GATEWAY] Edit - Broadcasted message:edited to room ${room}`);
        }
      } catch (socketError) {
        console.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer l'édition si la diffusion échoue
      }

      reply.send({
        success: true,
        data: messageResponse
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la modification du message'
      });
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
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          isDeleted: false
        },
        include: {
          sender: {
            select: { id: true }
          },
          attachments: {
            select: { id: true }
          }
        }
      });

      if (!existingMessage) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier les permissions : l'auteur peut supprimer, ou les modérateurs/admins/créateurs
      const isAuthor = existingMessage.senderId === userId;
      let canDelete = isAuthor;

      if (!canDelete) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.conversationMember.findFirst({
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
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à supprimer ce message'
        });
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (existingMessage.attachments && existingMessage.attachments.length > 0) {
        for (const attachment of existingMessage.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            console.error(`❌ [CONVERSATIONS] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // Supprimer les traductions du message
      const deletedTranslations = await prisma.messageTranslation.deleteMany({
        where: {
          messageId: messageId
        }
      });

      // Soft delete du message
      await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
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
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:deleted', {
            messageId,
            conversationId
          });
        }
      } catch (socketError) {
        console.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer la suppression si la diffusion échoue
      }

      reply.send({
        success: true,
        data: { messageId, deleted: true, meta: { conversationStats: stats } }
      });

    } catch (error) {
      console.error('[GATEWAY] Error deleting message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression du message'
      });
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
          conversation: {
            include: {
              members: {
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
        return reply.status(404).send({
          success: false,
          error: 'Message introuvable'
        });
      }

      // Vérifier que l'utilisateur est l'auteur du message
      if (message.senderId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Vous ne pouvez modifier que vos propres messages'
        });
      }

      // Vérifier que l'utilisateur est membre de la conversation
      // Pour la conversation globale "meeshy", l'accès est autorisé
      if (message.conversation.identifier !== "meeshy") {
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: message.conversationId,
            userId: userId,
            isActive: true
          }
        });
        
        if (!membership) {
          return reply.status(403).send({
            success: false,
            error: 'Accès non autorisé à cette conversation'
          });
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
              username: true,
              displayName: true,
              avatar: true,
              role: true
            }
          }
        }
      });

      // Note: Les traductions existantes restent inchangées
      // Le service de traduction sera notifié si nécessaire via WebSocket

      reply.send({
        success: true,
        data: updatedMessage
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la modification du message'
      });
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
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Récupérer toutes les réactions de tous les messages de la conversation
      const reactions = await prisma.reaction.findMany({
        where: {
          message: {
            conversationId: conversationId,
            isDeleted: false
          }
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          },
          anonymousUser: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true
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
          userId: reaction.userId || reaction.anonymousId,
          isAnonymous: !!reaction.anonymousId,
          user: reaction.user || reaction.anonymousUser
        });
      }

      // Convertir en tableau
      const reactionsArray = Array.from(reactionsByMessage.entries()).map(([messageId, emojis]) => ({
        messageId,
        reactions: Object.values(emojis)
      }));

      return reply.send({
        success: true,
        data: {
          reactions: reactionsArray,
          total: reactions.length
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation reactions:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des réactions'
      });
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
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Récupérer tous les messages avec leurs statuts dénormalisés
      const messages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          isDeleted: false
        },
        select: {
          id: true,
          senderId: true,
          anonymousSenderId: true,
          deliveredCount: true,
          readCount: true,
          deliveredToAllAt: true,
          readByAllAt: true,
          createdAt: true,
          statusEntries: {
            select: {
              userId: true,
              anonymousId: true,
              deliveredAt: true,
              readAt: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              },
              anonymousUser: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true
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
        senderId: message.senderId || message.anonymousSenderId,
        summary: {
          deliveredCount: message.deliveredCount || 0,
          readCount: message.readCount || 0,
          deliveredToAllAt: message.deliveredToAllAt,
          readByAllAt: message.readByAllAt
        },
        entries: message.statusEntries.map(entry => ({
          userId: entry.userId || entry.anonymousId,
          isAnonymous: !!entry.anonymousId,
          deliveredAt: entry.deliveredAt,
          readAt: entry.readAt,
          user: entry.user || entry.anonymousUser
        }))
      }));

      return reply.send({
        success: true,
        data: {
          statuses,
          total: messages.length
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation statuses:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des statuts'
      });
    }
  });


}
