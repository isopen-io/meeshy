/**
 * Message Handler
 * Gère l'envoi et le broadcast des messages
 *
 * Unified Participant model: messages use senderId pointing to Participant.
 * No more anonymousSenderId / anonymousSender dual path.
 */

import * as path from 'path';
import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
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
import { StatusService } from '../../services/StatusService';
import { NotificationService } from '../../services/notifications/NotificationService';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { attachmentForwardPreviewSelect, attachmentMediaSelect } from '../../services/attachments/attachmentIncludes';
import { serializeAttachmentForSocket } from '../serializeAttachmentForSocket';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';
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
import { BoundedTtlCache } from '../../utils/bounded-cache.js';
import type {
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import type { Message } from '@meeshy/shared/types/index';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { resolveMentionedUsers, resolveUsernamesToIds } from '../../services/MentionService';
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
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import type { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';

const handlerLogger = enhancedLogger.child({ module: 'MessageHandler' });


export interface MessageHandlerDependencies {
  io: SocketIOServer;
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
}

export class MessageHandler {
  private io: SocketIOServer;
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
  private privacyPreferencesService: PrivacyPreferencesService;
  private deliveryQueue: RedisDeliveryQueue | null;
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
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.deliveryQueue = deps.deliveryQueue ?? null;
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
    socket: Socket,
    data: {
      conversationId: string;
      content: string;
      originalLanguage?: string;
      messageType?: string;
      replyToId?: string;
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
      encryptedPayload?: unknown;
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

      const validation = validateMessageLength(validated.content);
      if (!validation.isValid && !data.encryptedPayload) {
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
        encryptedPayload: data.encryptedPayload as MessageRequest['encryptedPayload'],
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

        conversationMessageStatsService.onNewMessage(
          this.prisma, message.conversationId, userId || participantId, validated.content ?? '', [], message.originalLanguage ?? null,
          message.messageType || 'text'
        ).catch(err => handlerLogger.warn('stats update error', { error: err }));
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
    socket: Socket,
    data: {
      conversationId: string;
      content: string;
      originalLanguage?: string;
      attachmentIds: readonly string[];
      replyToId?: string;
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
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

      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, validated.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      const attachmentService = this.attachmentService;

      const attachments = await Promise.all(
        validated.attachmentIds.map((attachmentId: string) => attachmentService.getAttachment(attachmentId))
      );
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
        messageType: 'text',
        replyToId: validated.replyToId,
        storyReplyToId: validated.storyReplyToId,
        forwardedFromId: validated.forwardedFromId,
        forwardedFromConversationId: validated.forwardedFromConversationId,
        isAnonymous,
        // Aligner avec GatewayMessage: attachments are passed as IDs for linking
        attachmentIds: validated.attachmentIds,
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

        const msgAttachments = message.attachments as unknown as Array<Record<string, unknown>> | undefined;
        const attachmentTypes = (msgAttachments ?? []).map((a: Record<string, unknown>) => {
          const mime = (a.mimeType as string) ?? '';
          if (mime.startsWith('image/')) return 'image';
          if (mime.startsWith('audio/')) return 'audio';
          if (mime.startsWith('video/')) return 'video';
          return 'file';
        });
        conversationMessageStatsService.onNewMessage(
          this.prisma, message.conversationId, userId || participantId, data.content ?? '', attachmentTypes, message.originalLanguage ?? null,
          message.messageType || 'text'
        ).catch(err => handlerLogger.warn('stats update error', { error: err }));
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
   * Permissions: only the message author can edit their own message.
   * Anonymous users cannot edit (no stable identity → no ownership proof).
   */
  async handleMessageEdit(
    socket: Socket,
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

      const message = await this.prisma.message.findFirst({
        where: {
          id: validated.messageId,
          sender: { userId },
          deletedAt: null,
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          originalLanguage: true,
          sender: { select: { id: true, userId: true, displayName: true, avatar: true } },
          attachments: { select: attachmentMediaSelect },
        },
      });

      if (!message) {
        this._sendGenericError(callback, 'Message not found or you are not authorized to edit it', socket);
        return;
      }

      const hasAttachments = message.attachments && message.attachments.length > 0;
      if (!validated.content.trim() && !hasAttachments) {
        this._sendGenericError(callback, 'Message content cannot be empty', socket);
        return;
      }

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
          content: validated.content.trim(),
          isEdited: true,
          editedAt,
          translations: null,
        },
      });

      if (editResult.count === 0) {
        this._sendGenericError(callback, 'Message not found or you are not authorized to edit it', socket);
        return;
      }

      const updatedMessage = {
        id: message.id,
        conversationId: message.conversationId,
        content: validated.content.trim(),
        isEdited: true,
        editedAt,
        originalLanguage: message.originalLanguage,
        sender: message.sender,
      };

      // Trigger async retranslation — fire-and-forget, non-blocking
      const retranslationPayload = {
        id: validated.messageId,
        content: validated.content.trim(),
        originalLanguage: message.originalLanguage,
        conversationId: message.conversationId,
        senderId: message.senderId,
      };
      this.translationService.retranslateMessageAsync(validated.messageId, retranslationPayload)
        .catch((err: unknown) => handlerLogger.warn('retranslation failed after socket edit', { messageId: validated.messageId, error: err }));

      // Attachments are unaffected by a content edit — carry over the ones
      // fetched pre-edit so clients that overwrite their cached message with
      // this payload (`{ ...cached, ...editedPayload }`) do not lose the
      // photo/video/audio that was attached to the message being edited.
      const editedPayload = {
        ...updatedMessage,
        conversationId: message.conversationId,
        translations: [],
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

      this._enqueueOfflineEventForParticipants(
        message.conversationId, message.senderId, 'edited', validated.messageId, editedPayload
      ).catch((err) => handlerLogger.warn('offline enqueue (edit) failed', { error: err }));

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
   * Permissions: message author OR conversation admin/moderator OR global ADMIN/BIGBOSS.
   * Anonymous users cannot delete.
   */
  async handleMessageDelete(
    socket: Socket,
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
          conversation: {
            select: {
              createdAt: true,
              lastMessageAt: true,
              participants: {
                where: { userId, isActive: true },
                select: { id: true, role: true },
              },
            },
          },
          attachments: { select: { id: true } },
        },
      });

      if (!message) {
        this._sendGenericError(callback, 'Message not found', socket);
        return;
      }

      const memberRole = message.conversation.participants[0]?.role;
      const isAuthor = message.sender?.userId === userId;

      let canDelete = isAuthor || memberRole === 'admin' || memberRole === 'moderator';

      // Lazy global role lookup — only when author + conversation-role checks fail
      if (!canDelete) {
        const userRecord = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        const globalRole = userRecord?.role;
        canDelete = globalRole === 'ADMIN' || globalRole === 'BIGBOSS' || globalRole === 'MODERATOR';
      }

      if (!canDelete) {
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

      // Recompute conversation's lastMessageAt to the latest non-deleted message.
      // Optimistic-concurrency guard: only write while lastMessageAt is still the
      // value read at handler start. A `message:new` committing between the read
      // and this write advances lastMessageAt; the guard then mismatches (0 rows
      // updated) so the cursor never regresses backward onto the deleted message
      // and mis-sorts the conversation list.
      const lastNonDeleted = await this.prisma.message.findFirst({
        where: { conversationId: message.conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      await this.prisma.conversation.updateMany({
        where: {
          id: message.conversationId,
          lastMessageAt: message.conversation.lastMessageAt,
        },
        data: {
          lastMessageAt: lastNonDeleted?.createdAt ?? message.conversation.createdAt,
        },
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

      // Skip the DELETER, not the author. A moderator/admin may delete another
      // user's message (`message.senderId` is the author's participant id, not
      // the actor's) — passing the author here skipped the offline author, who
      // then never learns their moderated message was removed. The deleter's own
      // participant id is the conversation-scoped row loaded above; when the
      // deleter is a global admin who is NOT a participant it is undefined, which
      // skips nobody (the online deleter is already excluded by the presence check).
      const deleterParticipantId = message.conversation.participants[0]?.id;
      this._enqueueOfflineEventForParticipants(
        message.conversationId, deleterParticipantId, 'deleted', validated.messageId, deletedPayload
      ).catch((err) => handlerLogger.warn('offline enqueue (delete) failed', { error: err }));

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
  async broadcastNewMessage(message: Message, conversationId: string, senderSocket?: Socket): Promise<void> {
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

      const messagePayload: unknown = this._buildMessagePayload(
        message,
        normalizedId,
        messageTranslations
      );

      // Enrichir avec les détails du forward si applicable
      if (message.forwardedFromId) {
        const [originalMsg, originalConv] = await Promise.all([
          this.prisma.message.findUnique({
            where: { id: message.forwardedFromId },
            select: {
              id: true, content: true, senderId: true, messageType: true, createdAt: true,
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
        ]);
        if (originalMsg) (messagePayload as Record<string, unknown>).forwardedFrom = originalMsg;
        if (originalConv) (messagePayload as Record<string, unknown>).forwardedFromConversation = originalConv;
      }

      // Réponse à un post (status/story/reel/post) : servir le SNAPSHOT figé
      // (rangé dans `metadata.postReplyTo` à la création) pour que le
      // destinataire voie la citation immédiatement et qu'elle survive à
      // l'expiration du post. Hissé en `postReplyTo` top-level. Fallback live
      // legacy via lookup du post.
      if (message.storyReplyToId) {
        const fromSnapshot = postReplyToFromMetadata(message.metadata);
        if (fromSnapshot) {
          (messagePayload as Record<string, unknown>).postReplyTo = fromSnapshot;
        } else {
          const post = await this.prisma.post.findUnique({
            where: { id: message.storyReplyToId },
            select: POST_REPLY_SNAPSHOT_SELECT,
          });
          if (post) {
            (messagePayload as Record<string, unknown>).postReplyTo = buildPostReplyTo(post);
          }
        }
      }

      if (message.content) {
        const mentionedUsers = await resolveMentionedUsers(this.prisma, [message.content]);
        if (mentionedUsers.length > 0) {
          (messagePayload as Record<string, unknown>).mentionedUsers = mentionedUsers;
        }
      }

      // Tracking des URLs brutes : hisser `metadata.trackingLinks` ([{url, token}])
      // en top-level (miroir de `postReplyTo`) — `_buildMessagePayload` n'embarque
      // pas `metadata`. Le destinataire rend le lien (texte + façade vidéo) vers
      // `/l/<token>` (capture + redirection) en gardant l'URL/aperçu.
      const rawMetadata = message.metadata;
      if (rawMetadata && typeof rawMetadata === 'object') {
        const tl = (rawMetadata as Record<string, unknown>).trackingLinks;
        if (Array.isArray(tl) && tl.length > 0) {
          (messagePayload as Record<string, unknown>).trackingLinks = tl;
        }
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
      const senderPayload = messagePayload as Record<string, unknown>;
      const broadcastPayload: Record<string, unknown> = { ...senderPayload };
      delete broadcastPayload.clientMessageId;

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
      // Opt-in (OFF by default) — flip per-deploy after staging measurement.
      const langFilterOn = process.env.SOCKET_LANG_FILTER === 'true';

      if (senderUserId) {
        // Multi-device : send the cid-aware payload to the sender's
        // user room (catches every iOS / web session of this user)
        // and the cid-stripped payload to the conversation room
        // EXCEPT the sender's user room so peers do not receive a
        // duplicate.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, broadcastPayload, { excludeUserId: senderUserId });
        } else {
          this.io
            .to(room)
            .except(ROOMS.user(senderUserId))
            .emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        }
        this.io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else if (senderSocket) {
        // Anonymous sender with an active socket : same single-session
        // split as before. Multi-device anonymous is undefined.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, broadcastPayload, { excludeSocketId: senderSocket.id });
        } else {
          senderSocket.broadcast.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        }
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else {
        // No senderSocket context (REST path or background flush) and
        // no resolvable user id : fall back to the cid-stripped payload
        // for the whole room. The sender's other sessions still
        // reconcile via the REST / socket ACK path which carries the cid.
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, broadcastPayload, {});
        } else {
          this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        }
      }
      handlerLogger.debug('message:new emitted', { conversationId: normalizedId, messageId: message.id, senderUserId: senderUserId ?? 'anon' });

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

      // Single participant query shared between CONVERSATION_UPDATED and
      // CONVERSATION_UNREAD_UPDATED to avoid a duplicate DB round-trip.
      // The superset select (id + userId + joinedAt) satisfies both callers.
      let sharedParticipants: { id: string; userId: string | null; joinedAt: Date }[] = [];
      try {
        sharedParticipants = await this.prisma.participant.findMany({
          where: { conversationId: normalizedId, isActive: true },
          select: { id: true, userId: true, joinedAt: true }
        });
      } catch (err) {
        handlerLogger.warn('participant fetch failed — skipping CONVERSATION_UPDATED + unread', { error: err });
      }

      // Notify each participant's user room that the conversation has
      // been updated (lastMessageAt advanced) so their conversation
      // list can re-sort and surface this conversation at the top in
      // real time. Without this, MESSAGE_NEW only reaches sockets
      // already inside ROOMS.conversation(id), so a user with the
      // conversation list open elsewhere never receives a signal —
      // the row stays at its old position until a manual refresh,
      // and brand-new DMs never appear in the list at all.
      if (sharedParticipants.length > 0) {
        const updatePayload = {
          conversationId: normalizedId,
          // `updatedBy` is REQUIRED by ConversationUpdatedEventData — the sender's
          // User.id (participant senderId fallback for anonymous). Parity with the
          // REST/ZMQ send path in MeeshySocketIOManager, whose typed `io` forced
          // this field; here `io` is the loose Socket.IO Server, so the compiler
          // never caught the omission.
          updatedBy: { id: senderUserId ?? message.senderId },
          lastMessageAt: message.createdAt,
          lastMessageId: message.id,
          lastMessagePreview: message.content,
          senderId: message.senderId,
          updatedAt: new Date().toISOString()
        };
        for (const p of sharedParticipants) {
          if (!p.userId) continue;
          this.io.to(ROOMS.user(p.userId)).emit(
            SERVER_EVENTS.CONVERSATION_UPDATED,
            updatePayload
          );
        }
        handlerLogger.debug('conversation:updated emitted', { conversationId: normalizedId, recipients: sharedParticipants.filter((p) => p.userId).length });
      }

      // Offline delivery queue — parity with the REST send path
      // (`MeeshySocketIOManager.broadcastMessage` / `_broadcastNewMessage`).
      // Without this, a message sent via the primary WS `message:send` path
      // to a currently-offline recipient is never replayed on their next
      // reconnect (`_drainPendingMessages`) and never triggers the
      // sent→delivered receipt upgrade for the sender. Uses the cid-stripped
      // `broadcastPayload` (same one peers receive live) so a replayed
      // message never leaks the sender's local optimistic id to another user.
      if (this.deliveryQueue) {
        for (const p of sharedParticipants) {
          // Queue key mirrors the presence key convention: userId for
          // registered users, participant id for anonymous (connectedUsers
          // and ROOMS.user use the same key on the drain side).
          const queueKey = p.userId ?? p.id;
          if (this._isSender(p, message.senderId) || this.connectedUsers.has(queueKey)) continue;
          this.deliveryQueue.enqueue(queueKey, {
            messageId: message.id,
            conversationId: normalizedId,
            payload: broadcastPayload,
            enqueuedAt: new Date().toISOString(),
          }).catch((err) => handlerLogger.warn('Failed to enqueue message for offline user', { userId: queueKey, error: err }));
        }
      }

      // Mettre à jour unread counts (re-uses the participant list already fetched above)
      await this._updateUnreadCounts(message, normalizedId, sharedParticipants);

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
  private _emitMessageNewByLanguage(
    room: string,
    payload: Record<string, unknown>,
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

    const originalLanguage = String((payload as { originalLanguage?: unknown }).originalLanguage || 'fr');
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
      let emitter: ReturnType<SocketIOServer['to']> = this.io.to(firstSid);
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
   */
  private async _enqueueOfflineEventForParticipants(
    conversationId: string,
    senderParticipantId: string | null | undefined,
    eventType: 'edited' | 'deleted',
    messageId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true }
      });
      for (const p of participants) {
        const queueKey = p.userId ?? p.id;
        if (p.id === senderParticipantId || this.connectedUsers.has(queueKey)) continue;
        this.deliveryQueue.enqueue(queueKey, {
          messageId,
          conversationId,
          payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
        }).catch((err) => handlerLogger.warn('Failed to enqueue offline event', { userId: queueKey, eventType, error: err }));
      }
    } catch (err) {
      handlerLogger.warn('Failed to fetch participants for offline enqueue', { conversationId, eventType, error: err });
    }
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
   * Marque un message comme "delivered" pour chaque destinataire en ligne
   * (ayant une socket active), respecte la préférence `showReadReceipts` de
   * chaque destinataire, puis émet UN seul `read-status:updated` consolidé
   * vers la conversation room et chaque user room afin que l'expéditeur
   * voie passer son indicateur à "delivered" sans devoir attendre une
   * action manuelle du destinataire.
   *
   * Public: source unique partagée par les DEUX émetteurs de `message:new` —
   * le chemin WS `message:send` (ci-dessus, `broadcastNewMessage`) ET le chemin
   * REST/ZMQ (`MeeshySocketIOManager._broadcastNewMessage`, qui délègue ici).
   * Les deux instances partagent le même `io`/`connectedUsers`/services, donc
   * le comportement est identique quel que soit le transport (parité receipt).
   */
  async autoDeliverToOnlineRecipients(
    message: Message,
    conversationId: string
  ): Promise<void> {
    const senderId = message.senderId;
    if (!senderId) return;

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { id: true, userId: true }
    });

    const onlineRecipients = participants.filter(
      (p): p is { id: string; userId: string } =>
        !this._isSender(p, senderId) && !!p.userId && this.connectedUsers.has(p.userId)
    );
    handlerLogger.debug('auto-deliver', { conversationId, messageId: message.id, participants: participants.length, onlineRecipients: onlineRecipients.length });
    if (onlineRecipients.length === 0) return;

    const preferences = await this.privacyPreferencesService.getPreferencesForUsers(
      onlineRecipients.map((r) => ({ id: r.userId, isAnonymous: false }))
    );
    const allowedRecipients = onlineRecipients.filter(
      (r) => preferences.get(r.userId)?.showReadReceipts
    );

    const results = await Promise.allSettled(
      allowedRecipients.map((r) =>
        this.readStatusService.markMessagesAsReceived(r.id, conversationId, message.id)
      )
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        handlerLogger.warn('auto-deliver markAsReceived failed', {
          participantId: allowedRecipients[index].id,
          error: result.reason
        });
      }
    });

    const firstAckerIndex = results.findIndex((r) => r.status === 'fulfilled');
    if (firstAckerIndex === -1) {
      handlerLogger.debug('auto-deliver skipped — no receipts marked', { conversationId, didMarkAny: false });
      return;
    }
    const firstAcker = allowedRecipients[firstAckerIndex];

    const summary = await this.readStatusService.getLatestMessageSummary(conversationId);

    const payload = {
      conversationId,
      participantId: firstAcker.id,
      userId: firstAcker.userId,
      type: 'received' as const,
      updatedAt: new Date(),
      summary
    };

    const convRoom = ROOMS.conversation(conversationId);
    let emitter: ReturnType<SocketIOServer['to']> = this.io.to(convRoom);
    const seen = new Set<string>([convRoom]);
    for (const p of participants) {
      if (!p.userId) continue;
      const userRoom = ROOMS.user(p.userId);
      if (seen.has(userRoom)) continue;
      seen.add(userRoom);
      emitter = emitter.to(userRoom);
    }
    emitter.emit(SERVER_EVENTS.READ_STATUS_UPDATED, payload);
    emitter.emit(SERVER_EVENTS.MESSAGE_READ_STATUS_UPDATED, payload);
    handlerLogger.debug('auto-deliver read-status:updated emitted', { conversationId, rooms: [...seen], deliveredCount: summary.deliveredCount });
  }

  /**
   * Récupère le contexte utilisateur depuis le socket
   */
  private _getUserContext(socket: Socket): {
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
      return this._parseTranslations(message.translations);
    }
    const msg = await this.prisma.message.findUnique({
      where: { id: message.id },
      select: { translations: true }
    });
    return this._parseTranslations(msg?.translations);
  }

  private _parseTranslations(translations: unknown): unknown[] {
    if (!translations || typeof translations !== 'object') return [];
    if (Array.isArray(translations)) return translations;
    return Object.entries(translations as Record<string, unknown>).map(([lang, data]) => ({
      targetLanguage: lang,
      ...(typeof data === 'object' && data !== null ? data : {})
    }));
  }

  /**
   * Construit le payload de message pour broadcast
   * Unified Participant: senderId is Participant.id, sender is Participant object
   */
  private _buildMessagePayload(
    message: Message,
    conversationId: string,
    translations: unknown[]
  ): unknown {
    // Build a backward-compatible sender object from Participant
    const senderParticipant = message.sender;
    const senderUser = senderParticipant?.user;

    return {
      id: message.id,
      conversationId,
      // `message.senderId` is a Participant.id, but clients compare the wire
      // `senderId` against their own User.id (apps/web use-socket-cache-sync.ts)
      // to detect own messages and reconcile the optimistic bubble across
      // devices. Resolve to the sender's User.id — mirroring the REST/ZMQ
      // writer (MeeshySocketIOManager.broadcastMessage) — so both transports
      // emit the same id-space. Falls back to Participant.id for anonymous
      // senders (no userId), matching the anonymous room convention.
      senderId: senderParticipant?.userId ?? senderUser?.id ?? message.senderId,
      content: message.content,
      originalLanguage: message.originalLanguage || 'fr',
      messageType: message.messageType || 'text',
      // Phase 4 §6.2 — `clientMessageId` doit voyager dans le payload
      // `message:new` cible vers le sender pour que la réconciliation
      // by-cid (iOS / web) promote l'optimistic même quand l'ACK socket
      // a été perdu (crash app après le send, multi-device). Le caller
      // `broadcastNewMessage` strip ce champ pour les autres
      // participants (`delete broadcastPayload.clientMessageId`).
      clientMessageId: (message as unknown as Record<string, unknown>)['clientMessageId'] || undefined,
      isBlurred: Boolean(message.isBlurred),
      isViewOnce: Boolean(message.isViewOnce),
      maxViewOnceCount: message.maxViewOnceCount ?? undefined,
      effectFlags: (message as unknown as Record<string, unknown>)['effectFlags'] ?? 0,
      expiresAt: message.expiresAt || undefined,
      isEdited: Boolean(message.isEdited),
      deletedAt: message.deletedAt || undefined,
      createdAt: message.createdAt,
      validatedMentions: message.validatedMentions ?? [],
      translations,
      // Unified sender from Participant
      sender: senderParticipant ? {
        id: senderParticipant.id,
        displayName: senderParticipant.nickname || senderParticipant.displayName,
        avatar: senderParticipant.avatar || senderUser?.avatar,
        type: senderParticipant.type,
        userId: senderParticipant.userId,
        // Backward compat: flatten user fields
        username: senderUser?.username,
        firstName: senderUser?.firstName,
        lastName: senderUser?.lastName,
      } : undefined,
      attachments: this._serializeAttachmentsField(message),
      replyToId: message.replyToId,
      replyTo: message.replyTo,
      // Réponse à un post : `postReplyTo` (snapshot figé) est ajouté par
      // `broadcastNewMessage` après ce build, en miroir de `forwardedFrom`.
      storyReplyToId: message.storyReplyToId || undefined,
      forwardedFromId: message.forwardedFromId || undefined,
      forwardedFromConversationId: message.forwardedFromConversationId || undefined,
      isEncrypted: message.isEncrypted,
      encryptionMode: message.encryptionMode,
      encryptedContent: message.encryptedContent,
      encryptionMetadata: message.encryptionMetadata,
      encryptedPayload: message.isEncrypted && message.encryptionMode === 'e2ee' && message.encryptedContent ? {
        ciphertext: message.encryptedContent,
        ...(typeof message.encryptionMetadata === 'object' && message.encryptionMetadata ? message.encryptionMetadata : {})
      } : undefined,
    };
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
   * Met à jour les unread counts pour tous les participants
   * Uses Participant model instead of ConversationMember
   */
  private async _updateUnreadCounts(
    message: Message,
    conversationId: string,
    preloadedParticipants?: { id: string; userId: string | null; joinedAt: Date }[]
  ): Promise<void> {
    try {
      const senderId = message.senderId;
      if (!senderId) return;

      // Reuse the participant list already fetched by the caller when available
      // (avoids a second DB round-trip inside broadcastNewMessage). Fall back to
      // a fresh query when called standalone (e.g. from _broadcastNewMessage).
      const allParticipants = preloadedParticipants ?? await this.prisma.participant.findMany({
        where: {
          conversationId,
          isActive: true,
        },
        select: { id: true, userId: true, joinedAt: true }
      });
      // Filter out the sender — unread counts are for recipients only
      const participants = allParticipants.filter((p) => !this._isSender(p, senderId));

      // Batch: 1 cursor query + 1 message fetch instead of 3N sequential queries.
      // Each recipient's count excludes their OWN messages (handled inside the service).
      const unreadCounts = await this.readStatusService.getUnreadCountsForParticipants(
        participants,
        conversationId
      );

      await Promise.all(participants.map(async (participant) => {
        const roomTarget = participant.userId ?? participant.id;
        const unreadCount = unreadCounts.get(participant.id) ?? 0;
        this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
          conversationId,
          unreadCount
        });
      }));
    } catch (error) {
      handlerLogger.warn('unread count update failed', { error });
    }
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
    socket: Socket,
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
    socket: Socket,
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
        const data = response.data as { id: string; clientMessageId?: string; createdAt?: Date | string };
        const createdAt = data.createdAt instanceof Date
          ? data.createdAt.toISOString()
          : data.createdAt;
        callback({
          success: true,
          data: {
            messageId: data.id,
            ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {}),
            ...(createdAt ? { createdAt } : {})
          }
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
