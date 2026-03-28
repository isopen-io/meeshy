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
import { NotificationService } from '../../services/NotificationService';
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
  SocketIOResponse,
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import type { ZmqAgentClient } from '../../services/zmq-agent/ZmqAgentClient.js';
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
      if (!schemaValidation.success) {
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
        originalLanguage: validated.originalLanguage,
        messageType: validated.messageType || 'text',
        replyToId: validated.replyToId,
        forwardedFromId: data.forwardedFromId,
        forwardedFromConversationId: data.forwardedFromConversationId,
        encryptedPayload: data.encryptedPayload,
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
      attachmentIds: string[];
      replyToId?: string;
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketMessageSendWithAttachmentsSchema, data);
      if (!schemaValidation.success) {
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

      const { AttachmentService } = await import('../../services/AttachmentService');
      const attachmentService = new AttachmentService(this.prisma);

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
        originalLanguage: validated.originalLanguage,
        messageType: 'text',
        replyToId: validated.replyToId,
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
      }

      this._sendResponse(callback, response);
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

      const room = ROOMS.conversation(normalizedId);
      this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);

      if (senderSocket) {
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      }

      // Mettre à jour unread counts
      await this._updateUnreadCounts(message, normalizedId);
    } catch (error) {
      console.error('[BROADCAST] Erreur:', error);
    }
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
    return this.prisma.message.findUnique({
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
    }) as Promise<Message | null>;
  }

  /**
   * Récupère les traductions d'un message
   */
  private async _getMessageTranslations(messageId: string): Promise<unknown[]> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        translations: {
          select: {
            id: true,
            targetLanguage: true,
            translatedContent: true,
            translationModel: true,
            confidenceScore: true
          }
        }
      }
    });
    return msg?.translations || [];
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
      isBlurred: Boolean((message as never)['isBlurred']),
      isViewOnce: Boolean((message as never)['isViewOnce']),
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

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(this.prisma);

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
    callback: ((response: SocketIOResponse<{ messageId: string }>) => void) | undefined,
    response: MessageResponse
  ): void {
    if (!callback) return;

    if (response.success && response.data) {
      callback({
        success: true,
        data: { messageId: response.data.id }
      });
    } else {
      callback({
        success: false,
        error: response.error || 'Failed to send message'
      });
    }
  }
}
