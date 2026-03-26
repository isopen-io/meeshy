import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination, buildPaginationMeta, buildCursorPaginationMeta } from '../../utils/pagination';
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
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { transformTranslationsToArray } from '../../utils/translation-transformer';
// Logger dédié pour messages
const logger = enhancedLogger.child({ module: 'messages' });

/**
 * Nettoie les attachments pour l'API en transformant les valeurs invalides
 * Fixe spécifiquement voiceSimilarityScore: false -> null pour compatibilité schéma
 */
function cleanAttachmentsForApi(attachments: any[]): any[] {
  if (!attachments || !Array.isArray(attachments)) {
    return attachments;
  }

  if (attachments.length > 0) {
    logger.debug(`🧹 [CLEAN] Nettoyage de ${attachments.length} attachment(s) pour l'API`);
  }

  return attachments.map((att, attIndex) => {
    const cleaned = { ...att };

    // Nettoyer la transcription
    if (cleaned.transcription && cleaned.transcription.segments) {
      const originalSegment = cleaned.transcription.segments[0];

      // Log speakerAnalysis
      let speakerInfo = '';
      if (cleaned.transcription.speakerAnalysis) {
        const speakers = cleaned.transcription.speakerAnalysis.speakers || [];
        const withVoiceChars = speakers.filter((s: any) => s.voiceCharacteristics).length;
        speakerInfo = `speakerAnalysis: ${speakers.length} speaker(s), voiceChars: ${withVoiceChars}/${speakers.length}`;
        if (withVoiceChars > 0) {
          const firstSpeaker = speakers.find((s: any) => s.voiceCharacteristics);
          speakerInfo += `, firstSpeaker: sid=${firstSpeaker.sid}, pitch=${firstSpeaker.voiceCharacteristics.pitch?.mean_hz}Hz`;
        }
      } else {
        speakerInfo = '⚠️ AUCUN speakerAnalysis';
      }

      logger.info(`🧹 [CLEAN] Attachment ${attIndex} - Transcription: ${cleaned.transcription.segments.length} segments | ${speakerInfo} | segment[0]: hasStartMs=${'startMs' in originalSegment}, hasEndMs=${'endMs' in originalSegment}, hasSpeakerId=${'speakerId' in originalSegment}, voiceSimilarityScoreType=${typeof originalSegment.voiceSimilarityScore}, voiceSimilarityScoreValue=${originalSegment.voiceSimilarityScore}`);

      cleaned.transcription.segments = cleaned.transcription.segments.map((seg: any) => ({
        ...seg,
        // Convertir false/true en null (schéma attend number | null)
        voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
      }));

      const cleanedSegment = cleaned.transcription.segments[0];
      logger.info(`🧹 [CLEAN] Segment nettoyé [0]: text="${cleanedSegment.text}", startMs=${cleanedSegment.startMs}, endMs=${cleanedSegment.endMs}, speakerId=${cleanedSegment.speakerId}, voiceSimilarityScore=${cleanedSegment.voiceSimilarityScore}, confidence=${cleanedSegment.confidence}`);
    }

    // Nettoyer les traductions
    if (cleaned.translations && typeof cleaned.translations === 'object') {
      const langs = Object.keys(cleaned.translations);
      const translationsInfo = langs.map(lang => {
        const trans = cleaned.translations[lang] as any;
        return `${lang}(url="${trans.url || '⚠️ VIDE'}", segments=${trans.segments?.length || 0})`;
      }).join(', ');

      logger.info(`🧹 [CLEAN] Attachment ${attIndex} - Traductions: ${langs.length} langue(s) [${translationsInfo}]`);

      const cleanedTranslations: any = {};
      for (const [lang, translation] of Object.entries(cleaned.translations)) {
        const trans = translation as any;
        cleanedTranslations[lang] = {
          ...trans,
          segments: trans.segments?.map((seg: any) => ({
            ...seg,
            // Convertir false/true en null (schéma attend number | null)
            voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
          }))
        };
      }
      cleaned.translations = cleanedTranslations;
    } else {
      logger.info(`🧹 [CLEAN] Attachment ${attIndex} - AUCUNE traduction trouvée`);
    }

    return cleaned;
  });
}

/**
 * Enregistre les routes de base de gestion des messages (GET, POST, mark-read, mark-unread)
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
          around: { type: 'string', description: 'Load messages around this messageId (for search jump)' },
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
    const reqStart = performance.now();
    const timings: Record<string, number> = {};
    try {
      const { id } = request.params;
      const {
        limit: limitStr = '20',
        offset: offsetStr = '0',
        before,
        around,
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
      let t0 = performance.now();
      const conversationId = await resolveConversationId(prisma, id);
      timings.resolveConversationId = performance.now() - t0;
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier les permissions d'accès
      t0 = performance.now();
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      timings.canAccessConversation = performance.now() - t0;

      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Resolve the current user's participantId in this conversation
      t0 = performance.now();
      const isAnonymousUser = authRequest.authContext.type === 'anonymous';
      const currentParticipant = !isAnonymousUser && userId
        ? await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true, joinedAt: true, shareLinkId: true }
          })
        : null;

      // For anonymous users, also fetch joinedAt and shareLinkId
      const anonymousParticipant = isAnonymousUser && authRequest.authContext.participantId
        ? await prisma.participant.findFirst({
            where: { id: authRequest.authContext.participantId },
            select: { id: true, joinedAt: true, shareLinkId: true }
          })
        : null;

      timings.resolveParticipant = performance.now() - t0;
      const currentParticipantId = isAnonymousUser
        ? authRequest.authContext.participantId
        : currentParticipant?.id;

      // Determine history start date based on share link configuration
      const participant = isAnonymousUser ? anonymousParticipant : currentParticipant;
      let historyStartDate: Date | null = null;

      if (participant?.shareLinkId) {
        const shareLink = await prisma.conversationShareLink.findFirst({
          where: { id: participant.shareLinkId },
          select: { allowViewHistory: true }
        });
        if (shareLink && !shareLink.allowViewHistory) {
          historyStartDate = participant.joinedAt;
        }
      }

      // Construire la requête avec pagination
      const whereClause: any = {
        conversationId: conversationId, // Utiliser l'ID résolu
        deletedAt: null
      };

      // Apply history restriction if share link disallows viewing history
      if (historyStartDate) {
        whereClause.createdAt = { gte: historyStartDate };
      }

      if (before) {
        // Pagination par curseur (pour défilement historique)
        const beforeMessage = await prisma.message.findFirst({
          where: { id: before },
          select: { createdAt: true }
        });

        if (beforeMessage) {
          whereClause.createdAt = {
            ...whereClause.createdAt,
            lt: beforeMessage.createdAt
          };
        }
      }


      // Handle "around" mode: load messages around a specific message
      let isAroundMode = false;
      if (around && !before) {
        isAroundMode = true;
        const aroundMessage = await prisma.message.findFirst({
          where: { id: around, conversationId },
          select: { createdAt: true }
        });

        if (aroundMessage) {
          // Get half before and half after the target message
          const halfLimit = Math.floor(limit / 2);

          const beforeFilter: any = { lt: aroundMessage.createdAt };
          if (historyStartDate) beforeFilter.gte = historyStartDate;

          const [messagesBefore, messagesAfter] = await Promise.all([
            prisma.message.findMany({
              where: { conversationId, deletedAt: null, createdAt: beforeFilter },
              orderBy: { createdAt: 'desc' },
              take: halfLimit,
              select: { id: true }
            }),
            prisma.message.findMany({
              where: { conversationId, deletedAt: null, createdAt: { gt: aroundMessage.createdAt } },
              orderBy: { createdAt: 'asc' },
              take: halfLimit,
              select: { id: true }
            })
          ]);

          const allIds = [
            ...messagesBefore.map(m => m.id),
            around,
            ...messagesAfter.map(m => m.id)
          ];
          whereClause.id = { in: allIds };
          // Remove any createdAt filter since we're using id-based filtering
          delete whereClause.createdAt;
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
        messageType: true,
        messageSource: true,

        // ===== ÉDITION / SUPPRESSION =====
        isEdited: true,
        editedAt: true,
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

        // ===== TRADUCTIONS (champ Json) =====
        translations: true,

        // ===== RELATIONS OBLIGATOIRES =====
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
                systemLanguage: true,
                role: true
              }
            }
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
      // Note: translations est un champ Json dans Message, pas une relation
      // Il est déjà inclus dans le select de base (ligne 360)

      if (includeReactions) {
        messageSelect.reactions = {
          select: {
            id: true,
            emoji: true,
            userId: true,
            participantId: true,
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
            participantId: true,
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
            validatedMentions: true,
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
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
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
                bitrate: true,
                sampleRate: true,
                codec: true,
                channels: true,
                fps: true,
                videoCodec: true,
                pageCount: true,
                lineCount: true,
                metadata: true,
                transcription: true,  // ✅ Champ JSON scalaire
                translations: true,   // ✅ Champ JSON scalaire (pas translationsJson!)
                uploadedBy: true,
                isAnonymous: true,
                createdAt: true,
                isForwarded: true,
                isViewOnce: true,
                viewOnceCount: true,
                isBlurred: true,
                viewedCount: true,
                downloadedCount: true,
                consumedCount: true,
                isEncrypted: true
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
      const shouldFetchUserPrefs = authRequest.authContext.isAuthenticated && !isAnonymousUser;

      t0 = performance.now();
      const [totalCount, messages, userPrefs] = await Promise.all([
        // 1. Compter le total des messages (pour pagination) - skip when using cursor or around
        (before || isAroundMode)
          ? Promise.resolve(0)
          : prisma.message.count({
              where: {
                conversationId: conversationId,
                deletedAt: null
              }
            }),
        // 2. Récupérer les messages avec toutes les relations
        prisma.message.findMany({
          where: whereClause,
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: isAroundMode ? limit + 1 : limit, // +1 in around mode to include the target message
          skip: (before || isAroundMode) ? 0 : offset
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
      timings.mainQuery = performance.now() - t0;

      // ===== RÉCUPÉRER LES RÉACTIONS DE L'UTILISATEUR CONNECTÉ =====
      // Permet d'afficher les réactions de l'utilisateur sans requête de sync Socket.IO
      let userReactionsMap: Map<string, string[]> = new Map();

      t0 = performance.now();
      if (authRequest.authContext.isAuthenticated && messages.length > 0) {
        const messageIds: string[] = (messages as any[]).map(m => m.id);

        // Requête pour obtenir les réactions de l'utilisateur sur ces messages
        const userReactions = currentParticipantId ? await prisma.reaction.findMany({
          where: {
            messageId: { in: messageIds },
            participantId: currentParticipantId
          },
          select: {
            messageId: true,
            emoji: true
          }
        }) : [];

        // Grouper par messageId
        for (const reaction of userReactions) {
          const existing = userReactionsMap.get(reaction.messageId) || [];
          existing.push(reaction.emoji);
          userReactionsMap.set(reaction.messageId, existing);
        }
      }
      timings.userReactions = performance.now() - t0;

      // Déterminer la langue préférée de l'utilisateur
      const userPreferredLanguage = userPrefs
        ? resolveUserLanguage(userPrefs)
        : 'fr';

      // DEBUG: Log détaillé pour vérifier les transcriptions audio
      if (messages.length > 0) {
        logger.info(`🔍 [CONVERSATIONS] Chargement de ${messages.length} messages pour conversation ${conversationId}`);

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
                  const transcriptionText = (att.transcription.text || att.transcription.transcribedText)?.substring(0, 50) + '...';

                  // Vérifier speakerAnalysis AVANT nettoyage
                  let speakerAnalysisInfo = '';
                  if (att.transcription.speakerAnalysis) {
                    const speakers = att.transcription.speakerAnalysis.speakers || [];
                    const withVoiceChars = speakers.filter((s: any) => s.voiceCharacteristics).length;
                    speakerAnalysisInfo = ` | speakerAnalysis: ${speakers.length} speaker(s), voiceChars: ${withVoiceChars}/${speakers.length}`;
                    if (withVoiceChars > 0) {
                      const firstSpeaker = speakers.find((s: any) => s.voiceCharacteristics);
                      speakerAnalysisInfo += `, firstSpeaker: sid=${firstSpeaker.sid}, pitch=${firstSpeaker.voiceCharacteristics.pitch?.mean_hz}Hz, gender=${firstSpeaker.voiceCharacteristics.classification?.estimated_gender}`;
                    }
                  } else {
                    speakerAnalysisInfo = ' | ⚠️ AUCUN speakerAnalysis';
                  }

                  logger.info(`📝 [CONVERSATIONS] Message ${msg.id} - Audio transcription: attachmentId=${att.id}, text="${transcriptionText}", lang=${att.transcription.language}, confidence=${att.transcription.confidence}, source=${att.transcription.source}, model=${att.transcription.model}, durationMs=${att.transcription.durationMs || att.transcription.audioDurationMs}, segments=${att.transcription.segments?.length || 0}, speakerCount=${att.transcription.speakerCount}, hasTranslations=${!!att.translations}${speakerAnalysisInfo}`);
                } else {
                  logger.info(`⚠️ [CONVERSATIONS] Message ${msg.id} - Audio SANS transcription: attachmentId=${att.id}, mimeType=${att.mimeType}, fileUrl=${att.fileUrl}`);
                }

                // Vérifier les traductions audio (champ V2: translations au lieu de translatedAudios)
                if (att.translations && typeof att.translations === 'object' && Object.keys(att.translations).length > 0) {
                  audioWithTranslatedAudiosCount++;
                  const langs = Object.keys(att.translations);
                  const translationsInfo = langs.map(lang => {
                    const trans = att.translations[lang];
                    return `${lang}(url="${trans?.url || '⚠️ VIDE'}", cloned=${trans?.cloned}, segments=${trans?.segments?.length || 0})`;
                  }).join(', ');
                  logger.info(`🌍 [CONVERSATIONS] Message ${msg.id} - Audio traductions: attachmentId=${att.id}, ${langs.length} traduction(s) [${translationsInfo}]`);
                }
              }
            });
          }
        });

        const transcriptionRate = audioAttachmentCount > 0 ? `${(audioWithTranscriptionCount / audioAttachmentCount * 100).toFixed(1)}%` : '0%';
        logger.info(`📊 [CONVERSATIONS] Statistiques audio: totalMessages=${messages.length}, audioAttachments=${audioAttachmentCount}, audioWithTranscription=${audioWithTranscriptionCount}, audioWithTranslatedAudios=${audioWithTranslatedAudiosCount}, transcriptionRate=${transcriptionRate}`);
      }

      // Mapper les messages avec les champs alignés au type GatewayMessage de @meeshy/shared/types
      const mappedMessages = messages.map((message: any) => {
        // Construire l'objet de réponse aligné avec GatewayMessage
        const mappedMessage: any = {
          // Identifiants
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          

          // Contenu
          content: message.content,
          originalLanguage: message.originalLanguage || 'fr',
          messageType: message.messageType,
          messageSource: message.messageSource,

          // Édition/Suppression
          isEdited: message.isEdited,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,

          // Reply/Forward
          replyToId: message.replyToId,
          storyReplyToId: message.storyReplyToId,
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
          sender: message.sender ? {
            ...message.sender,
            username: message.sender.user?.username ?? message.sender.username ?? null,
            firstName: message.sender.user?.firstName ?? null,
            lastName: message.sender.user?.lastName ?? null,
            displayName: message.sender.displayName ?? message.sender.user?.displayName ?? null,
            avatar: message.sender.avatar ?? message.sender.user?.avatar ?? null,
            isOnline: message.sender.user?.isOnline ?? message.sender.isOnline ?? null,
            lastActiveAt: message.sender.user?.lastActiveAt ?? message.sender.lastActiveAt ?? null,
          } : null,
          attachments: cleanAttachmentsForApi(message.attachments),
          _count: message._count
        };

        // Relations optionnelles (selon paramètres include_*)
        if (includeTranslations && message.translations) {
          // Transformer JSON vers array pour rétrocompatibilité frontend
          mappedMessage.translations = transformTranslationsToArray(
            message.id,
            message.translations as Record<string, any>
          );
        }
        if (includeReactions && message.reactions) {
          mappedMessage.reactions = message.reactions;
        }
        if (includeStatus && message.statusEntries) {
          mappedMessage.statusEntries = message.statusEntries;
        }
        if (includeReplies && message.replyTo) {
          const replySender = (message as any).replyTo.sender;
          mappedMessage.replyTo = {
            ...message.replyTo,
            originalLanguage: message.replyTo.originalLanguage || 'fr',
            sender: replySender ? {
              ...replySender,
              username: replySender.user?.username ?? replySender.username ?? null,
              displayName: replySender.displayName ?? replySender.user?.displayName ?? null,
              avatar: replySender.avatar ?? replySender.user?.avatar ?? null,
            } : null,
          };
        }

        return mappedMessage;
      });

      // ===== ENRICHIR LES MESSAGES FORWARDÉS =====
      t0 = performance.now();
      // Charger les détails du message d'origine et de la conversation source
      const forwardedIds = mappedMessages
        .filter((m: any) => m.forwardedFromId)
        .map((m: any) => m.forwardedFromId);

      if (forwardedIds.length > 0) {
        const uniqueForwardedIds = [...new Set(forwardedIds)] as string[];

        const forwardedMessages = await prisma.message.findMany({
          where: { id: { in: uniqueForwardedIds } },
          select: {
            id: true,
            content: true,
            senderId: true,
            conversationId: true,
            messageType: true,
            createdAt: true,
            sender: {
              select: { id: true, userId: true, displayName: true, avatar: true, user: { select: { username: true } } }
            },
            attachments: {
              select: { id: true, mimeType: true, thumbnailUrl: true, fileUrl: true },
              take: 1
            }
          }
        });

        const forwardedMap = new Map(forwardedMessages.map(m => [m.id, m]));

        // Charger les conversations sources
        const convIds = mappedMessages
          .filter((m: any) => m.forwardedFromConversationId)
          .map((m: any) => m.forwardedFromConversationId);
        const uniqueConvIds = [...new Set(convIds)] as string[];

        let convMap = new Map<string, any>();
        if (uniqueConvIds.length > 0) {
          const conversations = await prisma.conversation.findMany({
            where: { id: { in: uniqueConvIds } },
            select: { id: true, title: true, identifier: true, type: true, avatar: true }
          });
          convMap = new Map(conversations.map(c => [c.id, c]));
        }

        // Enrichir chaque message forwardé
        for (const msg of mappedMessages) {
          if (msg.forwardedFromId) {
            const original = forwardedMap.get(msg.forwardedFromId);
            if (original) {
              msg.forwardedFrom = {
                id: original.id,
                content: original.content,
                messageType: original.messageType,
                createdAt: original.createdAt,
                sender: original.sender ? {
                  ...original.sender,
                  username: (original.sender as any).user?.username ?? (original.sender as any).username ?? null,
                  displayName: (original.sender as any).displayName ?? (original.sender as any).user?.displayName ?? null,
                  avatar: (original.sender as any).avatar ?? (original.sender as any).user?.avatar ?? null,
                } : null,
                attachments: original.attachments
              };
            }
          }
          if (msg.forwardedFromConversationId) {
            const conv = convMap.get(msg.forwardedFromConversationId);
            if (conv) {
              msg.forwardedFromConversation = {
                id: conv.id,
                title: conv.title,
                identifier: conv.identifier,
                type: conv.type,
                avatar: conv.avatar
              };
            }
          }
        }
      }

      timings.forwardedEnrichment = performance.now() - t0;

      // Marquer les messages comme lus (optimisé - ne marquer que les messages non lus)
      t0 = performance.now();
      if (messages.length > 0 && !authRequest.authContext.isAnonymous) {
        try {
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
          const readStatusService = new MessageReadStatusService(prisma);

          if (currentParticipantId) {
            await readStatusService.markMessagesAsReceived(currentParticipantId, conversationId);
          }
        } catch (error) {
          logger.warn('Error marking messages as received:', error);
        }
      }
      timings.markAsReceived = performance.now() - t0;

      // Construire les métadonnées de cursor pagination
      const lastMessageId = messages.length > 0 ? String((messages[messages.length - 1] as any).id) : null;
      const cursorPaginationMeta = buildCursorPaginationMeta(limit, messages.length, lastMessageId);

      // Format optimisé: data directement = Message[], meta pour userLanguage
      // Aligné avec MessagesListResponse de @meeshy/shared/types
      // Note: pagination offset-based uniquement pour les requêtes sans curseur.
      // Quand before/around est utilisé, seul cursorPagination est pertinent.
      // NOTE: Cannot use sendSuccess() — response includes top-level `cursorPagination`,
      // optional top-level `pagination`, and a `meta.userLanguage` field that iOS SDK
      // (MessagesListResponse / MessagesAPIResponse) and web parse at root level.
      // Migration to sendSuccess requires a coordinated client update (breaking change).
      const responsePayload: any = {
        success: true,
        data: mappedMessages,
        cursorPagination: cursorPaginationMeta,
        meta: {
          userLanguage: userPreferredLanguage
        }
      };

      if (!before && !isAroundMode) {
        responsePayload.pagination = buildPaginationMeta(totalCount, offset, limit, messages.length);
      }

      // Add around-specific pagination info
      if (isAroundMode) {
        const firstMsg = mappedMessages[0];
        const lastMsg = mappedMessages[mappedMessages.length - 1];
        if (firstMsg) {
          const olderCount = await prisma.message.count({
            where: { conversationId, deletedAt: null, createdAt: { lt: new Date(firstMsg.createdAt) } }
          });
          responsePayload.cursorPagination.hasMore = olderCount > 0;
        }
        if (lastMsg) {
          const newerCount = await prisma.message.count({
            where: { conversationId, deletedAt: null, createdAt: { gt: new Date(lastMsg.createdAt) } }
          });
          responsePayload.hasNewer = newerCount > 0;
        }
      }

      timings.total = performance.now() - reqStart;
      const timingsStr = Object.entries(timings)
        .map(([k, v]) => `${k}=${Math.round(v)}ms`)
        .join(', ');
      const level = timings.total > 5000 ? 'warn' : 'info';
      logger[level](`⏱️ GET /conversations/${conversationId}/messages`, {
        durationMs: Math.round(timings.total),
        messageCount: messages.length,
        limit,
        offset,
        before: before || null,
        around: around || null,
        timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)]))
      });

      reply.header('Cache-Control', 'private, no-cache');
      reply.send(responsePayload);

    } catch (error) {
      const totalMs = Math.round(performance.now() - reqStart);
      logger.error(`Error fetching messages (after ${totalMs}ms)`, error);
      reply.status(500).send({
        success: false,
        error: 'Error retrieving messages'
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
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Resolve participant ID for this user
      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { id: true }
      });

      if (!currentParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      // Récupérer tous les messages non lus de cette conversation pour cet utilisateur
      const unreadMessages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          deletedAt: null,
          senderId: { not: currentParticipant.id },
          statusEntries: {
            none: {
              participantId: currentParticipant.id,
              readAt: { not: null }
            }
          }
        },
        select: {
          id: true
        }
      });

      if (unreadMessages.length === 0) {
        return sendSuccess(reply, { message: 'Aucun message non lu à marquer', markedCount: 0 });
      }

      // Marquer tous les messages comme lus (utiliser le nouveau système de curseur)
      try {
        const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
        const readStatusService = new MessageReadStatusService(prisma);

        // Marquer comme lu (curseur automatiquement placé sur le dernier message)
        await readStatusService.markMessagesAsRead(currentParticipant.id, conversationId);
      } catch (err) {
        logger.warn('Error marking messages as read:', err);
      }

      return sendSuccess(reply, { message: `${unreadMessages.length} message(s) marqué(s) comme lu(s)`, markedCount: unreadMessages.length });

    } catch (error) {
      logger.error('Error marking conversation as read', error);
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
      description: 'Send a new message to a conversation with optional encryption and attachments. Unified handler using MessagingService.',
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
        properties: {
          content: { type: 'string', description: 'Message content' },
          originalLanguage: { type: 'string', description: 'Language code (e.g., fr, en)', default: 'fr' },
          messageType: { type: 'string', enum: ['text', 'image', 'file', 'audio', 'video'], default: 'text' },
          replyToId: { type: 'string', description: 'ID of message being replied to' },
          storyReplyToId: { type: 'string', description: 'ID of story being replied to' },
          forwardedFromId: { type: 'string', description: 'ID of original forwarded message' },
          forwardedFromConversationId: { type: 'string', description: 'ID of source conversation for cross-conversation forwarding' },
          encryptedContent: { type: 'string', description: 'Encrypted message content' },
          encryptionMode: { type: 'string', enum: ['e2e', 'server'], description: 'Encryption mode' },
          encryptionMetadata: { type: 'object', description: 'Encryption metadata' },
          isEncrypted: { type: 'boolean', description: 'Whether message is encrypted' },
          attachmentIds: { type: 'array', items: { type: 'string' }, description: 'IDs des attachments pré-uploadés' },
          isBlurred: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
          mentionedUserIds: { type: 'array', items: { type: 'string' } }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true }
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
        return reply.status(401).send({
          success: false,
          error: 'Authentification requise pour envoyer des messages'
        });
      }

      const { id } = request.params;
      const {
        content,
        originalLanguage,
        messageType = 'text',
        replyToId,
        storyReplyToId,
        forwardedFromId,
        forwardedFromConversationId,
        encryptedContent,
        encryptionMode,
        encryptionMetadata,
        isEncrypted,
        attachmentIds,
        isBlurred,
        expiresAt,
        mentionedUserIds
      } = request.body;

      const userId = authRequest.authContext.userId;
      const participantId = authRequest.authContext.isAnonymous
        ? authRequest.authContext.participantId
        : userId;

      if (!participantId) {
        return reply.status(403).send({ success: false, error: 'Participant identification failed' });
      }

      // Utiliser le MessagingService unifié
      const { MessagingService } = await import('../../services/messaging/MessagingService');
      const messagingService = new MessagingService(
        prisma,
        translationService,
        (fastify as any).notificationService
      );

      const messageRequest = {
        conversationId: id,
        content: content || '',
        originalLanguage,
        messageType,
        replyToId,
        forwardedFromId,
        forwardedFromConversationId,
        mentionedUserIds,
        attachmentIds,
        isBlurred,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        encryptedPayload: isEncrypted ? {
          ciphertext: encryptedContent!,
          mode: encryptionMode as any,
          ...encryptionMetadata as any
        } : undefined,
        metadata: {
          source: 'rest' as const,
          requestId: request.id
        }
      };

      const result = await messagingService.handleMessage(messageRequest, participantId);

      if (!result.success) {
        return reply.status(400).send(result);
      }

      // Broadcaster via socket (async)
      if (socketIOHandler && result.data) {
        const conversationId = result.data.conversationId;
        setImmediate(() => {
          socketIOHandler.broadcastMessage(result.data as any, conversationId).catch((err: any) => {
            logger.error('⚠️ [REST] Socket broadcast failed', err);
          });
        });
      }

      return reply.send(result);

    } catch (error) {
      logger.error('Error in REST send message:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne lors de l\'envoi du message'
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
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier les permissions d'accès
      let canAccess = false;

      if (id === "meeshy") {
        canAccess = true; // Conversation globale accessible à tous les utilisateurs connectés
      } else {
        const membership = await prisma.participant.findFirst({
          where: { conversationId: conversationId, userId, isActive: true }
        });
        canAccess = !!membership;
      }

      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // ✅ FIX: Utiliser uniquement le nouveau système de curseur
      // Pas besoin de compter les messages - on marque simplement comme lu
      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      // Calculer le nombre de messages non lus AVANT de marquer comme lu
      const unreadCount = await readStatusService.getUnreadCount(userId, conversationId);

      // Marquer la conversation comme lue (déplace le curseur au dernier message)
      await readStatusService.markMessagesAsRead(userId, conversationId);

      return sendSuccess(reply, { markedCount: unreadCount });
    } catch (error) {
      logger.error('Error marking conversation as read', error);
      sendInternalError(reply, 'Erreur lors du marquage comme lu');
    }
  });

  /**
   * POST /conversations/:id/mark-unread
   * Mark a conversation as unread by moving the read cursor back before the latest message.
   * This makes the conversation appear with 1 unread message in the conversation list.
   */
  fastify.post<{ Params: ConversationParams }>('/conversations/:id/mark-unread', {
    schema: {
      description: 'Mark a conversation as unread by setting the read cursor before the latest message, making it appear as 1 unread message.',
      tags: ['conversations', 'messages'],
      summary: 'Mark conversation as unread',
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
                unreadCount: { type: 'number', description: 'Number of unread messages after marking as unread' }
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
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Find the latest message in the conversation (not sent by the user)
      const latestMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: userId }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true }
      });

      if (!latestMessage) {
        // No messages from other users to mark as unread
        return sendSuccess(reply, { unreadCount: 0 });
      }

      // Move the read cursor to 1ms before the latest message's createdAt.
      // This ensures the latest message appears as unread (createdAt > lastReadAt).
      const lastReadAt = new Date(latestMessage.createdAt.getTime() - 1);

      // Find the message just before the latest (to use as lastReadMessageId)
      const previousMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          createdAt: { lt: latestMessage.createdAt }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });

      // Update the cursor: set lastReadAt before the latest message
      const participantForCursor = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { id: true }
      });

      if (!participantForCursor) {
        return sendForbidden(reply, 'Not a participant');
      }

      await prisma.conversationReadCursor.upsert({
        where: {
          conversation_participant_cursor: { participantId: participantForCursor.id, conversationId }
        },
        create: {
          participantId: participantForCursor.id,
          conversationId,
          lastReadMessageId: previousMessage?.id || null,
          lastReadAt: lastReadAt,
          unreadCount: 1,
          version: 0
        },
        update: {
          lastReadMessageId: previousMessage?.id || null,
          lastReadAt: lastReadAt,
          unreadCount: 1,
          version: { increment: 1 }
        }
      });

      logger.info(`[MARK-UNREAD] User ${userId} marked conversation ${conversationId} as unread (cursor moved before message ${latestMessage.id})`);

      return sendSuccess(reply, { unreadCount: 1 });

    } catch (error) {
      logger.error('Error marking conversation as unread', error);
      reply.status(500).send({
        success: false,
        error: 'Error marking conversation as unread'
      });
    }
  });

  // ============================================================================
  // PIN / UNPIN MESSAGE
  // ============================================================================

  fastify.put<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/pin', {
    schema: {
      description: 'Pin a message in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'Pin message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to pin' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                pinnedAt: { type: 'string', format: 'date-time' },
                pinnedBy: { type: 'string' }
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
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id, messageId } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      const now = new Date();
      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: now, pinnedBy: userId }
      });

      logger.info(`[PIN] User ${userId} pinned message ${messageId} in conversation ${conversationId}`);

      // Broadcast pin event via Socket.IO
      if (socketIOHandler) {
        socketIOHandler.io?.to(`conversation:${conversationId}`).emit('message:pinned', {
          messageId,
          conversationId,
          pinnedAt: now.toISOString(),
          pinnedBy: userId
        });
      }

      return sendSuccess(reply, { pinnedAt: now.toISOString(), pinnedBy: userId });
    } catch (error) {
      logger.error('Error pinning message', error);
      sendInternalError(reply, 'Error pinning message');
    }
  });

  fastify.delete<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/pin', {
    schema: {
      description: 'Unpin a message in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'Unpin message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to unpin' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
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
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id, messageId } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: null, pinnedBy: null }
      });

      logger.info(`[UNPIN] User ${userId} unpinned message ${messageId} in conversation ${conversationId}`);

      // Broadcast unpin event via Socket.IO
      if (socketIOHandler) {
        socketIOHandler.io?.to(`conversation:${conversationId}`).emit('message:unpinned', {
          messageId,
          conversationId
        });
      }

      return sendSuccess(reply, null);
    } catch (error) {
      logger.error('Error unpinning message', error);
      sendInternalError(reply, 'Error unpinning message');
    }
  });

  // ============================================================================
  // CONSUME VIEW-ONCE MESSAGE
  // ============================================================================

  fastify.post<{
    Params: { id: string; messageId: string };
  }>('/conversations/:id/messages/:messageId/consume', {
    schema: {
      description: 'Consume a view-once message (increment view count)',
      tags: ['conversations', 'messages'],
      summary: 'Consume view-once message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to consume' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                messageId: { type: 'string' },
                viewOnceCount: { type: 'number' },
                maxViewOnceCount: { type: 'number' },
                isFullyConsumed: { type: 'boolean' }
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
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id, messageId } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      if (!message.isViewOnce) {
        return sendBadRequest(reply, 'Message is not view-once');
      }

      const now = new Date();

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { viewOnceCount: { increment: 1 } }
      });

      const maxViewOnceCount = (message as any).maxViewOnceCount ?? 1;
      const newViewOnceCount = updated.viewOnceCount ?? 1;
      const isFullyConsumed = newViewOnceCount >= maxViewOnceCount;

      // Update status entry for this user
      const viewParticipant = await prisma.participant.findFirst({
        where: { conversationId: message.conversationId, userId, isActive: true },
        select: { id: true }
      });
      if (viewParticipant) {
        await prisma.messageStatusEntry.updateMany({
          where: { messageId, participantId: viewParticipant.id },
          data: { viewedOnceAt: now, revealedAt: now }
        });
      }

      logger.info(`[CONSUME] User ${userId} consumed view-once message ${messageId} (${newViewOnceCount}/${maxViewOnceCount})`);

      // Broadcast consume event via Socket.IO
      if (socketIOHandler) {
        socketIOHandler.io?.to(`conversation:${conversationId}`).emit('message:consumed', {
          messageId,
          conversationId,
          userId,
          viewOnceCount: newViewOnceCount,
          maxViewOnceCount,
          isFullyConsumed
        });
      }

      return sendSuccess(reply, { messageId, viewOnceCount: newViewOnceCount, maxViewOnceCount, isFullyConsumed });
    } catch (error) {
      logger.error('Error consuming view-once message', error);
      sendInternalError(reply, 'Error consuming view-once message');
    }
  });

  // ===== SEARCH MESSAGES IN CONVERSATION =====

  fastify.get<{
    Params: ConversationParams;
    Querystring: { q: string; limit?: string; cursor?: string };
  }>('/conversations/:id/messages/search', {
    schema: {
      description: 'Search messages within a conversation by content or translations',
      tags: ['conversations', 'messages'],
      summary: 'Search messages in conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query', minLength: 2 },
          limit: { type: 'string', description: 'Max results (default 20)' },
          cursor: { type: 'string', description: 'Message ID cursor for pagination' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema },
            cursorPagination: {
              type: 'object',
              properties: {
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
                limit: { type: 'integer' }
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
      const { q, limit: limitStr = '20', cursor } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      const searchLimit = Math.min(parseInt(limitStr, 10) || 20, 50);

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Conversation not found');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized');
      }

      const queryLower = q.toLowerCase().trim();

      // Build where clause for content search
      const whereClause: any = {
        conversationId,
        deletedAt: null,
        content: { contains: queryLower, mode: 'insensitive' }
      };

      if (cursor) {
        const cursorMsg = await prisma.message.findFirst({
          where: { id: cursor },
          select: { createdAt: true }
        });
        if (cursorMsg) {
          whereClause.createdAt = { lt: cursorMsg.createdAt };
        }
      }

      const messageSelect = {
        id: true,
        conversationId: true,
        content: true,
        originalLanguage: true,
        messageType: true,
        translations: true,
        createdAt: true,
        senderId: true,
        sender: {
          select: { id: true, userId: true, username: true, displayName: true, avatar: true }
        }
      };

      // Search content AND translations in parallel
      const [contentMatches, translationCandidates] = await Promise.all([
        prisma.message.findMany({
          where: whereClause,
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: searchLimit + 1
        }),
        prisma.message.findMany({
          where: {
            conversationId,
            deletedAt: null,
            NOT: { content: { contains: queryLower, mode: 'insensitive' } },
            translations: { not: { equals: null } },
            ...(cursor ? { createdAt: whereClause.createdAt } : {})
          },
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: 200
        })
      ]);

      const translationMatches = translationCandidates.filter((msg: any) => {
        if (!msg.translations || typeof msg.translations !== 'object') return false;
        return Object.values(msg.translations).some((t: any) => {
          const text = typeof t === 'string' ? t : t?.text || t?.content || '';
          return text.toLowerCase().includes(queryLower);
        });
      });

      // Merge and deduplicate results
      const seenIds = new Set(contentMatches.map(m => m.id));
      const merged = [...contentMatches];
      for (const tm of translationMatches) {
        if (!seenIds.has(tm.id)) {
          seenIds.add(tm.id);
          merged.push(tm);
        }
      }

      // Sort by createdAt desc and apply limit
      merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const hasMore = merged.length > searchLimit;
      const results = merged.slice(0, searchLimit);

      const lastId = results.length > 0 ? results[results.length - 1].id : null;

      // Transform translations JSON → array format for SDK compatibility
      const mappedResults = results.map((msg: any) => ({
        ...msg,
        translations: msg.translations
          ? transformTranslationsToArray(msg.id, msg.translations as Record<string, any>)
          : undefined
      }));

      // NOTE: Cannot use sendSuccess() — response includes a top-level `cursorPagination`
      // field that iOS SDK (MessagesSearchResponse) and web (crud.service.ts) parse at
      // root level. Migration to sendSuccess requires a coordinated client update
      // (breaking change).
      reply.send({
        success: true,
        data: mappedResults,
        cursorPagination: {
          hasMore,
          nextCursor: hasMore ? lastId : null,
          limit: searchLimit
        }
      });

    } catch (error) {
      logger.error('Error searching messages', error);
      sendInternalError(reply, 'Error searching messages');
    }
  });

}
