/**
 * Message Handler
 * Gère l'envoi et le broadcast des messages
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessagingService } from '../../services/MessagingService';
import { StatusService } from '../../services/StatusService';
import { NotificationService } from '../../services/NotificationService';
import { validateMessageLength } from '../../config/message-limits';
import {
  getConnectedUser,
  extractJWTToken,
  extractSessionToken,
  normalizeConversationId,
  buildAnonymousDisplayName,
  type SocketUser
} from '../utils/socket-helpers';
import type {
  SocketIOResponse,
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { invalidateConversationCacheAsync } from '../../services/ConversationListCache';

export interface MessageHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  messagingService: MessagingService;
  statusService: StatusService;
  notificationService: NotificationService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  stats: { messages_processed: number; errors: number };
}

export class MessageHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private messagingService: MessagingService;
  private statusService: StatusService;
  private notificationService: NotificationService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private stats: { messages_processed: number; errors: number };

  constructor(deps: MessageHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.messagingService = deps.messagingService;
    this.statusService = deps.statusService;
    this.notificationService = deps.notificationService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.stats = deps.stats;
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
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { userId, isAnonymous, user } = userContext;

      // Validation longueur du message
      const validation = validateMessageLength(data.content);
      if (!validation.isValid) {
        this._sendError(callback, validation.error || 'Message invalide', socket);
        return;
      }

      // Mettre à jour l'activité
      this.statusService.updateLastSeen(userId, isAnonymous);

      // Récupérer le nom d'affichage pour les anonymes
      const anonymousDisplayName = isAnonymous
        ? await this._getAnonymousDisplayName(user?.sessionToken)
        : undefined;

      // Créer la requête de message
      const messageRequest: MessageRequest = {
        conversationId: data.conversationId,
        content: data.content,
        originalLanguage: data.originalLanguage,
        messageType: data.messageType || 'text',
        replyToId: data.replyToId,
        isAnonymous,
        anonymousDisplayName,
        metadata: {
          source: 'websocket',
          socketId: socket.id,
          clientTimestamp: Date.now()
        }
      };

      // Envoyer via MessagingService
      const jwtToken = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      const response: MessageResponse = await this.messagingService.handleMessage(
        messageRequest,
        userId,
        true,
        jwtToken,
        sessionToken
      );

      // Répondre au client
      this._sendResponse(callback, response);

      // Broadcaster le message si succès
      if (response.success && response.data?.id) {
        const message = await this._fetchMessageForBroadcast(response.data.id);
        if (message) {
          // Invalider le cache AVANT de broadcaster pour éviter les race conditions
          // où un client rafraîchit et obtient des données stale
          await invalidateConversationCacheAsync(message.conversationId, this.prisma);

          await this.broadcastNewMessage(message, message.conversationId, socket);
          await this._createMessageNotifications(message, userId);
        }
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
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { userId, isAnonymous, user } = userContext;

      // Validation
      if (data.content && data.content.trim()) {
        const validation = validateMessageLength(data.content);
        if (!validation.isValid) {
          this._sendError(callback, validation.error || 'Message invalide', socket);
          return;
        }
      }

      // Vérifier les attachments
      const { AttachmentService } = await import('../../services/AttachmentService');
      const attachmentService = new AttachmentService(this.prisma);

      for (const attachmentId of data.attachmentIds) {
        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment || attachment.uploadedBy !== userId) {
          this._sendError(callback, `Attachment ${attachmentId} invalid`, socket);
          return;
        }
      }

      const anonymousDisplayName = isAnonymous
        ? await this._getAnonymousDisplayName(user?.sessionToken)
        : undefined;

      const messageRequest: MessageRequest = {
        conversationId: data.conversationId,
        content: data.content,
        originalLanguage: data.originalLanguage,
        messageType: 'text',
        replyToId: data.replyToId,
        isAnonymous,
        anonymousDisplayName,
        attachments: data.attachmentIds.map((id) => ({ id } as never)),
        metadata: {
          source: 'websocket',
          socketId: socket.id,
          clientTimestamp: Date.now()
        }
      };

      const jwtToken = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      const response: MessageResponse = await this.messagingService.handleMessage(
        messageRequest,
        userId,
        true,
        jwtToken,
        sessionToken
      );

      if (response.success && response.data?.id) {
        await attachmentService.associateAttachmentsToMessage(data.attachmentIds, response.data.id);

        // Traiter les audios
        await this._processAudioAttachments(data.attachmentIds, response.data.id);

        const message = await this._fetchMessageForBroadcast(response.data.id);
        if (message) {
          // Invalider le cache AVANT de broadcaster pour éviter les race conditions
          await invalidateConversationCacheAsync(message.conversationId, this.prisma);

          await this.broadcastNewMessage(message, message.conversationId, socket);
        }
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

      const messagePayload = this._buildMessagePayload(
        message,
        normalizedId,
        translations.status === 'fulfilled' ? translations.value : [],
        stats.status === 'fulfilled' ? stats.value : null
      );

      const room = `conversation_${normalizedId}`;
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
    userId: string;
    isAnonymous: boolean;
    user?: SocketUser;
  } | null {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return null;

    const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!userResult) return null;

    return {
      userId: userResult.realUserId,
      isAnonymous: userResult.user.isAnonymous,
      user: userResult.user
    };
  }

  /**
   * Récupère le nom d'affichage pour un utilisateur anonyme
   */
  private async _getAnonymousDisplayName(sessionToken?: string): Promise<string> {
    if (!sessionToken) return 'Anonymous User';

    try {
      const anonymousUser = await this.prisma.anonymousParticipant.findUnique({
        where: { sessionToken },
        select: { username: true, firstName: true, lastName: true }
      });

      return buildAnonymousDisplayName(anonymousUser);
    } catch {
      return 'Anonymous User';
    }
  }

  /**
   * Récupère un message complet pour le broadcast
   */
  private async _fetchMessageForBroadcast(messageId: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true } },
        anonymousSender: { select: { id: true, firstName: true, lastName: true, username: true } },
        attachments: true,
        replyTo: { include: { sender: true, anonymousSender: true } }
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
   */
  private _buildMessagePayload(
    message: Message,
    conversationId: string,
    translations: unknown[],
    stats: unknown
  ): unknown {
    return {
      id: message.id,
      conversationId,
      senderId: message.senderId || undefined,
      anonymousSenderId: message.anonymousSenderId || undefined,
      content: message.content,
      originalLanguage: message.originalLanguage || 'fr',
      messageType: message.messageType || 'text',
      createdAt: message.createdAt,
      validatedMentions: (message as never)['validatedMentions'] || [],
      translations,
      sender: message.sender,
      anonymousSender: (message as never)['anonymousSender'],
      attachments: (message as never)['attachments'] || [],
      replyToId: message.replyToId,
      replyTo: (message as never)['replyTo'],
      meta: { conversationStats: stats }
    };
  }

  /**
   * Met à jour les unread counts pour tous les membres
   */
  private async _updateUnreadCounts(message: Message, conversationId: string): Promise<void> {
    try {
      const senderId = message.senderId || message.anonymousSenderId;
      if (!senderId) return;

      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId, isActive: true, userId: { not: senderId } },
        select: { userId: true }
      });

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(this.prisma);

      for (const member of members) {
        const unreadCount = await readStatusService.getUnreadCount(member.userId, conversationId);
        this.io.to(`user_${member.userId}`).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
          conversationId,
          unreadCount
        });
      }
    } catch (error) {
      console.warn('⚠️ [UNREAD_COUNT] Erreur:', error);
    }
  }

  /**
   * Créer des notifications pour un message
   */
  private async _createMessageNotifications(message: Message, senderId: string): Promise<void> {
    try {
      const conversationId = message.conversationId;
      const messageId = message.id;
      const messagePreview = message.content.substring(0, 100);

      // Récupérer tous les membres de la conversation sauf l'expéditeur
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          isActive: true,
          userId: { not: senderId }
        },
        select: { userId: true }
      });

      // Créer une notification pour chaque membre
      for (const member of members) {
        await this.notificationService.createMessageNotification({
          recipientUserId: member.userId,
          senderId,
          messageId,
          conversationId,
          messagePreview,
        });
      }

      console.log(`[NOTIFICATIONS] Created ${members.length} notifications for message ${messageId}`);
    } catch (error) {
      console.error('[NOTIFICATIONS] Error creating message notifications:', error);
    }
  }

  /**
   * Traiter les attachments audio
   */
  private async _processAudioAttachments(attachmentIds: string[], messageId: string): Promise<void> {
    // Logique de traitement audio (déjà implémentée dans le fichier original)
    // Cette méthode est un placeholder
  }

  /**
   * Envoie une réponse d'erreur
   */
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
    socket.emit('error', { message: error });
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
