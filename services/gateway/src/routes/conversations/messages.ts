import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveUserLanguage, isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import { messageValidationHook } from '../../middleware/rate-limiter';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import type {
  ConversationParams,
  SendMessageBody,
  MessagesQuery
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
 * Enregistre les routes de base de gestion des messages (GET, POST, mark-read)
 */
export function registerMessagesRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);
  const socketIOHandler = (fastify as any).socketIOHandler;

  fastify.get<{
    Params: ConversationParams;
    Querystring: MessagesQuery;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Get paginated messages from a conversation with optional cursor-based pagination',
      tags: ['conversations', 'messages'],
      summary: 'Get conversation messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of messages to return (default 20)' },
          offset: { type: 'string', description: 'Number of messages to skip (default 0)' },
          before: { type: 'string', description: 'Cursor for pagination: get messages before this timestamp' },
          include_reactions: { type: 'string', enum: ['true', 'false'], description: 'Include detailed reactions list (default false). Note: reactionSummary and reactionCount are always included.' },
          include_translations: { type: 'string', enum: ['true', 'false'], description: 'Include translations (default true)' },
          include_status: { type: 'string', enum: ['true', 'false'], description: 'Include per-user read status entries (default false)' },
          include_replies: { type: 'string', enum: ['true', 'false'], description: 'Include replyTo message details (default true)' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'MessagesListResponse - aligned with @meeshy/shared/types/api-responses.ts',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              description: 'Array of messages directly',
              items: messageSchema
            },
            pagination: {
              type: 'object',
              description: 'Pagination metadata',
              properties: {
                total: { type: 'integer', description: 'Total number of messages in conversation' },
                offset: { type: 'integer', description: 'Current offset' },
                limit: { type: 'integer', description: 'Page size limit' },
                hasMore: { type: 'boolean', description: 'Whether more messages are available' }
              }
            },
            meta: {
              type: 'object',
              description: 'Response metadata',
              properties: {
                userLanguage: { type: 'string', description: 'User preferred language for translations' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        limit: limitStr = '20',
        offset: offsetStr = '0',
        before,
        include_reactions: includeReactionsStr = 'false',
        include_translations: includeTranslationsStr = 'true',
        include_status: includeStatusStr = 'false',
        include_replies: includeRepliesStr = 'true'
      } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Parser les paramètres optionnels d'inclusion
      const includeReactions = includeReactionsStr === 'true';
      const includeTranslations = includeTranslationsStr === 'true';
      const includeStatus = includeStatusStr === 'true';
      const includeReplies = includeRepliesStr === 'true';

      // Valider et parser les paramètres de pagination
      const { offset, limit } = validatePagination(offsetStr, limitStr, 50);

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

      // Construire la requête avec pagination
      const whereClause: any = {
        conversationId: conversationId, // Utiliser l'ID résolu
        isDeleted: false
      };

      if (before) {
        // Pagination par curseur (pour défilement historique)
        const beforeMessage = await prisma.message.findFirst({
          where: { id: before },
          select: { createdAt: true }
        });

        if (beforeMessage) {
          whereClause.createdAt = {
            lt: beforeMessage.createdAt
          };
        }
      }

      // Construire le select Prisma dynamiquement selon les paramètres d'inclusion
      // (avant les requêtes pour permettre la parallélisation)
      const messageSelect: any = {
        // ===== CHAMPS DE BASE =====
        id: true,
        content: true,
        originalLanguage: true,
        conversationId: true,
        senderId: true,
        anonymousSenderId: true,
        messageType: true,
        messageSource: true,

        // ===== ÉDITION / SUPPRESSION =====
        isEdited: true,
        editedAt: true,
        isDeleted: true,
        deletedAt: true,

        // ===== REPLY / FORWARD =====
        replyToId: true,
        forwardedFromId: true,
        forwardedFromConversationId: true,

        // ===== VIEW-ONCE / BLUR / EXPIRATION =====
        isViewOnce: true,
        maxViewOnceCount: true,
        viewOnceCount: true,
        isBlurred: true,
        expiresAt: true,

        // ===== ÉPINGLAGE =====
        pinnedAt: true,
        pinnedBy: true,

        // ===== STATUTS AGRÉGÉS (dénormalisés) =====
        deliveredToAllAt: true,
        receivedByAllAt: true,
        readByAllAt: true,
        deliveredCount: true,
        readCount: true,

        // ===== RÉACTIONS (dénormalisées - toujours incluses) =====
        reactionSummary: true,
        reactionCount: true,

        // ===== CHIFFREMENT =====
        isEncrypted: true,
        encryptionMode: true,

        // ===== TIMESTAMPS =====
        createdAt: true,
        updatedAt: true,

        // ===== MENTIONS =====
        validatedMentions: true,

        // ===== RELATIONS OBLIGATOIRES =====
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
            metadata: true,
            uploadedBy: true,
            isAnonymous: true,
            createdAt: true,
            // V2: Champs JSON intégrés (pas de sous-sélection sur JSON scalaires)
            transcription: true,
            translations: true
          }
        },
        _count: {
          select: {
            reactions: true,
            statusEntries: true
          }
        }
      };

      // ===== RELATIONS OPTIONNELLES (selon paramètres include_*) =====
      if (includeTranslations) {
        messageSelect.translations = {
          select: {
            id: true,
            targetLanguage: true,
            translatedContent: true,
            translationModel: true
          }
        };
      }

      if (includeReactions) {
        messageSelect.reactions = {
          select: {
            id: true,
            emoji: true,
            userId: true,
            anonymousId: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        };
      }

      if (includeStatus) {
        // Charger les statusEntries détaillés (par utilisateur)
        messageSelect.statusEntries = {
          select: {
            id: true,
            userId: true,
            anonymousId: true,
            deliveredAt: true,
            receivedAt: true,
            readAt: true,
            readDurationMs: true,
            readDevice: true,
            viewedOnceAt: true,
            revealedAt: true,
            createdAt: true,
            updatedAt: true
          }
        };
      }

      if (includeReplies) {
        // Charger les détails du message de réponse
        messageSelect.replyTo = {
          select: {
            id: true,
            content: true,
            originalLanguage: true,
            createdAt: true,
            senderId: true,
            anonymousSenderId: true,
            validatedMentions: true,
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
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
            attachments: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                fileUrl: true,
                thumbnailUrl: true,
                metadata: true,
                transcription: {
                  select: {
                    id: true,
                    transcribedText: true,
                    language: true,
                    confidence: true,
                    source: true,
                    segments: true,
                    audioDurationMs: true,
                    model: true,
                    speakerCount: true,
                    voiceQualityAnalysis: true
                  }
                }
              },
              take: 4
            },
            _count: {
              select: {
                reactions: true
              }
            }
          }
        };
      }

      // ===== OPTIMISATION: Exécuter les requêtes en parallèle =====
      // Évite le problème N+1 séquentiel (count -> messages -> user)
      const shouldFetchUserPrefs = authRequest.authContext.isAuthenticated && !authRequest.authContext.isAnonymous;
      const isAnonymousUser = authRequest.authContext.isAnonymous;

      const [totalCount, messages, userPrefs] = await Promise.all([
        // 1. Compter le total des messages (pour pagination)
        prisma.message.count({
          where: {
            conversationId: conversationId,
            isDeleted: false
          }
        }),
        // 2. Récupérer les messages avec toutes les relations
        prisma.message.findMany({
          where: whereClause,
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: before ? 0 : offset
        }),
        // 3. Récupérer les préférences linguistiques (si authentifié)
        shouldFetchUserPrefs
          ? prisma.user.findFirst({
              where: { id: userId },
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true
              }
            })
          : Promise.resolve(null)
      ]);

      // ===== RÉCUPÉRER LES RÉACTIONS DE L'UTILISATEUR CONNECTÉ =====
      // Permet d'afficher les réactions de l'utilisateur sans requête de sync Socket.IO
      let userReactionsMap: Map<string, string[]> = new Map();

      if (authRequest.authContext.isAuthenticated && messages.length > 0) {
        const messageIds: string[] = (messages as any[]).map(m => m.id);

        // Requête pour obtenir les réactions de l'utilisateur sur ces messages
        const userReactions = await prisma.reaction.findMany({
          where: {
            messageId: { in: messageIds },
            ...(isAnonymousUser
              ? { anonymousId: userId }
              : { userId: userId }
            )
          },
          select: {
            messageId: true,
            emoji: true
          }
        });

        // Grouper par messageId
        for (const reaction of userReactions) {
          const existing = userReactionsMap.get(reaction.messageId) || [];
          existing.push(reaction.emoji);
          userReactionsMap.set(reaction.messageId, existing);
        }
      }

      // Déterminer la langue préférée de l'utilisateur
      const userPreferredLanguage = userPrefs
        ? resolveUserLanguage(userPrefs)
        : 'en';

      // DEBUG: Log détaillé pour vérifier les transcriptions audio
      if (messages.length > 0) {
        console.log(`🔍 [CONVERSATIONS] Chargement de ${messages.length} messages pour conversation ${conversationId}`);

        // Compter les messages avec attachments audio
        let audioAttachmentCount = 0;
        let audioWithTranscriptionCount = 0;
        let audioWithTranslatedAudiosCount = 0;

        (messages as any[]).forEach((msg, index) => {
          if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach((att: any) => {
              // Vérifier si c'est un audio
              if (att.mimeType && att.mimeType.startsWith('audio/')) {
                audioAttachmentCount++;

                // Vérifier si l'audio a une transcription
                if (att.transcription) {
                  audioWithTranscriptionCount++;
                  console.log(`📝 [CONVERSATIONS] Message ${msg.id} - Audio avec transcription:`, {
                    attachmentId: att.id,
                    hasTranscription: true,
                    transcriptionText: att.transcription.transcribedText?.substring(0, 100) + '...',
                    language: att.transcription.language,
                    confidence: att.transcription.confidence,
                    source: att.transcription.source,
                    model: att.transcription.model,
                    audioDurationMs: att.transcription.audioDurationMs
                  });
                } else {
                  console.log(`⚠️ [CONVERSATIONS] Message ${msg.id} - Audio SANS transcription:`, {
                    attachmentId: att.id,
                    hasTranscription: false,
                    mimeType: att.mimeType,
                    fileUrl: att.fileUrl
                  });
                }

                // Vérifier les audios traduits
                if (att.translatedAudios && att.translatedAudios.length > 0) {
                  audioWithTranslatedAudiosCount++;
                  console.log(`🌍 [CONVERSATIONS] Message ${msg.id} - Audio avec ${att.translatedAudios.length} traductions:`, {
                    attachmentId: att.id,
                    translatedLanguages: att.translatedAudios.map((ta: any) => ta.targetLanguage),
                    voiceCloned: att.translatedAudios.map((ta: any) => ta.voiceCloned)
                  });
                }
              }
            });
          }
        });

        console.log(`📊 [CONVERSATIONS] Statistiques audio:`, {
          totalMessages: messages.length,
          audioAttachments: audioAttachmentCount,
          audioWithTranscription: audioWithTranscriptionCount,
          audioWithTranslatedAudios: audioWithTranslatedAudiosCount,
          transcriptionRate: audioAttachmentCount > 0 ? `${(audioWithTranscriptionCount / audioAttachmentCount * 100).toFixed(1)}%` : '0%'
        });
      }

      // Mapper les messages avec les champs alignés au type GatewayMessage de @meeshy/shared/types
      const mappedMessages = messages.map((message: any) => {
        // Construire l'objet de réponse aligné avec GatewayMessage
        const mappedMessage: any = {
          // Identifiants
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          anonymousSenderId: message.anonymousSenderId,

          // Contenu
          content: message.content,
          originalLanguage: message.originalLanguage || 'fr',
          messageType: message.messageType,
          messageSource: message.messageSource,

          // Édition/Suppression
          isEdited: message.isEdited,
          editedAt: message.editedAt,
          isDeleted: message.isDeleted,
          deletedAt: message.deletedAt,

          // Reply/Forward
          replyToId: message.replyToId,
          forwardedFromId: message.forwardedFromId,
          forwardedFromConversationId: message.forwardedFromConversationId,

          // View-once / Blur / Expiration
          isViewOnce: message.isViewOnce,
          maxViewOnceCount: message.maxViewOnceCount,
          viewOnceCount: message.viewOnceCount,
          isBlurred: message.isBlurred,
          expiresAt: message.expiresAt,

          // Épinglage
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,

          // Statuts agrégés (dénormalisés)
          deliveredToAllAt: message.deliveredToAllAt,
          receivedByAllAt: message.receivedByAllAt,
          readByAllAt: message.readByAllAt,
          deliveredCount: message.deliveredCount,
          readCount: message.readCount,

          // Réactions (dénormalisées - toujours incluses)
          reactionSummary: message.reactionSummary,
          reactionCount: message.reactionCount,
          // Réactions de l'utilisateur connecté (pour affichage instantané sans sync Socket.IO)
          currentUserReactions: userReactionsMap.get(message.id) || [],

          // Chiffrement
          isEncrypted: message.isEncrypted,
          encryptionMode: message.encryptionMode,

          // Timestamps
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,

          // Mentions
          validatedMentions: message.validatedMentions,

          // Relations obligatoires
          sender: message.sender,
          anonymousSender: message.anonymousSender,
          attachments: message.attachments,
          _count: message._count
        };

        // Relations optionnelles (selon paramètres include_*)
        if (includeTranslations && message.translations) {
          mappedMessage.translations = message.translations;
        }
        if (includeReactions && message.reactions) {
          mappedMessage.reactions = message.reactions;
        }
        if (includeStatus && message.statusEntries) {
          mappedMessage.statusEntries = message.statusEntries;
        }
        if (includeReplies && message.replyTo) {
          mappedMessage.replyTo = {
            ...message.replyTo,
            originalLanguage: message.replyTo.originalLanguage || 'fr'
          };
        }

        return mappedMessage;
      });

      // Marquer les messages comme lus (optimisé - ne marquer que les messages non lus)
      if (messages.length > 0 && !authRequest.authContext.isAnonymous) {
        const messageIds = messages.map(m => m.id);

        try {
          // Utiliser le nouveau MessageReadStatusService (système de curseur)
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
          const readStatusService = new MessageReadStatusService(prisma);

          // Marquer les messages comme reçus (curseur automatiquement placé sur le dernier message)
          await readStatusService.markMessagesAsReceived(userId, conversationId);
        } catch (error) {
          console.warn('[GATEWAY] Error marking messages as received:', error);
        }
      }

      // Construire les métadonnées de pagination standard
      const paginationMeta = buildPaginationMeta(totalCount, offset, limit, messages.length);

      // Format optimisé: data directement = Message[], meta pour userLanguage
      // Aligné avec MessagesListResponse de @meeshy/shared/types
      reply.send({
        success: true,
        data: mappedMessages,
        pagination: paginationMeta,
        meta: {
          userLanguage: userPreferredLanguage
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching messages:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des messages'
      });
    }
  });


  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:id/mark-read', {
    schema: {
      description: 'Mark all messages in a conversation as read for the authenticated user',
      tags: ['conversations', 'messages'],
      summary: 'Mark conversation as read',
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
                markedCount: { type: 'number', description: 'Number of messages marked as read' }
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

      // Récupérer tous les messages non lus de cette conversation pour cet utilisateur
      const unreadMessages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          isDeleted: false,
          senderId: { not: userId }, // Ne pas marquer ses propres messages
          statusEntries: {
            none: {
              userId: userId,
              readAt: { not: null }
            }
          }
        },
        select: {
          id: true
        }
      });

      if (unreadMessages.length === 0) {
        return reply.send({
          success: true,
          data: { message: 'Aucun message non lu à marquer', markedCount: 0 }
        });
      }

      // Marquer tous les messages comme lus (utiliser le nouveau système de curseur)
      try {
        const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
        const readStatusService = new MessageReadStatusService(prisma);

        // Marquer comme lu (curseur automatiquement placé sur le dernier message)
        await readStatusService.markMessagesAsRead(userId, conversationId);
      } catch (err) {
        console.warn('[GATEWAY] Error marking messages as read:', err);
      }

      return reply.send({
        success: true,
        data: { message: `${unreadMessages.length} message(s) marqué(s) comme lu(s)`, markedCount: unreadMessages.length }
      });

    } catch (error) {
      console.error('[GATEWAY] Error marking conversation as read:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors du marquage des messages comme lus'
      });
    }
  });

  fastify.post<{
    Params: ConversationParams;
    Body: SendMessageBody;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Send a new message to a conversation with optional encryption and attachments',
      tags: ['conversations', 'messages'],
      summary: 'Send message',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Message content', minLength: 1 },
          originalLanguage: { type: 'string', description: 'Language code (e.g., fr, en)', default: 'fr' },
          messageType: { type: 'string', enum: ['text', 'image', 'file', 'audio', 'video'], default: 'text' },
          replyToId: { type: 'string', description: 'ID of message being replied to' },
          encryptedContent: { type: 'string', description: 'Encrypted message content' },
          encryptionMode: { type: 'string', enum: ['e2e', 'server'], description: 'Encryption mode' },
          encryptionMetadata: { type: 'object', description: 'Encryption metadata' },
          isEncrypted: { type: 'boolean', description: 'Whether message is encrypted' }
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
                message: { type: 'object', description: 'Created message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      
      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(403).send({
          success: false,
          error: 'Authentification requise pour envoyer des messages'
        });
      }
      
      const { id } = request.params;
      const {
        content,
        originalLanguage = 'fr',
        messageType = 'text',
        replyToId,
        encryptedContent,
        encryptionMode,
        encryptionMetadata,
        isEncrypted
      } = request.body;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès et d'écriture
      let canSend = false;
      
      // Règle simple : seuls les utilisateurs faisant partie de la conversation peuvent y écrire
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        canSend = false;
      } else {
        // Vérifier les permissions d'écriture spécifiques
        if (authRequest.authContext.isAnonymous) {
          // Pour les utilisateurs anonymes, vérifier les permissions d'écriture
          const anonymousParticipant = await prisma.anonymousParticipant.findFirst({
            where: {
              id: authRequest.authContext.userId,
              isActive: true,
              canSendMessages: true
            }
          });
          canSend = !!anonymousParticipant;
        } else {
          // Pour les utilisateurs connectés, l'accès implique l'écriture
          canSend = true;
        }
      }

      if (!canSend) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation'
        });
      }

      // Validation du contenu (plaintext ou encrypted)
      if (isEncrypted) {
        // For encrypted messages, validate encrypted content
        if (!encryptedContent || encryptedContent.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Encrypted content cannot be empty'
          });
        }
        if (!encryptionMode || !['e2ee', 'server', 'hybrid'].includes(encryptionMode)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid encryption mode. Must be e2ee, server, or hybrid'
          });
        }
        if (!encryptionMetadata) {
          return reply.status(400).send({
            success: false,
            error: 'Encryption metadata is required for encrypted messages'
          });
        }
      } else {
        // For plaintext messages, validate content
        if (!content || content.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Le contenu du message ne peut pas être vide'
          });
        }
      }

      // ÉTAPE 1: Traiter les liens dans le message AVANT la sauvegarde (skip for E2EE)
      let processedContent = content;
      let trackingLinks: any[] = [];

      if (!isEncrypted || encryptionMode !== 'e2ee') {
        const linkResult = await trackingLinkService.processMessageLinks({
          content: content.trim(),
          conversationId,
          createdBy: userId
        });
        processedContent = linkResult.processedContent;
        trackingLinks = linkResult.trackingLinks;
      }

      // ÉTAPE 2: Créer le message avec le contenu transformé
      const messageData: any = {
        conversationId: conversationId,
        senderId: userId,
        content: processedContent,
        originalLanguage,
        messageType,
        replyToId
      };

      // Add encryption fields if message is encrypted
      if (isEncrypted) {
        messageData.isEncrypted = true;
        messageData.encryptedContent = encryptedContent;
        messageData.encryptionMode = encryptionMode;
        messageData.encryptionMetadata = encryptionMetadata;
      }

      const message = await prisma.message.create({
        data: messageData,
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

      // ÉTAPE 3: Opérations post-création en PARALLÈLE (indépendantes)
      // OPTIMIZED: Ces 3 opérations n'ont pas de dépendances entre elles
      const postCreateOperations: Promise<void>[] = [];

      // 3a. Mettre à jour les messageIds des TrackingLinks
      if (trackingLinks.length > 0) {
        const tokens = trackingLinks.map(link => link.token);
        postCreateOperations.push(
          trackingLinkService.updateTrackingLinksMessageId(tokens, message.id).then(() => {})
        );
      }

      // 3b. Mettre à jour le timestamp de la conversation
      postCreateOperations.push(
        prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() }
        }).then(() => {})
      );

      // 3c. Marquer le message comme lu pour l'expéditeur
      postCreateOperations.push(
        (async () => {
          try {
            const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
            const readStatusService = new MessageReadStatusService(prisma);
            await readStatusService.markMessagesAsRead(userId, conversationId, message.id);
          } catch (err) {
            console.warn('[GATEWAY] Error marking message as read for sender:', err);
          }
        })()
      );

      // Attendre toutes les opérations en parallèle
      await Promise.all(postCreateOperations);

      // TRAITEMENT DES MENTIONS ET NOTIFICATIONS
      const mentionService = (fastify as any).mentionService;
      const notificationService = (fastify as any).notificationService;

      if (mentionService && notificationService) {
        try {
          console.log('[GATEWAY REST] ===== TRAITEMENT DES MENTIONS =====');

          // Extraire les mentions du contenu
          const mentionedUsernames = mentionService.extractMentions(processedContent);
          console.log('[GATEWAY REST] Mentions extraites:', mentionedUsernames);

          if (mentionedUsernames.length > 0) {
            // Résoudre les usernames en utilisateurs
            const userMap = await mentionService.resolveUsernames(mentionedUsernames);
            const mentionedUserIds = Array.from(userMap.values()).map((user: any) => user.id);
            console.log('[GATEWAY REST] UserIds trouvés:', mentionedUserIds);

            if (mentionedUserIds.length > 0) {
              // Valider les permissions de mention
              const validationResult = await mentionService.validateMentionPermissions(
                conversationId,
                mentionedUserIds,
                userId
              );

              if (validationResult.validUserIds.length > 0) {
                // Créer les mentions en DB
                await mentionService.createMentions(message.id, validationResult.validUserIds);

                // Extraire les usernames validés
                const validatedUsernames = Array.from(userMap.entries())
                  .filter(([_, user]: [string, any]) => validationResult.validUserIds.includes(user.id))
                  .map(([username, _]: [string, any]) => username);

                // Mettre à jour le message avec validatedMentions
                await prisma.message.update({
                  where: { id: message.id },
                  data: { validatedMentions: validatedUsernames }
                });

                // Mettre à jour l'objet message en mémoire
                (message as any).validatedMentions = validatedUsernames;

                console.log(`[GATEWAY REST] ✅ ${validationResult.validUserIds.length} mention(s) créée(s)`);

                // OPTIMIZED: Charger sender et conversation en PARALLÈLE
                const [sender, conversationForNotif] = await Promise.all([
                  prisma.user.findUnique({
                    where: { id: userId },
                    select: { username: true, displayName: true, avatar: true }
                  }),
                  prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: {
                      title: true,
                      type: true,
                      members: {
                        where: { isActive: true },
                        select: { userId: true }
                      }
                    }
                  })
                ]);

                if (sender && conversationForNotif) {
                  const conversation = conversationForNotif;
                  const memberIds = conversation.members.map((m: any) => m.userId);

                  // PERFORMANCE: Créer toutes les notifications de mention en batch
                  const count = await notificationService.createMentionNotificationsBatch(
                    validationResult.validUserIds,
                    {
                      senderId: userId,
                      senderUsername: sender.displayName || sender.username,
                      senderAvatar: sender.avatar || undefined,
                      messageContent: processedContent,
                      conversationId,
                      conversationTitle: conversation.title,
                      messageId: message.id
                    },
                    memberIds
                  );
                  console.log(`[GATEWAY REST] 📩 ${count} notifications de mention créées en batch`);
                }
              }
            }
          }
        } catch (mentionError) {
          console.error('[GATEWAY REST] Erreur traitement mentions:', mentionError);
          // Ne pas bloquer l'envoi du message
        }
      }

      // Déclencher les traductions via le MessageTranslationService (gère les langues des participants)
      try {
        await translationService.handleNewMessage({
          id: message.id,
          conversationId: conversationId, // Utiliser l'ID résolu
          senderId: userId,
          content: message.content,
          originalLanguage,
          messageType,
          replyToId
        } as any);
      } catch (error) {
        console.error('[GATEWAY] Error queuing translations via MessageTranslationService:', error);
        // Ne pas faire échouer l'envoi du message si la traduction échoue
      }

      // Mettre à jour les stats dans le cache (et les calculer si entrée absente)
      const stats = await conversationStatsService.updateOnNewMessage(
        prisma,
        conversationId, // Utiliser l'ID résolu
        originalLanguage,
        () => []
      );

      reply.status(201).send({
        success: true,
        data: {
          ...message,
          meta: { conversationStats: stats }
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error sending message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi du message'
      });
    }
  });


  fastify.post<{ Params: ConversationParams }>('/conversations/:id/read', {
    schema: {
      description: 'Mark conversation as read (alias for mark-read endpoint)',
      tags: ['conversations', 'messages'],
      summary: 'Mark as read',
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
            success: { type: 'boolean', example: true }
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
      let canAccess = false;

      if (id === "meeshy") {
        canAccess = true; // Conversation globale accessible à tous les utilisateurs connectés
      } else {
        const membership = await prisma.conversationMember.findFirst({
          where: { conversationId: conversationId, userId, isActive: true }
        });
        canAccess = !!membership;
      }

      if (!canAccess) {
        return reply.status(403).send({ success: false, error: 'Accès non autorisé à cette conversation' });
      }

      // ✅ FIX: Utiliser uniquement le nouveau système de curseur
      // Pas besoin de compter les messages - on marque simplement comme lu
      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      // Calculer le nombre de messages non lus AVANT de marquer comme lu
      const unreadCount = await readStatusService.getUnreadCount(userId, conversationId);

      // Marquer la conversation comme lue (déplace le curseur au dernier message)
      await readStatusService.markMessagesAsRead(userId, conversationId);

      reply.send({ success: true, data: { markedCount: unreadCount } });
    } catch (error) {
      console.error('[GATEWAY] Error marking conversation as read:', error);
      reply.status(500).send({ success: false, error: 'Erreur lors du marquage comme lu' });
    }
  });

}
