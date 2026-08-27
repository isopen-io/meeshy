import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { aggregateAttachmentReactions } from '../../socketio/serializeAttachmentForSocket';
import { broadcastReadStatus } from '../../socketio/broadcastReadStatus';
import { MessagingService } from '../../services/messaging/MessagingService';
import { recordViewOnceConsumption } from '../../services/messaging/recordViewOnceConsumption';
import { scheduleViewOnceBurn } from '../../services/messaging/scheduleViewOnceBurn';
import {
  buildPostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
} from '../../services/messaging/postReplySnapshot';
import { sharedPlaceFromMetadata, hoistLocationOnto } from '../../services/location/sharedPlace';
import { resolveForwardSourceGateForReader } from '../../services/preferences/forward-source-visibility.js';
import { redactForwardedAttachmentUrlsIn } from '../../services/preferences/forwarded-attachment-urls.js';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  applyHistoryFloor,
  historyFloorFor,
  historyReaderFromAuthContext,
  loadReaderHistoryFloor
} from '../../services/historyFloor';
import { attachmentMediaSelect, attachmentFullSelect, attachmentForwardPreviewSelect } from '../../services/attachments/attachmentIncludes';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveParticipantAvatar, resolveParticipantDisplayName, resolveAnonymousSenderIdentity } from '@meeshy/shared/utils/participant-helpers';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  loadPersonalHistoryHiding,
  applyPersonalHistoryHiding,
  NO_PERSONAL_HIDING
} from '../../services/personalHistoryFilter';
import { MarkReadBodySchema } from '../../validation/messages-schemas';
import { UnifiedAuthRequest, createUnifiedAuthMiddleware } from '../../middleware/auth';
import { validatePagination, buildPaginationMeta, buildCursorPaginationMeta } from '../../utils/pagination';
import { messageValidationHook } from '../../middleware/rate-limiter';
import { MESSAGE_LIMITS } from '../../config/message-limits';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
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
import { ConversationBridgeService } from '../../services/ConversationBridgeService';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';

import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';

// Mirrors the cursor-advance freshness guard in MessageReadStatusService. It
// orders by the message's `createdAt` (millisecond precision, stable across
// gateway processes); ObjectId hex order is only second-accurate and its next 5
// bytes are per-process random, so it can invert real recency for same-second
// messages from different nodes. The ObjectId comparison is kept only as a
// fallback for legacy cursors written before `lastReadMessageCreatedAt` existed.
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
function isStaleCursorMessageId(params: {
  candidateMessageId: string;
  candidateCreatedAt: Date;
  cursorMessageId: string | null | undefined;
  cursorMessageCreatedAt: Date | null | undefined;
}): boolean {
  const { candidateMessageId, candidateCreatedAt, cursorMessageId, cursorMessageCreatedAt } = params;
  if (!cursorMessageId) return false;
  if (cursorMessageCreatedAt) {
    return candidateCreatedAt < cursorMessageCreatedAt;
  }
  if (!OBJECT_ID_RE.test(candidateMessageId) || !OBJECT_ID_RE.test(cursorMessageId)) {
    return false;
  }
  return candidateMessageId.toLowerCase() < cursorMessageId.toLowerCase();
}

// Le fragment vit dans `utils/message-sender-select.ts` (partagé avec le delta
// `/sync`, qui ne peut pas importer ce module de routes) et reste ré-exporté ici
// pour les appelants historiques.
import { messageSenderUserSelect } from './utils/message-sender-select';
import {
  ENCRYPTION_ENVELOPE_SHAPE,
  noSilentDowngrade,
  NO_SILENT_DOWNGRADE_ISSUE,
  toEncryptedPayload,
} from '../../validation/encryption-envelope.js';
import { MENTIONED_USER_IDS_SHAPE } from '../../validation/mention-list.js';
export { messageSenderUserSelect };

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
  // Diffusion à plusieurs destinataires (PAS un transfert) : copie SERVEUR
  // des pièces jointes du message désigné vers celui-ci, mêmes fichiers,
  // sans `forwardedFromId` ni marque de transfert sur les copies. Voir
  // `services/messaging/copyAttachments.ts`.
  copyAttachmentsFromMessageId: z.string().optional(),
  // Enveloppe de chiffrement — déclarée dans `validation/encryption-envelope.ts`.
  // Elle vivait ICI, et ici seulement : le transport SOCKET, pourtant le chemin
  // d'envoi PRIMAIRE, n'en portait aucun champ et perdait donc tout chiffré.
  // Les deux transports lisent désormais la même déclaration.
  ...ENCRYPTION_ENVELOPE_SHAPE,
  // Même plafond que le schéma socket et que `MessageValidator` — ce tableau
  // n'était borné nulle part sur le chemin REST.
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
  // Liste explicite de mentionnés — déclarée dans `validation/mention-list.ts`,
  // la MÊME que celle des deux schémas socket. Elle vivait ici seule ; le
  // transport SOCKET, qui porte le trafic, la strippait.
  ...MENTIONED_USER_IDS_SHAPE,
  // Lieu partagé — champ dédié, JAMAIS un `metadata` brut (cf.
  // services/location/sharedPlace.ts). Validation stricte déléguée à
  // `parseSharedPlace`, appelé côté `MessageProcessor.saveMessage`.
  location: z.unknown().optional(),
}).refine(
  (data) =>
    (data.content?.trim().length ?? 0) > 0 ||
    (data.attachmentIds?.length ?? 0) > 0 ||
    Boolean(data.forwardedFromId) ||
    Boolean(data.copyAttachmentsFromMessageId) ||
    Boolean(data.encryptedContent),
  { message: 'Le message ne peut pas être vide', path: ['content'] },
).refine(noSilentDowngrade, NO_SILENT_DOWNGRADE_ISSUE);
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
// Logger dédié pour messages
const logger = enhancedLogger.child({ module: 'messages' });

// Présence de l'EXPÉDITEUR sur une charge servie PAR DESTINATAIRE (liste,
// épinglés, recherche) : le viewer est connu, donc la loi descend pour LUI —
// `resolveForTargets(viewer, ids)` — et le sort d'une entrée ABSENTE (expéditeur
// SANS COMPTE, ou inscrit non résolu) est UN site, `presenceMissingEntryPolicy`
// (presence-gate) : masqué, sauf viewer ADMIN/BIGBOSS.

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
 * Enregistre les routes de base de gestion des messages (GET, POST, mark-read, mark-unread)
 */
export function registerMessagesRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  // Authentification des routes de LECTURE (mark-read / read / mark-unread).
  //
  // `requiredAuth` porte `allowAnonymous: false` et sert tout le reste de ce
  // fichier ; le suivi de lecture est la seule famille qui ne peut pas
  // l'accepter. Un invité de lien partagé lit la conversation (`optionalAuth`
  // sur le GET), y envoie des messages (`optionalAuth` sur le POST) et y réagit
  // (`routes/reactions.ts`), mais se voyait refuser la seule opération qui
  // REMET SON BADGE À ZÉRO — et le serveur lui pousse pourtant ce badge
  // (`emitUnreadCountsToRecipients`, `ROOMS.user(userId ?? id)`). Son compteur
  // ne pouvait donc que monter.
  //
  // `requireAuth: true` reste : c'est « authentifié, avec ou sans compte », pas
  // `optionalAuth` (`requireAuth: false`), qui laisserait passer un appelant
  // sans jeton du tout. Le curseur de lecture est indexé sur `Participant.id`
  // depuis toujours : rien en aval ne suppose un `User`.
  const participantAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true
  });

  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);
  const socketIOHandler = fastify.socketIOHandler;
  const privacyPreferencesService = new PrivacyPreferencesService(prisma);
  // G-123 — cf. la même attache aux trois portes de `routes/message-read-status.ts`.
  const bridgeService = new ConversationBridgeService(prisma);

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
          include_status: { type: 'string', enum: ['true', 'false'], description: 'Accepté pour compatibilité, sans effet. Les accusés NOMINATIFS par participant ne sont pas servis par cette liste — `messageSchema` ne les déclare pas, donc fast-json-stringify les a toujours retirés, et les charger revenait à payer une relation par page pour un tableau jeté. Les coches se peignent avec les compteurs agrégés déjà présents sur chaque message (deliveredCount / readCount / recipientCount), qui appliquent le gate showReadReceipts. Pour le détail nominatif, utiliser GET /conversations/:id/statuses, qui applique ce même gate.' },
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
            cursorPagination: {
              type: 'object',
              description: 'Cursor pagination metadata (always present; authoritative for before/around modes). Must stay declared: fast-json-stringify strips undeclared fields, which silently killed client infinite scroll.',
              properties: {
                limit: { type: 'integer', description: 'Page size limit' },
                hasMore: { type: 'boolean', description: 'Whether a further page exists — older messages in backward/around modes, newer ones in forward `after` mode' },
                nextCursor: { type: ['string', 'null'], description: 'Message id to pass as `before` for the next page. Null when the page is empty, and always null in forward `after` mode: that mode resumes from the client-held `createdAt` watermark, never from a backward id cursor.' }
              }
            },
            hasNewer: { type: 'boolean', description: 'Around mode only: whether messages newer than the returned window exist' },
            meta: {
              type: 'object',
              description: 'Response metadata',
              properties: {
                userLanguage: { type: 'string', description: 'User preferred language for translations' },
                mentionedUsers: {
                  type: 'array',
                  description: 'Users @-mentioned in the returned messages',
                  items: {
                    type: 'object',
                    properties: {
                      userId: { type: 'string' },
                      username: { type: 'string' },
                      displayName: { type: ['string', 'null'] },
                      avatar: { type: ['string', 'null'] }
                    }
                  }
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
        include_replies: includeRepliesStr = 'true',
        languages: languagesStr
      } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Parser les paramètres optionnels d'inclusion
      const includeReactions = includeReactionsStr === 'true';
      const includeTranslations = includeTranslationsStr === 'true';
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

      // Ce que CE lecteur a retiré de sa propre vue : le curseur `clear-history`
      // de la conversation et ses `delete-for-me` message par message. Lancé
      // ICI, avant la résolution du participant, et attendu seulement au moment
      // de bâtir la clause — il ne dépend d'aucune des requêtes qui suivent, et
      // les recouvrir lui fait coûter zéro aller-retour sur le chemin le plus
      // chaud du service. Appliqué ensuite à TOUTES les requêtes de cette route
      // (page, COUNT total, sous-requêtes du mode `around`, compteurs
      // older/newer) : un seul oubli suffirait à faire réapparaître un message
      // masqué, soit dans la liste, soit dans un compteur qui promet une page
      // de plus.
      // Le `.catch` n'est pas redondant avec le try/catch interne du module :
      // entre cette ligne et son `await` il y a des `return` (lien de partage
      // expiré, quota atteint) après lesquels cette promesse n'est plus
      // attendue. « Le callee avale ses erreurs » est une propriété du
      // collaborateur, pas une garantie du site d'appel — cf. `tasks/lessons.md`
      // § Leçon 230.
      const personalHidingPromise = loadPersonalHistoryHiding(prisma, {
        userId: isAnonymousUser ? null : userId,
        conversationId
      }).catch(() => NO_PERSONAL_HIDING);
      const currentParticipant = !isAnonymousUser && userId
        ? await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
          })
        : null;

      // For anonymous users, also fetch joinedAt and shareLinkId
      const anonymousParticipant = isAnonymousUser && authRequest.authContext.participantId
        ? await prisma.participant.findFirst({
            where: { id: authRequest.authContext.participantId },
            select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
          })
        : null;

      timings.resolveParticipant = performance.now() - t0;
      const currentParticipantId = isAnonymousUser
        ? authRequest.authContext.participantId
        : currentParticipant?.id;

      // Le lien de partage répond ici à DEUX questions distinctes sur la même
      // ligne : la PORTE (lien expiré, quota atteint → 403) et le PLANCHER de
      // lecture. Elles restent séparées — la décision de réponse appartient à
      // la route, le plancher est rendu par `historyFloorFor`, qui l'énonce
      // aussi pour `/sync` (forme ensembliste) et pour la galerie de médias.
      // Un seul aller-retour : le module ne charge rien, cette route lit déjà
      // la ligne pour les colonnes de la porte.
      const participant = isAnonymousUser ? anonymousParticipant : currentParticipant;
      const shareLink = participant?.shareLinkId
        ? await prisma.conversationShareLink.findFirst({
            where: { id: participant.shareLinkId },
            select: { allowViewHistory: true, expiresAt: true, maxUses: true, currentUses: true }
          })
        : null;
      if (shareLink) {
        if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
          return sendForbidden(reply, 'This share link has expired', { code: 'SHARE_LINK_EXPIRED' });
        }
        if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
          return sendForbidden(reply, 'This share link has reached its usage limit', { code: 'SHARE_LINK_MAX_USES' });
        }
      }
      // Le plancher vaut pour TOUT participant, lien ou non : un membre ajouté
      // après coup, un inscrit dans le salon global, un octroi par date d'un
      // administrateur — la ligne participant porte la réponse, le lien n'est
      // que son dernier repli.
      const historyStartDate: Date | null = participant ? historyFloorFor(participant, shareLink) : null;

      t0 = performance.now();
      const personalHiding = await personalHidingPromise;
      timings.personalHiding = performance.now() - t0;

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
        // La cible n'entre dans la fenêtre que si elle est LISIBLE : sous le
        // plancher, `around` se comporte comme un id inconnu.
        const aroundMessage = await prisma.message.findFirst({
          where: applyHistoryFloor({ id: around, conversationId }, historyStartDate),
          select: { createdAt: true }
        });

        if (aroundMessage) {
          // Get half before and half after the target message
          const halfLimit = Math.floor(limit / 2);

          const beforeFilter: any = { lt: aroundMessage.createdAt };
          if (historyStartDate) beforeFilter.gte = historyStartDate;

          // Les deux moitiés sont filtrées ICI et pas seulement à la fin : sans
          // cela, `take: halfLimit` remplirait sa moitié de messages masqués
          // que la soustraction finale retirerait, et la fenêtre `around`
          // rendrait moins de messages que demandé sans jamais le dire.
          const [messagesBefore, messagesAfter] = await Promise.all([
            prisma.message.findMany({
              where: applyPersonalHistoryHiding(
                { conversationId, deletedAt: null, createdAt: beforeFilter },
                personalHiding
              ),
              orderBy: { createdAt: 'desc' },
              take: halfLimit,
              select: { id: true }
            }),
            prisma.message.findMany({
              where: applyPersonalHistoryHiding(
                { conversationId, deletedAt: null, createdAt: { gt: aroundMessage.createdAt } },
                personalHiding
              ),
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
          // Remove any createdAt filter since we're using id-based filtering —
          // sauf le plancher, qui ne se retire jamais d'une lecture.
          delete whereClause.createdAt;
          if (historyStartDate) whereClause.createdAt = { gte: historyStartDate };
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

        // ===== STATUTS AGRÉGÉS =====
        // Aucune colonne dénormalisée n'est lue ici : les cinq
        // (`deliveredToAllAt`, `receivedByAllAt`, `readByAllAt`,
        // `deliveredCount`, `readCount`) ont perdu leur écrivain quand le suivi
        // est passé aux curseurs — `updateMessageComputedStatus` est un no-op
        // assumé. Tout le bloc de statut vient de
        // `MessageReadStatusService.getConversationReadStatuses`.

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
            // Identité humaine d'un auteur SANS COMPTE : le nom donné au
            // formulaire d'entrée vit dans le profil de session. Jamais servi
            // brut (email/birthday) — résolu puis détruit au formatage.
            anonymousSession: { select: { profile: true } },
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
            // Lot 2 : le message CITÉ est un objet imbriqué, pas la racine —
            // le hoist doit porter sur `replyTo` lui-même, pas seulement sur
            // le message qui cite.
            metadata: true,
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
      const personalWhereClause = applyPersonalHistoryHiding(whereClause, personalHiding);

      const [totalCount, messages, userPrefs] = await Promise.all([
        // 1. Compter le total des messages (pour pagination) - skip when using cursor, around, or forward watermark
        (before || isAroundMode || afterMode)
          ? Promise.resolve(0)
          : prisma.message.count({
              where: applyPersonalHistoryHiding(
                applyHistoryFloor({ conversationId: conversationId, deletedAt: null }, historyStartDate),
                personalHiding
              )
            }),
        // 2. Récupérer les messages avec toutes les relations
        prisma.message.findMany({
          where: personalWhereClause,
          select: messageSelect,
          // Forward watermark backfill returns oldest-after-watermark first so
          // the client can advance its high-water mark contiguously; all other
          // modes return newest-first.
          orderBy: { createdAt: afterMode ? 'asc' : 'desc' },
          // Cursor reads (before / after): fetch limit+1 to MEASURE hasMore
          // without an extra COUNT query. The probe row is trimmed before
          // returning to the client. `after` was sized to `limit` and inferred
          // hasMore from `length === limit`, which cannot tell an exactly-full
          // FINAL page from a truncated one — every backfill that landed on the
          // boundary claimed more and cost the client a round trip to disprove.
          take: (before || isAroundMode || afterMode) ? limit + 1 : limit,
          skip: (before || isAroundMode || afterMode) ? 0 : offset
        }),
        // 3. Récupérer les préférences linguistiques (si authentifié)
        shouldFetchUserPrefs
          ? prisma.user.findFirst({
              where: { id: userId },
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true,
                deviceLocale: true
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
        ? resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })
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

      // Enrichir les messages avec les vrais statuts de lecture.
      // Les champs dénormalisés en base (`deliveredCount`, `readCount`) n'ont
      // AUCUN écrivain : ils valent toujours zéro. Le comptage vit dans
      // `MessageReadStatusService.getConversationReadStatuses`, l'unique
      // source de vérité partagée avec les trois autres lecteurs d'accusés
      // (`getMessageReadStatus`, `getMessageStatusDetails`,
      // `getLatestMessageSummary`). Cette route en tenait une COPIE, qui avait
      // dérivé sur un point décisif : elle ne consultait pas la préférence
      // `showReadReceipts`, si bien que le rattrapage REST révélait à
      // l'expéditeur la lecture d'un destinataire qui l'avait explicitement
      // tue — et comptait ce même destinataire dans le dénominateur, que le
      // canal socket en retire.
      const readStatusMap = new Map<string, {
        deliveredCount: number;
        readCount: number;
        recipientCount: number;
        deliveredToAllAt: Date | null;
        readByAllAt: Date | null;
      }>();
      if (messages.length > 0 && authRequest.authContext?.userId) {
        try {
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
          const readStatusService = new MessageReadStatusService(prisma);
          const statuses = await readStatusService.getConversationReadStatuses(
            conversationId,
            (messages as any[]).map((m: any) => m.id)
          );
          for (const [messageId, status] of statuses) {
            readStatusMap.set(messageId, {
              deliveredCount: status.receivedCount,
              readCount: status.readCount,
              // Dénominateur all-or-nothing faisant autorité : les
              // destinataires actifs, expéditeur exclu, opt-out exclus. Permet
              // au client d'allumer ✓✓ / « lu » sur le compte réel du serveur
              // plutôt que sur un `memberCount` local périmé.
              recipientCount: status.totalMembers,
              // Les DATES du même seuil, dérivées de la même union — l'instant
              // du DERNIER destinataire servi, `null` tant qu'il en manque un.
              deliveredToAllAt: status.deliveredToAllAt,
              readByAllAt: status.readByAllAt,
            });
          }
        } catch (err) {
          logger.warn('[CONVERSATIONS] Failed to compute read statuses:', err);
        }
      }

      // Présence des expéditeurs : régime STRICT (2026-08-25) — self/ADMIN+/
      // ami seuls, jamais la seule co-participation.
      const listPresenceViewer = viewerFromRequest(request);
      const listMissingEntry = presenceMissingEntryPolicy(listPresenceViewer);
      const senderPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        listPresenceViewer,
        messages
          .map((message: any) => message.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

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

          // Statuts agrégés — CALCULÉS, jamais lus de la ligne Message : ses
          // champs `deliveredCount`/`readCount` n'ont aucun écrivain et valent
          // toujours zéro. Les garder en repli donnait à un compteur mort
          // l'apparence d'une valeur de secours.
          //
          // Les DATES du seuil « tous servis » avaient gardé ce repli une
          // couche de plus : `deliveredToAllAt`/`readByAllAt` sortaient encore
          // de la ligne, donc valaient `null` en permanence — et les trois
          // clients lisent `readByAllAt != null` comme la PREUVE que tous les
          // destinataires ont lu (`DeliveryStatusResolver`, iOS et Android).
          // `receivedByAllAt`, lui, n'avait aucun lecteur nulle part : il sort.
          deliveredToAllAt: readStatusMap.get(message.id)?.deliveredToAllAt ?? null,
          readByAllAt: readStatusMap.get(message.id)?.readByAllAt ?? null,
          deliveredCount: readStatusMap.get(message.id)?.deliveredCount ?? 0,
          readCount: readStatusMap.get(message.id)?.readCount ?? 0,
          // Dénominateur des destinataires actifs faisant autorité côté serveur
          // (participants moins l'expéditeur, opt-out retirés). `0` quand rien
          // n'a été calculé (pas de contexte d'authentification) — le client
          // retombe alors sur son compte de membres local.
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
          sender: message.sender ? (() => {
            // PII : le profil de session (email/birthday) ne sort JAMAIS — on
            // en résout l'identité puis on le détruit avant le spread.
            const { anonymousSession: _anonymousSession, ...senderData } = message.sender;
            const anonymousIdentity = message.sender.type === 'anonymous'
              ? resolveAnonymousSenderIdentity(message.sender)
              : null;
            return applyPresenceVisibilityAsOffline(
              {
                ...senderData,
                username: anonymousIdentity?.username
                  ?? message.sender.user?.username ?? message.sender.username ?? null,
                // T16 — firstName/lastName were serialized but read by no client and
                // are no longer fetched (messageSenderUserSelect trims them).
                // Auteur sans compte : le nom DONNÉ au formulaire prime, le pseudo
                // ano_ descend en handle (`username` ci-dessus).
                displayName: anonymousIdentity && anonymousIdentity.displayName
                  ? anonymousIdentity.displayName
                  : resolveParticipantDisplayName(message.sender),
                avatar: resolveParticipantAvatar(message.sender),
                isOnline: message.sender.user?.isOnline ?? message.sender.isOnline ?? null,
                lastActiveAt: message.sender.user?.lastActiveAt ?? message.sender.lastActiveAt ?? null,
              },
              message.sender.userId ? senderPresenceVis.get(message.sender.userId) : undefined,
              { onMissingEntry: listMissingEntry },
            );
          })() : null,
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
        if (includeReplies && message.replyTo) {
          const replySender = (message as any).replyTo.sender;
          // Lot 2 : hoistLocationOnto hisse metadata.location du message CITÉ
          // — sans lui, une citation d'un message géolocalisé n'affiche
          // jamais sa position, même si la liste principale la restitue.
          mappedMessage.replyTo = hoistLocationOnto({
            ...message.replyTo,
            originalLanguage: message.replyTo.originalLanguage || 'fr',
            sender: replySender ? {
              ...replySender,
              username: replySender.user?.username ?? replySender.username ?? null,
              displayName: resolveParticipantDisplayName(replySender),
              avatar: resolveParticipantAvatar(replySender),
            } : null,
          });
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

        // Réciprocité de la SOURCE : elle n'est enrichie que si l'auteur du
        // transfert ET le lecteur l'autorisent. Résolue AVANT la construction,
        // pas après : ce qui n'est pas construit ne peut pas fuiter, alors
        // qu'un objet construit puis « filtré » n'attend qu'un chemin de
        // sortie oublié. L'auteur du transfert est l'expéditeur du message
        // PORTEUR — ses préférences sont déjà chaudes dans le cache module,
        // la liste ayant lu celles de tous les expéditeurs de la page.
        const forwardSourceGate = await resolveForwardSourceGateForReader(
          prisma,
          userId,
          // Les DEUX porteurs, pas seulement `forwardedFromId` : un message
          // qui ne nomme que sa conversation source a lui aussi un auteur dont
          // la volonté compte, et c'est justement le NOM DE GROUPE que la
          // directive ajoute à la portée de la règle.
          mappedMessages
            .filter((m: any) => m.forwardedFromId || m.forwardedFromConversationId)
            .map((m: any) => m.sender?.userId ?? null)
        );

        const forwardedMessages = await prisma.message.findMany({
          where: { id: { in: uniqueForwardedIds } },
          select: {
            id: true,
            content: true,
            senderId: true,
            conversationId: true,
            messageType: true,
            createdAt: true,
            // Lot 2 : le message d'ORIGINE transféré est un objet imbriqué —
            // sans `metadata`, un message géolocalisé transféré n'affiche
            // jamais sa position dans l'aperçu de transfert.
            metadata: true,
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
          // Les DEUX objets nommants tombent ensemble ou pas du tout : les
          // trois politiques clientes nomment le groupe à partir du seul
          // `forwardedFromConversation` et l'auteur d'origine à partir du seul
          // `forwardedFrom.sender`. N'en taire qu'un laisse l'autre nommer.
          if (!forwardSourceGate(msg.sender?.userId ?? null)) {
            // Taire le NOM ne suffit pas : la copie de transfert réutilise le
            // chemin de stockage de l'original, qui porte le `User.id` de son
            // auteur. La même réponse livrait l'identité qu'elle refusait de
            // nommer. Les pièces jointes passent donc à l'adressage par
            // identifiant — mêmes octets, même autorisation, aucun chemin.
            msg.attachments = redactForwardedAttachmentUrlsIn(msg.attachments);
            continue;
          }
          if (msg.forwardedFromId) {
            const original = forwardedMap.get(msg.forwardedFromId);
            if (original) {
              // Lot 2 : la position du message TRANSFÉRÉ (l'objet imbriqué),
              // pas celle de `msg` lui-même — sans elle, un message transféré
              // géolocalisé n'affiche jamais sa position dans l'aperçu.
              const forwardedPlace = sharedPlaceFromMetadata((original as { metadata?: unknown }).metadata);
              msg.forwardedFrom = {
                id: original.id,
                content: original.content,
                messageType: original.messageType,
                createdAt: original.createdAt,
                sender: original.sender ? {
                  ...original.sender,
                  username: (original.sender as any).user?.username ?? (original.sender as any).username ?? null,
                  displayName: resolveParticipantDisplayName(original.sender as any),
                  avatar: resolveParticipantAvatar(original.sender as any),
                } : null,
                attachments: original.attachments,
                ...(forwardedPlace ? { location: forwardedPlace } : {}),
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

      // Lieu partagé : hisser `metadata.location` en top-level `location` —
      // même miroir que `postReplyTo` ci-dessus, mais sur TOUT message
      // (contrairement à postReplyTo, indépendant de `storyReplyToId`).
      for (const m of mappedMessages) {
        const place = sharedPlaceFromMetadata(m.metadata);
        if (place) m.location = place;
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
      // Cursor reads (before / after) fetched limit+1 rows. More than `limit`
      // back means the probe row exists and there IS more; trim it away.
      const isProbedRead = Boolean(before) || afterMode;
      let cursorHasMore: boolean;
      if (isProbedRead && messages.length > limit) {
        cursorHasMore = true;
        // Trim BOTH arrays: `messages` feeds the cursor meta below, but the
        // client receives `mappedMessages` (built before this block) — only
        // trimming `messages` shipped limit+1 rows to the client.
        messages.splice(limit);
        mappedMessages.splice(limit);
      } else {
        cursorHasMore = isProbedRead ? false : messages.length === limit;
      }
      // `nextCursor` is a message id the client passes back as `before` — a
      // BACKWARD cursor. A forward-watermark page is ASCENDING, so its last row
      // is the NEWEST one: handing it over under that contract pointed the
      // client at everything OLDER than the page it had just consumed, and a
      // client following the cursor generically would re-read the history
      // instead of advancing. Forward reads resume from the `after` watermark,
      // which the client already holds — there is no `before` continuation to
      // publish, and claiming one was the lie.
      const lastMessageId = messages.length > 0 ? String((messages[messages.length - 1] as any).id) : null;
      const cursorPaginationMeta = {
        limit,
        hasMore: cursorHasMore,
        nextCursor: afterMode ? null : lastMessageId
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
            where: applyPersonalHistoryHiding(
              applyHistoryFloor(
                { conversationId, deletedAt: null, createdAt: { lt: new Date(firstMsg.createdAt) } },
                historyStartDate
              ),
              personalHiding
            )
          });
          responsePayload.cursorPagination.hasMore = olderCount > 0;
        }
        if (lastMsg) {
          // #3893 point 4 : seul agrégat de cette route sans le plancher
          // appliqué EXPLICITEMENT — sûr aujourd'hui car son prédicat `gt`
          // dérive d'un message déjà borné (`lastMsg` a lui-même passé le
          // plancher), mais c'est le seul des quatre agrégats à ne pas passer
          // par `applyHistoryFloor`, sur une route dont le commentaire dit
          // explicitement « un seul oubli suffirait ». Même patron que
          // `olderCount` ci-dessus.
          const newerCount = await prisma.message.count({
            where: applyPersonalHistoryHiding(
              applyHistoryFloor(
                { conversationId, deletedAt: null, createdAt: { gt: new Date(lastMsg.createdAt) } },
                historyStartDate
              ),
              personalHiding
            )
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
    preValidation: [participantAuth]
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
      const currentParticipant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!currentParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      // Corps absent = client déjà distribué → repli fenêtre (surtout pas un
      // lot vide, qui ne figerait rien et perdrait la lecture).
      let reportedMessageIds: readonly string[] | undefined;
      let reportedLanguage: string | undefined;
      let reportedMessageLanguages: Readonly<Record<string, string>> | undefined;
      let caughtUpToMessageId: string | undefined;
      if (request.body !== undefined && request.body !== null) {
        const bodyResult = MarkReadBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return sendBadRequest(reply, 'Corps de requête invalide pour le marquage de lecture');
        }
        reportedMessageIds = bodyResult.data.messageIds;
        reportedLanguage = bodyResult.data.language;
        reportedMessageLanguages = bodyResult.data.messageLanguages;
        caughtUpToMessageId = bodyResult.data.caughtUpToMessageId;
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      const unreadCount = await readStatusService.getUnreadCount(currentParticipant.id, conversationId);
      // Le raccourci « 0 non-lu → ne rien faire » ne vaut que SANS ids
      // rapportés : le curseur peut buter sur un trou et annoncer 0 alors que
      // le client vient d'afficher des messages situés après ce trou.
      if (unreadCount === 0 && !reportedMessageIds && !caughtUpToMessageId) {
        // Le raccourci ne doit pas sauter la cascade notifications : une
        // réaction/mention arrivée sur un message déjà lu a créé une
        // notification alors que le compteur de messages est resté à 0.
        Promise.resolve(
          fastify.notificationService?.markConversationNotificationsAsRead?.(userId, conversationId)
        ).catch(() => {});
        return sendSuccess(reply, { markedCount: 0 });
      }

      // `markedCount` compte ce qui a RÉELLEMENT été figé. Le nombre d'ids
      // rapportés sur-compterait (certains étaient déjà lus) et le compteur de
      // non-lus inclurait des messages jamais rapportés.
      const frozenCount = await readStatusService.markMessagesAsRead(
        currentParticipant.id,
        conversationId,
        undefined,
        reportedMessageIds || reportedLanguage || reportedMessageLanguages || caughtUpToMessageId
          ? {
              messageIds: reportedMessageIds,
              language: reportedLanguage,
              messageLanguages: reportedMessageLanguages,
              caughtUpToMessageId
            }
          : undefined
      );
      // La troisième copie de ce fan-out vivait ici, en fermeture, et avait
      // dérivé comme les autres. Une seule forme désormais : c'est elle qui
      // consulte la préférence d'accusés, découpe le payload des pairs de celui
      // de l'acteur, et recale le badge sur les DEUX branches de la préférence.
      try {
        await broadcastReadStatus(
          {
            io: socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: currentParticipant.id,
            userId,
            isAnonymous: authRequest.authContext.type === 'anonymous',
            type: 'read'
          }
        );
      } catch (error) {
        logger.error('Error broadcasting read status:', error);
      }

      return sendSuccess(reply, { markedCount: reportedMessageIds ? frozenCount : unreadCount });

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
          encryptedContent: {
            type: 'string',
            description: 'Ciphertext. Its presence is what makes the message encrypted — a body carrying only this field is a valid message.'
          },
          encryptionMode: {
            type: 'string',
            enum: ['e2ee', 'server', 'hybrid'],
            description: 'Encryption mode. Case-insensitive on input, normalised lowercase. Defaults to e2ee when encryptedContent is present.'
          },
          encryptionMetadata: { type: 'object', description: 'Encryption metadata' },
          isEncrypted: {
            type: 'boolean',
            description: 'Optional echo of the encryption fact. When true, encryptedContent is REQUIRED — the server never downgrades a message declared encrypted to plaintext.'
          },
          attachmentIds: { type: 'array', items: { type: 'string' }, maxItems: MAX_ATTACHMENTS_PER_MESSAGE, description: 'IDs des attachments pré-uploadés' },
          isBlurred: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
          effectFlags: { type: 'integer', description: 'Bitfield for message effects' },
          mentionedUserIds: { type: 'array', items: { type: 'string' } },
          location: {
            type: 'object',
            additionalProperties: true,
            description: 'Lieu partagé (latitude, longitude, name?, address?, category?) — validé serveur',
          }
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
        copyAttachmentsFromMessageId,
        encryptedContent,
        encryptionMode,
        encryptionMetadata,
        attachmentIds,
        isBlurred,
        expiresAt,
        isViewOnce,
        maxViewOnceCount,
        mentionedUserIds,
        location
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
        copyAttachmentsFromMessageId,
        mentionedUserIds,
        attachmentIds,
        isBlurred,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        effectFlags,
        isViewOnce,
        maxViewOnceCount,
        // Lieu partagé — champ dédié transmis tel quel ; validé et écrit
        // dans `metadata.location` par `MessageProcessor.saveMessage`.
        location,
        // Le FAIT du chiffrement, c'est la présence du chiffré — pas un booléen
        // posé à côté. Gater sur `isEncrypted` perdait dans les DEUX sens : un
        // chiffré sans le drapeau était jeté (alors que le `.refine()` ci-dessus
        // le compte comme porteur de contenu), et le drapeau sans le chiffré
        // faisait mentir le `!` puis écrivait le message EN CLAIR. Le schéma
        // refuse désormais le second cas ; ici on sert le premier.
        encryptedPayload: toEncryptedPayload({ encryptedContent, encryptionMode, encryptionMetadata }),
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
    preValidation: [participantAuth]
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

      // Résoudre l'appelant → participantId (curseur = participantId)
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Not a participant in this conversation');
      }

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      const unreadCount = await readStatusService.getUnreadCount(membership.id, conversationId);
      await readStatusService.markMessagesAsRead(membership.id, conversationId);
      try {
        await broadcastReadStatus(
          {
            io: socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: membership.id,
            userId,
            isAnonymous: (request as UnifiedAuthRequest).authContext.type === 'anonymous',
            type: 'read'
          }
        );
      } catch (error) {
        logger.error('Error broadcasting read status:', error);
      }

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
    preValidation: [participantAuth]
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
      const currentParticipant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

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
        select: { id: true, createdAt: true }
      });

      // Le participant a déjà été résolu en tête de ce handler — la seconde
      // requête ne faisait que reposer la même question à la même base, avec la
      // copie de la règle d'identité qui oubliait les invités de lien partagé.
      const participantForCursor = currentParticipant;

      // Guard against a race with a concurrent, fresher read: another device
      // may have read a message newer than `latestMessage` between our read
      // above and this write. Without this check the unconditional upsert
      // below would roll the cursor backward past that fresher read,
      // resurrecting already-read messages as unread (mirrors the
      // isStaleCursorMessageId guard in MessageReadStatusService.markMessagesAsRead).
      const currentCursor = await prisma.conversationReadCursor.findUnique({
        where: {
          conversation_participant_cursor: { participantId: participantForCursor.id, conversationId }
        },
        select: { lastReadMessageId: true, lastReadMessageCreatedAt: true }
      });

      if (isStaleCursorMessageId({
        candidateMessageId: latestMessage.id,
        candidateCreatedAt: latestMessage.createdAt,
        cursorMessageId: currentCursor?.lastReadMessageId,
        cursorMessageCreatedAt: currentCursor?.lastReadMessageCreatedAt
      })) {
        logger.info(
          `[MARK-UNREAD] Ignoring stale mark-unread for user ${userId} in conversation ${conversationId}: cursor already advanced past message ${latestMessage.id}`
        );
        return sendSuccess(reply, { unreadCount: 0 });
      }

      await prisma.conversationReadCursor.upsert({
        where: {
          conversation_participant_cursor: { participantId: participantForCursor.id, conversationId }
        },
        create: {
          participantId: participantForCursor.id,
          conversationId,
          lastReadMessageId: previousMessage?.id || null,
          // Keep the (id, createdAt) pair consistent so the cursor-advance
          // freshness guard in MessageReadStatusService stays correct — a stale
          // createdAt left pointing at a newer message would wrongly reject
          // later legitimate read advances.
          lastReadMessageCreatedAt: previousMessage?.createdAt ?? null,
          lastReadAt: lastReadAt,
          unreadCount: 1,
          version: 0
        },
        update: {
          lastReadMessageId: previousMessage?.id || null,
          lastReadMessageCreatedAt: previousMessage?.createdAt ?? null,
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

      // `deletedAt: null` — un message supprimé pour tout le monde n'est plus
      // un objet épinglable, et c'est ce que TOUTES les lectures de ce fichier
      // disent déjà : la liste des messages, la recherche, et la liste des
      // messages épinglés cent lignes plus bas (`{ pinnedAt: { not: null },
      // deletedAt: null }`). Les deux écritures de l'épingle étaient les seules
      // à ne pas le dire. Sans la garde, l'appel répond 200, écrit sur un
      // tombstone, et diffuse `message:pinned` — dans la room ET dans la file
      // hors-ligne — pour un message que tous les clients ont déjà retiré. Le
      // web l'applique à son cache, iOS à sa persistance, et rien ne les
      // détrompe : la liste des épinglés filtre ce message, donc aucun
      // rechargement ne corrige l'état.
      //
      // `select: { id: true }` : seule l'existence est en question ici. La
      // requête chargeait le document entier — contenu, traductions, metadata —
      // pour un `if (!message)`. Le jumeau qui dépingle sélectionnait déjà `id`
      // seul ; c'est l'asymétrie que le correctif précédent avait laissée.
      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: { id: true }
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
        const pinPayload = {
          messageId,
          conversationId,
          pinnedAt: now.toISOString(),
          pinnedBy: userId
        };
        const manager = fastify.socketIOHandler.getManager();
        // `ROOMS.conversation` / `SERVER_EVENTS`, et pas les chaînes brutes
        // équivalentes : ces deux lignes (ici et au dépinglage) étaient les
        // SEULES du service à composer un nom de room à la main. Le balayage
        // d'audience de la passerelle grepe `to(ROOMS.conversation(` — cf. la
        // note laissée dans `participants.ts` § PARTICIPANT_ROLE_UPDATED, qui
        // le nomme explicitement — donc l'épingle lui était invisible.
        manager?.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_PINNED, pinPayload);
        // Replay the pin to offline participants on reconnect (parity with
        // edit/delete/reaction offline delivery) so their pin state converges.
        void manager?.enqueueOfflineMessageMutation({
          conversationId,
          actorUserId: userId,
          eventType: 'pinned',
          messageId,
          payload: pinPayload
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

      // Localiser le message DANS la conversation, comme le fait déjà le jumeau
      // qui épingle — et comme le font `consume`, l'édition et la suppression.
      // Cette entrée était la seule du fichier à écrire par id seul : être
      // membre actif de N'IMPORTE QUELLE conversation suffisait alors à
      // dépingler le message de N'IMPORTE QUELLE autre, pour qui en connaît
      // l'id — ce que tout ancien membre garde en cache local. La diffusion
      // partait vers la conversation de la ROUTE, jamais vers celle du message :
      // les clients réellement concernés gardaient l'épingle affichée jusqu'au
      // prochain chargement complet, sans qu'aucun événement ne les détrompe.
      // `deletedAt: null` pour la même raison que le jumeau qui épingle : les
      // deux sens du même geste portent la même garde, sinon le dépinglage
      // redevient le chemin par lequel un événement fantôme part vers une room
      // et vers la file hors-ligne. L'épingle qui SURVIT à une suppression
      // (épingler puis supprimer) reste en base sans être atteignable ici —
      // elle n'est visible nulle part (toutes les lectures filtrent
      // `deletedAt: null`) et le tombstone lui-même part au balayage.
      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: { id: true }
      });
      if (!message) {
        return sendNotFound(reply, 'Message not found');
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: null, pinnedBy: null }
      });

      logger.info(`[UNPIN] User ${userId} unpinned message ${messageId} in conversation ${conversationId}`);

      // Broadcast unpin event via Socket.IO
      if (socketIOHandler) {
        const unpinPayload = {
          messageId,
          conversationId
        };
        const manager = fastify.socketIOHandler.getManager();
        manager?.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_UNPINNED, unpinPayload);
        // Replay the unpin to offline participants on reconnect (parity with
        // edit/delete/reaction offline delivery) so their pin state converges.
        void manager?.enqueueOfflineMessageMutation({
          conversationId,
          actorUserId: userId,
          eventType: 'unpinned',
          messageId,
          payload: unpinPayload
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
      // SSOT guard: a malformed `?limit`/`?offset` (string schema, no AJV
      // coercion) would otherwise reach Prisma as `take: NaN` → HTTP 500.
      const { limit, offset } = validatePagination(request.query.offset, request.query.limit, { defaultLimit: 50, maxLimit: 100 });

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      // Une épingle est posée pour TOUT le monde, mais elle ne rend pas au
      // lecteur un message qu'il a retiré de sa propre vue : sans ce filtre,
      // `clear-history` laissait une porte dérobée sur l'historique effacé.
      const pinnedHiding = await loadPersonalHistoryHiding(prisma, {
        userId: authRequest.authContext.type === 'anonymous' ? null : authRequest.authContext.userId,
        conversationId
      });
      // Et pas plus qu'elle ne rend un message d'AVANT l'arrivée du lecteur :
      // une épingle est la porte la plus évidente sur l'historique interdit.
      const pinnedFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      const pinnedMessages = await prisma.message.findMany({
        where: applyPersonalHistoryHiding(
          applyHistoryFloor({ conversationId, pinnedAt: { not: null }, deletedAt: null }, pinnedFloor),
          pinnedHiding
        ),
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
          // Lot 1 : un message épinglé est une bulle complète — sans
          // `metadata`, un message géolocalisé épinglé n'affiche jamais sa
          // position alors que la liste complète la restitue déjà.
          metadata: true,
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
        where: applyPersonalHistoryHiding(
          {
            conversationId,
            pinnedAt: { not: null },
            deletedAt: null
          },
          pinnedHiding
        )
      });

      // Régime STRICT (2026-08-25) : self/ADMIN+/ami seuls.
      const pinnedPresenceViewer = viewerFromRequest(request);
      const pinnedMissingEntry = presenceMissingEntryPolicy(pinnedPresenceViewer);
      const pinnedPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        pinnedPresenceViewer,
        pinnedMessages
          .map((message: any) => message.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      const formattedMessages = pinnedMessages.map((message: any) => {
        const sender = message.sender;
        const place = sharedPlaceFromMetadata(message.metadata);
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
          // `Message.translations` est une CARTE Mongo, jamais un tableau — et
          // le schéma de cette réponse déclare `translations: { type: 'array' }`
          // (`messageSchema`). `fast-json-stringify` ne coerce pas : la carte
          // faisait échouer la sérialisation, donc répondre 500 sur la route
          // ENTIÈRE dès qu'une épingle portait une traduction, c'est-à-dire dès
          // que le Prisme avait tourné. Même sérialiseur que toutes les autres
          // routes de messages — source unique de vérité.
          translations: transformTranslationsToArray(
            message.id,
            message.translations as Record<string, MessageTranslationJSON> | null
          ),
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          sender: sender ? applyPresenceVisibilityAsOffline(
            {
              id: sender.id,
              userId: sender.userId,
              displayName: resolveParticipantDisplayName(sender),
              avatar: resolveParticipantAvatar(sender),
              type: sender.type,
              username: sender.user?.username ?? null,
              firstName: sender.user?.firstName ?? null,
              lastName: sender.user?.lastName ?? null,
              isOnline: sender.user?.isOnline ?? false
            },
            sender.userId ? pinnedPresenceVis.get(sender.userId) : undefined,
            { onMissingEntry: pinnedMissingEntry },
          ) : null,
          attachments: message.attachments || [],
          reactionCount: message._count?.reactions ?? 0,
          replyCount: message._count?.replies ?? 0,
          // Lot 1 : hisser metadata.location en champ top-level `location`,
          // même miroir que la liste complète des messages.
          ...(place ? { location: place } : {})
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

      // Le spectateur, et non l'appelant. Un anonyme porte un jeton de session
      // dans `authContext.userId` : le chercher par `userId` ne trouvait
      // jamais sa ligne, si bien qu'il dépensait le budget sans laisser la
      // moindre trace de l'avoir fait. Même ordre de résolution que
      // `canAccessConversation`, dont le succès garantit qu'une de ces deux
      // lectures aboutit.
      const viewParticipant = authRequest.authContext.participantId
        ? await prisma.participant.findFirst({
            where: { id: authRequest.authContext.participantId, conversationId: message.conversationId, isActive: true },
            select: { id: true }
          })
        : await prisma.participant.findFirst({
            where: { conversationId: message.conversationId, userId, isActive: true },
            select: { id: true }
          });

      if (!viewParticipant) {
        return sendForbidden(reply, 'Not a participant');
      }

      // Une unité par SPECTATEUR, pas par ouverture. Le compteur était
      // incrémenté à chaque appel : un rejeu de la requête, ou un destinataire
      // qui rouvre la photo, épuisait le budget des autres membres du groupe.
      const { viewOnceCount: newViewOnceCount, firstConsumption } = await recordViewOnceConsumption(prisma, {
        messageId,
        conversationId: message.conversationId,
        participantId: viewParticipant.id,
        currentViewOnceCount: message.viewOnceCount ?? 0,
        at: now
      });

      const maxViewOnceCount = message.maxViewOnceCount ?? 1;
      const isFullyConsumed = newViewOnceCount >= maxViewOnceCount;

      logger.info(`[CONSUME] User ${userId} consumed view-once message ${messageId} (${newViewOnceCount}/${maxViewOnceCount})`);

      // Le budget épuisé programme la destruction, il ne l'exécute pas : le
      // spectateur qui vient de payer sa vue n'a pas encore fini de regarder.
      // Le balayage éphémère détruira — c'est déjà son métier, fichiers et
      // annonce `message:deleted` comprises. Sans cette ligne, `isFullyConsumed`
      // ne masquait le média que dans l'UI des clients qui l'implémentent, et le
      // clair restait servi indéfiniment à tous les autres.
      //
      // Non gardé par `firstConsumption` : la programmation est idempotente, et
      // la rejouer répare aussi bien un échec d'écriture qu'un message épuisé
      // AVANT la mise en service de ce chemin.
      if (isFullyConsumed) {
        // Best-effort. Échouer ici retirerait au spectateur le média dont la
        // revendication est déjà dépensée — sans rendre pour autant le contenu
        // plus sûr. La tentative suivante repose l'échéance.
        await scheduleViewOnceBurn(prisma, { messageId, at: now }).catch((error) =>
          logger.warn(`[CONSUME] view-once burn scheduling failed for ${messageId}`, error)
        );
      }

      // Annoncé seulement quand l'état a CHANGÉ. Rediffuser un compte identique
      // à toute la room n'apprend rien à personne et, sur un rejeu, ferait
      // clignoter chez les pairs un événement qui ne correspond à aucune
      // ouverture nouvelle.
      if (socketIOHandler && firstConsumption) {
        fastify.socketIOHandler.getManager()?.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_CONSUMED, {
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

      // Route the page size through the pagination SSOT (as the paged
      // `GET .../messages` above already does). The querystring schema declares
      // `limit` as a bare string with no numeric bounds, so the inline
      // `parseInt(limitStr) || 20` used to reintroduce the exact defect
      // `validatePagination` documents killing: `limit=0` falsy-coerced to a
      // full page instead of the floor of 1, and `limit=-5` flowed through as a
      // NEGATIVE Prisma `take`. Search is cursor-based, so only the limit is used.
      const { limit: searchLimit } = validatePagination('0', limitStr, { maxLimit: 50 });

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
        // Lot 1 : un résultat de recherche est une bulle complète elle
        // aussi — sans `metadata`, un message géolocalisé trouvé par
        // recherche n'affiche jamais sa position.
        metadata: true,
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

      // La recherche est la surface la plus facile à oublier et la plus
      // révélatrice : elle rend un message par son CONTENU, donc un historique
      // effacé y ressort intégralement dès qu'on en connaît un mot.
      const searchHiding = await loadPersonalHistoryHiding(prisma, {
        userId: authRequest.authContext.type === 'anonymous' ? null : userId,
        conversationId
      });
      // Même raison pour le plancher : chercher un mot est le moyen le plus
      // court de lire ce qui précède son arrivée.
      const searchFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      // Search content AND translations in parallel
      const [contentMatches, translationCandidates] = await Promise.all([
        prisma.message.findMany({
          where: applyPersonalHistoryHiding(applyHistoryFloor(whereClause, searchFloor), searchHiding),
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: searchLimit + 1
        }),
        prisma.message.findMany({
          where: applyPersonalHistoryHiding(
            applyHistoryFloor(
              {
                conversationId,
                deletedAt: null,
                NOT: { content: { contains: queryLower, mode: 'insensitive' } },
                translations: { not: { equals: null } },
                ...(cursor ? { createdAt: whereClause.createdAt } : {})
              },
              searchFloor
            ),
            searchHiding
          ),
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

      // Régime STRICT (2026-08-25) : self/ADMIN+/ami seuls.
      const msgSearchPresenceViewer = viewerFromRequest(request);
      const searchMissingEntry = presenceMissingEntryPolicy(msgSearchPresenceViewer);
      const searchPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        msgSearchPresenceViewer,
        results
          .map((msg: any) => msg.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      // Transform translations JSON → array format for SDK compatibility and
      // flatten the participant `sender` (username/isOnline come from the nested
      // `user` relation) so the userMinimalSchema serializer keeps them.
      const mappedResults = results.map((msg: any) => {
        const sender = msg.sender;
        // Lot 1 : hoistLocationOnto hisse metadata.location en `location`
        // top-level — un résultat de recherche géolocalisé le perdait sinon.
        return hoistLocationOnto({
          ...msg,
          sender: sender ? applyPresenceVisibilityAsOffline(
            {
              id: sender.id,
              userId: sender.userId,
              displayName: resolveParticipantDisplayName(sender),
              avatar: resolveParticipantAvatar(sender),
              username: sender.user?.username ?? null,
              isOnline: sender.user?.isOnline ?? false
            },
            sender.userId ? searchPresenceVis.get(sender.userId) : undefined,
            { onMissingEntry: searchMissingEntry },
          ) : null,
          translations: msg.translations
            ? transformTranslationsToArray(msg.id, msg.translations as Record<string, any>)
            : undefined
        });
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
