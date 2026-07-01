import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { aggregateAttachmentReactions } from '../../socketio/serializeAttachmentForSocket';
import { MessagingService } from '../../services/messaging/MessagingService';
import {
  buildPostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
} from '../../services/messaging/postReplySnapshot';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { attachmentMediaSelect, attachmentFullSelect, attachmentForwardPreviewSelect } from '../../services/attachments/attachmentIncludes';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination, buildPaginationMeta, buildCursorPaginationMeta } from '../../utils/pagination';
import { messageValidationHook } from '../../middleware/rate-limiter';
import { MESSAGE_LIMITS } from '../../config/message-limits';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { isBlockedBetween } from '../../utils/blocking';
import { resolveMentionedUsers } from '../../services/MentionService';
import type {
  ConversationParams,
  SendMessageBody,
  MessagesQuery
} from './types';
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { sendWithETag } from '../../utils/etag';
import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';

import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';

/**
 * Nested-user fields fetched for a message sender in the GET messages select.
 *
 * T16 — only the fields the response actually derives are fetched: the handler
 * overlays the top-level sender username / displayName / avatar from this
 * nested user (with the flat Participant fields as the primary). `firstName`,
 * `lastName`, `systemLanguage` and `role` are NOT selected: the response schema
 * (`messageSenderSchema`) strips the nested user entirely and never exposes
 * systemLanguage/role, `firstName`/`lastName` are read by no client, so
 * fetching them was pure per-message DB over-fetch.
 */
export const messageSenderUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true
} as const;

// `content` est optionnel : un message média-seul (image/vidéo/fichier sans
// légende) ou un forward arrive avec un contenu vide. Le `.refine()` final
// exige qu'au moins une source de contenu soit présente. Restaure le
// comportement du commit ee9a29db, perdu lors de la migration Zod (Phase 4).
export const SendMessageBodySchema = z.object({
  content: z
    .string()
    .max(
      MESSAGE_LIMITS.MAX_MESSAGE_LENGTH,
      `Le message ne peut pas dépasser ${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH} caractères`,
    )
    .optional(),
  // Phase 4 §6.2 — `cid_<uuid v4 lowercase>` idempotency key. OPTIONAL:
  // only clients needing sync/dedup (app, web) send it. Scripts and
  // integrations may omit it; the message is then simply not deduped
  // (MessageProcessor persists clientMessageId as null). When provided it
  // must still be well-formed.
  clientMessageId: z
    .string()
    .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)')
    .optional(),
  originalLanguage: CommonSchemas.language.optional(),
  messageType: CommonSchemas.messageType.optional(),
  replyToId: z.string().optional(),
  storyReplyToId: z.string().optional(),
  forwardedFromId: z.string().optional(),
  forwardedFromConversationId: z.string().optional(),
  encryptedContent: z.string().optional(),
  encryptionMode: z.enum(['e2ee', 'server', 'hybrid']).optional(),
  encryptionMetadata: z.record(z.string(), z.unknown())
    .refine(
      (m) => { try { return JSON.stringify(m).length <= 8 * 1024; } catch { return false; } },
      { message: 'encryptionMetadata exceeds 8KB serialized' }
    )
    .optional(),
  isEncrypted: z.boolean().optional(),
  attachmentIds: z.array(z.string()).optional(),
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
  mentionedUserIds: z.array(z.string()).optional(),
}).refine(
  (data) =>
    (data.content?.trim().length ?? 0) > 0 ||
    (data.attachmentIds?.length ?? 0) > 0 ||
    Boolean(data.forwardedFromId) ||
    Boolean(data.encryptedContent),
  { message: 'Le message ne peut pas être vide', path: ['content'] },
);
import { transformTranslationsToArray } from '../../utils/translation-transformer';
// Logger dédié pour messages
const logger = enhancedLogger.child({ module: 'messages' });

/**
 * Nettoie les attachments pour l'API en transformant les valeurs invalides
 * Fixe spécifiquement voiceSimilarityScore: false -> null pour compatibilité schéma
 */
type CurrentUserConsumption = {
  lastPlayPositionMs: number | null;
  listenedComplete: boolean;
  lastWatchPositionMs: number | null;
  watchedComplete: boolean;
};

function cleanAttachmentsForApi(
  attachments: any[],
  languageFilter?: readonly string[],
  currentParticipantId?: string,
  consumptionMap?: Map<string, CurrentUserConsumption>
): any[] {
  if (!attachments || !Array.isArray(attachments)) {
    return attachments;
  }

  // Bandwidth opt-in : restreindre les traductions audio (Prisme) aux langues
  // demandées, miroir exact du filtre appliqué aux traductions texte.
  const langSet = languageFilter && languageFilter.length > 0
    ? new Set(languageFilter.map((l) => l.toLowerCase()))
    : null;

  if (attachments.length > 0) {
    logger.debug(`🧹 [CLEAN] Nettoyage de ${attachments.length} attachment(s) pour l'API`);
  }

  return attachments.map((att, attIndex) => {
    const cleaned = { ...att };

    // BUG2 A' — agréger les réactions par-image en reactionSummary + currentUserReactions
    // (miroir des réactions message-level) et retirer les rows brutes.
    const __reactions = aggregateAttachmentReactions(cleaned.reactions, currentParticipantId);
    cleaned.reactionSummary = __reactions.reactionSummary;
    cleaned.currentUserReactions = __reactions.currentUserReactions;
    delete cleaned.reactions;

    // Phase 2 — progression de consommation PERSONNELLE (sync cross-device) :
    // position/complétion du participant courant, pour seeder le tint waveform
    // (audio) et la progress-bar (vidéo) dès l'ouverture. `null` = jamais
    // consommé par ce participant. Miroir de currentUserReactions.
    cleaned.currentUserConsumption = consumptionMap?.get(att.id) ?? null;

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

      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - Transcription: ${cleaned.transcription.segments.length} segments | ${speakerInfo} | segment[0]: hasStartMs=${'startMs' in originalSegment}, hasEndMs=${'endMs' in originalSegment}, hasSpeakerId=${'speakerId' in originalSegment}, voiceSimilarityScoreType=${typeof originalSegment.voiceSimilarityScore}, voiceSimilarityScoreValue=${originalSegment.voiceSimilarityScore}`);

      cleaned.transcription.segments = cleaned.transcription.segments.map((seg: any) => ({
        ...seg,
        // Convertir false/true en null (schéma attend number | null)
        voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
      }));

      const cleanedSegment = cleaned.transcription.segments[0];
      logger.debug(`🧹 [CLEAN] Segment nettoyé [0]: text="${cleanedSegment.text}", startMs=${cleanedSegment.startMs}, endMs=${cleanedSegment.endMs}, speakerId=${cleanedSegment.speakerId}, voiceSimilarityScore=${cleanedSegment.voiceSimilarityScore}, confidence=${cleanedSegment.confidence}`);
    }

    // Nettoyer les traductions
    if (cleaned.translations && typeof cleaned.translations === 'object') {
      const langs = Object.keys(cleaned.translations);
      const translationsInfo = langs.map(lang => {
        const trans = cleaned.translations[lang] as any;
        return `${lang}(url="${trans.url || '⚠️ VIDE'}", segments=${trans.segments?.length || 0})`;
      }).join(', ');

      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - Traductions: ${langs.length} langue(s) [${translationsInfo}]`);

      const cleanedTranslations: any = {};
      for (const [lang, translation] of Object.entries(cleaned.translations)) {
        if (langSet && !langSet.has(lang.toLowerCase())) continue;
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
      logger.debug(`🧹 [CLEAN] Attachment ${attIndex} - AUCUNE traduction trouvée`);
    }

    return cleaned;
  });
}

/**
 * Forward watermark filter for GET messages. Given an ISO8601 `after`
 * timestamp, returns a Prisma `createdAt > after` clause so a client can
 * resume a missed-message gap from its per-conversation high-water mark
 * (local-first incremental backfill) instead of refetching offset:0. Returns
 * null when `after` is absent or unparseable — the caller then keeps its
 * default offset/cursor paging and never builds an `Invalid Date` filter.
 */
export function buildAfterWatermarkClause(after?: string): { createdAt: { gt: Date } } | null {
  if (!after) return null;
  const d = new Date(after);
  if (isNaN(d.getTime())) return null;
  return { createdAt: { gt: d } };
}

/**
 * Active-recipient denominator for a message's all-or-nothing delivery
 * indicator: the count of active participants EXCLUDING the message's sender.
 * Mirrors `MessageReadStatusService.totalMembers`. Returned to clients per
 * message so the sender's ✓✓ / read tier lights up only once EVERY recipient
 * has received / read it, using the server's authoritative count instead of a
 * possibly-stale local member count.
 *
 * @param activeParticipantIds set of `Participant.id` for active members
 * @param senderParticipantId  the message's raw `senderId` (a `Participant.id`)
 */
export function computeRecipientCount(
  activeParticipantIds: Set<string>,
  senderParticipantId: string
): number {
  return Math.max(
    0,
    activeParticipantIds.size - (activeParticipantIds.has(senderParticipantId) ? 1 : 0)
  );
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
  const socketIOHandler = fastify.socketIOHandler;
  const privacyPreferencesService = new PrivacyPreferencesService(prisma);

  // `MessagingService` is stateless across requests, so it is built once and
  // reused. The POST /messages handler previously re-imported the module and
  // reconstructed the whole dependency graph (validator, processor,
  // AttachmentService, …) on every send — pure overhead on the send hot path.
  // Construction is lazy so `fastify.notificationService` is read only after
  // it has been decorated (decoration order vs route registration is not
  // guaranteed).
  let messagingService: MessagingService | undefined;
  function getMessagingService(): MessagingService {
    if (!messagingService) {
      messagingService = new MessagingService(
        prisma,
        translationService,
        fastify.notificationService
      );
    }
    return messagingService;
  }

  async function broadcastReadStatus(
    userId: string,
    participantId: string,
    conversationId: string,
    type: 'read' | 'received',
    isAnonymous: boolean
  ): Promise<void> {
    try {
      if (!socketIOHandler) return;
      const socketIOManager = socketIOHandler.getManager?.();
      if (!socketIOManager) return;
      const io = socketIOManager.getIO();

      const shouldBroadcast = await privacyPreferencesService.shouldShowReadReceipts(userId, isAnonymous);

      if (!shouldBroadcast) {
        // Badge reset is internal multi-device sync, not a peer disclosure — always fire.
        if (type === 'read') {
          io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
            conversationId,
            unreadCount: 0,
          });
        }
        return;
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      // Fetch the summary and the list of active participants' userIds in parallel.
      // We emit to BOTH the conversation room AND each registered participant's
      // user room so that message authors receive receipt updates even when they
      // have navigated away from the conversation view (and thus left the
      // conversation room). Socket.IO deduplicates delivery per socket when
      // multiple rooms are chained via `.to(room1).to(room2).emit(...)`.
      const [summary, activeParticipants] = await Promise.all([
        readStatusService.getLatestMessageSummary(conversationId),
        prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: { userId: true }
        })
      ]);

      const payload = {
        conversationId,
        participantId,
        userId,
        type,
        updatedAt: new Date(),
        summary
      };

      const convRoom = ROOMS.conversation(conversationId);
      let emitter: any = io.to(convRoom);
      const seenRooms = new Set<string>([convRoom]);
      for (const p of activeParticipants) {
        if (!p.userId) continue;
        const userRoom = ROOMS.user(p.userId);
        if (seenRooms.has(userRoom)) continue;
        seenRooms.add(userRoom);
        emitter = emitter.to(userRoom);
      }
      emitter.emit(SERVER_EVENTS.READ_STATUS_UPDATED, payload);

      io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
        conversationId,
        unreadCount: 0,
      });
    } catch (error) {
      logger.error('Error broadcasting read status:', error);
    }
  }

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
          after: { type: 'string', description: 'Forward watermark (ISO8601): get messages created strictly after this instant, ascending. For local-first incremental gap backfill.' },
          around: { type: 'string', description: 'Load messages around this messageId (for search jump)' },
          include_reactions: { type: 'string', enum: ['true', 'false'], description: 'Include detailed reactions list (default false). Note: reactionSummary and reactionCount are always included.' },
          include_translations: { type: 'string', enum: ['true', 'false'], description: 'Include translations (default true)' },
          include_status: { type: 'string', enum: ['true', 'false'], description: 'Include per-user read status entries (default false)' },
          include_replies: { type: 'string', enum: ['true', 'false'], description: 'Include replyTo message details (default true)' },
          languages: { type: 'string', description: 'Comma-separated Prisme languages (e.g. "fr,en"). When set, only these languages are serialized in BOTH text and audio translations; absent = all languages. Bandwidth opt-in.' }
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
        after,
        around,
        include_reactions: includeReactionsStr = 'false',
        include_translations: includeTranslationsStr = 'true',
        include_status: includeStatusStr = 'false',
        include_replies: includeRepliesStr = 'true',
        languages: languagesStr
      } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Parser les paramètres optionnels d'inclusion
      const includeReactions = includeReactionsStr === 'true';
      const includeTranslations = includeTranslationsStr === 'true';
      const includeStatus = includeStatusStr === 'true';
      const includeReplies = includeRepliesStr === 'true';

      // Bandwidth opt-in : filtrage des traductions (texte + audio) aux seules
      // langues du Prisme demandées par le client. Absent/vide = toutes les
      // langues (comportement historique). Normalisé, dédupliqué, borné.
      const languageFilter = languagesStr
        ? Array.from(new Set(
            languagesStr.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
          )).slice(0, 20)
        : undefined;
      const hasLanguageFilter = !!languageFilter && languageFilter.length > 0;

      // Forward watermark mode (local-first incremental gap backfill): fetch
      // messages created strictly after the client's high-water mark, oldest
      // first. Only active when not already paging backwards (before) or
      // jumping to a search hit (around). Treated like a cursor read — no
      // total COUNT, no offset pagination.
      const afterClause = (!before && !around) ? buildAfterWatermarkClause(after) : null;
      const afterMode = afterClause !== null;

      // Valider et parser les paramètres de pagination
      const { offset, limit } = validatePagination(offsetStr, limitStr, { maxLimit: 50 });

      // Résoudre l'ID de conversation réel
      let t0 = performance.now();
      const conversationId = await resolveConversationId(prisma, id);
      timings.resolveConversationId = performance.now() - t0;
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      t0 = performance.now();
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      timings.canAccessConversation = performance.now() - t0;

      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
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
          select: { allowViewHistory: true, expiresAt: true, maxUses: true, currentUses: true }
        });
        if (shareLink) {
          if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
            return sendForbidden(reply, 'This share link has expired', { code: 'SHARE_LINK_EXPIRED' });
          }
          if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
            return sendForbidden(reply, 'This share link has reached its usage limit', { code: 'SHARE_LINK_MAX_USES' });
          }
          if (!shareLink.allowViewHistory) {
            historyStartDate = participant.joinedAt;
          }
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

      // Forward watermark filter: createdAt > after (merged with any history gte).
      if (afterMode && afterClause) {
        whereClause.createdAt = { ...whereClause.createdAt, ...afterClause.createdAt };
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
        // Idempotency key — exposed so clients reconcile optimistic rows by
        // `clientMessageId` on a cold message-list load (avoids duplicate
        // bubbles when the optimistic→server ack was missed offline).
        clientMessageId: true,
        content: true,
        originalLanguage: true,
        conversationId: true,
        senderId: true,
        messageType: true,
        messageSource: true,
        // Structured per-type payload (call-summary facts for system messages)
        metadata: true,

        // ===== ÉDITION / SUPPRESSION =====
        isEdited: true,
        editedAt: true,
        deletedAt: true,

        // ===== REPLY / FORWARD =====
        replyToId: true,
        storyReplyToId: true,
        forwardedFromId: true,
        forwardedFromConversationId: true,

        // ===== VIEW-ONCE / BLUR / EXPIRATION =====
        isViewOnce: true,
        maxViewOnceCount: true,
        viewOnceCount: true,
        isBlurred: true,
        effectFlags: true,
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
            userId: true,
            displayName: true,
            avatar: true,
            type: true,
            role: true,
            language: true,
            user: {
              select: messageSenderUserSelect
            }
          }
        },
        attachments: { select: attachmentMediaSelect },
        _count: {
          select: {
            reactions: true,
            statusEntries: true
          }
        }
      };

      // ===== RELATIONS OPTIONNELLES (selon paramètres include_*) =====

      // `translations` est un champ Json sur Message (pas une relation) — on
      // ne le ramène du DB que si le client le demande. Économie bandwidth :
      // une conv warm-cache iOS (GRDB déjà peuplé + socket temps réel) appelle
      // `?include_translations=false` et évite ~22 KB par refresh sur 30
      // messages × 3 langues. Cold-start envoie `true` par défaut.
      if (includeTranslations) {
        messageSelect.translations = true;
      }

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
            attachments: { select: attachmentFullSelect, take: 4 },
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
        // 1. Compter le total des messages (pour pagination) - skip when using cursor, around, or forward watermark
        (before || isAroundMode || afterMode)
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
          // Forward watermark backfill returns oldest-after-watermark first so
          // the client can advance its high-water mark contiguously; all other
          // modes return newest-first.
          orderBy: { createdAt: afterMode ? 'asc' : 'desc' },
          // Cursor-based pagination (before): fetch limit+1 to detect hasMore
          // without an extra COUNT query. The extra row is trimmed before
          // returning to the client.
          take: isAroundMode ? limit + 1 : (before ? limit + 1 : limit),
          skip: (before || isAroundMode || afterMode) ? 0 : offset
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

      // Phase 2 — progression de consommation média du participant courant
      // (sync cross-device). Une seule requête bornée à la page, scopée au
      // participant : on n'élargit pas les `select` partagés (cf.
      // attachmentIncludes) ni les broadcasts socket.
      const consumptionMap = new Map<string, CurrentUserConsumption>();
      if (currentParticipantId && messages.length > 0) {
        const attachmentIds: string[] = (messages as any[]).flatMap(m =>
          Array.isArray(m.attachments) ? m.attachments.map((a: any) => a.id) : []
        );
        if (attachmentIds.length > 0) {
          const consumptionRows = await prisma.attachmentStatusEntry.findMany({
            where: { attachmentId: { in: attachmentIds }, participantId: currentParticipantId },
            select: {
              attachmentId: true,
              lastPlayPositionMs: true,
              listenedComplete: true,
              lastWatchPositionMs: true,
              watchedComplete: true,
            },
          });
          for (const row of consumptionRows) {
            consumptionMap.set(row.attachmentId, {
              lastPlayPositionMs: row.lastPlayPositionMs ?? null,
              listenedComplete: row.listenedComplete ?? false,
              lastWatchPositionMs: row.lastWatchPositionMs ?? null,
              watchedComplete: row.watchedComplete ?? false,
            });
          }
        }
      }

      // Déterminer la langue préférée de l'utilisateur
      const userPreferredLanguage = userPrefs
        ? resolveUserLanguage(userPrefs)
        : 'fr';

      // DEBUG: Log détaillé pour vérifier les transcriptions audio
      // Diagnostic audio verbeux (par message + par attachment) : coûteux sur ce
      // hot-path (GET messages). Gardé derrière LOG_AUDIO_DIAG=true — OFF par
      // défaut en prod. La boucle entière est court-circuitée quand désactivé.
      if (process.env.LOG_AUDIO_DIAG === 'true' && messages.length > 0) {
        logger.debug(`audio-diag: loading ${messages.length} messages for conversation ${conversationId}`);

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
                  const rawTranscriptionText = att.transcription.text || att.transcription.transcribedText || '';
                  const transcriptionText = rawTranscriptionText ? `${rawTranscriptionText.substring(0, 50)}...` : '(vide)';

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

                  logger.debug(`audio-diag: msg=${msg.id} attachmentId=${att.id} text="${transcriptionText}" lang=${att.transcription.language} confidence=${att.transcription.confidence} source=${att.transcription.source} model=${att.transcription.model} durationMs=${att.transcription.durationMs || att.transcription.audioDurationMs} segments=${att.transcription.segments?.length || 0} speakerCount=${att.transcription.speakerCount} hasTranslations=${!!att.translations}${speakerAnalysisInfo}`);
                } else {
                  logger.debug(`audio-diag: msg=${msg.id} attachmentId=${att.id} no-transcription mimeType=${att.mimeType}`);
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

      // Enrichir les messages avec les vrais statuts de lecture depuis les cursors
      // Les champs dénormalisés (deliveredCount, readCount) ne sont jamais mis à jour en DB
      // On les calcule dynamiquement ici depuis ConversationReadCursor
      const readStatusMap = new Map<string, { deliveredCount: number; readCount: number; recipientCount: number }>();
      if (messages.length > 0 && authRequest.authContext?.userId) {
        try {
          const [activeParticipants, cursors] = await Promise.all([
            prisma.participant.findMany({
              where: { conversationId, isActive: true },
              select: { id: true }
            }),
            prisma.conversationReadCursor.findMany({
              where: { conversationId },
              select: { participantId: true, lastDeliveredAt: true, lastReadAt: true }
            })
          ]);
          const activeIds = new Set(activeParticipants.map((p: any) => p.id));
          const activeCursors = cursors.filter((c: any) => activeIds.has(c.participantId));

          for (const msg of (messages as any[])) {
            let deliveredCount = 0;
            let readCount = 0;
            for (const cursor of activeCursors) {
              if (cursor.participantId === msg.senderId) continue;
              if (cursor.lastDeliveredAt && cursor.lastDeliveredAt >= msg.createdAt) deliveredCount++;
              if (cursor.lastReadAt && cursor.lastReadAt >= msg.createdAt) readCount++;
            }
            // Authoritative all-or-nothing denominator: active participants
            // EXCLUDING this message's sender. Lets the client render the group
            // ✓✓ / read tier from the real recipient count instead of a stale
            // local memberCount.
            const recipientCount = computeRecipientCount(activeIds, msg.senderId);
            readStatusMap.set(msg.id, { deliveredCount, readCount, recipientCount });
          }
        } catch (err) {
          logger.warn('[CONVERSATIONS] Failed to compute read statuses:', err);
        }
      }

      // Mapper les messages avec les champs alignés au type GatewayMessage de @meeshy/shared/types
      const mappedMessages = messages.map((message: any) => {
        // Construire l'objet de réponse aligné avec GatewayMessage
        const mappedMessage: any = {
          // Identifiants
          id: message.id,
          // Idempotency key — lets clients reconcile an optimistic send with
          // its server record by `clientMessageId` on a cold list load.
          clientMessageId: message.clientMessageId ?? null,
          conversationId: message.conversationId,
          // CORRECTION senderId: en DB, senderId = Participant.id (FK).
          // Les clients (iOS/Web) comparent senderId avec leur userId (User.id).
          // On résout ici : senderId devient sender.userId si disponible.
          senderId: message.sender?.userId ?? message.sender?.user?.id ?? message.senderId,
          // Conserver le participantId brut pour debug/internal usage
          senderParticipantId: message.senderId,
          

          // Contenu
          content: message.content,
          originalLanguage: message.originalLanguage || 'fr',
          messageType: message.messageType,
          messageSource: message.messageSource,
          // Structured per-type payload (call-summary facts for system messages)
          metadata: message.metadata ?? undefined,

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
          effectFlags: message.effectFlags,
          expiresAt: message.expiresAt,

          // Épinglage
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,

          // Statuts agrégés (calculés dynamiquement depuis les cursors)
          deliveredToAllAt: message.deliveredToAllAt,
          receivedByAllAt: message.receivedByAllAt,
          readByAllAt: message.readByAllAt,
          deliveredCount: readStatusMap.get(message.id)?.deliveredCount ?? message.deliveredCount ?? 0,
          readCount: readStatusMap.get(message.id)?.readCount ?? message.readCount ?? 0,
          // Server-authoritative active-recipient denominator (participants
          // excluding the sender). `0` when not computed (no auth context) — the
          // client then falls back to its local member count.
          recipientCount: readStatusMap.get(message.id)?.recipientCount ?? 0,

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
            // T16 — firstName/lastName were serialized but read by no client and
            // are no longer fetched (messageSenderUserSelect trims them).
            displayName: message.sender.displayName ?? message.sender.user?.displayName ?? null,
            avatar: resolveParticipantAvatar(message.sender),
            isOnline: message.sender.user?.isOnline ?? message.sender.isOnline ?? null,
            lastActiveAt: message.sender.user?.lastActiveAt ?? message.sender.lastActiveAt ?? null,
          } : null,
          attachments: cleanAttachmentsForApi(message.attachments, languageFilter, currentParticipantId, consumptionMap),
          _count: message._count
        };

        // Relations optionnelles (selon paramètres include_*)
        if (includeTranslations && message.translations) {
          // Transformer JSON vers array pour rétrocompatibilité frontend
          mappedMessage.translations = transformTranslationsToArray(
            message.id,
            message.translations as Record<string, any>,
            hasLanguageFilter ? { languages: languageFilter } : undefined
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
              avatar: resolveParticipantAvatar(replySender),
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
            attachments: { select: attachmentForwardPreviewSelect, take: 1 }
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
                  avatar: resolveParticipantAvatar(original.sender as any),
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

      // ===== ENRICHIR LES RÉPONSES À UN POST (status/story/reel/post) =====
      // Source de vérité : le SNAPSHOT figé dans `metadata.postReplyTo`, capturé
      // au moment de la réponse — il survit à l'expiration du post (STATUS 1h /
      // STORY 21h) et à sa suppression. On le hisse en champ top-level
      // `postReplyTo` (contrat client propre). La résolution live de
      // `storyReplyToId` n'est qu'un fallback pour les messages legacy.
      for (const m of mappedMessages) {
        if (!m.storyReplyToId) continue;
        const fromSnapshot = postReplyToFromMetadata(m.metadata);
        if (fromSnapshot) m.postReplyTo = fromSnapshot;
      }

      const legacyPostReplyIds = mappedMessages
        .filter((m: any) => m.storyReplyToId && !m.postReplyTo)
        .map((m: any) => m.storyReplyToId as string);

      if (legacyPostReplyIds.length > 0) {
        const uniquePostIds = [...new Set(legacyPostReplyIds)];
        const citedPosts = await prisma.post.findMany({
          where: { id: { in: uniquePostIds } },
          select: POST_REPLY_SNAPSHOT_SELECT,
        });
        const postMap = new Map(citedPosts.map((p) => [p.id, p]));
        for (const m of mappedMessages) {
          if (!m.storyReplyToId || m.postReplyTo) continue;
          const post = postMap.get(m.storyReplyToId);
          if (!post) continue; // post supprimé sans snapshot → citation absente
          m.postReplyTo = buildPostReplyTo(post);
        }
      }

      // Marquer les messages comme "reçus" — EFFET DE BORD (statut de livraison
      // propagé aux autres participants via socket). La réponse (mappedMessages)
      // n'en dépend PAS. Déféré en fire-and-forget : l'awaiter ajoutait
      // 50-130ms à CHAQUE fetch de messages (l'endpoint le plus appelé).
      t0 = performance.now();
      if (messages.length > 0 && !authRequest.authContext.isAnonymous && currentParticipantId) {
        const participantIdForReceipt = currentParticipantId;
        void (async () => {
          try {
            const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
            const readStatusService = new MessageReadStatusService(prisma);
            await readStatusService.markMessagesAsReceived(participantIdForReceipt, conversationId);
          } catch (error) {
            logger.warn('Error marking messages as received:', error);
          }
        })();
      }
      timings.markAsReceived = performance.now() - t0; // ~0 : dispatch non-bloquant désormais

      // Construire les métadonnées de cursor pagination
      // When using cursor-based pagination (before), we fetched limit+1 rows.
      // If we got more than `limit`, there are definitely more messages.
      // Trim the extra row before returning to the client.
      let cursorHasMore: boolean;
      if (before && messages.length > limit) {
        cursorHasMore = true;
        messages.splice(limit); // trim to exactly `limit` rows
      } else {
        cursorHasMore = before ? false : messages.length === limit;
      }
      const lastMessageId = messages.length > 0 ? String((messages[messages.length - 1] as any).id) : null;
      const cursorPaginationMeta = {
        limit,
        hasMore: cursorHasMore,
        nextCursor: messages.length > 0 ? lastMessageId : null
      };

      // Format optimisé: data directement = Message[], meta pour userLanguage
      // Aligné avec MessagesListResponse de @meeshy/shared/types
      // Note: pagination offset-based uniquement pour les requêtes sans curseur.
      // Quand before/around est utilisé, seul cursorPagination est pertinent.
      // NOTE: Cannot use sendSuccess() — response includes top-level `cursorPagination`,
      // optional top-level `pagination`, and a `meta.userLanguage` field that iOS SDK
      // (MessagesListResponse / MessagesAPIResponse) and web parse at root level.
      // Migration to sendSuccess requires a coordinated client update (breaking change).
      const mentionContents = mappedMessages
        .map((m: any) => m.content as string)
        .filter(Boolean);
      const mentionedUsers = mentionContents.length > 0
        ? await resolveMentionedUsers(prisma, mentionContents)
        : [];

      const responsePayload: any = {
        success: true,
        data: mappedMessages,
        cursorPagination: cursorPaginationMeta,
        meta: {
          userLanguage: userPreferredLanguage,
          mentionedUsers
        }
      };

      if (!before && !isAroundMode && !afterMode) {
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

      // T15 — ETag + If-None-Match→304: don't re-send an unchanged message
      // page body. `sendWithETag` sets ETag + Cache-Control: private, no-cache
      // and short-circuits with a body-less 304 on a match. The ETag reflects
      // the filtered result, so it composes with the `after`/`before`/`around`
      // delta-sync modes without special handling.
      if (sendWithETag(request, reply, responsePayload)) return;
      reply.send(responsePayload);

    } catch (error) {
      const totalMs = Math.round(performance.now() - reqStart);
      logger.error(`Error fetching messages (after ${totalMs}ms)`, error);
      return sendInternalError(reply, 'Error retrieving messages');
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
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participant ID for this user
      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { id: true }
      });

      if (!currentParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      const unreadCount = await readStatusService.getUnreadCount(currentParticipant.id, conversationId);
      if (unreadCount === 0) {
        return sendSuccess(reply, { markedCount: 0 });
      }

      await readStatusService.markMessagesAsRead(currentParticipant.id, conversationId);
      await broadcastReadStatus(userId, currentParticipant.id, conversationId, 'read', authRequest.authContext.type === 'anonymous');

      return sendSuccess(reply, { markedCount: unreadCount });

    } catch (error) {
      logger.error('Error marking conversation as read', error);
      return sendInternalError(reply, 'Erreur lors du marquage des messages comme lus');
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
          clientMessageId: {
            type: 'string',
            description: 'Optional Phase 4 idempotency key, format cid_<uuid v4 lowercase>. Only clients needing dedup/sync send it.',
            pattern: '^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          },
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
          effectFlags: { type: 'integer', description: 'Bitfield for message effects' },
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
        return sendUnauthorized(reply, 'Authentification requise pour envoyer des messages');
      }

      const bodyResult = SendMessageBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message });
      }

      const { id } = request.params;
      const {
        content,
        clientMessageId,
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
        isViewOnce,
        maxViewOnceCount,
        mentionedUserIds
      } = bodyResult.data as SendMessageBody;

      // Resolve identifier (e.g. "meeshy") → ObjectId, same as GET route
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Compute effectFlags from legacy fields if not provided
      const { MESSAGE_EFFECT_FLAGS } = await import('@meeshy/shared/types/message-effect-flags');
      let effectFlags = (bodyResult.data as any).effectFlags ?? 0;
      if (isBlurred && !(effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED)) effectFlags |= MESSAGE_EFFECT_FLAGS.BLURRED;
      if (expiresAt && !(effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL)) effectFlags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
      if (isViewOnce && !(effectFlags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE)) effectFlags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

      const userId = authRequest.authContext.userId;
      let participantId: string;
      if (authRequest.authContext.isAnonymous) {
        participantId = authRequest.authContext.participantId!;
      } else {
        const participant = await prisma.participant.findFirst({
          where: { userId, conversationId, isActive: true },
          select: { id: true }
        });
        if (!participant) {
          return sendForbidden(reply, 'You are not a participant of this conversation');
        }
        participantId = participant.id;
      }

      if (!participantId) {
        return sendForbidden(reply, 'Participant identification failed');
      }

      // Block enforcement applies to DIRECT conversations only. Bidirectional:
      // reject if the sender blocked the other party OR the other party blocked
      // the sender. Anonymous senders (no userId) are not block-enforced.
      if (!authRequest.authContext.isAnonymous && userId) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            type: true,
            participants: {
              where: { isActive: true },
              select: { userId: true }
            }
          }
        });
        if (conversation && (conversation.type === 'direct' || conversation.type === 'dm')) {
          const otherMemberIds = conversation.participants
            .map(p => p.userId)
            .filter((memberId): memberId is string => memberId !== null && memberId !== userId);
          for (const otherId of otherMemberIds) {
            if (await isBlockedBetween(prisma, userId, otherId)) {
              return sendForbidden(reply, ErrorMessages[ErrorCode.USER_BLOCKED].en, {
                code: ErrorCode.USER_BLOCKED
              });
            }
          }
        }
      }

      const corr: Record<string, any> = {
        clientMessageId,
        conversationId,
        participantId,
        route: 'POST /conversations/:id/messages'
      };
      const routeStart = Date.now();
      logger.info('perf:http.message.post', {
        ...corr, step: 'http.message.post', phase: 'start'
      });

      // MessagingService unifié — instance partagée construite une seule fois
      const messagingService = getMessagingService();

      const messageRequest = {
        conversationId,
        content: content || '',
        clientMessageId,
        originalLanguage,
        messageType,
        replyToId,
        forwardedFromId,
        forwardedFromConversationId,
        mentionedUserIds,
        attachmentIds,
        isBlurred,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        effectFlags,
        isViewOnce,
        maxViewOnceCount,
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
        logger.info('perf:http.message.post', {
          ...corr, step: 'http.message.post', phase: 'end',
          durationMs: Date.now() - routeStart, success: false,
          error: result.error
        });
        return sendBadRequest(reply, result.error || 'Invalid message request');
      }

      // Broadcaster via socket (async) — SAUF sur un dedup idempotent.
      // Quand le même clientMessageId est renvoyé (ex: à la reconnexion, où
      // l'outbox SQLite ET le retry en mémoire drainent le même message), le
      // message existe déjà et a déjà été broadcasté au premier envoi. Re-broadcaster
      // `message:new` est ce qui dupliquait la bulle chez l'expéditeur (course
      // echo/reconcile) ET le récepteur. Le flag est posé in-process par
      // MessageProcessor.saveMessage (cf. §6.2 idempotence).
      if (socketIOHandler && result.data && !(result.data as { isDuplicate?: boolean }).isDuplicate) {
        const broadcastConvId = result.data.conversationId || conversationId;
        setImmediate(() => {
          socketIOHandler.broadcastMessage(result.data as any, broadcastConvId).catch((err: any) => {
            logger.error('⚠️ [REST] Socket broadcast failed', err);
          });
        });
      }

      logger.info('perf:http.message.post', {
        ...corr, step: 'http.message.post', phase: 'end',
        durationMs: Date.now() - routeStart, success: true,
        messageId: result.data?.id
      });

      return sendSuccess(reply, result.data);

    } catch (error) {
      logger.error('Error in REST send message:', error);
      return sendInternalError(reply, 'Erreur interne lors de l\'envoi du message');
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
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Résoudre userId → participantId (curseur = participantId)
      const membership = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { id: true }
      });

      if (!membership) {
        return sendForbidden(reply, 'Not a participant in this conversation');
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      const unreadCount = await readStatusService.getUnreadCount(membership.id, conversationId);
      await readStatusService.markMessagesAsRead(membership.id, conversationId);
      await broadcastReadStatus(userId, membership.id, conversationId, 'read', (request as UnifiedAuthRequest).authContext.type === 'anonymous');

      return sendSuccess(reply, { markedCount: unreadCount });
    } catch (error) {
      logger.error('Error marking conversation as read', error);
      return sendInternalError(reply, 'Erreur lors du marquage comme lu');
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
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participant ID for this user
      const currentParticipant = await prisma.participant.findFirst({
        where: { userId, conversationId, isActive: true },
        select: { id: true }
      });

      if (!currentParticipant) {
        return sendForbidden(reply, 'Participant not found in this conversation');
      }

      // Find the latest message in the conversation (not sent by the user)
      const latestMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: currentParticipant.id }
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
      return sendInternalError(reply, 'Error marking conversation as unread');
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
        fastify.socketIOHandler.getManager()?.getIO().to(`conversation:${conversationId}`).emit('message:pinned', {
          messageId,
          conversationId,
          pinnedAt: now.toISOString(),
          pinnedBy: userId
        });
      }

      return sendSuccess(reply, { pinnedAt: now.toISOString(), pinnedBy: userId });
    } catch (error) {
      logger.error('Error pinning message', error);
      return sendInternalError(reply, 'Error pinning message');
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
        fastify.socketIOHandler.getManager()?.getIO().to(`conversation:${conversationId}`).emit('message:unpinned', {
          messageId,
          conversationId
        });
      }

      return sendSuccess(reply, null);
    } catch (error) {
      logger.error('Error unpinning message', error);
      return sendInternalError(reply, 'Error unpinning message');
    }
  });


  // ============================================================================
  // LIST PINNED MESSAGES
  // ============================================================================

  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>('/conversations/:id/pinned-messages', {
    schema: {
      description: 'List all pinned messages in a conversation',
      tags: ['conversations', 'messages'],
      summary: 'List pinned messages',
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
          limit: { type: 'string', description: 'Max number of pinned messages to return', default: '50' },
          offset: { type: 'string', description: 'Offset for pagination', default: '0' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema }
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
      const { id } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const pinnedMessages = await prisma.message.findMany({
        where: {
          conversationId,
          pinnedAt: { not: null },
          deletedAt: null
        },
        orderBy: { pinnedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          originalLanguage: true,
          messageType: true,
          editedAt: true,
          deletedAt: true,
          replyToId: true,
          forwardedFromId: true,
          forwardedFromConversationId: true,
          pinnedAt: true,
          pinnedBy: true,
          isViewOnce: true,
          isBlurred: true,
          expiresAt: true,
          effectFlags: true,
          translations: true,
          createdAt: true,
          updatedAt: true,
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              type: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          attachments: true,
          _count: { select: { reactions: true, replies: true } }
        }
      });

      const total = await prisma.message.count({
        where: {
          conversationId,
          pinnedAt: { not: null },
          deletedAt: null
        }
      });

      const formattedMessages = pinnedMessages.map((message: any) => {
        const sender = message.sender;
        return {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          originalLanguage: message.originalLanguage,
          messageType: message.messageType,
          isEdited: !!message.editedAt,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,
          replyToId: message.replyToId,
          forwardedFromId: message.forwardedFromId,
          forwardedFromConversationId: message.forwardedFromConversationId,
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,
          isViewOnce: message.isViewOnce,
          isBlurred: message.isBlurred,
          expiresAt: message.expiresAt,
          effectFlags: message.effectFlags,
          translations: message.translations,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          sender: sender ? {
            id: sender.id,
            userId: sender.userId,
            displayName: sender.displayName ?? sender.user?.displayName ?? null,
            avatar: resolveParticipantAvatar(sender),
            type: sender.type,
            username: sender.user?.username ?? null,
            firstName: sender.user?.firstName ?? null,
            lastName: sender.user?.lastName ?? null,
            isOnline: sender.user?.isOnline ?? false
          } : null,
          attachments: message.attachments || [],
          reactionCount: message._count?.reactions ?? 0,
          replyCount: message._count?.replies ?? 0
        };
      });

      return sendSuccess(reply, formattedMessages, {
        pagination: { total, offset, limit, hasMore: offset + formattedMessages.length < total }
      });
    } catch (error) {
      logger.error('Error listing pinned messages', error);
      return sendInternalError(reply, 'Error listing pinned messages');
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
        fastify.socketIOHandler.getManager()?.getIO().to(`conversation:${conversationId}`).emit('message:consumed', {
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
      return sendInternalError(reply, 'Error consuming view-once message');
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
          // `sender` is a `Participant`, which has no `username`/`isOnline` of
          // its own — those live on the related `User`. Selecting `username`
          // directly on Participant throws PrismaClientValidationError and
          // 500s the whole search. Mirror the canonical message-sender select
          // (cf. pinned-messages route) and pull username via the `user`
          // relation; it is flattened back to the top level below so the
          // userMinimalSchema response serializer keeps it.
          select: {
            id: true,
            userId: true,
            displayName: true,
            avatar: true,
            type: true,
            user: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } }
          }
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

      // Transform translations JSON → array format for SDK compatibility and
      // flatten the participant `sender` (username/isOnline come from the nested
      // `user` relation) so the userMinimalSchema serializer keeps them.
      const mappedResults = results.map((msg: any) => {
        const sender = msg.sender;
        return {
          ...msg,
          sender: sender ? {
            id: sender.id,
            userId: sender.userId,
            displayName: sender.displayName ?? sender.user?.displayName ?? null,
            avatar: resolveParticipantAvatar(sender),
            username: sender.user?.username ?? null,
            isOnline: sender.user?.isOnline ?? false
          } : null,
          translations: msg.translations
            ? transformTranslationsToArray(msg.id, msg.translations as Record<string, any>)
            : undefined
        };
      });

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
      return sendInternalError(reply, 'Error searching messages');
    }
  });

}
