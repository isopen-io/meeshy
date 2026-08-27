/**
 * Message Handler
 * Gère l'envoi et le broadcast des messages
 *
 * Unified Participant model: messages use senderId pointing to Participant.
 * No more anonymousSenderId / anonymousSender dual path.
 */

import * as path from 'path';
// Cycle 101 (bis) — ce handler est le ONZIÈME et DERNIER basculé sur
// `MeeshySocket` : ses émissions sont désormais vérifiées à la compilation
// contre `ServerToClientEvents`, comme celles des dix autres (cycles 99, 100).
//
// Le flip butait sur deux dettes, l'une derrière l'autre :
//
//  1. `message:edited` — le producteur omettait trois des sept champs requis
//     par `SocketIOMessage`. C'est le défaut de production que ce flip a nommé,
//     réparé par `socketio/messageEditedPayload.ts` et retenu par son cliquet.
//
//  2. `message:new` — `_buildMessagePayload` rendait `unknown`, que six
//     enrichissements MUTAIENT ensuite via `as Record<string, unknown>`. Un tel
//     sac de clés ne satisfait AUCUN champ requis : c'est lui qui rendait le
//     fichier entier intypable, `message:edited` compris. Les enrichissements
//     sont maintenant composés par étalement IMMUABLE, et le type inféré de
//     `buildMessageNewPayload` survit jusqu'à l'émission.
//
// Une dette annoncée s'est révélée inexistante, et c'est mesuré : `messageType`
// était donné pour bloquant, servi en `string` là où le contrat déclare l'union
// `MessageType`. Il ne l'est pas — `Message.messageType` EST déjà cette union
// (`@meeshy/shared/types/index`), donc `message.messageType || 'text'` la rend.
// Une fois le sac de clés retiré, il ne restait AUCUN blocage : ni cast, ni
// validateur au producteur.
import type { MeeshySocket, MeeshyIOServer } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../../services/CacheStore';
import { isBlockedBetween } from '../../utils/blocking';
import { blockCacheKey, BLOCK_CACHE_TTL_SECONDS } from '../../utils/block-cache';
import { MessagingService } from '../../services/MessagingService';
import {
  buildPostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
} from '../../services/messaging/postReplySnapshot';
import { sharedPlaceFromMetadata, hoistLocationOnto } from '../../services/location/sharedPlace';
import { StatusService } from '../../services/StatusService';
import { NotificationService } from '../../services/notifications/NotificationService';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { attachmentForwardPreviewSelect, attachmentMediaSelect } from '../../services/attachments/attachmentIncludes';
import { serializeAttachmentForSocket } from '../serializeAttachmentForSocket';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';
import { emitUnreadCountsToRecipients } from '../emitUnreadCountsToRecipients';
import { ConversationBridgeService } from '../../services/ConversationBridgeService';
import { emitToConversationParticipants, participantUserRoomTargets } from '../emitToConversationParticipants';
import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  resolveLastMessagePreviewPrism,
  toIsoOrNull,
  type PreviewPrismParticipant,
} from '../utils/lastMessagePreviewPrism';
import { validateMessageLength } from '../../config/message-limits';
import {
  getConnectedUser,
  extractJWTToken,
  extractSessionToken,
  normalizeConversationId,
  type SocketUser
} from '../utils/socket-helpers';
import {
  filterMessagePayloadForLanguages,
  groupSocketsByLanguage,
} from '../utils/message-payload-filter.js';
import { resolveParticipant } from '../utils/participant-resolver.js';
import { resolveForwardSourceForBroadcast } from '../../services/preferences/forward-source-visibility.js';
import { redactForwardedAttachmentUrlsIn } from '../../services/preferences/forwarded-attachment-urls.js';
import {
  carriesForwardSource,
  withoutForwardSource,
} from '@meeshy/shared/utils/forward-source-visibility';
import { buildMessageAckData, stripClientMessageId, type MessageAckSource } from '../utils/message-ack-shaping.js';
import { messageTypeFromMimeTypes } from '../../services/messaging/attachmentMessageType.js';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';
import type {
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { SocketIOMessage, SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import type { Message } from '@meeshy/shared/types/index';
import { buildMessageNewPayload } from '../messageNewPayload';
import { buildMessageEditedCore } from '../messageEditedPayload';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { resolveMentionedUsers, resolveUsernamesToIds } from '../../services/MentionService';
import { reconcileEditedMentions, type MentionResolver } from '../../services/messaging/messageMentions';
import {
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
  type LinkReconciler,
} from '../../services/messaging/messageLinks';
import {
  admitMessageEdit,
  isEditRefused,
  CONVERSATION_CLOSED_EDIT_MESSAGE,
} from '../../services/messaging/messageEditAdmission';
import { admitMessageDelete } from '../../services/messaging/messageDeleteAdmission';
import { applyMessageRemovalEffects } from '../../services/messaging/messageRemovalEffects';
import { applyMessageEditEffects } from '../../services/messaging/messageEditEffects';
import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../../services/messaging/messageEditContent';
import { emitMentionCreated } from '../emitMentionCreated';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import type { ZmqAgentClient } from '../../services/zmq-agent/ZmqAgentClient.js';
import { AttachmentService } from '../../services/attachments/AttachmentService';
import { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService.js';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketMessageSendSchema,
  SocketMessageSendWithAttachmentsSchema,
  SocketMessageEditSchema,
  SocketMessageDeleteSchema,
} from '../../validation/socket-event-schemas.js';
import { toEncryptedPayload } from '../../validation/encryption-envelope.js';
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import type { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';
import type { QueuedVariantFor } from '../queuedEventContract';

const handlerLogger = enhancedLogger.child({ module: 'MessageHandler' });


export interface MessageHandlerDependencies {
  io: MeeshyIOServer;
  prisma: PrismaClient;
  messagingService: MessagingService;
  translationService: MessageTranslationService;
  statusService: StatusService;
  notificationService: NotificationService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  stats: { messages_processed: number; errors: number };
  agentClient?: ZmqAgentClient | null;
  attachmentService: AttachmentService;
  readStatusService: MessageReadStatusService;
  privacyPreferencesService: PrivacyPreferencesService;
  deliveryQueue?: RedisDeliveryQueue | null;
  /**
   * Optionnel : sans lui, une édition socket laisse les lignes `Mention`
   * telles quelles plutôt que d'en déduire que le message ne nomme plus
   * personne (cf. `reconcileEditedMentions`, qui distingue « établi vide » de
   * « rien établi »).
   */
  mentionService?: MentionResolver | null;
  /**
   * Optionnel pour le seul bénéfice des tests : sans injection, le handler en
   * construit un sur son propre `prisma`. Le laisser à la charge du site de
   * construction rejouerait le défaut qu'on corrige — un écrivain qui oublie
   * de câbler, et l'édition socket réécrit du texte brut sans que rien ne le
   * dise.
   */
  trackingLinkService?: LinkReconciler | null;
}

/**
 * Le retrait COMPLET d'une source de transfert : le nom ET le chemin.
 *
 * `withoutForwardSource` (shared, pur) retire `forwardedFrom` et
 * `forwardedFromConversation`. Il ne peut pas faire plus : la seconde fuite ne
 * vit pas dans ces champs mais dans `attachments[].fileUrl`, où le chemin de
 * stockage de la copie porte le `User.id` de l'auteur d'origine — un transfert
 * réutilise le fichier plutôt que de le recopier.
 *
 * Les trois émissions qui masquent une source passent par ici, et non par le
 * seul `withoutForwardSource` : masquer sur un canal en laissant l'autre ouvert
 * ne masque rien. La porte REST ferme la même fuite avec le même helper.
 */
const withoutForwardSourceOrItsPath = <T extends object>(payload: T): T => {
  const stripped = withoutForwardSource(payload) as T & { attachments?: unknown };
  if (!Array.isArray(stripped.attachments)) return stripped;

  return {
    ...stripped,
    attachments: redactForwardedAttachmentUrlsIn(stripped.attachments as never[]),
  } as T;
};

export class MessageHandler {
  private io: MeeshyIOServer;
  private prisma: PrismaClient;
  private messagingService: MessagingService;
  private translationService: MessageTranslationService;
  private statusService: StatusService;
  private notificationService: NotificationService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private stats: { messages_processed: number; errors: number };
  private agentClient: ZmqAgentClient | null;
  private attachmentService: AttachmentService;
  private readStatusService: MessageReadStatusService;
  // Le pont ✦ (G-123) — construit depuis `this.prisma`, jamais injecté : les
  // trois transports d'envoi partagent la même discipline « une instance,
  // sans état, réutilisée » que `readStatusService`.
  private bridgeService: ConversationBridgeService;
  private privacyPreferencesService: PrivacyPreferencesService;
  private deliveryQueue: RedisDeliveryQueue | null;
  private mentionService: MentionResolver | null;
  private trackingLinkService: LinkReconciler;
  private rateLimiter = getSocketRateLimiter();

  /**
   * Short-lived in-process cache for (userId, conversationId) → participantId lookups.
   * Avoids a DB findFirst query on every message send for active users.
   * TTL: 5 minutes, size-bounded (BoundedTtlCache) so a long-running gateway
   * process doesn't accumulate one entry per (user, conversation) pair forever.
   * Also invalidated on conversation leave / kick events via
   * `invalidateParticipantCache`. Key: `${userId}:${conversationId}`.
   *
   * Uses `BoundedTtlCache` (size cap + lazy/bulk TTL eviction) rather than a raw
   * `Map`: a lazily-checked TTL only reclaims a key when the SAME key is read
   * again, so a one-shot (user, conversation) sender that never sends again would
   * leak its entry forever on a long-lived gateway. The size cap hard-bounds the
   * heap regardless of read patterns, matching `StatusHandler.identityCache`.
   */
  private static readonly PARTICIPANT_CACHE_MAX_SIZE = 50_000;
  private readonly PARTICIPANT_CACHE_TTL_MS = 5 * 60 * 1000;
  private participantIdCache = new BoundedTtlCache<string, string>({
    maxSize: MessageHandler.PARTICIPANT_CACHE_MAX_SIZE,
    ttlMs: this.PARTICIPANT_CACHE_TTL_MS,
  });

  constructor(deps: MessageHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.messagingService = deps.messagingService;
    this.translationService = deps.translationService;
    this.statusService = deps.statusService;
    this.notificationService = deps.notificationService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.stats = deps.stats;
    this.agentClient = deps.agentClient ?? null;
    this.attachmentService = deps.attachmentService;
    this.readStatusService = deps.readStatusService;
    this.bridgeService = new ConversationBridgeService(deps.prisma);
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.deliveryQueue = deps.deliveryQueue ?? null;
    this.mentionService = deps.mentionService ?? null;
    this.trackingLinkService = deps.trackingLinkService ?? new TrackingLinkService(deps.prisma);
  }

  /**
   * Injected after construction by `MeeshySocketIOManager.setDeliveryQueue`
   * (same instance shared with the REST broadcast path), since the queue is
   * built once `server.ts` has the Redis-backed CacheStore ready.
   */
  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
  }

  /**
   * Gère l'envoi d'un nouveau message (texte simple)
   */
  async handleMessageSend(
    socket: MeeshySocket,
    data: {
      conversationId: string;
      content: string;
      originalLanguage?: string;
      messageType?: string;
      replyToId?: string;
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
      location?: unknown;
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketMessageSendSchema, data);
      if (schemaValidation.success === false) {
        this._sendError(callback, schemaValidation.error, socket);
        return;
      }
      const validated = schemaValidation.data;

      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { participantId, userId, isAnonymous } = userContext;
      handlerLogger.debug('message:send received', { conversationId: validated.conversationId, userId: userId ?? participantId, isAnonymous });

      const rateLimitAllowed = await this.rateLimiter.checkLimit(userId || participantId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
      if (!rateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId || participantId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
        const errorResponse: SocketIOResponse<{ messageId: string }> = {
          success: false,
          error: 'Rate limit exceeded'
        };
        if (callback) callback(errorResponse);
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Rate limit exceeded. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`
        });
        return;
      }

      // Per-conversation burst guard: prevents flooding a single conversation
      // even within the global 20 msg/min budget.
      const convRateLimitKey = `${userId || participantId}:${validated.conversationId}`;
      const convRateLimitAllowed = await this.rateLimiter.checkLimit(convRateLimitKey, SOCKET_RATE_LIMITS.MESSAGE_SEND_PER_CONVERSATION);
      if (!convRateLimitAllowed) {
        const convInfo = this.rateLimiter.getRateLimitInfo(convRateLimitKey, SOCKET_RATE_LIMITS.MESSAGE_SEND_PER_CONVERSATION);
        const errorResponse: SocketIOResponse<{ messageId: string }> = {
          success: false,
          error: 'Rate limit exceeded'
        };
        if (callback) callback(errorResponse);
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Too many messages in this conversation. Please wait ${Math.ceil(convInfo.resetIn / 1000)} seconds.`
        });
        return;
      }

      // L'enveloppe de chiffrement est recomposée depuis le VALIDÉ, par la même
      // unité que la route REST (`validation/encryption-envelope.ts`). Elle
      // était lue sur le `data` BRUT, sous un nom — `encryptedPayload` —
      // qu'aucun client n'émet et qu'aucun schéma ne produit : seul champ de
      // tout ce chemin à échapper au schéma, donc toujours `undefined`.
      const encryptedPayload = toEncryptedPayload(validated);

      // RÈGLE JUMELLE de `MessageValidator.validateRequest` : un transfert rend
      // le corps non-vide autrement — ses pièces jointes sont copiées CÔTÉ
      // SERVEUR (`MessageProcessor.copyForwardedAttachments`), le client
      // n'envoie donc ni texte ni `attachmentIds` pour un transfert de média.
      // L'exemption vivait dans le validateur mais pas ici : ce transport —
      // celui que la modale de transfert web emprunte en PRIMAIRE — refusait
      // tout transfert de média sans légende. Toute évolution de l'une des deux
      // exemptions touche l'autre.
      //
      // `copyAttachmentsFromMessageId` porte la MÊME exemption pour la MÊME
      // raison (diffusion à plusieurs destinataires : les pièces jointes sont
      // copiées côté serveur par `copyAttachments.ts`, le client n'envoie ni
      // texte ni `attachmentIds`). Cette troisième porte est restée fermée
      // pendant que les deux autres s'ouvraient.
      //
      // QUATRIÈME porteur de la même exemption : un corps chiffré. Le
      // déclencheur est désormais l'enveloppe VALIDÉE ci-dessus, non plus un
      // champ brut que le fil ne portait jamais.
      //
      // CINQUIÈME porteur : une géolocalisation SEULE (`location`, ni texte ni
      // attachmentIds). Restée fermée ici, cette porte rejetait à coup sûr —
      // sur CHAQUE tentative, y compris le rejeu depuis la file offline —
      // tout message de géolocalisation seule ; ce transport est le repli
      // documenté quand le POST REST échoue (#4039).
      const validation = validateMessageLength(validated.content);
      if (
        !validation.isValid &&
        !encryptedPayload &&
        !validated.forwardedFromId &&
        !validated.copyAttachmentsFromMessageId &&
        !validated.location
      ) {
        this._sendError(callback, validation.error || 'Message invalide', socket);
        return;
      }

      if (!isAnonymous && userId) {
        const blocked = await this._isDirectMessageBlocked(validated.conversationId, userId);
        if (blocked) {
          this._sendError(
            callback,
            ErrorMessages[ErrorCode.USER_BLOCKED].en,
            socket,
            ErrorCode.USER_BLOCKED
          );
          return;
        }
      }

      // Mettre à jour l'activité
      this.statusService.updateLastSeen(userId || participantId, isAnonymous);

      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, validated.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      const corr: Record<string, any> = {
        clientMessageId: validated.clientMessageId,
        conversationId: validated.conversationId,
        socketId: socket.id,
        participantId: resolvedParticipantId,
        isAnonymous
      };
      const handlerStart = Date.now();
      handlerLogger.info('perf:ws.message.send', {
        ...corr, step: 'ws.message.send', phase: 'start'
      });

      const messageRequest: MessageRequest = {
        conversationId: validated.conversationId,
        content: validated.content,
        // Phase 4 §6.2 — `clientMessageId` est obligatoire dans le schema
        // Zod du socket (validé à l'entrée), mais le destructure historique
        // l'oubliait — sans cette ligne le pattern catch-P2002 du
        // MessagingService ne se déclenche jamais sur le path Socket.IO
        // (qui est pourtant la surface d'envoi principale), rendant tout
        // le contrat de dedup inopérant en pratique.
        clientMessageId: validated.clientMessageId,
        originalLanguage: validated.originalLanguage,
        messageType: validated.messageType || 'text',
        replyToId: validated.replyToId,
        storyReplyToId: validated.storyReplyToId,
        forwardedFromId: validated.forwardedFromId,
        forwardedFromConversationId: validated.forwardedFromConversationId,
        // Diffusion : les pièces jointes du message source sont copiées côté
        // serveur (`MessageProcessor.saveMessage` → `copyAttachments`). Franchir
        // la garde sans transmettre le champ laisserait la copie muette.
        copyAttachmentsFromMessageId: validated.copyAttachmentsFromMessageId,
        encryptedPayload,
        // Effets de message — parité avec POST /messages. Le bitfield final
        // `effectFlags` est recomposé par `MessageProcessor.saveMessage`
        // depuis `isBlurred` / `expiresAt` / `isViewOnce`, donc on transmet
        // les champs bruts.
        isBlurred: validated.isBlurred,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
        effectFlags: validated.effectFlags,
        isViewOnce: validated.isViewOnce,
        maxViewOnceCount: validated.maxViewOnceCount,
        isAnonymous,
        // Lieu partagé — champ dédié transmis tel quel ; validé et écrit
        // dans `metadata.location` par `MessageProcessor.saveMessage`.
        location: validated.location,
        // Mentionnés nommés par l'ÉMETTEUR — parité avec POST /messages, qui
        // les honore depuis toujours. Sans cette propagation, la résolution
        // retombe sur l'extraction des `@` du CONTENU : un repli suffisant tant
        // que le contenu porte le texte, et VIDE en mode `e2ee`, où le client
        // a remplacé `content` par le littéral `[Encrypted]` avant d'émettre.
        // Nommer quelqu'un dans une conversation chiffrée ne produisait alors
        // ni ligne `Mention`, ni `validatedMentions`, ni notification.
        mentionedUserIds: validated.mentionedUserIds,
        metadata: {
          source: 'websocket',
          socketId: socket.id,
          clientTimestamp: Date.now()
        }
      };

      // Envoyer via MessagingService (simplified: participantId only)
      const response: MessageResponse = await this.messagingService.handleMessage(
        messageRequest,
        resolvedParticipantId
      );

      // Répondre au client
      this._sendResponse(callback, response);

      // Broadcaster le message si succès — SAUF sur un dedup idempotent
      // (même clientMessageId renvoyé). Le message existe déjà et a déjà été
      // broadcasté au premier envoi ; re-broadcaster `message:new` duplique la
      // bulle. Flag posé in-process par MessageProcessor.saveMessage.
      // response.data is already enriched (sender.user, attachments, replyTo) from saveMessage include
      if (response.success && response.data && !(response.data as { isDuplicate?: boolean }).isDuplicate) {
        const message = response.data as unknown as import('@meeshy/shared/types/index').Message;
        await performanceLogger.withTiming(
          'ws.broadcastNewMessage',
          () => this.broadcastNewMessage(message, message.conversationId, socket),
          { ...corr, messageId: message.id }
        );

        this._notifyAgent({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderDisplayName: message.sender?.displayName ?? message.sender?.user?.username,
          senderUsername: message.sender?.user?.username,
          content: message.content,
          originalLanguage: message.originalLanguage,
          replyToId: message.replyToId,
          mentionedUserIds: await this._resolveMentionUserIds(
            (message.validatedMentions as string[] | undefined) ?? []
          ),
          createdAt: message.createdAt,
        });

        // Le comptage du message n'est plus fait ici : il vit avec les trois
        // autres obligations post-commit, dans `runMessagePostSaveEffects`, que
        // `MessagingService.handleMessage` vient d'exécuter pour CE message.
        // Le garder ici le compterait deux fois — et le laisser ici seulement
        // était exactement ce qui laissait tous les autres tuyaux d'envoi
        // (REST, liens de partage) ne jamais compter.
      }

      handlerLogger.info('perf:ws.message.send', {
        ...corr, step: 'ws.message.send', phase: 'end',
        durationMs: Date.now() - handlerStart,
        success: response.success,
        messageId: response.success ? response.data?.id : undefined
      });

      this.stats.messages_processed++;
    } catch (error: unknown) {
      handlerLogger.error('message:send failed', { error });
      this.stats.errors++;
      this._sendError(callback, 'Failed to send message', socket);
    }
  }

  /**
   * Gère l'envoi d'un message avec attachments
   */
  async handleMessageSendWithAttachments(
    socket: MeeshySocket,
    data: {
      conversationId: string;
      content: string;
      originalLanguage?: string;
      attachmentIds: readonly string[];
      replyToId?: string;
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
      location?: unknown;
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketMessageSendWithAttachmentsSchema, data);
      if (schemaValidation.success === false) {
        this._sendError(callback, schemaValidation.error, socket);
        return;
      }
      const validated = schemaValidation.data;

      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { participantId, userId, isAnonymous } = userContext;

      const rateLimitAllowed = await this.rateLimiter.checkLimit(userId || participantId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
      if (!rateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId || participantId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
        const errorResponse: SocketIOResponse<{ messageId: string }> = {
          success: false,
          error: 'Rate limit exceeded'
        };
        if (callback) callback(errorResponse);
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Rate limit exceeded. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`
        });
        return;
      }

      // Per-conversation burst guard (mirrors handleMessageSend logic)
      const convRateLimitKeyWA = `${userId || participantId}:${validated.conversationId}`;
      const convRateLimitAllowedWA = await this.rateLimiter.checkLimit(convRateLimitKeyWA, SOCKET_RATE_LIMITS.MESSAGE_SEND_PER_CONVERSATION);
      if (!convRateLimitAllowedWA) {
        const convInfoWA = this.rateLimiter.getRateLimitInfo(convRateLimitKeyWA, SOCKET_RATE_LIMITS.MESSAGE_SEND_PER_CONVERSATION);
        const errorResponse: SocketIOResponse<{ messageId: string }> = {
          success: false,
          error: 'Rate limit exceeded'
        };
        if (callback) callback(errorResponse);
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Too many messages in this conversation. Please wait ${Math.ceil(convInfoWA.resetIn / 1000)} seconds.`
        });
        return;
      }

      if (validated.content && validated.content.trim()) {
        const validation = validateMessageLength(validated.content);
        if (!validation.isValid) {
          this._sendError(callback, validation.error || 'Message invalide', socket);
          return;
        }
      }

      if (!isAnonymous && userId) {
        const blocked = await this._isDirectMessageBlocked(validated.conversationId, userId);
        if (blocked) {
          this._sendError(
            callback,
            ErrorMessages[ErrorCode.USER_BLOCKED].en,
            socket,
            ErrorCode.USER_BLOCKED
          );
          return;
        }
      }

      // Mettre à jour l'activité — parité avec handleMessageSend. L'envoi de
      // pièces jointes (notamment les notes vocales, dont ce path WS est le
      // SEUL transport) est une activité utilisateur qui doit rafraîchir
      // lastActiveAt, sinon la présence d'un utilisateur voice-first se périme.
      this.statusService.updateLastSeen(userId || participantId, isAnonymous);

      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, validated.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      const attachmentService = this.attachmentService;

      // UNE requête pour les N pièces (cf. `getAttachmentsByIds`) : le
      // `Promise.all` de `findUnique` qui vivait ici ouvrait autant de
      // requêtes MongoDB que de pièces jointes — jusqu'à 199 par envoi.
      // Le tableau reste aligné sur `attachmentIds`, donc `invalidIndex`
      // ci-dessous continue de nommer la pièce fautive.
      const attachments = await attachmentService.getAttachmentsByIds(validated.attachmentIds);
      const invalidIndex = attachments.findIndex(
        (attachment) => !attachment || attachment.uploadedBy !== (userId || participantId)
      );
      if (invalidIndex !== -1) {
        this._sendError(callback, `Attachment ${validated.attachmentIds[invalidIndex]} invalid`, socket);
        return;
      }

      const corr: Record<string, any> = {
        clientMessageId: validated.clientMessageId,
        conversationId: validated.conversationId,
        socketId: socket.id,
        participantId: resolvedParticipantId,
        isAnonymous,
        attachmentCount: validated.attachmentIds.length
      };
      const handlerStart = Date.now();
      handlerLogger.info('perf:ws.message.send-with-attachments', {
        ...corr, step: 'ws.message.send-with-attachments', phase: 'start'
      });

      const messageRequest: MessageRequest = {
        conversationId: validated.conversationId,
        content: validated.content,
        // Phase 4 §6.2 — propagation obligatoire (cf. fix dans le sibling
        // handler `handleMessageSend` plus haut). Sans ce champ, le path
        // attachments — qui inclut tout l'audio (Whisper transcription) —
        // contournerait également le dedup serveur.
        clientMessageId: validated.clientMessageId,
        originalLanguage: validated.originalLanguage,
        // Le schéma socket n'expose pas `messageType` (le client ne peut pas le
        // fournir) — on le DÉRIVE des MIME des pièces jointes déjà résolues
        // ci-dessus. Sans ça, une photo/vidéo/audio (dont les médias view-once /
        // floutés / éphémères qui transitent principalement par CE path) était
        // persistée et diffusée en `'text'`, faisant afficher un ballon 💬 au
        // lieu de l'icône média dans `protectedPreview`/`contentTypeIcon`.
        messageType: messageTypeFromMimeTypes(attachments.map((a) => a?.mimeType)) ?? 'text',
        replyToId: validated.replyToId,
        storyReplyToId: validated.storyReplyToId,
        forwardedFromId: validated.forwardedFromId,
        forwardedFromConversationId: validated.forwardedFromConversationId,
        // Effets de message — parité avec `handleMessageSend` (path texte) et
        // POST /messages. Le bitfield final `effectFlags` est recomposé par
        // `MessageProcessor.saveMessage` depuis `isBlurred` / `expiresAt` /
        // `isViewOnce`, donc on transmet les champs bruts. Sans cette
        // propagation, une photo view-once / floutée / éphémère envoyée sur ce
        // path (le PRINCIPAL pour les pièces jointes) serait persistée comme un
        // média normal, rouvrable indéfiniment.
        isBlurred: validated.isBlurred,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
        effectFlags: validated.effectFlags,
        isViewOnce: validated.isViewOnce,
        maxViewOnceCount: validated.maxViewOnceCount,
        isAnonymous,
        // Aligner avec GatewayMessage: attachments are passed as IDs for linking
        attachmentIds: validated.attachmentIds,
        // Lieu partagé — même contrat que handleMessageSend ci-dessus.
        location: validated.location,
        // Mentionnés nommés par l'émetteur — même contrat que handleMessageSend.
        // Ce path porte TOUT l'audio : la légende d'un média y est souvent le
        // seul texte, et c'est là qu'un `@` a le plus de chances de manquer.
        mentionedUserIds: validated.mentionedUserIds,
        // Enveloppe de chiffrement — même unité que handleMessageSend. Ce
        // chemin-ci ne la portait pas du tout : une pièce jointe envoyée dans
        // une conversation chiffrée perdait son chiffré sans qu'aucun type ni
        // schéma ne puisse le dire.
        encryptedPayload: toEncryptedPayload(validated),
        metadata: {
          source: 'websocket',
          socketId: socket.id,
          clientTimestamp: Date.now()
        }
      };

      const response: MessageResponse = await this.messagingService.handleMessage(
        messageRequest,
        resolvedParticipantId
      );

      // Phase 4 — ack the client BEFORE running the broadcast / agent
      // notification side effects. The previous order delayed the ACK
      // behind `broadcastNewMessage`, so a throw inside the broadcast
      // (Prisma read failure, connection drop) would silently skip the
      // callback and leave iOS / web waiting indefinitely → spurious
      // retry. Mirror the order used by `handleMessageSend` above.
      this._sendResponse(callback, response);

      if (response.success && response.data && !(response.data as { isDuplicate?: boolean }).isDuplicate) {
        const message = response.data as unknown as import('@meeshy/shared/types/index').Message;
        await performanceLogger.withTiming(
          'ws.broadcastNewMessage',
          () => this.broadcastNewMessage(message, message.conversationId, socket),
          { ...corr, messageId: message.id }
        );

        this._notifyAgent({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderDisplayName: message.sender?.displayName ?? message.sender?.user?.username,
          senderUsername: message.sender?.user?.username,
          content: message.content,
          originalLanguage: message.originalLanguage,
          replyToId: message.replyToId,
          mentionedUserIds: await this._resolveMentionUserIds(
            (message.validatedMentions as string[] | undefined) ?? []
          ),
          createdAt: message.createdAt,
        });

        // Idem : le comptage — pièces jointes comprises — vit dans
        // `runMessagePostSaveEffects`, qui lit les MIME du message committé au
        // lieu de retraduire ici une table déjà écrite ailleurs.
      }

      handlerLogger.info('perf:ws.message.send-with-attachments', {
        ...corr, step: 'ws.message.send-with-attachments', phase: 'end',
        durationMs: Date.now() - handlerStart,
        success: response.success,
        messageId: response.success ? response.data?.id : undefined
      });

      this.stats.messages_processed++;
    } catch (error: unknown) {
      handlerLogger.error('message:send-with-attachments failed', { error });
      this.stats.errors++;
      this._sendError(callback, 'Failed to send message', socket);
    }
  }

  /**
   * Handles real-time message editing via WebSocket.
   * Mirrors the REST PUT /messages/:messageId logic but operates over socket
   * so the edit is propagated without an HTTP round-trip.
   *
   * Permissions: `admitMessageEdit` — l'auteur pendant 24h, ET tout membre
   * actif porteur d'un rôle GLOBAL privilégié (MODERATOR/ADMIN/BIGBOSS), sans
   * fenêtre. Cette ligne annonçait encore « seul l'auteur peut éditer », ce que
   * le code avait cessé de faire : c'est en la lisant qu'on a laissé la file de
   * rejeu hors ligne exclure l'auteur en croyant exclure l'acteur.
   * Anonymous users cannot edit (no stable identity → no ownership proof).
   */
  async handleMessageEdit(
    socket: MeeshySocket,
    data: { messageId: string; content: string },
    callback?: (response: SocketIOResponse) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketMessageEditSchema, data);
      if (schemaValidation.success === false) {
        this._sendGenericError(callback, schemaValidation.error, socket);
        return;
      }
      const validated = schemaValidation.data;

      const userContext = this._getUserContext(socket);
      if (!userContext || !userContext.userId || userContext.isAnonymous) {
        this._sendGenericError(callback, 'Authentication required to edit messages', socket);
        return;
      }

      const { userId } = userContext;

      const editRateLimitAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.MESSAGE_EDIT);
      if (!editRateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId, SOCKET_RATE_LIMITS.MESSAGE_EDIT);
        this._sendGenericError(callback, `Rate limit exceeded. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`, socket);
        return;
      }

      // La lecture n'ENCODE plus la règle d'admission : elle filtrait
      // `sender: { userId }`, donc la ligne d'un message qu'on n'a pas écrit
      // n'atteignait jamais la décision — et aucun modérateur ne pouvait être
      // admis ici, alors que l'UI web lui propose le geste et que la route
      // conversation-scopée l'admet. Une politique cachée dans un `where` est
      // une politique qu'on ne peut ni lire ni unifier.
      const message = await this.prisma.message.findFirst({
        where: {
          id: validated.messageId,
          deletedAt: null,
        },
        select: {
          id: true,
          conversationId: true,
          // L'état TERMINAL du conteneur, exigé par `admitMessageEdit`. Deux
          // colonnes ajoutées à un `select` déjà là : aucun aller-retour de plus.
          conversation: { select: { isActive: true, closedAt: true } },
          senderId: true,
          content: true,
          originalLanguage: true,
          // `messageType` et `createdAt` ne sont pas lus par la décision
          // d'admission : ils sont REQUIS par le contrat de fil
          // (`SocketIOMessage`) que la diffusion doit servir. Deux colonnes de
          // plus sur un `select` déjà là — aucun aller-retour supplémentaire.
          messageType: true,
          createdAt: true,
          // Lu pour la réconciliation des mentions : une mention ajoutée en
          // éditant un message éphémère ne doit pas survivre à ce message.
          expiresAt: true,
          // Lu pour la réconciliation des liens : `metadata` est un blob
          // PARTAGÉ, et le recomposer sans le lire écraserait `postReplyTo` et
          // `location`.
          metadata: true,
          sender: { select: { id: true, userId: true, displayName: true, avatar: true, role: true } },
          attachments: { select: attachmentMediaSelect },
        },
      });

      if (!message) {
        this._sendGenericError(callback, 'Message not found or you are not authorized to edit it', socket);
        return;
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`services/messaging/messageEditAdmission`). Cette garde vivait ici
      // dépliée, et les trois entrées REST en portaient chacune une variante
      // différente. Le privilège de contournement est un rôle GLOBAL
      // (`User.role`), JAMAIS le `Participant.role` minuscule qu'expose
      // `message.sender.role` — confondre les deux avait déjà produit un bypass
      // mort. L'unité garde ses lectures paresseuses : l'auteur dans sa fenêtre
      // n'en déclenche aucune.
      const admission = await admitMessageEdit({
        prisma: this.prisma,
        editorUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
          conversation: message.conversation,
          createdAt: message.createdAt,
        },
        onError: (err) => console.error('[MESSAGE_HANDLER] Edit admission lookup failed:', err),
      });

      if (isEditRefused(admission)) {
        // Le fil terminé a sa branche PROPRE. Sans elle, il tomberait dans le
        // `else` et s'annoncerait « vous n'êtes pas autorisé » — un refus
        // d'autorisation pour un état qui n'en est pas un, et que l'éditeur
        // corrigerait indéfiniment sans comprendre.
        this._sendGenericError(
          callback,
          admission.reason === 'conversation-closed'
            ? CONVERSATION_CLOSED_EDIT_MESSAGE
            : admission.reason === 'edit-window-expired'
              ? 'You can no longer edit this message (24-hour limit exceeded)'
              : 'Message not found or you are not authorized to edit it',
          socket
        );
        return;
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`), énoncé
      // une seule fois pour les quatre transports d'édition.
      const contentAdmission = admitEditedContent({
        content: validated.content,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(contentAdmission)) {
        this._sendGenericError(callback, EMPTY_EDIT_REFUSAL_MESSAGE, socket);
        return;
      }

      // Les liens `[[url]]` / `<url>` deviennent des `m+<token>` traçables AVANT
      // l'écriture, exactement comme à l'envoi. Ce chemin — le transport
      // d'édition PRIMAIRE, celui qu'emploie le web — écrivait le texte BRUT :
      // les crochets restaient en dur dans le message, pour toujours, alors que
      // le même texte envoyé produit un lien traçable. Le contenu traité est
      // ensuite le SEUL en circulation : base, mentions, retraduction, payload.
      // La seconde moitié — le mapping des URLs BRUTES (`metadata.trackingLinks`)
      // — n'était recomposée par aucun transport d'édition : une URL brute
      // ajoutée par édition restait intraçable pour toujours.
      const editedLinks = await reconcileEditedLinks({
        linkService: this.trackingLinkService,
        message: { id: validated.messageId, conversationId: message.conversationId },
        content: contentAdmission.content,
        editorUserId: userId,
        onError: (err) => handlerLogger.warn('tracking link processing failed on socket edit', { messageId: validated.messageId, error: err }),
      });
      const editedContent = editedLinks.processedContent;

      // Écrit seulement si la réconciliation a ÉTABLI quelque chose — y compris
      // l'ensemble vide, qui dit « ce texte ne porte plus d'URL ». Sur panne, la
      // base garde le mapping qu'elle avait.
      const nextMetadata = editedLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(message.metadata, editedLinks.trackingLinks) }
        : {};

      // Optimistic-concurrency guard: only write while the message is still
      // non-deleted. A `message:delete` landing between the read above and
      // this write would otherwise resurrect the row with edited content
      // (unconditional `update` by id succeeds regardless of `deletedAt`),
      // and the gateway would broadcast MESSAGE_EDITED for a message clients
      // already removed. Mirrors the guarded `updateMany` used by
      // handleMessageDelete's lastMessageAt recompute.
      const editedAt = new Date();
      const editResult = await this.prisma.message.updateMany({
        where: { id: validated.messageId, deletedAt: null },
        data: {
          content: editedContent,
          isEdited: true,
          editedAt,
          translations: null,
          ...nextMetadata,
        },
      });

      if (editResult.count === 0) {
        this._sendGenericError(callback, 'Message not found or you are not authorized to edit it', socket);
        return;
      }

      // Les effets DURABLES de l'édition — l'écart de mots et de caractères sur
      // les compteurs de la conversation. Ce transport, pourtant PRIMAIRE, ne
      // les ajustait pas : ils restaient sur les longueurs du texte d'origine,
      // définitivement. La liste vit dans `applyMessageEditEffects`, une fois
      // pour les quatre transports.
      await applyMessageEditEffects(this.prisma, {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: message.sender?.userId ?? null,
        previousContent: message.content,
        content: editedContent,
      });

      // Ce que ce message doit à ceux qu'il NOMME, après édition. Ce chemin
      // n'écrivait AUCUNE mention : ni ligne `Mention`, ni `validatedMentions`,
      // ni notification — alors qu'il est le transport d'édition PRIMAIRE.
      // Éditer « salut @alice » en « salut @bob » laissait Alice mentionnée et
      // ne nommait jamais Bob. Même unité que la route REST, aux mêmes
      // conditions : la réconciliation ne détruit rien qu'elle n'ait pu lire,
      // et seuls les ENTRANTS sont notifiés.
      const editedMentions = await reconcileEditedMentions({
        prisma: this.prisma,
        mentionService: this.mentionService,
        notificationService: this.notificationService,
        message: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          expiresAt: message.expiresAt,
        },
        content: editedContent,
        editorUserId: userId,
        onError: (err) => handlerLogger.warn('mention reconciliation failed after socket edit', { messageId: validated.messageId, error: err }),
      });

      // Le NOYAU du contrat `message:edited` vient de `buildMessageEditedCore`
      // — la source unique partagée avec les autres producteurs de l'événement.
      // Ce littéral était manuscrit, et il omettait TROIS des sept champs que
      // `SocketIOMessage` déclare requis (`senderId`, `messageType`,
      // `createdAt`), ce qui faisait échouer le décodage iOS du message ENTIER
      // et rendait invisible en direct, sur iOS, toute édition faite depuis le
      // web. Détail et tableau de parité : `socketio/messageEditedPayload.ts`.
      //
      // `sender` reste ici, en passthrough BRUT : la forme est propre à ce
      // transport (le `select` ci-dessus porte `role`, pas `user`), et
      // l'aligner sur celle du manager serait un CHANGEMENT de forme, pas un
      // ajout.
      const updatedMessage = {
        ...buildMessageEditedCore(message as unknown as Message, {
          conversationId: message.conversationId,
          content: editedContent,
          isEdited: true,
          editedAt,
        }),
        sender: message.sender,
      };

      // Trigger async retranslation — fire-and-forget, non-blocking
      const retranslationPayload = {
        id: validated.messageId,
        content: editedContent,
        originalLanguage: message.originalLanguage,
        conversationId: message.conversationId,
        senderId: message.senderId,
      };
      this.translationService.retranslateMessageAsync(validated.messageId, retranslationPayload)
        .catch((err: unknown) => handlerLogger.warn('retranslation failed after socket edit', { messageId: validated.messageId, error: err }));

      // `mention:created` aux ENTRANTS, dans leur salon PERSONNEL : quelqu'un
      // que l'édition vient de nommer n'est pas forcément dans
      // ROOMS.conversation(id), et `message:edited` ne fan que là. Parité avec
      // le chemin d'envoi (`broadcastNewMessage`), à ceci près qu'ici les
      // `User.id` sont déjà résolus — inutile de repasser par les usernames.
      emitMentionCreated({
        io: this.io,
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId: message.id,
        conversationId: message.conversationId,
        editorUserId: userId,
        content: editedContent,
        timestamp: editedAt,
        onError: (err) => handlerLogger.warn('mention:created fanout (edit) failed', { messageId: validated.messageId, error: err }),
      });

      // Attachments are unaffected by a content edit — carry over the ones
      // fetched pre-edit so clients that overwrite their cached message with
      // this payload (`{ ...cached, ...editedPayload }`) do not lose the
      // photo/video/audio that was attached to the message being edited.
      // `validatedMentions` n'est recopié que si la réconciliation a ÉTABLI
      // quelque chose — y compris l'ensemble vide, qui dit « ce texte ne nomme
      // plus personne ». Le poser inconditionnellement rejouerait dans le
      // payload l'effacement que l'unité vient d'empêcher en base : les clients
      // écrasent leur message caché avec `{ ...cached, ...editedPayload }`, et
      // un `[]` venu d'une panne transitoire effacerait un surlignage vivant.
      const editedPayload = {
        ...updatedMessage,
        conversationId: message.conversationId,
        translations: [],
        ...(editedMentions.reconciled ? { validatedMentions: [...editedMentions.validatedUsernames] } : {}),
        attachments: this._serializeAttachmentsField(message as unknown as Message),
      };

      const room = ROOMS.conversation(message.conversationId);
      this.io.to(room).emit(SERVER_EVENTS.MESSAGE_EDITED, editedPayload);

      // Fan a conversation:updated preview refresh to participants sitting on
      // the conversation list (in user:<id> but not conversation:<id>) so an
      // edit of the latest message updates their row — MESSAGE_EDITED alone
      // only reaches the conversation room. Mirrors broadcastNewMessage.
      await emitConversationPreviewUpdate(
        this.prisma, this.io, message.conversationId, userId,
        (err) => handlerLogger.warn('conversation preview fanout (edit) failed', { error: err })
      );

      // Skip the EDITOR, not the author. Depuis que `admitMessageEdit` admet un
      // modérateur sur le message d'autrui, les deux ne sont plus la même
      // personne : `message.senderId` est le `Participant.id` de l'AUTEUR. Le
      // passer ici sautait l'auteur hors ligne, qui n'apprenait alors JAMAIS
      // que son message avait été modéré — rien ne rejoue l'événement et aucun
      // client ne refetch spontanément, donc sa copie gardait le texte
      // d'avant-modération pendant que toute la conversation lisait le texte
      // corrigé. Le seul destinataire que le geste concerne vraiment était le
      // seul exclu. `userId` est l'éditeur, et c'est un `User.id` réel :
      // l'anonyme est refusé en tête de ce handler. Jumeau du même correctif
      // dans `handleMessageDelete`.
      this._enqueueOfflineEventForParticipants({
        conversationId: message.conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId: validated.messageId,
        payload: editedPayload,
      }).catch((err) => handlerLogger.warn('offline enqueue (edit) failed', { error: err }));

      callback?.({ success: true, data: { messageId: validated.messageId } });
      handlerLogger.debug('message:edit processed', { messageId: validated.messageId, userId, conversationId: message.conversationId });
    } catch (error: unknown) {
      handlerLogger.error('message:edit failed', { error });
      this._sendGenericError(callback, 'Failed to edit message', socket);
    }
  }

  /**
   * Handles real-time message deletion (soft delete) via WebSocket.
   * Mirrors the REST DELETE /messages/:messageId logic.
   *
   * Permissions: `admitMessageDelete` — l'auteur sans limite de temps, sinon un
   * rôle privilégié de CONVERSATION (`admin`/`moderator`) ou GLOBAL
   * (`MODERATOR`/`ADMIN`/`BIGBOSS`). La règle vit dans l'unité partagée, pas
   * ici : les trois transports de suppression y répondent désormais la même
   * chose. Les utilisateurs anonymes ne peuvent pas supprimer.
   */
  async handleMessageDelete(
    socket: MeeshySocket,
    data: { messageId: string },
    callback?: (response: SocketIOResponse) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketMessageDeleteSchema, data);
      if (schemaValidation.success === false) {
        this._sendGenericError(callback, schemaValidation.error, socket);
        return;
      }
      const validated = schemaValidation.data;

      const userContext = this._getUserContext(socket);
      if (!userContext || !userContext.userId || userContext.isAnonymous) {
        this._sendGenericError(callback, 'Authentication required to delete messages', socket);
        return;
      }

      const { userId } = userContext;

      const deleteRateLimitAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.MESSAGE_DELETE);
      if (!deleteRateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId, SOCKET_RATE_LIMITS.MESSAGE_DELETE);
        this._sendGenericError(callback, `Rate limit exceeded. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`, socket);
        return;
      }

      const message = await this.prisma.message.findFirst({
        where: { id: validated.messageId, deletedAt: null },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          sender: { select: { id: true, userId: true } },
          // L'appartenance n'est plus jointe : `admitMessageDelete` la lit
          // lui-même, et seulement quand l'acteur n'est PAS l'auteur. La
          // conversation ne l'est plus non plus : `applyMessageRemovalEffects`
          // relit `lastMessageAt` lui-même, au plus près de son écriture
          // conditionnelle. Restent le contenu et les métadonnées, qui portent
          // les deux représentations des `/l/<token>` du message. Et, depuis que
          // le décompte des compteurs vit dans la même unité, `messageType` et
          // les MIME des pièces jointes — capturés ICI parce qu'ils ne sont plus
          // lisibles une fois les attachements supprimés, quelques lignes plus
          // bas.
          content: true,
          metadata: true,
          messageType: true,
          attachments: { select: { id: true, mimeType: true } },
        },
      });

      if (!message) {
        this._sendGenericError(callback, 'Message not found', socket);
        return;
      }

      // Qui peut supprimer : `admitMessageDelete`, l'unique énoncé de la règle,
      // jumeau d'`admitMessageEdit`. Cette copie-ci était la plus juste des
      // trois, et c'est précisément pour ça qu'elle n'était pas suffisante :
      // rien ne la reliait aux deux autres, qui avaient dérivé chacune de son
      // côté. Sa forme est conservée à l'identique — auteur, rôle de
      // conversation, puis rôle global en lecture paresseuse.
      const admission = await admitMessageDelete({
        prisma: this.prisma,
        deleterUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
        },
        onError: (err) => handlerLogger.warn('delete admission read failed', { messageId: validated.messageId, error: err }),
      });

      if (!admission.admitted) {
        this._sendGenericError(callback, 'You are not authorized to delete this message', socket);
        return;
      }

      // Delete attachments (best-effort, non-blocking on individual failures)
      if (message.attachments && message.attachments.length > 0) {
        await Promise.allSettled(
          message.attachments.map((att) => this.attachmentService.deleteAttachment(att.id))
        );
      }

      // Soft delete: atomically clear translations and set deletedAt in one write
      await this.prisma.message.update({
        where: { id: validated.messageId },
        data: { translations: null, deletedAt: new Date() },
      });

      // Les effets DURABLES du retrait — recalcul de `lastMessageAt` et
      // désactivation des `/l/<token>` que ce message emporte. La liste vit
      // dans `applyMessageRemovalEffects`, une fois pour les quatre écrivains.
      await applyMessageRemovalEffects(this.prisma, {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: message.sender?.userId ?? null,
        messageType: message.messageType,
        attachmentMimeTypes: (message.attachments ?? []).map((att) => att.mimeType ?? ''),
        content: message.content,
        metadata: message.metadata,
      });

      const room = ROOMS.conversation(message.conversationId);
      const deletedPayload = {
        messageId: validated.messageId,
        conversationId: message.conversationId,
      };
      this.io.to(room).emit(SERVER_EVENTS.MESSAGE_DELETED, deletedPayload);

      // Fan a conversation:updated preview refresh to list-screen participants
      // (in user:<id> but not conversation:<id>): deleting the latest message
      // changes their row's preview, which MESSAGE_DELETED (conversation room
      // only) never tells them. The latest non-deleted message is recomputed
      // inside the helper, consistent with the lastMessageAt recompute above.
      await emitConversationPreviewUpdate(
        this.prisma, this.io, message.conversationId, userId,
        (err) => handlerLogger.warn('conversation preview fanout (delete) failed', { error: err })
      );

      // Le badge de non-lus doit ce retrait aux mêmes destinataires.
      //
      // `conversation:unread-updated` n'était émis que par les chemins d'ENVOI :
      // aucun chemin de suppression ne le repoussait, et la pastille continuait
      // de compter un message que le lecteur voit disparaître. Le décompte est
      // déjà juste côté service (`getUnreadCountsForParticipants` filtre
      // `deletedAt: null`) — il ne manquait que de le redemander.
      //
      // L'exclusion porte sur l'AUTEUR (`message.senderId`), pas sur l'acteur :
      // c'est la seule identité dont le compteur ne peut pas bouger ici (ses
      // propres messages ne comptent jamais dans ses non-lus), tandis qu'un
      // modérateur qui supprime le message d'un autre est, lui, un destinataire
      // à rafraîchir. C'est exactement le contrat de l'unité partagée avec les
      // trois transports d'envoi.
      await this._updateUnreadCounts(message.senderId, message.conversationId);

      // Skip the DELETER, not the author. A moderator/admin may delete another
      // user's message (`message.senderId` is the author's participant id, not
      // the actor's) — passing the author here skipped the offline author, who
      // then never learns their moderated message was removed.
      //
      // Les DEUX monnaies d'identité de l'acteur sont passées, et elles se
      // relaient. Le `Participant.id` a deux provenances, et une seule est
      // juste dans chaque cas :
      //   - l'acteur EST l'auteur → c'est `message.senderId`, par définition ;
      //   - l'acteur est un tiers → c'est la ligne que `admitMessageDelete`
      //     vient de lire pour l'admettre, JAMAIS `message.senderId`, qui
      //     désigne alors la personne à servir et non celle à exclure.
      // Il reste `undefined` pour un admin GLOBAL non-participant, lequel a
      // toujours un `User.id`. L'exclusion ne dépend donc jamais du fait que
      // l'acteur soit connecté. Les deux espaces d'id ne se croisant pas, en
      // passer deux ne sur-exclut personne : ils désignent la même personne.
      const deleterParticipantId = message.sender?.userId === userId
        ? message.senderId
        : admission.actorParticipantId;
      this._enqueueOfflineEventForParticipants({
        conversationId: message.conversationId,
        actorParticipantId: deleterParticipantId,
        actorUserId: userId,
        eventType: 'deleted',
        messageId: validated.messageId,
        payload: deletedPayload,
      }).catch((err) => handlerLogger.warn('offline enqueue (delete) failed', { error: err }));

      callback?.({ success: true, data: { messageId: validated.messageId } });
      handlerLogger.debug('message:delete processed', { messageId: validated.messageId, userId, conversationId: message.conversationId });
    } catch (error: unknown) {
      handlerLogger.error('message:delete failed', { error });
      this._sendGenericError(callback, 'Failed to delete message', socket);
    }
  }

  /**
   * Broadcaster un nouveau message vers tous les participants
   */
  async broadcastNewMessage(message: Message, conversationId: string, senderSocket?: MeeshySocket): Promise<void> {
    try {
      const normalizedId = await normalizeConversationId(
        conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      // Fire stats update as true fire-and-forget: it is a non-critical
      // DB side-effect (cache warm-up for `conversation:stats`) and must
      // not block the emit. Previously awaited via Promise.allSettled which
      // added the full stats write latency (~10–50ms) to every broadcast.
      conversationStatsService.updateOnNewMessage(
        this.prisma,
        conversationId,
        message.originalLanguage || 'fr',
        () => Array.from(this.connectedUsers.values()).map((u) => u.id)
      ).catch(error => handlerLogger.warn('stats update error', { error }));

      // Translations are part of the payload — await them separately so
      // the stats write no longer gates the emit (fast path when
      // message.translations is already on the object; DB fallback otherwise).
      const messageTranslations = await this._getMessageTranslations(message).catch(() => []);

      const basePayload = this._buildMessagePayload(
        message,
        normalizedId,
        messageTranslations
      );

      // Enrichir avec les détails du forward si applicable. Best-effort : un
      // échec de ce lookup (DB transient) ne doit JAMAIS avorter le broadcast —
      // sinon un message déjà persisté ET ACKé « envoyé » ne serait délivré à
      // personne (ni emit live, ni offline queue), sans retry. Parité avec
      // `_getMessageTranslations().catch(() => [])` ci-dessus.
      const forwardParts = await (async () => {
        if (!message.forwardedFromId) return {};
        const [originalMsg, originalConv] = await Promise.all([
          this.prisma.message.findUnique({
            where: { id: message.forwardedFromId },
            select: {
              id: true, content: true, senderId: true, messageType: true, createdAt: true,
              // Lot 2 : message transféré (objet imbriqué) — sans `metadata`,
              // un message géolocalisé transféré n'affiche jamais sa
              // position sur le chemin socket (parité avec le chemin REST).
              metadata: true,
              sender: { select: { id: true, userId: true, displayName: true, avatar: true, type: true } },
              attachments: { select: attachmentForwardPreviewSelect, take: 1 }
            }
          }),
          message.forwardedFromConversationId
            ? this.prisma.conversation.findUnique({
                where: { id: message.forwardedFromConversationId },
                select: { id: true, title: true, identifier: true, type: true, avatar: true }
              })
            : Promise.resolve(null)
        ]).catch(() => [null, null] as const);
        return {
          ...(originalMsg
            ? { forwardedFrom: hoistLocationOnto(originalMsg as unknown as Record<string, unknown>) }
            : {}),
          ...(originalConv ? { forwardedFromConversation: originalConv } : {}),
        };
      })();

      // Réponse à un post (status/story/reel/post) : servir le SNAPSHOT figé
      // (rangé dans `metadata.postReplyTo` à la création) pour que le
      // destinataire voie la citation immédiatement et qu'elle survive à
      // l'expiration du post. Hissé en `postReplyTo` top-level. Fallback live
      // legacy via lookup du post.
      const postReplyParts = await (async () => {
        if (!message.storyReplyToId) return {};
        const fromSnapshot = postReplyToFromMetadata(message.metadata);
        if (fromSnapshot) return { postReplyTo: fromSnapshot };
        // Best-effort : le fallback live ne doit pas gater la délivrance.
        const post = await this.prisma.post.findUnique({
          where: { id: message.storyReplyToId },
          select: POST_REPLY_SNAPSHOT_SELECT,
        }).catch(() => null);
        return post ? { postReplyTo: buildPostReplyTo(post) } : {};
      })();

      const mentionParts = await (async () => {
        if (!message.content) return {};
        // Best-effort : une résolution de mention en échec ne doit pas avorter
        // le broadcast (cf. `_resolveMentionUserIds` plus bas, même contrat).
        const mentionedUsers = await resolveMentionedUsers(this.prisma, [message.content]).catch(() => []);
        return mentionedUsers.length > 0 ? { mentionedUsers } : {};
      })();

      // Tracking des URLs brutes : hisser `metadata.trackingLinks` ([{url, token}])
      // en top-level (miroir de `postReplyTo`) — `_buildMessagePayload` n'embarque
      // pas `metadata`. Le destinataire rend le lien (texte + façade vidéo) vers
      // `/l/<token>` (capture + redirection) en gardant l'URL/aperçu.
      const trackingParts = ((): { trackingLinks?: unknown[] } => {
        const rawMetadata = message.metadata;
        if (!rawMetadata || typeof rawMetadata !== 'object') return {};
        const tl = (rawMetadata as Record<string, unknown>).trackingLinks;
        return Array.isArray(tl) && tl.length > 0 ? { trackingLinks: tl } : {};
      })();

      // Lieu partagé : hisser `metadata.location` en top-level `location` —
      // même miroir que `postReplyTo`/`trackingLinks` ci-dessus.
      // `_buildMessagePayload` n'embarque pas `metadata`, donc sans ce hoist
      // le destinataire ne voit la position qu'après rechargement (relecture
      // REST, qui hisse aussi `location` — cf. routes/conversations/messages.ts).
      const place = sharedPlaceFromMetadata(message.metadata);
      const locationParts = place ? { location: place } : {};

      // Composition IMMUABLE des enrichissements, là où six blocs mutaient le
      // payload à travers un cast `Record<string, unknown>`. Ce cast était le
      // seam qui annulait le contrat : une fois le payload dégradé en sac de
      // clés, `io.emit(MESSAGE_NEW, …)` n'avait plus rien à vérifier — c'est
      // pour cela que ce handler restait, seul, rendu au `Socket` NU de
      // socket.io (suivi du cycle 100). Le composer par étalement préserve le
      // type INFÉRÉ de `buildMessageNewPayload`, donc l'émission redevient
      // vérifiée contre `ServerToClientEvents`.
      const messagePayload = {
        ...basePayload,
        ...forwardParts,
        ...postReplyParts,
        ...mentionParts,
        ...trackingParts,
        ...locationParts,
      };

      // Single participant query shared between the `message:new` fan-out,
      // CONVERSATION_UPDATED and CONVERSATION_UNREAD_UPDATED to avoid
      // duplicate DB round-trips. Lue AVANT la diffusion : la réciprocité
      // des sources de transfert a besoin des lecteurs du salon pour
      // décider qui a droit à la provenance — une liste, un lecteur.
      // The superset select (PREVIEW_PRISM_PARTICIPANT_SELECT + joinedAt)
      // satisfies both callers — `user` (préférences de langue) est le Prisme
      // de la ligne de liste, résolu par destinataire ci-dessous ; `joinedAt`
      // reste requis par `enqueueForOfflineParticipants` / `_updateUnreadCounts`.
      // Parité avec le chemin REST/ZMQ (`MeeshySocketIOManager._broadcastNewMessage`),
      // qui charge le même superset pour la même raison.
      //
      // `undefined` — jamais `[]` — quand la requête tombe. Les deux formes se
      // lisent pareil au site d'appel et ne disent pas la même chose : `[]`
      // AFFIRME que la conversation n'a aucun participant, `undefined` avoue
      // qu'on ne sait pas. `enqueueForOfflineParticipants` distingue les deux
      // (`params.participants ?? sa propre requête`), et c'est la seule des
      // trois consommatrices dont l'abandon soit DESTRUCTIF : un `[]` lui
      // faisait enfiler pour PERSONNE, donc perdre le message pour tous les
      // absents, pendant que ce journal n'annonçait que deux pertes cosmétiques.
      let sharedParticipants: Array<PreviewPrismParticipant & { joinedAt: Date }> | undefined;
      try {
        sharedParticipants = await this.prisma.participant.findMany({
          where: { conversationId: normalizedId, isActive: true },
          select: { ...PREVIEW_PRISM_PARTICIPANT_SELECT, joinedAt: true }
        });
      } catch (err) {
        handlerLogger.warn('participant fetch failed — CONVERSATION_UPDATED + unread sautés, la file hors ligne refait sa propre requête', { error: err });
      }

      const room = ROOMS.conversation(normalizedId);

      // Phase 4 §6.2 — split broadcast into two payloads :
      //   - `broadcastPayload` (others) : strip `clientMessageId` so the
      //     value never leaks to non-sender participants (privacy: a peer
      //     cannot deduce the sender's offline-queue id space).
      //   - `senderPayload` (sender's sockets across all devices) : keep
      //     `clientMessageId` so the iOS / web reconciliation by-cid path
      //     can promote the optimistic row to `.sent` even after a crash
      //     that lost the ACK.
      // Pas de cast : `stripClientMessageId` est générique et préservant, donc
      // les deux payloads gardent le type du littéral composé ci-dessus et les
      // cinq émissions `message:new` de cette méthode restent vérifiées.
      const senderPayload = messagePayload;
      const broadcastPayload = stripClientMessageId(messagePayload);

      // Resolve the sender's USER id (not the participant id) so we can
      // address every device session via `ROOMS.user(userId)`. The sender
      // field on the message is a `Participant` whose `.userId` points at
      // the underlying user (null for anonymous). For anonymous sends we
      // fall back to the previous senderSocket-only path since there is
      // no user-level room to broadcast into.
      const senderUserId = message.sender?.userId ?? null;

      // Bandwidth sprint Phase B1 — per-recipient language filtering of the
      // `message:new` broadcast. The payload carries every translation; each
      // recipient under the Prisme reads ONE language, so room-wide emission
      // wastes ~75% of the translation weight for the majority of users. When
      // SOCKET_LANG_FILTER=true we group the room's peer sockets by their
      // resolved languages (zero DB query — from the in-memory connectedUsers
      // map) and emit a trimmed payload once per distinct language set. The
      // original language is always kept (Prisme source fallback). The sender's
      // own devices still receive the full, cid-aware `senderPayload`.

      // Réciprocité de la SOURCE d'un transfert (directive produit 2026-08-23).
      //
      // `visible ⇔ auteur ET lecteur`. L'auteur du transfert est FIXE pour ce
      // message : son refus tranche pour tout le salon d'un coup. Son accord ne
      // laisse que la moitié « lecteur », qui partage les destinataires en
      // exactement DEUX groupes — jamais plus. C'est ce qui rend la règle
      // finançable sur une diffusion de salon.
      //
      // Le découpage passe par les SALONS UTILISATEUR : l'adaptateur Redis les
      // propage, donc un destinataire connecté à un AUTRE nœud est exclu comme
      // il faut. Surtout PAS le motif de `_emitMessageNewByLanguage`, qui
      // énumère des socket ids locaux et dont le repli multi-nœud rediffuse le
      // payload COMPLET au salon : reproduire ce motif ici ferait fuiter le nom
      // sur tout déploiement multi-nœud, en silence.
      //
      // Rien n'est payé quand le message ne nomme aucune source — c'est
      // l'immense majorité des envois.
      let peerPayload = broadcastPayload;
      let forwardSourceHiddenRooms: string[] = [];
      let forwardSourceHiddenUserIds: ReadonlySet<string> = new Set<string>();
      if (carriesForwardSource(broadcastPayload)) {
        const verdict = await resolveForwardSourceForBroadcast(
          this.prisma,
          senderUserId,
          (sharedParticipants ?? []).map((participant) => participant.userId)
        );
        if (!verdict.forwarderAllows) {
          // L'auteur s'est retiré : plus personne n'apprend la provenance —
          // sauf lui-même, servi par `senderPayload` (se cacher des autres
          // n'est pas s'aveugler).
          peerPayload = withoutForwardSourceOrItsPath(broadcastPayload);
        } else {
          forwardSourceHiddenUserIds = verdict.refusingReaderIds;
          forwardSourceHiddenRooms = [...verdict.refusingReaderIds].map((userId) => ROOMS.user(userId));
        }
      }

      // Opt-in (OFF by default) — flip per-deploy after staging measurement.
      //
      // Désactivé d'office dès qu'un lecteur doit être masqué : une règle de
      // confidentialité ne se subordonne pas à un drapeau d'optimisation de
      // bande passante, et `_emitMessageNewByLanguage` ne sait pas exclure de
      // salon utilisateur.
      const langFilterOn =
        process.env.SOCKET_LANG_FILTER === 'true' && forwardSourceHiddenRooms.length === 0;

      if (senderUserId) {
        // Multi-device : send the cid-aware payload to the sender's
        // user room (catches every iOS / web session of this user)
        // and the cid-stripped payload to the conversation room
        // EXCEPT the sender's user room so peers do not receive a
        // duplicate.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, peerPayload, { excludeUserId: senderUserId });
        } else {
          this.io
            .to(room)
            .except([ROOMS.user(senderUserId), ...forwardSourceHiddenRooms])
            .emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
        }
        this.io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else if (senderSocket) {
        // Anonymous sender with an active socket : same single-session
        // split as before. Multi-device anonymous is undefined.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, peerPayload, { excludeSocketId: senderSocket.id });
        } else {
          const peers = senderSocket.broadcast.to(room);
          (forwardSourceHiddenRooms.length > 0 ? peers.except(forwardSourceHiddenRooms) : peers)
            .emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
        }
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else {
        // No senderSocket context (REST path or background flush) and
        // no resolvable user id : fall back to the cid-stripped payload
        // for the whole room. The sender's other sessions still
        // reconcile via the REST / socket ACK path which carries the cid.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, peerPayload, {});
        } else {
          const peers = this.io.to(room);
          (forwardSourceHiddenRooms.length > 0 ? peers.except(forwardSourceHiddenRooms) : peers)
            .emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
        }
      }

      // Les lecteurs qui se sont retirés : le MÊME message, sans sa provenance.
      // Émis après l'exclusion ci-dessus, jamais en plus d'elle — un
      // destinataire reçoit exactement UN `message:new`, sinon le client
      // insère la bulle deux fois.
      if (forwardSourceHiddenRooms.length > 0) {
        this.io
          .to(forwardSourceHiddenRooms)
          .emit(SERVER_EVENTS.MESSAGE_NEW, withoutForwardSourceOrItsPath(peerPayload));
      }
      handlerLogger.debug('message:new emitted', { conversationId: normalizedId, messageId: message.id, senderUserId: senderUserId ?? 'anon' });

      // Offline delivery queue — parity with the REST send path
      // (`MeeshySocketIOManager.broadcastMessage` / `_broadcastNewMessage`).
      // Without this, a message sent via the primary WS `message:send` path
      // to a currently-offline recipient is never replayed on their next
      // reconnect (`_drainPendingMessages`) and never triggers the
      // sent→delivered receipt upgrade for the sender. Uses the cid-stripped
      // `broadcastPayload` (same one peers receive live) so a replayed
      // message never leaks the sender's local optimistic id to another user.
      // Sender exclusion goes through BOTH identities, reproducing `_isSender`:
      // this path's `senderId` is a Participant.id on the REST/ZMQ transport and
      // a User.id on the WS transport, and the two id spaces never collide.
      //
      // ── Sa PLACE fait partie de la garantie ────────────────────────────────
      // Elle est ici, juste après l'émission live, et AVANT les deux synchros
      // cosmétiques (`conversation:updated` par destinataire, badges non-lus).
      // Elle en était l'aval, dans le même `try` que tout le broadcast : un
      // `emit` qui lève — ce qui arrive quand l'adaptateur ou l'encodeur est en
      // défaut, cf. `emitWithSeq` — sautait à un `catch` de fin de méthode et
      // annulait le rejeu durable pour TOUS les absents, pour une ligne de liste
      // qui n'aurait pas été retriée. Même règle qu'à l'instantané de
      // reconnexion, où le drain est placé hors du `try` pour qu'un accroc Mongo
      // cosmétique n'échoue jamais le rejeu (cf. `services/gateway/CLAUDE.md`).
      //
      // `participants` peut valoir `undefined` : l'unité partagée refait alors
      // SA requête, qui ne demande que `{id, userId}`. C'est précisément ce que
      // la requête SUPERSET tombée ci-dessus lui aurait interdit en lui passant
      // une liste VIDE.
      await enqueueForOfflineParticipants(
        { deliveryQueue: this.deliveryQueue, prisma: this.prisma, connectedUsers: this.connectedUsers },
        {
          conversationId: normalizedId,
          actorParticipantId: message.senderId,
          actorUserId: message.senderId,
          eventType: 'new',
          messageId: message.id,
          payload: peerPayload,
          // La file est la TROISIÈME porte de sortie de ce message. Sans cette
          // ligne, un destinataire hors ligne qui a refusé les sources de
          // transfert se les verrait rejouer intactes à sa reconnexion : la
          // règle ne serait qu'un rideau différé. `peerPayload` porte déjà le
          // retrait quand c'est l'AUTEUR qui s'est retiré ; ceci ajoute le
          // retrait par LECTEUR, que seule la boucle par participant peut
          // faire.
          ...(forwardSourceHiddenUserIds.size > 0
            ? {
                resolvePayloadForReader: (queueKey: string) =>
                  forwardSourceHiddenUserIds.has(queueKey)
                    ? withoutForwardSourceOrItsPath(peerPayload)
                    : peerPayload,
              }
            : {}),
          participants: sharedParticipants,
        }
      );

      // Emit `mention:created` to each mentioned user's PERSONAL room so an
      // @mention reaches a recipient who is online but not currently inside
      // ROOMS.conversation(id) — `message:new` only fans to the conversation
      // room. Parity with the REST/ZMQ broadcast path
      // (`MeeshySocketIOManager._broadcastNewMessage`); without it, @mentions
      // sent over the PRIMARY WebSocket `message:send` transport were silently
      // dropped for anyone not viewing the conversation. `validatedMentions` is
      // persisted as String[] of usernames, so resolve to User.ids first. The
      // self-mention guard compares against `senderUserId` (the sender's
      // User.id; null for anonymous senders, which can't self-mention a
      // registered user). `_resolveMentionUserIds` swallows lookup failures so a
      // mention miss never blocks the message broadcast.
      const mentionUsernames = (message.validatedMentions as string[] | undefined) ?? [];
      if (mentionUsernames.length > 0) {
        const mentionedUserIds = await this._resolveMentionUserIds(mentionUsernames);
        for (const targetUserId of mentionedUserIds) {
          if (targetUserId && targetUserId !== senderUserId) {
            this.io.to(ROOMS.user(targetUserId)).emit(SERVER_EVENTS.MENTION_CREATED, {
              messageId: message.id,
              conversationId: normalizedId,
              senderId: senderUserId ?? message.senderId,
              mentionedUserId: targetUserId,
              content: message.content,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Notify each participant's user room that the conversation has
      // been updated (lastMessageAt advanced) so their conversation
      // list can re-sort and surface this conversation at the top in
      // real time. Without this, MESSAGE_NEW only reaches sockets
      // already inside ROOMS.conversation(id), so a user with the
      // conversation list open elsewhere never receives a signal —
      // the row stays at its old position until a manual refresh,
      // and brand-new DMs never appear in the list at all.
      if (sharedParticipants && sharedParticipants.length > 0) {
        const updatePayload = {
          conversationId: normalizedId,
          // `updatedBy` is REQUIRED by ConversationUpdatedEventData — the sender's
          // User.id (participant senderId fallback for anonymous). Parity with the
          // REST/ZMQ send path in MeeshySocketIOManager.
          //
          // Cette ligne a longtemps dit « ici `io` est le Socket.IO Server
          // lâche, donc le compilateur n'a jamais attrapé l'omission ». C'est
          // FAUX : `MessageHandler.io` est typé `MeeshyIOServer`
          // (`socketio/typed-socket.ts`), exactement comme celui du manager. Ce
          // qui reste vrai, c'est que le typage n'attrape rien ici — non par
          // manque de type, mais parce que `ConversationUpdatedEventData` finit
          // sur `readonly [key: string]: unknown`. Ne déclarant que trois
          // champs, il laisse TOUT le groupe d'aperçu (`lastMessageAt`,
          // `lastMessageId`, `lastMessagePreview`, `senderId`) voyager sans
          // contrat — et c'est ce que l'en-tête de `location` raconte déjà être
          // arrivé une fois : la parité des trois émetteurs y a échoué en
          // silence (#3122). Le diagnostic à garder est celui de la signature
          // d'index, pas celui d'un `io` non typé.
          updatedBy: { id: senderUserId ?? message.senderId },
          // Chaîne ISO, comme `updatedAt` deux lignes plus bas : c'est ce que
          // les trois clients reçoivent de toute façon (l'encodeur par défaut
          // de socket.io est `JSON.stringify`, qui rend exactement ceci), et le
          // dire ici est ce qui rend le contrat vérifiable au lieu de laisser
          // le type se décider chez l'encodeur.
          lastMessageAt: toIsoOrNull(message.createdAt),
          lastMessageId: message.id,
          // `lastMessagePreview` sort de `resolveLastMessagePreviewPrism` avec
          // le reste de la paire, sous le même plafond qu'elle.
          // Un message position-seule a un `content` vide : hisser
          // `metadata.location` (même règle que la liste REST et
          // emitConversationPreviewUpdate) pour que la ligne d'aperçu du
          // client compose son libellé — aucun texte de repli côté serveur.
          ...((): Record<string, unknown> => {
            const place = sharedPlaceFromMetadata((message as { metadata?: unknown }).metadata);
            return place ? { location: place } : {};
          })(),
          senderId: message.senderId,
          updatedAt: new Date().toISOString()
        };
        // `userId ?? id` — un participant sans compte a une room personnelle
        // nommée d'après son `Participant.id`, et c'est la SEULE par laquelle il
        // apprend qu'une conversation remonte en tête de liste. Sans elle, un
        // invité de lien partagé ne voit jamais sa liste se retrier, et une
        // conversation toute neuve n'y apparaît pas du tout.
        //
        // Un payload PAR destinataire : la carte d'aperçu est filtrée au prisme
        // du lecteur (resolveLastMessagePreviewPrism), donc deux participants de
        // langues différentes n'ont pas la même carte de traductions. Parité
        // avec le chemin REST/ZMQ (`MeeshySocketIOManager._broadcastNewMessage`)
        // et `emitConversationPreviewUpdate` (édition/suppression) — sans ce
        // Prisme sur CE chemin (le PRIMARY WS `message:send`), un destinataire
        // sur l'écran de liste gardait la carte du message PRÉCÉDENT jusqu'à un
        // rechargement manuel.
        const targets = participantUserRoomTargets(sharedParticipants);
        for (const { room, participant } of targets) {
          this.io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
            ...updatePayload,
            ...resolveLastMessagePreviewPrism(participant, message)
          });
        }
        handlerLogger.debug('conversation:updated emitted', { conversationId: normalizedId, recipients: targets.length });
      }


      // Mettre à jour unread counts (re-uses the participant list already fetched above)
      await this._updateUnreadCounts(message.senderId, normalizedId, sharedParticipants);

      // Auto-mark delivered for online recipients so the sender's checkmark
      // upgrades from "sent" (✓) to "delivered" (✓✓ gray) immediately, even
      // when the recipient is connected but viewing another conversation.
      // Without this, MESSAGE_NEW only reaches sockets in the conversation
      // room, so an online recipient outside the conversation never triggers
      // mark-as-received and the sender stays stuck at a single checkmark.
      this.autoDeliverToOnlineRecipients(message, normalizedId).catch((err) => {
        handlerLogger.warn('auto-deliver background failure', { error: err });
      });
    } catch (error) {
      handlerLogger.error('broadcastNewMessage failed', { error });
    }
  }

  /**
   * Phase B1 — emit `message:new` to a conversation room grouped by each peer's
   * preferred language, sending a translation-trimmed payload once per distinct
   * language set (delegating the pure grouping/trimming to unit-tested helpers).
   * The sender's own sockets are excluded here; their cid-aware payload is sent
   * separately by the caller.
   */
  private _emitMessageNewByLanguage<P extends SocketIOMessage>(
    room: string,
    payload: P,
    opts: { excludeUserId?: string; excludeSocketId?: string }
  ): void {
    // `adapter.rooms` and the `connectedUsers`/`socketToUser` maps only ever see
    // THIS node's sockets. On a multi-node deployment (the documented 100k+
    // msg/s horizontal-scale topology runs the Socket.IO Redis adapter) a
    // recipient connected to another gateway node is never enumerated here — so
    // the per-language loop below, which can only resolve locally-connected
    // sockets, would silently never deliver `message:new` to them. Broadcast the
    // FULL, untrimmed payload to the room across the cluster FIRST (the Redis
    // adapter propagates `io.to(room)`), excepting every LOCAL room socket —
    // each of which the loop below serves with a language-trimmed copy — plus
    // the sender. Remote sockets thus receive exactly one (unfiltered)
    // `message:new`; local sockets receive exactly one trimmed copy. On a single
    // node every room socket is local, so the except-set covers the whole room
    // and this cross-node broadcast reaches nobody — behavior is unchanged. The
    // bandwidth trim still applies to every socket whose language IS resolvable
    // locally (the common co-located case).
    const localSocketIds = this.io.sockets.adapter.rooms.get(room);
    const exceptForRemote: string[] = localSocketIds ? [...localSocketIds] : [];
    if (opts.excludeUserId) exceptForRemote.push(ROOMS.user(opts.excludeUserId));
    if (opts.excludeSocketId) exceptForRemote.push(opts.excludeSocketId);
    this.io.to(room).except(exceptForRemote).emit(SERVER_EVENTS.MESSAGE_NEW, payload);

    if (!localSocketIds || localSocketIds.size === 0) return;

    const originalLanguage = payload.originalLanguage || 'fr';
    const groups = groupSocketsByLanguage({
      socketIds: localSocketIds,
      originalLanguage,
      excludeUserId: opts.excludeUserId,
      excludeSocketIds: opts.excludeSocketId ? new Set([opts.excludeSocketId]) : undefined,
      socketToUser: (sid) => this.socketToUser.get(sid),
      resolveLanguages: (uid) => this.connectedUsers.get(uid)?.resolvedLanguages,
      userLanguage: (uid) => this.connectedUsers.get(uid)?.language,
    });

    for (const group of groups) {
      if (group.socketIds.length === 0) continue;
      const filtered = filterMessagePayloadForLanguages(payload, group.languages);
      // 5.3 — mesure du gain bande passante (debug, gaté). Permet de prouver la
      // réduction en staging avant un flip prod. Coût nul quand le flag est OFF.
      if (process.env.SOCKET_LANG_FILTER === 'true') {
        const fullBytes = JSON.stringify(payload).length;
        const filteredBytes = JSON.stringify(filtered).length;
        handlerLogger.debug('[lang-filter] payload reduced', {
          fullBytes,
          filteredBytes,
          savedPct: fullBytes > 0 ? Math.round((1 - filteredBytes / fullBytes) * 100) : 0,
          languages: group.languages,
          originalLanguage,
        });
      }
      // Chain `.to(socketId)` so a single emit fans out to exactly this group's
      // sockets (mirrors the manager's per-language emit).
      const [firstSid, ...restSids] = group.socketIds;
      let emitter: ReturnType<MeeshyIOServer['to']> = this.io.to(firstSid);
      for (const sid of restSids) emitter = emitter.to(sid);
      emitter.emit(SERVER_EVENTS.MESSAGE_NEW, filtered);
    }
  }

  /**
   * Offline delivery queue for message:edit / message:delete — mirrors the
   * enqueue block in `broadcastNewMessage` for the WS `message:send` path.
   * Without this, an edit or delete made while a recipient is offline is
   * lost for them: `RedisDeliveryQueue` only ever replayed `message:new`
   * entries on reconnect, so the recipient's cached message stays on the
   * pre-edit content (or a "deleted" message stays visible) until an
   * unrelated full refetch of that conversation happens to occur.
   *
   * L'exclusion porte sur l'ACTEUR — celui qui édite ou supprime — et sur
   * personne d'autre. Le paramètre s'appelait `senderParticipantId`, et ce nom
   * décrivait l'auteur du message : les deux coïncident tant qu'on ne peut
   * toucher que ses propres messages, et divergent dès qu'un modérateur
   * intervient. `handleMessageEdit` passait effectivement `message.senderId`,
   * si bien que l'auteur hors ligne — le seul destinataire que la modération
   * concerne vraiment — était le seul que le rejeu sautait. Un paramètre-objet
   * nommé d'après le RÔLE (`actor…`) plutôt que d'après une valeur qu'on avait
   * sous la main est ce qui rend le prochain appel lisible au premier coup
   * d'œil.
   */
  private async _enqueueOfflineEventForParticipants(params: {
    conversationId: string;
    /** `Participant.id` de l'acteur, quand le transport le connaît. */
    actorParticipantId?: string | null;
    /** `User.id` de l'acteur. Les deux espaces d'id ne se croisent jamais. */
    actorUserId?: string | null;
    messageId: string;
  } & QueuedVariantFor<'edited' | 'deleted'>): Promise<void> {
    await enqueueForOfflineParticipants(
      { deliveryQueue: this.deliveryQueue, prisma: this.prisma, connectedUsers: this.connectedUsers },
      params
    );
  }

  /**
   * Sender-exclusion predicate robust to which identity `senderId` carries.
   * The WS `message:send` path forwards `MessagingService`'s response object
   * whose `senderId` is normalised to the sender's `User.id` (clients compare
   * against their own userId), whereas the REST/ZMQ path keeps `senderId` as
   * the raw `Participant.id`. Participant ids and user ids never collide, so
   * matching EITHER excludes the sender on both transports without ever
   * dropping a legitimate recipient. Anonymous senders (no `userId`) keep the
   * `Participant.id` representation and are matched by `p.id`.
   */
  private _isSender(
    p: { id: string; userId: string | null },
    senderId: string | null | undefined
  ): boolean {
    return !!senderId && (p.id === senderId || p.userId === senderId);
  }

  /**
   * Clé sous laquelle `connectedUsers` indexe ce participant.
   *
   * `AuthHandler._registerUser` reçoit `user.id` pour un inscrit et
   * `participant.id` pour un anonyme — la seule identité qu'un anonyme
   * possède, n'ayant pas de ligne `User`. Une sonde de présence écrite
   * `!!p.userId && connectedUsers.has(p.userId)` ne peut donc JAMAIS être
   * vraie pour un anonyme : elle l'exclut par construction, pas par
   * circonstance.
   *
   * Ce n'est pas neutre pour l'expéditeur : `getLatestMessageSummary` compte
   * TOUT participant actif par `Participant.id` dans `totalMembers`. Un
   * anonyme présent au dénominateur et inatteignable au numérateur rend
   * « remis à tous » impossible pour la conversation entière — soit
   * exactement la forme de toute conversation ouverte par lien de partage.
   */
  private _presenceKey(p: { id: string; userId: string | null }): string {
    return p.userId ?? p.id;
  }

  /**
   * Marque un message comme "delivered" pour chaque destinataire en ligne
   * (ayant une socket active) — sans exception, la préférence
   * `showReadReceipts` ne gouvernant que la DIFFUSION — puis émet, au nom d'un
   * destinataire qui partage bien ses accusés, UN seul `read-status:updated` consolidé
   * vers la conversation room et chaque user room afin que l'expéditeur
   * voie passer son indicateur à "delivered" sans devoir attendre une
   * action manuelle du destinataire.
   *
   * Public: source unique partagée par les TROIS transports d'envoi — le chemin
   * WS `message:send` (ci-dessus, `broadcastNewMessage`), le chemin REST/ZMQ
   * (`MeeshySocketIOManager._broadcastNewMessage`, qui délègue ici) et les deux
   * routes de lien de partage (via `broadcastLinkMessage`, qui passent par le
   * relais public du manager). Toutes partagent le même `io`/`connectedUsers`
   * et les mêmes services, donc le comportement est identique quel que soit le
   * transport (parité receipt).
   *
   * Le paramètre est structural et minimal — les deux seuls champs lus — et non
   * un `Message` Prisma : les routes de lien ne construisent pas d'entité
   * complète, et demander ce dont on n'a pas besoin est précisément ce qui
   * rendait cette unité inatteignable depuis une route. Même raison et même
   * forme que `PostSaveMessage` (`services/messaging/messagePostSaveEffects.ts`).
   */
  async autoDeliverToOnlineRecipients(
    message: { id: string; senderId: string | null },
    conversationId: string
  ): Promise<void> {
    const senderId = message.senderId;
    if (!senderId) return;

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { id: true, userId: true }
    });

    const onlineRecipients = participants.filter(
      (p) => !this._isSender(p, senderId) && this.connectedUsers.has(this._presenceKey(p))
    );
    handlerLogger.debug('auto-deliver', { conversationId, messageId: message.id, participants: participants.length, onlineRecipients: onlineRecipients.length });
    if (onlineRecipients.length === 0) return;

    // Les préférences se lisent sous la MÊME clé que la présence : un anonyme
    // n'a pas d'id utilisateur à interroger, et `getPreferencesForUsers` le
    // sert par les défauts dès que `isAnonymous` est vrai. Le déclarer inscrit
    // enverrait un `Participant.id` à `fetchManyFromDatabase` comme s'il
    // s'agissait d'un `User.id` — une requête payée pour rien, dont le résultat
    // vide serait mis en cache sous un id qui n'est pas un utilisateur.
    const preferences = await this.privacyPreferencesService.getPreferencesForUsers(
      onlineRecipients.map((r) => ({ id: this._presenceKey(r), isAnonymous: !r.userId }))
    );

    // La préférence décide de la DIFFUSION, jamais de l'ENREGISTREMENT. C'est la
    // règle que `broadcastReadStatus` porte en toutes lettres et que les trois
    // portes REST appliquent (`mark-as-received`, `delivery-receipt`,
    // `mark-read`) : « le curseur est avancé par l'appelant avant d'arriver
    // ici ». Filtrer AVANT l'écriture faisait dépendre l'ÉTAT du transport — le
    // même message, livré au même destinataire, laissait une trace par REST et
    // aucune par socket.
    //
    // Ce que ça coûtait : `showReadReceipts` est un réglage RÉVERSIBLE, et le
    // gate qui protège vraiment est à la LECTURE (`_loadReadReceiptOptOuts`
    // filtre l'opt-out sur les cinq sites qui servent un statut). Le jour où ce
    // destinataire ré-active la préférence, il cesse d'être filtré et son
    // arriéré ressort « jamais livré » : les coches de l'expéditeur régressent
    // de ✓✓ à ✓ sur tout l'historique reçu pendant l'opt-out, jusqu'à ce que le
    // destinataire rouvre chaque conversation. Rien de tout cela n'arrive sur la
    // moitié REST du même trafic.
    const results = await Promise.allSettled(
      onlineRecipients.map((r) =>
        this.readStatusService.markMessagesAsReceived(r.id, conversationId, message.id)
      )
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        handlerLogger.warn('auto-deliver markAsReceived failed', {
          participantId: onlineRecipients[index].id,
          error: result.reason
        });
      }
    });

    // L'acteur NOMMÉ par l'accusé doit, lui, partager les siens : diffuser au nom
    // d'un opt-out publierait précisément ce qu'il a demandé de taire. Le
    // `summary` qui l'accompagne applique déjà le même retrait côté service.
    const firstAckerIndex = results.findIndex(
      (result, index) =>
        result.status === 'fulfilled' &&
        preferences.get(this._presenceKey(onlineRecipients[index]))?.showReadReceipts === true
    );
    if (firstAckerIndex === -1) {
      handlerLogger.debug('auto-deliver receipt not broadcast', {
        conversationId,
        marked: results.filter((r) => r.status === 'fulfilled').length,
        onlineRecipients: onlineRecipients.length
      });
      return;
    }
    const firstAcker = onlineRecipients[firstAckerIndex];

    const summary = await this.readStatusService.getLatestMessageSummary(conversationId);

    const payload = {
      conversationId,
      participantId: firstAcker.id,
      userId: firstAcker.userId,
      type: 'received' as const,
      updatedAt: new Date(),
      summary
    };

    // Même clé de présence que le filtre ci-dessus, par la même unité que les
    // deux routes d'accusé de lecture : la boucle que ceci remplace sautait tout
    // participant sans ligne `User`, donc l'anonyme qui vient d'acquitter
    // n'apprenait pas lui-même que la remise avait eu lieu — et un anonyme parti
    // sur la liste des conversations, sorti de `conversation:<id>`, ne recevait
    // plus rien du tout.
    const rooms = emitToConversationParticipants({
      io: this.io,
      conversationId,
      participants,
      event: SERVER_EVENTS.READ_STATUS_UPDATED,
      payload
    });
    handlerLogger.debug('auto-deliver read-status:updated emitted', { conversationId, rooms, deliveredCount: summary.deliveredCount });
  }

  /**
   * Récupère le contexte utilisateur depuis le socket
   */
  private _getUserContext(socket: MeeshySocket): {
    participantId: string;
    userId?: string;
    isAnonymous: boolean;
    user?: SocketUser;
  } | null {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return null;

    const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!userResult) return null;

    const socketUser = userResult.user;
    return {
      participantId: socketUser.participantId || socketUser.id,
      userId: socketUser.userId,
      isAnonymous: socketUser.isAnonymous,
      user: socketUser
    };
  }

  /**
   * Resolve participant ID for a given conversation.
   * For anonymous users, their socket id IS the participantId.
   * For registered users, look up their Participant row for this conversation.
   */
  private async _resolveParticipantId(
    userId: string | undefined,
    fallbackParticipantId: string,
    conversationId: string,
    isAnonymous: boolean
  ): Promise<string | null> {
    if (isAnonymous) {
      return fallbackParticipantId;
    }

    if (!userId) return null;

    const cacheKey = `${userId}:${conversationId}`;
    const cached = this.participantIdCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await resolveParticipant({
      prisma: this.prisma,
      userIdOrToken: userId,
      conversationId,
      connectedUsers: this.connectedUsers,
    });

    if (result?.participantId) {
      this.participantIdCache.set(cacheKey, result.participantId);
    }

    return result?.participantId ?? null;
  }

  /**
   * Invalidate participantId cache entries for a given user (e.g. on leave/kick).
   * Pass conversationId to remove just one entry, omit to clear all for the user.
   */
  invalidateParticipantCache(userId: string, conversationId?: string): void {
    if (conversationId) {
      this.participantIdCache.delete(`${userId}:${conversationId}`);
    } else {
      for (const key of this.participantIdCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.participantIdCache.delete(key);
        }
      }
    }
  }

  /**
   * Récupère les traductions d'un message.
   * Court-circuite la DB si le champ translations est déjà présent sur l'objet
   * (messages tout juste créés → null, messages re-broadcastés après traduction → objet).
   */
  private async _getMessageTranslations(message: Message): Promise<unknown[]> {
    if (message.translations !== undefined) {
      return this._parseTranslations(message.id, message.translations);
    }
    const msg = await this.prisma.message.findUnique({
      where: { id: message.id },
      select: { translations: true }
    });
    return this._parseTranslations(message.id, msg?.translations);
  }

  /**
   * Sérialise les traductions d'un message pour le fil `message:new`.
   *
   * Deux formes entrent ici, et une seule sort :
   * - une **carte Mongo** (`{ "en": { text, translationModel, ... } }`), telle
   *   que la colonne `Message.translations` la stocke — c'est ce que rend le
   *   `findUnique` ci-dessus, et ce que porte un message re-broadcasté après
   *   traduction ;
   * - un **tableau déjà au format API**, ce que le type partagé
   *   `Message.translations` promet (`readonly MessageTranslation[]`) — laissé
   *   intact, le re-transformer produirait `targetLanguage: "0"` (les clés
   *   d'un tableau sont ses index).
   *
   * La carte passe par `transformTranslationsToArray`, le MÊME sérialiseur que
   * le chemin REST/ZMQ (`MeeshySocketIOManager._broadcastNewMessage`). Ce
   * handler en portait une seconde copie qui répandait l'entrée Mongo telle
   * quelle (`{ targetLanguage, ...data }`) : il en sortait `text`, jamais
   * `translatedContent`, et ni `id` ni `messageId`. Ces trois champs sont NON
   * optionnels dans `APITextTranslation` (SDK iOS), et `APIMessage.init(from:)`
   * décode le tableau avec `try` et non `try?` — une seule entrée mal formée
   * fait échouer le décodage du `message:new` ENTIER : le message n'apparaît
   * pas du tout en temps réel, il ne lui manque pas seulement ses traductions.
   * Le même message rechargé par `GET /messages` s'affichait normalement ; la
   * visibilité dépendait donc du transport qui l'avait apporté.
   *
   * Les entrées inexploitables de la carte (valeur nulle, primitive, `text`
   * non textuel — une colonne `Json` n'a pas de schéma pour l'interdire) sont
   * ÉCARTÉES avant transformation, jamais émises mutilées : une entrée sans
   * `translatedContent` utilisable ferait échouer le décodage du message
   * entier, exactement le défaut que ce sérialiseur corrige. Les écarter ici
   * plutôt que de laisser `transformTranslationsToArray` déréférencer `null`
   * garde aussi les traductions VALIDES de la même carte — un seul `throw`
   * remonterait au `.catch(() => [])` de l'appelant et les perdrait toutes.
   */
  private _parseTranslations(messageId: string, translations: unknown): unknown[] {
    if (!translations || typeof translations !== 'object') return [];
    if (Array.isArray(translations)) return translations;

    const usableEntries = Object.entries(translations as Record<string, unknown>)
      .filter(([, data]) => typeof (data as { text?: unknown })?.text === 'string');

    return transformTranslationsToArray(
      messageId,
      Object.fromEntries(usableEntries) as Record<string, MessageTranslationJSON>
    );
  }

  /**
   * Construit le payload `message:new` du transport socket.
   *
   * Les champs DÉRIVÉS DE LA LIGNE MESSAGE viennent de `buildMessageNewPayload`
   * — la source unique partagée avec le transport REST/ZMQ
   * (`MeeshySocketIOManager._broadcastNewMessage`). Ce handler en portait une
   * copie manuscrite, et les deux ont divergé sur SIX familles de champs
   * (l'enveloppe E2EE, le plafond de vue-unique, la provenance d'un transfert,
   * la réponse à un post, `messageSource`/`updatedAt`, le pseudo d'un
   * expéditeur sans compte) — cf. l'en-tête de `messageNewPayload.ts`.
   *
   * Ne restent ici que les deux projections dont la forme est DÉLIBÉRÉMENT
   * propre à ce transport :
   *
   * - `attachments` : normalisés par `serializeAttachmentForSocket`, qui
   *   garantit que `transcription` et `translations` voyagent quelle que soit
   *   la requête amont ;
   * - `replyTo` : passthrough BRUT (sender imbriqué, non aplati), là où le
   *   chemin REST reconstruit et aplatit le sien. Les fusionner changerait la
   *   forme consommée par un client sans certitude sur lequel des deux en
   *   dépend — d'où la note, ici comme là-bas, plutôt que la fusion.
   *
   * `postReplyTo` (snapshot figé) et `forwardedFrom` sont ajoutés par
   * `broadcastNewMessage` après ce build, comme les autres enrichissements qui
   * demandent une lecture en base.
   */
  /**
   * Type de retour INFÉRÉ, jamais annoté — même raison que
   * `buildMessageNewPayload` et `buildSenderPayload` dans `messageNewPayload.ts`.
   * Il a porté `: unknown` pendant toute la vie de ce handler, et c'était LA
   * source du fait que le contrat ne contraignait pas le producteur WebSocket de
   * `message:new` : annoter large rend au compilateur un payload sans forme, et
   * l'émission cesse d'être vérifiée.
   */
  private _buildMessagePayload(
    message: Message,
    conversationId: string,
    translations: unknown[]
  ) {
    return buildMessageNewPayload(message, {
      conversationId,
      translations,
      attachments: this._serializeAttachmentsField(message),
      // Lot 2 : `MessageProcessor.saveMessage` récupère déjà `metadata` du
      // message CITÉ (include, pas select restrictif), donc la donnée brute
      // voyageait déjà — mais sans ce hoist elle restait invisible sous
      // `replyTo.metadata.location` au lieu de `replyTo.location`.
      replyTo: message.replyTo
        ? hoistLocationOnto(message.replyTo as unknown as Record<string, unknown>)
        : message.replyTo,
    });
  }

  /**
   * Normalize the attachments field on a broadcast message via the
   * centralized `serializeAttachmentForSocket` helper. Tolerates the
   * legacy `as any` access pattern and guarantees `transcription` +
   * `translations` always travel through the socket payload (parity with
   * the REST `attachmentMediaSelect` shape). Replaces the previous
   * `(message as never)['attachments'] || []` cast that silently dropped
   * both Prisme Linguistique JSON fields when the upstream query did not
   * explicitly select them.
   */
  private _serializeAttachmentsField(message: Message): unknown[] {
    const raw = message.attachments;
    if (!Array.isArray(raw)) return [];
    return raw.map((att) => serializeAttachmentForSocket(att as Record<string, unknown>));
  }

  /**
   * Met à jour les unread counts pour tous les participants.
   *
   * Délègue à `emitUnreadCountsToRecipients` — l'unité partagée par les TROIS
   * transports d'envoi (WS ici, REST/ZMQ via `MeeshySocketIOManager`, lien de
   * partage via `broadcastLinkMessage`). L'implémentation vivait ici, dans un
   * `private`, donc inatteignable par les routes de lien qui contournent cette
   * classe : leur badge ne bougeait jamais.
   *
   * `preloadedParticipants` est transmis tel quel — `broadcastNewMessage` a déjà
   * chargé cette liste pour la file hors ligne, et un second aller-retour sur le
   * chemin le plus chaud du service n'est pas acceptable.
   *
   * Ne prend que le `senderId` — la seule chose que l'unité lise du message.
   * Exiger un `Message` complet obligeait les appelants qui n'en ont qu'une
   * projection (la SUPPRESSION lit un `select` étroit) à mentir par cast.
   */
  private async _updateUnreadCounts(
    senderId: string,
    conversationId: string,
    preloadedParticipants?: { id: string; userId: string | null; joinedAt: Date }[]
  ): Promise<void> {
    await emitUnreadCountsToRecipients({
      io: this.io,
      prisma: this.prisma,
      readStatusService: this.readStatusService,
      bridgeService: this.bridgeService,
      conversationId,
      senderId,
      participants: preloadedParticipants,
      onError: (error) => handlerLogger.warn('unread count update failed', { error }),
    });
  }


  private async _resolveMentionUserIds(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];
    try {
      return await resolveUsernamesToIds(this.prisma, usernames);
    } catch (error) {
      handlerLogger.warn('mention user lookup failed (mentions skipped)', { usernames, error });
      return [];
    }
  }

  private _notifyAgent(message: {
    id: string;
    conversationId: string;
    senderId: string | null;
    senderDisplayName?: string;
    senderUsername?: string;
    content: string | null;
    originalLanguage: string | null;
    replyToId?: string | null;
    mentionedUserIds?: string[];
    createdAt: Date;
  }): void {
    if (!this.agentClient || !message.senderId || !message.content) return;
    this.agentClient.sendEvent({
      type: 'agent:new-message',
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      senderUsername: message.senderUsername,
      content: message.content,
      originalLanguage: message.originalLanguage ?? 'fr',
      replyToId: message.replyToId ?? undefined,
      mentionedUserIds: message.mentionedUserIds ?? [],
      timestamp: message.createdAt.getTime(),
    }).catch(err => handlerLogger.warn('agent event delivery failed (non-blocking)', { messageId: message.id, error: err }));
  }

  private _sendError(
    callback: ((response: SocketIOResponse<{ messageId: string }>) => void) | undefined,
    error: string,
    socket: MeeshySocket,
    code?: string
  ): void {
    const errorResponse: SocketIOResponse<{ messageId: string }> = {
      success: false,
      error,
      ...(code ? { code } : {})
    };
    if (callback) callback(errorResponse);
    socket.emit(SERVER_EVENTS.ERROR, { message: error, ...(code ? { code } : {}) });
  }

  private _sendGenericError(
    callback: ((response: SocketIOResponse) => void) | undefined,
    error: string,
    socket: MeeshySocket,
    code?: string
  ): void {
    const errorResponse: SocketIOResponse = {
      success: false,
      error,
      ...(code ? { code } : {})
    };
    if (callback) callback(errorResponse);
    socket.emit(SERVER_EVENTS.ERROR, { message: error, ...(code ? { code } : {}) });
  }

  /**
   * DM-only bidirectional block gate shared by `message:send` and
   * `message:send-with-attachments`. Returns true when the conversation is a
   * direct/dm and the sender is blocked by — or has blocked — any other active
   * participant. Non-direct conversations are never block-enforced.
   *
   * The result is cached per ordered pair of participants for 5 minutes. The
   * cache key is symmetric (the user ids are sorted) so it reflects the
   * bidirectional semantics: blocking in either direction yields the same key.
   */
  private async _isDirectMessageBlocked(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        participants: {
          where: { isActive: true },
          select: { userId: true }
        }
      }
    });
    if (!conversation || (conversation.type !== 'direct' && conversation.type !== 'dm')) {
      return false;
    }
    const otherMemberIds = conversation.participants
      .map(p => p.userId)
      .filter((id): id is string => id !== null && id !== userId);
    if (otherMemberIds.length === 0) {
      return false;
    }
    const cacheStore = getCacheStore();
    for (const otherId of otherMemberIds) {
      const cacheKey = blockCacheKey(userId, otherId);
      const cached = await cacheStore.get(cacheKey);
      let blocked: boolean;
      if (cached !== null) {
        blocked = cached === '1';
      } else {
        blocked = await isBlockedBetween(this.prisma, userId, otherId);
        await cacheStore.set(cacheKey, blocked ? '1' : '0', BLOCK_CACHE_TTL_SECONDS);
      }
      if (blocked) {
        return true;
      }
    }
    return false;
  }

  /**
   * Envoie une réponse de succès
   *
   * Wrapped in try-catch: a throwing callback must never propagate up to the
   * Socket.IO event handler frame, which would tear down the entire socket
   * connection for an unrelated serialization / client-side bug.
   */
  private _sendResponse(
    callback: ((response: SocketIOResponse<{ messageId: string; clientMessageId?: string; createdAt?: string }>) => void) | undefined,
    response: MessageResponse
  ): void {
    if (!callback) return;

    try {
      if (response.success && response.data) {
        // Phase 4 §6.2 — echo `clientMessageId` back so iOS / web can match the
        // ACK against their pending optimistic row by cid (the `messageId`
        // alone is insufficient: the optimistic row has a `cid_*` local id
        // and only learns the server `messageId` from this very ACK).
        // `createdAt` is echoed too so the WS-first send path can stamp the
        // optimistic row with the authoritative server time without waiting
        // for the `message:new` broadcast.
        const data = response.data as MessageAckSource;
        callback({
          success: true,
          data: buildMessageAckData(data)
        });
      } else {
        callback({
          success: false,
          error: response.error || 'Failed to send message'
        });
      }
    } catch (error) {
      handlerLogger.error('ACK callback threw — socket connection preserved', { error });
    }
  }
}
