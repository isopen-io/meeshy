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
import { MessagingService } from '../../services/MessagingService';
import { StatusService } from '../../services/StatusService';
import { NotificationService } from '../../services/notifications/NotificationService';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { validateMessageLength } from '../../config/message-limits';
import {
  getConnectedUser,
  extractJWTToken,
  extractSessionToken,
  normalizeConversationId,
  type SocketUser
} from '../utils/socket-helpers';
import { resolveParticipant } from '../utils/participant-resolver.js';
import type {
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { resolveMentionedUsers } from '../../services/MentionService';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import type { ZmqAgentClient } from '../../services/zmq-agent/ZmqAgentClient.js';
import { AttachmentService } from '../../services/attachments/AttachmentService';
import { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketMessageSendSchema, SocketMessageSendWithAttachmentsSchema } from '../../validation/socket-event-schemas.js';


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
  private rateLimiter = getSocketRateLimiter();

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

      const validation = validateMessageLength(validated.content);
      if (!validation.isValid && !data.encryptedPayload) {
        this._sendError(callback, validation.error || 'Message invalide', socket);
        return;
      }

      if (!isAnonymous && userId) {
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: validated.conversationId },
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
            .filter((id): id is string => id !== null && id !== userId);
          if (otherMemberIds.length > 0) {
            const blockers = await this.prisma.user.findMany({
              where: { id: { in: otherMemberIds }, blockedUserIds: { has: userId } },
              select: { id: true }
            });
            if (blockers.length > 0) {
              this._sendError(callback, 'You are blocked by this user', socket);
              return;
            }
          }
        }
      }

      // Mettre à jour l'activité
      this.statusService.updateLastSeen(userId || participantId, isAnonymous);

      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, validated.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

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
        forwardedFromId: data.forwardedFromId,
        forwardedFromConversationId: data.forwardedFromConversationId,
        encryptedPayload: data.encryptedPayload as MessageRequest['encryptedPayload'],
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

      // Broadcaster le message si succès
      // response.data is already enriched (sender.user, attachments, replyTo) from saveMessage include
      if (response.success && response.data) {
        const message = response.data as unknown as import('@meeshy/shared/types/index').Message;
        await this.broadcastNewMessage(message, message.conversationId, socket);

        this._notifyAgent({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderDisplayName: (message as unknown as Record<string, unknown>).sender
            ? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.displayName as string | undefined
              ?? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.username as string | undefined
            : undefined,
          senderUsername: (message as unknown as Record<string, unknown>).sender
            ? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.username as string | undefined
            : undefined,
          content: message.content,
          originalLanguage: message.originalLanguage,
          replyToId: message.replyToId,
          mentionedUserIds: await this._resolveMentionUserIds(
            ((message as never)['validatedMentions'] as string[]) ?? []
          ),
          createdAt: message.createdAt,
        });

        conversationMessageStatsService.onNewMessage(
          this.prisma, message.conversationId, userId || participantId, data.content ?? '', [], null
        ).catch(err => console.error('[MessageHandler] Stats update error:', err));
      }

      this.stats.messages_processed++;
    } catch (error: unknown) {
      console.error('[MESSAGE_SEND] Erreur:', error);
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

      if (validated.content && validated.content.trim()) {
        const validation = validateMessageLength(validated.content);
        if (!validation.isValid) {
          this._sendError(callback, validation.error || 'Message invalide', socket);
          return;
        }
      }

      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, validated.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      const attachmentService = this.attachmentService;

      for (const attachmentId of validated.attachmentIds) {
        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment || attachment.uploadedBy !== (userId || participantId)) {
          this._sendError(callback, `Attachment ${attachmentId} invalid`, socket);
          return;
        }
      }

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
        forwardedFromId: data.forwardedFromId,
        forwardedFromConversationId: data.forwardedFromConversationId,
        isAnonymous,
        // Aligner avec GatewayMessage: attachments are passed as IDs for linking
        attachmentIds: validated.attachmentIds,
        metadata: {
          source: 'websocket',
          socketId: socket.id,
          clientTimestamp: Date.now()
        }
      } as any; // Cast needed as MessageRequest uses readonly attachments objects

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

      if (response.success && response.data) {
        const message = response.data as unknown as import('@meeshy/shared/types/index').Message;
        await this.broadcastNewMessage(message, message.conversationId, socket);

        this._notifyAgent({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderDisplayName: (message as unknown as Record<string, unknown>).sender
            ? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.displayName as string | undefined
              ?? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.username as string | undefined
            : undefined,
          senderUsername: (message as unknown as Record<string, unknown>).sender
            ? ((message as unknown as Record<string, unknown>).sender as Record<string, unknown>)?.username as string | undefined
            : undefined,
          content: message.content,
          originalLanguage: message.originalLanguage,
          replyToId: message.replyToId,
          mentionedUserIds: await this._resolveMentionUserIds(
            ((message as never)['validatedMentions'] as string[]) ?? []
          ),
          createdAt: message.createdAt,
        });

        const msgAttachments = (message as unknown as Record<string, unknown>).attachments as Array<Record<string, unknown>> | undefined;
        const attachmentTypes = (msgAttachments ?? []).map((a: Record<string, unknown>) => {
          const mime = (a.mimeType as string) ?? '';
          if (mime.startsWith('image/')) return 'image';
          if (mime.startsWith('audio/')) return 'audio';
          if (mime.startsWith('video/')) return 'video';
          return 'file';
        });
        conversationMessageStatsService.onNewMessage(
          this.prisma, message.conversationId, userId || participantId, data.content ?? '', attachmentTypes, null
        ).catch(err => console.error('[MessageHandler] Stats update error:', err));
      }

      this.stats.messages_processed++;
    } catch (error: unknown) {
      console.error('[MESSAGE_SEND_ATTACHMENTS] Erreur:', error);
      this.stats.errors++;
      this._sendError(callback, 'Failed to send message', socket);
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

      // Récupérer traductions et stats en parallèle
      const [translations, stats] = await Promise.allSettled([
        this._getMessageTranslations(message.id),
        conversationStatsService.updateOnNewMessage(
          this.prisma,
          conversationId,
          message.originalLanguage || 'fr',
          () => Array.from(this.connectedUsers.values()).map((u) => u.id)
        )
      ]);

      const messagePayload: unknown = this._buildMessagePayload(
        message,
        normalizedId,
        translations.status === 'fulfilled' ? translations.value : [],
        stats.status === 'fulfilled' ? stats.value : null
      );

      // Enrichir avec les détails du forward si applicable
      if (message.forwardedFromId) {
        const [originalMsg, originalConv] = await Promise.all([
          this.prisma.message.findUnique({
            where: { id: message.forwardedFromId },
            select: {
              id: true, content: true, senderId: true, messageType: true, createdAt: true,
              sender: { select: { id: true, userId: true, displayName: true, avatar: true, type: true } },
              attachments: { select: { id: true, mimeType: true, thumbnailUrl: true, fileUrl: true }, take: 1 }
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

      if (message.content) {
        const mentionedUsers = await resolveMentionedUsers(this.prisma, [message.content]);
        if (mentionedUsers.length > 0) {
          (messagePayload as Record<string, unknown>).mentionedUsers = mentionedUsers;
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
      const senderParticipant = (message as unknown as { sender?: { userId?: string | null } }).sender;
      const senderUserId = senderParticipant?.userId ?? null;

      if (senderUserId) {
        // Multi-device : send the cid-aware payload to the sender's
        // user room (catches every iOS / web session of this user)
        // and the cid-stripped payload to the conversation room
        // EXCEPT the sender's user room so peers do not receive a
        // duplicate.
        this.io
          .to(room)
          .except(ROOMS.user(senderUserId))
          .emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        this.io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else if (senderSocket) {
        // Anonymous sender with an active socket : same single-session
        // split as before. Multi-device anonymous is undefined.
        senderSocket.broadcast.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else {
        // No senderSocket context (REST path or background flush) and
        // no resolvable user id : fall back to the cid-stripped payload
        // for the whole room. The sender's other sessions still
        // reconcile via the REST / socket ACK path which carries the cid.
        this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
      }

      // Notify each participant's user room that the conversation has
      // been updated (lastMessageAt advanced) so their conversation
      // list can re-sort and surface this conversation at the top in
      // real time. Without this, MESSAGE_NEW only reaches sockets
      // already inside ROOMS.conversation(id), so a user with the
      // conversation list open elsewhere never receives a signal —
      // the row stays at its old position until a manual refresh,
      // and brand-new DMs never appear in the list at all.
      try {
        const participants = await this.prisma.participant.findMany({
          where: { conversationId: normalizedId, isActive: true },
          select: { userId: true }
        });
        const updatePayload = {
          conversationId: normalizedId,
          lastMessageAt: message.createdAt,
          lastMessageId: message.id,
          lastMessagePreview: message.content,
          senderId: message.senderId,
          updatedAt: new Date().toISOString()
        };
        for (const p of participants) {
          if (!p.userId) continue;
          this.io.to(ROOMS.user(p.userId)).emit(
            SERVER_EVENTS.CONVERSATION_UPDATED,
            updatePayload
          );
        }
      } catch (err) {
        console.warn('[BROADCAST] CONVERSATION_UPDATED emit failed:', err);
      }

      // Mettre à jour unread counts
      await this._updateUnreadCounts(message, normalizedId);

      // Auto-mark delivered for online recipients so the sender's checkmark
      // upgrades from "sent" (✓) to "delivered" (✓✓ gray) immediately, even
      // when the recipient is connected but viewing another conversation.
      // Without this, MESSAGE_NEW only reaches sockets in the conversation
      // room, so an online recipient outside the conversation never triggers
      // mark-as-received and the sender stays stuck at a single checkmark.
      this._autoDeliverToOnlineRecipients(message, normalizedId).catch((err) => {
        console.warn('[AUTO_DELIVERED] background failure:', err);
      });
    } catch (error) {
      console.error('[BROADCAST] Erreur:', error);
    }
  }

  /**
   * Marque un message comme "delivered" pour chaque destinataire en ligne
   * (ayant une socket active), respecte la préférence `showReadReceipts` de
   * chaque destinataire, puis émet UN seul `read-status:updated` consolidé
   * vers la conversation room et chaque user room afin que l'expéditeur
   * voie passer son indicateur à "delivered" sans devoir attendre une
   * action manuelle du destinataire.
   */
  private async _autoDeliverToOnlineRecipients(
    message: Message,
    conversationId: string
  ): Promise<void> {
    const senderId = message.senderId;
    if (!senderId) return;

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true, id: { not: senderId } },
      select: { id: true, userId: true }
    });

    const onlineRecipients = participants.filter(
      (p) => p.userId && this.connectedUsers.has(p.userId)
    );
    if (onlineRecipients.length === 0) return;

    const { PrivacyPreferencesService } = await import('../../services/PrivacyPreferencesService.js');
    const privacyService = new PrivacyPreferencesService(this.prisma);

    let didMarkAny = false;
    let firstAcker: { id: string; userId: string } | null = null;

    for (const recipient of onlineRecipients) {
      if (!recipient.userId) continue;
      const allowsReceipts = await privacyService.shouldShowReadReceipts(recipient.userId, false);
      if (!allowsReceipts) continue;
      try {
        await this.readStatusService.markMessagesAsReceived(
          recipient.id,
          conversationId,
          message.id
        );
        didMarkAny = true;
        if (!firstAcker) firstAcker = { id: recipient.id, userId: recipient.userId };
      } catch (err) {
        console.warn('[AUTO_DELIVERED] markAsReceived failed:', err);
      }
    }

    if (!didMarkAny || !firstAcker) return;

    const summary = await this.readStatusService.getLatestMessageSummary(conversationId);

    const payload = {
      conversationId,
      participantId: firstAcker.id,
      userId: firstAcker.userId,
      type: 'received' as const,
      updatedAt: new Date(),
      summary
    };

    const allParticipants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true }
    });

    const convRoom = ROOMS.conversation(conversationId);
    let emitter: ReturnType<SocketIOServer['to']> = this.io.to(convRoom);
    const seen = new Set<string>([convRoom]);
    for (const p of allParticipants) {
      if (!p.userId) continue;
      const userRoom = ROOMS.user(p.userId);
      if (seen.has(userRoom)) continue;
      seen.add(userRoom);
      emitter = emitter.to(userRoom);
    }
    emitter.emit(SERVER_EVENTS.READ_STATUS_UPDATED, payload);
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

    const result = await resolveParticipant({
      prisma: this.prisma,
      userIdOrToken: userId,
      conversationId,
      connectedUsers: this.connectedUsers,
    });

    return result?.participantId ?? null;
  }

  /**
   * Récupère un message complet pour le broadcast
   * Unified Participant: sender is a Participant, no anonymousSender
   * Still needed for attachment and forward paths where relations are added post-create
   */
  private async _fetchMessageForBroadcast(messageId: string): Promise<Message | null> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
            type: true,
            nickname: true,
            userId: true,
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
        attachments: true,
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                type: true,
                nickname: true,
                userId: true,
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
            }
          }
        }
      }
    });
    if (!msg) return null;
    return { ...msg, timestamp: msg.createdAt, translations: [] } as unknown as Message;
  }

  /**
   * Récupère les traductions d'un message
   */
  private async _getMessageTranslations(messageId: string): Promise<unknown[]> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { translations: true }
    });
    const translations = msg?.translations;
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
    translations: unknown[],
    stats: unknown
  ): unknown {
    // Build a backward-compatible sender object from Participant
    const senderParticipant = (message as unknown as Record<string, unknown>).sender as Record<string, unknown> | undefined;
    const senderUser = senderParticipant?.user as Record<string, unknown> | undefined;

    return {
      id: message.id,
      conversationId,
      senderId: message.senderId,
      content: message.content,
      originalLanguage: message.originalLanguage || 'fr',
      messageType: message.messageType || 'text',
      // Phase 4 §6.2 — `clientMessageId` doit voyager dans le payload
      // `message:new` cible vers le sender pour que la réconciliation
      // by-cid (iOS / web) promote l'optimistic même quand l'ACK socket
      // a été perdu (crash app après le send, multi-device). Le caller
      // `broadcastNewMessage` strip ce champ pour les autres
      // participants (`delete broadcastPayload.clientMessageId`).
      clientMessageId: (message as never)['clientMessageId'] || undefined,
      isBlurred: Boolean((message as never)['isBlurred']),
      isViewOnce: Boolean((message as never)['isViewOnce']),
      effectFlags: (message as never)['effectFlags'] ?? 0,
      expiresAt: (message as never)['expiresAt'] || undefined,
      isEdited: Boolean((message as never)['isEdited']),
      deletedAt: (message as never)['deletedAt'] || undefined,
      createdAt: message.createdAt,
      validatedMentions: (message as never)['validatedMentions'] || [],
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
      attachments: (message as never)['attachments'] || [],
      replyToId: message.replyToId,
      replyTo: (message as never)['replyTo'],
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
      meta: { conversationStats: stats }
    };
  }

  /**
   * Met à jour les unread counts pour tous les participants
   * Uses Participant model instead of ConversationMember
   */
  private async _updateUnreadCounts(message: Message, conversationId: string): Promise<void> {
    try {
      const senderId = message.senderId;
      if (!senderId) return;

      // Get all active participants except the sender
      const participants = await this.prisma.participant.findMany({
        where: {
          conversationId,
          isActive: true,
          id: { not: senderId }
        },
        select: { id: true, userId: true }
      });

      const readStatusService = this.readStatusService;

      await Promise.all(participants.map(async (participant) => {
        // Use userId for registered users (for their personal room), participantId for anonymous
        const roomTarget = participant.userId || participant.id;
        const unreadCount = await readStatusService.getUnreadCount(roomTarget, conversationId);
        this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
          conversationId,
          unreadCount
        });
      }));
    } catch (error) {
      console.warn('⚠️ [UNREAD_COUNT] Erreur:', error);
    }
  }


  private async _resolveMentionUserIds(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];
    try {
      const users = await this.prisma.user.findMany({
        where: { username: { in: usernames.map((u) => u.toLowerCase()) } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    } catch {
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
    }).catch(() => {});
  }

  private _sendError(
    callback: ((response: SocketIOResponse<{ messageId: string }>) => void) | undefined,
    error: string,
    socket: Socket
  ): void {
    const errorResponse: SocketIOResponse<{ messageId: string }> = {
      success: false,
      error
    };
    if (callback) callback(errorResponse);
    socket.emit(SERVER_EVENTS.ERROR, { message: error });
  }

  /**
   * Envoie une réponse de succès
   */
  private _sendResponse(
    callback: ((response: SocketIOResponse<{ messageId: string; clientMessageId?: string }>) => void) | undefined,
    response: MessageResponse
  ): void {
    if (!callback) return;

    if (response.success && response.data) {
      // Phase 4 §6.2 — echo `clientMessageId` back so iOS / web can match the
      // ACK against their pending optimistic row by cid (the `messageId`
      // alone is insufficient: the optimistic row has a `cid_*` local id
      // and only learns the server `messageId` from this very ACK).
      const data = response.data as { id: string; clientMessageId?: string };
      callback({
        success: true,
        data: {
          messageId: data.id,
          ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {})
        }
      });
    } else {
      callback({
        success: false,
        error: response.error || 'Failed to send message'
      });
    }
  }
}
