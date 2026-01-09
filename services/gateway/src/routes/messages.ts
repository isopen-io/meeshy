import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { AttachmentService } from '../services/AttachmentService.js';
import { TranslationService } from '../services/TranslationService.js';

interface MessageParams {
  messageId: string;
}

interface UpdateMessageBody {
  content?: string;
  isEdited?: boolean;
}

interface MessageStatusBody {
  status: 'read' | 'delivered';
  timestamp?: string;
}

export default async function messageRoutes(fastify: FastifyInstance) {
  // Récupérer prisma décoré par le serveur
  const prisma = fastify.prisma;

  // Instancier les services
  const attachmentService = new AttachmentService(prisma);
  const translationService: TranslationService = (fastify as any).translationService;
  const socketIOHandler = fastify.socketIOHandler;

  // Middleware d'authentification requis pour les messages
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Route pour récupérer un message spécifique
  // OPTIMISÉ: N'inclut plus les statusEntries - utilise les champs dénormalisés
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Récupérer le message avec ses détails (sans statusEntries - évite N+1)
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          isDeleted: false
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              avatar: true,
              isOnline: true
            }
          },
          anonymousSender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true
            }
          },
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true, role: true }
              }
            }
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              fileUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
              duration: true,
              // Champs dénormalisés pour éviter N+1
              viewedCount: true,
              downloadedCount: true,
              consumedCount: true,
              viewedByAllAt: true,
              downloadedByAllAt: true,
              listenedByAllAt: true,
              watchedByAllAt: true
            }
          },
          translations: {
            select: {
              id: true,
              targetLanguage: true,
              translatedContent: true
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      if (!(message as any).conversation.members.length) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à ce message'
        });
      }

      // Retourner le message avec les champs dénormalisés (deliveredCount, readCount, etc.)
      // Les détails des statuts sont disponibles via GET /messages/:messageId/status-details
      return reply.send({
        success: true,
        data: {
          ...message,
          // Les compteurs sont déjà dans message via les champs dénormalisés
          statusSummary: {
            deliveredCount: (message as any).deliveredCount || 0,
            readCount: (message as any).readCount || 0,
            deliveredToAllAt: (message as any).deliveredToAllAt,
            readByAllAt: (message as any).readByAllAt
          }
        }
      });

    } catch (error) {
      console.error('[MESSAGES] Error fetching message:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du message'
      });
    }
  });

  // Route pour éditer un message
  fastify.put<{
    Params: MessageParams;
    Body: UpdateMessageBody;
  }>('/messages/:messageId', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et appartient à l'utilisateur
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          senderId: userId,
          isDeleted: false
        },
        include: {
          attachments: {
            select: {
              id: true,
              messageId: true,
              fileName: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              fileUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
              duration: true,
              bitrate: true,
              sampleRate: true,
              codec: true,
              channels: true,
              fps: true,
              videoCodec: true,
              pageCount: true,
              lineCount: true,
              metadata: true, // Inclure audioEffectsTimeline et autres métadonnées JSON
              uploadedBy: true,
              isAnonymous: true,
              createdAt: true
            }
          },
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message not found or you are not authorized to modify it'
        });
      }

      // Permettre l'édition de messages sans contenu si le message a des attachements
      const messageHasAttachments = message.attachments && message.attachments.length > 0;
      if ((!content || content.trim().length === 0) && !messageHasAttachments) {
        return reply.status(400).send({
          success: false,
          error: 'Message content cannot be empty (unless attachments are included)'
        });
      }

      // Mettre à jour le message
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
              avatar: true
            }
          }
        }
      });

      // Déclencher la retraduction automatique du message modifié
      try {
        // Invalider les traductions existantes en base de données
        const deletedCount = await prisma.messageTranslation.deleteMany({
          where: {
            messageId: messageId
          }
        });

        // Créer un objet message pour la retraduction
        const messageForRetranslation = {
          id: messageId,
          content: content.trim(),
          originalLanguage: message.originalLanguage,
          conversationId: message.conversationId,
          senderId: userId
        };

        // Déclencher la retraduction via la méthode privée existante
        if (translationService) {
          await (translationService as any)._processRetranslationAsync(messageId, messageForRetranslation);
        } else {
          console.warn('[MESSAGES] TranslationService non disponible, retraduction non effectuée');
        }

      } catch (translationError) {
        console.error('[MESSAGES] Erreur lors de la retraduction:', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Diffuser la mise à jour via Socket.IO
      try {
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${message.conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:edited', {
            ...updatedMessage,
            conversationId: message.conversationId
          });
        }
      } catch (socketError) {
        console.error('[MESSAGES] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer l'édition si la diffusion échoue
      }

      return reply.send({
        success: true,
        data: {
          ...updatedMessage,
          message: 'Message modifié avec succès'
        }
      });

    } catch (error) {
      console.error('[MESSAGES] Error updating message:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la modification du message'
      });
    }
  });

  // Route pour supprimer un message (soft delete)
  fastify.delete<{
    Params: MessageParams;
  }>('/messages/:messageId', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          isDeleted: false
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true
            }
          },
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true, role: true }
              }
            }
          },
          attachments: {
            select: {
              id: true
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier les permissions de suppression
      const userMembership = message.conversation.members[0];
      const canDelete =
        // L'auteur du message peut le supprimer
        message.senderId === userId ||
        // Les administrateurs et modérateurs peuvent supprimer
        userMembership?.role === 'admin' ||
        userMembership?.role === 'moderator' ||
        authRequest.authContext.registeredUser?.role === 'ADMIN' ||
        authRequest.authContext.registeredUser?.role === 'BIGBOSS' ||
        authRequest.authContext.registeredUser?.role === 'MODERATOR' ||
        authRequest.authContext.registeredUser?.role === 'CREATOR';

      if (!canDelete) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à supprimer ce message'
        });
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            console.error(`[MESSAGES] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
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
      if (deletedTranslations.count > 0) {
      }

      // Marquer le message comme supprimé (soft delete)
      const deletedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          deletedAt: new Date()
          // Note: deletedBy n'existe pas dans le schéma Prisma actuel
        }
      });

      // Mettre à jour le lastMessageAt de la conversation avec le dernier message non supprimé
      const lastNonDeletedMessage = await prisma.message.findFirst({
        where: {
          conversationId: message.conversationId,
          isDeleted: false
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      await prisma.conversation.update({
        where: { id: message.conversationId },
        data: {
          lastMessageAt: lastNonDeletedMessage?.createdAt || message.conversation.createdAt
        }
      });

      // Diffuser la suppression via Socket.IO
      try {
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${message.conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:deleted', {
            messageId,
            conversationId: message.conversationId
          });
        }
      } catch (socketError) {
        console.error('[MESSAGES] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer la suppression si la diffusion échoue
      }

      return reply.send({
        success: true,
        data: { message: 'Message supprimé avec succès' }
      });

    } catch (error) {
      console.error('[MESSAGES] Error deleting message:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression du message'
      });
    }
  });

  // Route pour marquer un message comme lu
  fastify.post<{
    Params: MessageParams;
    Body: MessageStatusBody;
  }>('/messages/:messageId/status', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { status } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!status || !['read', 'delivered'].includes(status)) {
        return reply.status(400).send({
          success: false,
          error: 'Statut invalide'
        });
      }

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          isDeleted: false
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!message || !message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé ou accès non autorisé'
        });
      }

      // Ne pas marquer ses propres messages comme lus
      if (message.senderId === userId) {
        return reply.status(400).send({
          success: false,
          error: 'Vous ne pouvez pas marquer vos propres messages comme lus'
        });
      }

      if (status === 'read') {
        // TODO: Cette route utilise l'ancien système de MessageStatus
        // Elle devrait être remplacée par /conversations/:conversationId/mark-as-read
        // Pour l'instant, on utilise le MessageReadStatusService avec le nouveau système

        const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
        const readStatusService = new MessageReadStatusService(prisma);

        // Marquer tous les messages de la conversation comme lus
        await readStatusService.markMessagesAsRead(
          userId,
          message.conversationId,
          messageId  // Utiliser ce message comme curseur
        );

        // Diffuser le statut de lecture via Socket.IO
        try {
          const socketIOManager = socketIOHandler.getManager();
          if (socketIOManager) {
            const room = `conversation_${message.conversationId}`;
            (socketIOManager as any).io.to(room).emit('read-status:updated', {
              conversationId: message.conversationId,
              userId,
              type: 'read',
              updatedAt: new Date()
            });
          }
        } catch (socketError) {
          console.error('[MESSAGES] Erreur lors de la diffusion Socket.IO:', socketError);
          // Ne pas faire échouer la mise à jour si la diffusion échoue
        }

        return reply.send({
          success: true,
          data: { message: 'Message marqué comme lu' }
        });
      }

    } catch (error) {
      console.error('[MESSAGES] Error updating message status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du statut du message'
      });
    }
  });

  // Route pour récupérer l'historique des modifications d'un message
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId/history', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true, role: true }
              }
            }
          }
        }
      });

      if (!message || !message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé ou accès non autorisé'
        });
      }

      // Seuls les modérateurs/admins ou l'auteur peuvent voir l'historique
      const userMembership = message.conversation.members[0];
      const canViewHistory =
        message.senderId === userId ||
        userMembership?.role === 'admin' ||
        userMembership?.role === 'moderator' ||
        authRequest.authContext.registeredUser?.role === 'ADMIN' ||
        authRequest.authContext.registeredUser?.role === 'BIGBOSS' ||
        authRequest.authContext.registeredUser?.role === 'MODERATOR';

      if (!canViewHistory) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à voir l\'historique de ce message'
        });
      }

      // Pour l'instant, retourner les informations de base
      // TODO: Implémenter un système d'historique des modifications si nécessaire
      const history = {
        messageId: message.id,
        originalContent: message.content,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
        createdAt: message.createdAt,
        deletedAt: message.deletedAt,
        // Note: deletedBy n'existe pas dans le schéma actuel
        isDeleted: message.isDeleted
      };

      return reply.send({
        success: true,
        data: history
      });

    } catch (error) {
      console.error('[MESSAGES] Error fetching message history:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération de l\'historique du message'
      });
    }
  });

  // Route pour récupérer les traductions d'un message
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId/translations', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          isDeleted: false
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true }
              }
            }
          },
          translations: {
            select: {
              id: true,
              targetLanguage: true,
              translatedContent: true,
              translationModel: true,
              confidenceScore: true,
              createdAt: true
            }
          }
        }
      });

      if (!message || !message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé ou accès non autorisé'
        });
      }

      return reply.send({
        success: true,
        data: {
          messageId: message.id,
          originalContent: message.content,
          originalLanguage: message.originalLanguage,
          translations: message.translations
        }
      });

    } catch (error) {
      console.error('[MESSAGES] Error fetching message translations:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des traductions du message'
      });
    }
  });

  // ===========================================================================
  // ROUTES DÉTAILS DE STATUT AVEC PAGINATION CURSOR (évite N+1)
  // ===========================================================================

  // Route pour récupérer les détails de statut d'un message avec pagination offset/limit
  // Utiliser UNIQUEMENT quand l'utilisateur demande explicitement les détails
  fastify.get<{
    Params: MessageParams;
    Querystring: {
      offset?: string;
      limit?: string;
      filter?: 'all' | 'delivered' | 'read' | 'unread';
    };
  }>('/messages/:messageId/status-details', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { offset = '0', limit = '20', filter = 'all' } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          isDeleted: false
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: userId },
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!message || !message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé ou accès non autorisé'
        });
      }

      // Utiliser le service pour récupérer les détails paginés
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      const statusDetails = await readStatusService.getMessageStatusDetails(messageId, {
        offset: parseInt(offset, 10),
        limit: Math.min(parseInt(limit, 10), 100), // Max 100 par page
        filter
      });

      return reply.send({
        success: true,
        data: statusDetails.statuses,
        pagination: statusDetails.pagination
      });

    } catch (error) {
      console.error('[MESSAGES] Error fetching message status details:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des détails de statut'
      });
    }
  });

  // Route pour récupérer les détails de statut d'un attachment avec pagination offset/limit
  // Utiliser UNIQUEMENT quand l'utilisateur ouvre les détails d'un attachment
  fastify.get<{
    Params: { attachmentId: string };
    Querystring: {
      offset?: string;
      limit?: string;
      filter?: 'all' | 'viewed' | 'downloaded' | 'listened' | 'watched';
    };
  }>('/attachments/:attachmentId/status-details', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { attachmentId } = request.params;
      const { offset = '0', limit = '20', filter = 'all' } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'attachment existe et que l'utilisateur a accès
      const attachment = await prisma.messageAttachment.findFirst({
        where: { id: attachmentId },
        include: {
          message: {
            include: {
              conversation: {
                include: {
                  members: {
                    where: { userId: userId },
                    select: { userId: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!attachment || !attachment.message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Attachment non trouvé ou accès non autorisé'
        });
      }

      // Utiliser le service pour récupérer les détails paginés
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      const statusDetails = await readStatusService.getAttachmentStatusDetails(attachmentId, {
        offset: parseInt(offset, 10),
        limit: Math.min(parseInt(limit, 10), 100), // Max 100 par page
        filter
      });

      return reply.send({
        success: true,
        data: statusDetails.statuses,
        pagination: statusDetails.pagination
      });

    } catch (error) {
      console.error('[MESSAGES] Error fetching attachment status details:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des détails de statut de l\'attachment'
      });
    }
  });

  // Route pour marquer un attachment comme écouté/vu/téléchargé
  fastify.post<{
    Params: { attachmentId: string };
    Body: {
      action: 'listened' | 'watched' | 'viewed' | 'downloaded';
      playPositionMs?: number;
      durationMs?: number;
      complete?: boolean;
      wasZoomed?: boolean;
    };
  }>('/attachments/:attachmentId/status', {
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { attachmentId } = request.params;
      const { action, playPositionMs, durationMs, complete, wasZoomed } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!action || !['listened', 'watched', 'viewed', 'downloaded'].includes(action)) {
        return reply.status(400).send({
          success: false,
          error: 'Action invalide. Valeurs acceptées: listened, watched, viewed, downloaded'
        });
      }

      // Vérifier que l'attachment existe et que l'utilisateur a accès
      const attachment = await prisma.messageAttachment.findFirst({
        where: { id: attachmentId },
        include: {
          message: {
            include: {
              conversation: {
                include: {
                  members: {
                    where: { userId: userId },
                    select: { userId: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!attachment || !attachment.message.conversation.members.length) {
        return reply.status(404).send({
          success: false,
          error: 'Attachment non trouvé ou accès non autorisé'
        });
      }

      // Utiliser le service pour mettre à jour le statut
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      switch (action) {
        case 'listened':
          await readStatusService.markAudioAsListened(userId, attachmentId, {
            playPositionMs,
            listenDurationMs: durationMs,
            complete
          });
          break;
        case 'watched':
          await readStatusService.markVideoAsWatched(userId, attachmentId, {
            watchPositionMs: playPositionMs,
            watchDurationMs: durationMs,
            complete
          });
          break;
        case 'viewed':
          await readStatusService.markImageAsViewed(userId, attachmentId, {
            viewDurationMs: durationMs,
            wasZoomed
          });
          break;
        case 'downloaded':
          await readStatusService.markAttachmentAsDownloaded(userId, attachmentId);
          break;
      }

      // Diffuser le statut via Socket.IO
      try {
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${attachment.message.conversationId}`;
          (socketIOManager as any).io.to(room).emit('attachment-status:updated', {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            action,
            updatedAt: new Date()
          });
        }
      } catch (socketError) {
        console.error('[MESSAGES] Erreur lors de la diffusion Socket.IO:', socketError);
      }

      return reply.send({
        success: true,
        data: { message: `Attachment marqué comme ${action}` }
      });

    } catch (error) {
      console.error('[MESSAGES] Error updating attachment status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du statut de l\'attachment'
      });
    }
  });
}
