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
import type {
  SocketIOResponse,
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types/messaging';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { invalidateConversationCacheAsync } from '../../services/ConversationListCache';

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
      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { participantId, userId, isAnonymous } = userContext;

      // Validation longueur du message
      const validation = validateMessageLength(data.content);
      if (!validation.isValid && !data.encryptedPayload) {
        this._sendError(callback, validation.error || 'Message invalide', socket);
        return;
      }

      // Vérifier si l'expéditeur est bloqué par un membre de la conversation (DM uniquement)
      // For registered users, check via userId; for anonymous, skip block check
      if (!isAnonymous && userId) {
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: data.conversationId },
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

      // Resolve participantId for this conversation
      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, data.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      // Créer la requête de message
      const messageRequest: MessageRequest = {
        conversationId: data.conversationId,
        content: data.content,
        originalLanguage: data.originalLanguage,
        messageType: data.messageType || 'text',
        replyToId: data.replyToId,
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

      // Copier les attachments si c'est un transfert (avec vérification d'accès)
      if (response.success && response.data?.id && data.forwardedFromId) {
        try {
          // Vérifier que l'utilisateur a accès à la conversation source
          if (data.forwardedFromConversationId) {
            const isMember = await this.prisma.participant.findFirst({
              where: {
                conversationId: data.forwardedFromConversationId,
                ...(userId ? { userId } : { id: participantId }),
                isActive: true
              },
              select: { id: true }
            });
            if (!isMember) {
              console.warn(`[MESSAGE_SEND] Forward denied: participant ${resolvedParticipantId} not member of source conversation ${data.forwardedFromConversationId}`);
              return;
            }
          }

          const originalAttachments = await this.prisma.messageAttachment.findMany({
            where: { messageId: data.forwardedFromId }
          });

          if (originalAttachments.length > 0) {
            const createdAtts = await Promise.all(
              originalAttachments.map(att =>
                this.prisma.messageAttachment.create({
                  data: {
                    messageId: response.data!.id,
                    fileName: att.fileName,
                    originalName: att.originalName,
                    mimeType: att.mimeType,
                    fileSize: att.fileSize,
                    filePath: att.filePath,
                    fileUrl: att.fileUrl,
                    title: att.title,
                    alt: att.alt,
                    caption: att.caption,
                    forwardedFromAttachmentId: att.id,
                    isForwarded: true,
                    width: att.width,
                    height: att.height,
                    thumbnailPath: att.thumbnailPath,
                    thumbnailUrl: att.thumbnailUrl,
                    duration: att.duration,
                    bitrate: att.bitrate,
                    sampleRate: att.sampleRate,
                    codec: att.codec,
                    channels: att.channels,
                    fps: att.fps,
                    videoCodec: att.videoCodec,
                    pageCount: att.pageCount,
                    lineCount: att.lineCount,
                    uploadedBy: resolvedParticipantId,
                    isAnonymous: false,
                    transcription: att.transcription ?? undefined,
                    translations: att.translations ?? undefined,
                    metadata: att.metadata ?? undefined,
                  }
                })
              )
            );

            // Mettre à jour le messageType
            const firstMime = createdAtts[0].mimeType;
            let detectedType = 'text';
            if (firstMime.startsWith('image/')) detectedType = 'image';
            else if (firstMime.startsWith('audio/')) detectedType = 'audio';
            else if (firstMime.startsWith('video/')) detectedType = 'video';
            else if (firstMime.startsWith('application/')) detectedType = 'file';

            if (detectedType !== 'text') {
              await this.prisma.message.update({
                where: { id: response.data!.id },
                data: { messageType: detectedType }
              });
            }

            console.log(`[MESSAGE_SEND] 📎 Copied ${createdAtts.length} attachment(s) for forward`);
          }
        } catch (fwdErr) {
          console.error('[MESSAGE_SEND] Error copying forward attachments:', fwdErr);
        }
      }

      // Broadcaster le message si succès
      if (response.success && response.data?.id) {
        const message = await this._fetchMessageForBroadcast(response.data.id);
        if (message) {
          // Invalider le cache AVANT de broadcaster pour éviter les race conditions
          await invalidateConversationCacheAsync(message.conversationId, this.prisma);

          await this.broadcastNewMessage(message, message.conversationId, socket);
          await this._createMessageNotifications(message, resolvedParticipantId);
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
      forwardedFromId?: string;
      forwardedFromConversationId?: string;
    },
    callback?: (response: SocketIOResponse<{ messageId: string }>) => void
  ): Promise<void> {
    try {
      const userContext = this._getUserContext(socket);
      if (!userContext) {
        this._sendError(callback, 'User not authenticated', socket);
        return;
      }

      const { participantId, userId, isAnonymous } = userContext;

      // Validation
      if (data.content && data.content.trim()) {
        const validation = validateMessageLength(data.content);
        if (!validation.isValid) {
          this._sendError(callback, validation.error || 'Message invalide', socket);
          return;
        }
      }

      // Resolve participantId for this conversation
      const resolvedParticipantId = await this._resolveParticipantId(userId, participantId, data.conversationId, isAnonymous);
      if (!resolvedParticipantId) {
        this._sendError(callback, 'Not a participant in this conversation', socket);
        return;
      }

      // Vérifier les attachments
      const { AttachmentService } = await import('../../services/AttachmentService');
      const attachmentService = new AttachmentService(this.prisma);

      for (const attachmentId of data.attachmentIds) {
        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment || attachment.uploadedBy !== (userId || participantId)) {
          this._sendError(callback, `Attachment ${attachmentId} invalid`, socket);
          return;
        }
      }

      const messageRequest: MessageRequest = {
        conversationId: data.conversationId,
        content: data.content,
        originalLanguage: data.originalLanguage,
        messageType: 'text',
        replyToId: data.replyToId,
        forwardedFromId: data.forwardedFromId,
        forwardedFromConversationId: data.forwardedFromConversationId,
        isAnonymous,
        attachments: data.attachmentIds.map((id) => ({ id } as never)),
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
              sender: { select: { id: true, displayName: true, avatar: true, type: true } },
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

    const participant = await this.prisma.participant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      },
      select: { id: true }
    });

    return participant?.id || null;
  }

  /**
   * Récupère un message complet pour le broadcast
   * Unified Participant: sender is a Participant, no anonymousSender
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

  /**
   * Créer des notifications pour un message
   * Uses Participant model instead of ConversationMember
   */
  private async _createMessageNotifications(message: Message, senderParticipantId: string): Promise<void> {
    try {
      const conversationId = message.conversationId;
      const messageId = message.id;
      const messagePreview = message.content.substring(0, 100);

      // Récupérer tous les participants de la conversation sauf l'expéditeur
      // Only notify registered users (they have userId)
      const participants = await this.prisma.participant.findMany({
        where: {
          conversationId,
          isActive: true,
          id: { not: senderParticipantId },
          userId: { not: null }
        },
        select: { userId: true }
      });

      console.log(`[NOTIFICATIONS] Génération de ${participants.length} notification(s) pour le message ${messageId} dans la conversation ${conversationId}`);

      // Resolve sender's userId for notification
      const senderParticipant = await this.prisma.participant.findUnique({
        where: { id: senderParticipantId },
        select: { userId: true }
      });
      const senderUserId = senderParticipant?.userId || senderParticipantId;

      await Promise.all(participants.map(participant =>
        this.notificationService.createMessageNotification({
          recipientUserId: participant.userId!,
          senderId: senderUserId,
          messageId,
          conversationId,
          messagePreview,
        })
      ));
    } catch (error) {
      console.error('[NOTIFICATIONS] Error creating message notifications:', error);
    }
  }

  /**
   * Traiter les attachments audio via le pipeline Whisper → NLLB → Chatterbox
   */
  private async _processAudioAttachments(attachmentIds: string[], messageId: string): Promise<void> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true, senderId: true }
      });

      if (!message || !message.senderId) return;

      const attachmentsDetails = await this.prisma.messageAttachment.findMany({
        where: { id: { in: attachmentIds } },
        select: {
          id: true,
          mimeType: true,
          fileUrl: true,
          filePath: true,
          duration: true,
          metadata: true
        }
      });

      const audioAttachments = attachmentsDetails.filter(att =>
        att.mimeType && att.mimeType.startsWith('audio/')
      );

      if (audioAttachments.length === 0) return;

      for (const audioAtt of audioAttachments) {
        let mobileTranscription: unknown = undefined;
        if (audioAtt.metadata && typeof audioAtt.metadata === 'object') {
          const metadata = audioAtt.metadata as Record<string, unknown>;
          if (metadata.transcription) {
            mobileTranscription = metadata.transcription;
          }
        }

        const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
        const audioPath = audioAtt.filePath ? path.join(uploadBasePath, audioAtt.filePath) : '';

        await this.translationService.processAudioAttachment({
          messageId,
          attachmentId: audioAtt.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          audioUrl: audioAtt.fileUrl || '',
          audioPath: audioPath,
          audioDurationMs: audioAtt.duration || 0,
          mobileTranscription: mobileTranscription,
          generateVoiceClone: true,
          modelType: 'medium'
        });
      }

      console.log(`[MESSAGE_HANDLER] ${audioAttachments.length} audio(s) sent to Translator for message ${messageId}`);
    } catch (error) {
      console.error('[MESSAGE_HANDLER] Error processing audio attachments:', error);
    }
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
