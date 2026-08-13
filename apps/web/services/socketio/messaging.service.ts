/**
 * Messaging Service
 * Handles all message-related Socket.IO operations
 * - Sending messages (with/without attachments)
 * - Editing messages
 * - Deleting messages
 * - Message encryption/decryption
 * - Message event listeners
 */

'use client';

import { logger } from '@/utils/logger';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  AttachmentStatusUpdatedEventData,
  AttachmentUpdatedEventData,
  LinkMessageNewEventData,
  MessageConsumedEventData,
  MessagePinnedEventData,
  MessageUnpinnedEventData,
  MessageHiddenForMeEventData,
  MessageRestoredForMeEventData,
  ReactionUpdateEventData,
} from '@meeshy/shared/types/socketio-events';
import type {
  Message,
  SocketIOMessage
} from '@/types';
import type { EncryptedPayload } from '@meeshy/shared/types/encryption';
import type { AnonymousChatService } from '../anonymous-chat.service';
import type {
  TypedSocket,
  MessageListener,
  MessageEditListener,
  MessageDeleteListener,
  UnsubscribeFn,
  EncryptionHandlers,
  GetMessageByIdCallback,
  MessageSendOptions,
  MessageAckResponse
} from './types';

/**
 * MessagingService
 * Single Responsibility: Handle all message operations
 */
export class MessagingService {
  private messageListeners: Set<MessageListener> = new Set();
  private editListeners: Set<MessageEditListener> = new Set();
  private deleteListeners: Set<MessageDeleteListener> = new Set();
  private mentionListeners: Set<(data: unknown) => void> = new Set();
  private consumedListeners: Set<(data: MessageConsumedEventData) => void> = new Set();
  private attachmentStatusListeners: Set<(data: AttachmentStatusUpdatedEventData) => void> = new Set();
  private messageAttachmentUpdatedListeners: Set<(data: AttachmentUpdatedEventData) => void> = new Set();
  private pendingDeliveredListeners: Set<(data: { count: number; conversationIds: string[] }) => void> = new Set();
  private linkMessageNewListeners: Set<(data: LinkMessageNewEventData) => void> = new Set();
  private messagePinnedListeners: Set<(data: MessagePinnedEventData) => void> = new Set();
  private messageUnpinnedListeners: Set<(data: MessageUnpinnedEventData) => void> = new Set();
  private messageRestoredForMeListeners: Set<(data: MessageRestoredForMeEventData) => void> = new Set();

  private encryptionHandlers: EncryptionHandlers | null = null;
  private getMessageByIdCallback: GetMessageByIdCallback | null = null;
  private currentUserId: string | null = null;
  private markReceivedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private recentMessageIds: Map<string, number> = new Map();

  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  private isOwnMessage(message: Message): boolean {
    if (!this.currentUserId) return false;
    const sender = message.sender;
    const senderId = sender?.userId ?? sender?.id ?? message.senderId;
    return senderId === this.currentUserId;
  }

  private isDuplicateMessage(id: string): boolean {
    if (this.recentMessageIds.has(id)) return true;

    if (this.recentMessageIds.size >= 200) {
      const oldest = [...this.recentMessageIds.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 50; i++) {
        this.recentMessageIds.delete(oldest[i][0]);
      }
    }

    const ts = Date.now();
    this.recentMessageIds.set(id, ts);
    setTimeout(() => {
      if (this.recentMessageIds.get(id) === ts) {
        this.recentMessageIds.delete(id);
      }
    }, 300_000);

    return false;
  }

  private markAsReceivedDebounced(conversationId: string): void {
    if (this.markReceivedTimers.has(conversationId)) return;
    if (this.markReceivedTimers.size >= 100) return;
    const timer = setTimeout(async () => {
      this.markReceivedTimers.delete(conversationId);
      try {
        const { conversationsService } = await import('@/services/conversations.service');
        await conversationsService.markAsReceived(conversationId);
      } catch (error) {
        logger.debug('[MessagingService]', 'Failed to mark as received', { conversationId });
      }
    }, 500);
    this.markReceivedTimers.set(conversationId, timer);
  }

  /**
   * Check if encryption handlers are already configured
   */
  hasEncryptionHandlers(): boolean {
    return this.encryptionHandlers !== null;
  }

  /**
   * Set encryption handlers for E2EE support
   */
  setEncryptionHandlers(handlers: EncryptionHandlers): void {
    this.encryptionHandlers = handlers;
    logger.debug('[MessagingService]', 'Encryption handlers configured');
  }

  /**
   * Clear encryption handlers (on logout)
   */
  clearEncryptionHandlers(): void {
    this.encryptionHandlers = null;
    logger.debug('[MessagingService]', 'Encryption handlers cleared');
  }

  setGetMessageByIdCallback(callback: GetMessageByIdCallback): void {
    this.getMessageByIdCallback = callback;
  }

  /**
   * Check if conversation has encryption enabled
   */
  async isConversationEncrypted(conversationId: string): Promise<boolean> {
    if (!this.encryptionHandlers?.getConversationMode) {
      return false;
    }
    const mode = await this.encryptionHandlers.getConversationMode(conversationId);
    return mode !== null;
  }

  /**
   * Setup message event listeners on socket
   */
  setupEventListeners(socket: TypedSocket, convertMessageFn: (msg: SocketIOMessage) => Message): void {
    // New message
    socket.on(SERVER_EVENTS.MESSAGE_NEW, async (socketMessage) => {
      if (socketMessage.id && this.isDuplicateMessage(socketMessage.id)) return;

      let message: Message = convertMessageFn(socketMessage);

      // E2EE: Decrypt message if encrypted
      message = await this.decryptMessage(socketMessage, message);

      this.messageListeners.forEach(listener => listener(message));

      // Auto mark-as-received for messages from other users
      if (message.conversationId && !this.isOwnMessage(message)) {
        this.markAsReceivedDebounced(message.conversationId);
      }
    });

    // Edited message
    socket.on(SERVER_EVENTS.MESSAGE_EDITED, async (socketMessage) => {
      logger.debug('[MessagingService]', 'Message edited', { messageId: socketMessage.id });

      let message: Message = convertMessageFn(socketMessage);

      // E2EE: Decrypt edited message if encrypted
      message = await this.decryptMessage(socketMessage, message);

      this.editListeners.forEach(listener => listener(message));
    });

    // Deleted message
    socket.on(SERVER_EVENTS.MESSAGE_DELETED, (data) => {
      logger.debug('[MessagingService]', 'Message deleted', { messageId: data.messageId });
      this.deleteListeners.forEach(listener => listener(data.messageId));
    });

    // « Supprimer pour moi » venu d'un AUTRE appareil du même utilisateur.
    //
    // L'effet local est mot pour mot celui d'une suppression : la bulle s'en
    // va. On réutilise donc les mêmes écouteurs plutôt que d'écrire un second
    // retrait — deux implémentations du même geste auraient dérivé (l'aperçu de
    // la liste, les réponses qui pointent vers la bulle retirée).
    //
    // L'appareil qui a ÉMIS la requête reçoit l'événement lui aussi : la room
    // est celle de l'utilisateur, pas du socket. Le retrait y est idempotent —
    // il a déjà retiré la bulle en optimiste, et re-filtrer une liste qui ne la
    // contient plus ne change rien.
    socket.on(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, (data: MessageHiddenForMeEventData) => {
      logger.debug('[MessagingService]', 'Messages hidden for me', {
        count: data?.messages?.length ?? 0,
      });
      (data?.messages ?? []).forEach(({ messageId }) => {
        this.deleteListeners.forEach(listener => listener(messageId));
      });
    });

    // L'inverse. Une APPARITION ne peut pas être servie comme une tombstone :
    // l'appareil qui a retiré la bulle n'en détient plus le contenu. L'événement
    // ne porte donc que l'adresse, et le consommateur va rechercher.
    socket.on(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, (data: MessageRestoredForMeEventData) => {
      logger.debug('[MessagingService]', 'Messages restored for me', {
        count: data?.messages?.length ?? 0,
      });
      this.messageRestoredForMeListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MESSAGE_CONSUMED, (data: MessageConsumedEventData) => {
      this.consumedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.SYSTEM_MESSAGE, (data) => {
      this.messageListeners.forEach(listener => listener(convertMessageFn(data as unknown as SocketIOMessage)));
    });

    (socket as unknown as { on: (event: string, handler: (data: AttachmentStatusUpdatedEventData) => void) => void }).on(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, (data: AttachmentStatusUpdatedEventData) => {
      this.attachmentStatusListeners.forEach(listener => listener(data));
    });

    (socket as unknown as { on: (event: string, handler: (data: AttachmentUpdatedEventData) => void) => void }).on(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, (data: AttachmentUpdatedEventData) => {
      this.messageAttachmentUpdatedListeners.forEach(listener => listener(data));
    });

    (socket as unknown as { on: (event: string, handler: (data: { count: number; conversationIds: string[] }) => void) => void }).on(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, (data: { count: number; conversationIds: string[] }) => {
      this.pendingDeliveredListeners.forEach(listener => listener(data));
    });

    (socket as unknown as { on: (event: string, handler: (data: LinkMessageNewEventData) => void) => void }).on(SERVER_EVENTS.LINK_MESSAGE_NEW, (data: LinkMessageNewEventData) => {
      this.linkMessageNewListeners.forEach(listener => listener(data));
    });

    (socket as unknown as { on: (event: string, handler: (data: MessagePinnedEventData) => void) => void }).on(SERVER_EVENTS.MESSAGE_PINNED, (data: MessagePinnedEventData) => {
      this.messagePinnedListeners.forEach(listener => listener(data));
    });

    (socket as unknown as { on: (event: string, handler: (data: MessageUnpinnedEventData) => void) => void }).on(SERVER_EVENTS.MESSAGE_UNPINNED, (data: MessageUnpinnedEventData) => {
      this.messageUnpinnedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MENTION_CREATED, (data: unknown) => {
      this.mentionListeners.forEach(listener => listener(data));
    });
  }

  /**
   * Decrypt message if it has encrypted content
   */
  private async decryptMessage(socketMessage: SocketIOMessage, message: Message): Promise<Message> {
    const socketMsg = socketMessage as SocketIOMessage & { encryptedContent?: string; encryptionMetadata?: { mode: string; keyId?: string; iv?: string; authTag?: string } };
    const encryptedContent = socketMsg.encryptedContent;
    const encryptionMetadata = socketMsg.encryptionMetadata;

    if (!encryptedContent || !encryptionMetadata || !this.encryptionHandlers?.decrypt) {
      return message;
    }

    try {
      const encryptedPayload: EncryptedPayload = {
        ciphertext: encryptedContent,
        metadata: {
          ...encryptionMetadata,
          protocol: (encryptionMetadata as unknown as { protocol?: string }).protocol ?? (encryptionMetadata.mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm'),
        } as EncryptedPayload['metadata']
      };
      const senderId = socketMessage.senderId;
      const decryptedContent = await this.encryptionHandlers.decrypt(encryptedPayload, senderId);

      return {
        ...message,
        content: decryptedContent,
        _isEncrypted: true,
        _encryptionMode: encryptionMetadata.mode
      } as Message & { _isEncrypted?: boolean; _encryptionMode?: string };

    } catch (decryptionError) {
      const errorMsg = decryptionError instanceof Error ? decryptionError.message : 'Unknown error';
      const decryptionErrorCode = errorMsg.includes('key')
        ? 'KEY_MISSING'
        : errorMsg.includes('session')
          ? 'SESSION_NOT_FOUND'
          : 'DECRYPTION_FAILED';
      logger.error('[MessagingService]', `Decryption failed (${decryptionErrorCode})`, { conversationId: message.conversationId, messageId: message.id });
      return {
        ...message,
        content: message.content || '[Encrypted message - Unable to decrypt]',
        _isEncrypted: true,
        _decryptionFailed: true,
        _decryptionErrorCode: decryptionErrorCode,
      } as Message & { _isEncrypted?: boolean; _decryptionFailed?: boolean; _decryptionErrorCode?: string };
    }
  }

  /**
   * Send a message
   */
  async sendMessage(
    socket: TypedSocket | null,
    options: MessageSendOptions
  ): Promise<MessageAckResponse> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'Socket not connected');
      return { success: false };
    }

    const {
      conversationId,
      content,
      originalLanguage,
      replyToId,
      forwardedFromId,
      forwardedFromConversationId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes,
      clientMessageId,
    } = options;

    try {
      const hasAttachments = attachmentIds && attachmentIds.length > 0;

      const messageData: Record<string, unknown> = {
        conversationId,
        content,
        clientMessageId,
        ...(originalLanguage && { originalLanguage }),
        ...(replyToId && { replyToId }),
        ...(forwardedFromId && { forwardedFromId }),
        ...(forwardedFromConversationId && { forwardedFromConversationId }),
        ...(mentionedUserIds && mentionedUserIds.length > 0 && { mentionedUserIds }),
      };

      // E2EE: Encrypt content if conversation is encrypted
      if (this.encryptionHandlers?.encrypt && this.encryptionHandlers?.getConversationMode) {
        try {
          const encryptionMode = await this.encryptionHandlers.getConversationMode(conversationId);
          if (encryptionMode) {
            const encryptedPayload = await this.encryptionHandlers.encrypt(content, conversationId);
            if (encryptedPayload) {
              messageData.encryptedContent = encryptedPayload.ciphertext;
              messageData.encryptionMetadata = encryptedPayload.metadata;
              if (encryptionMode === 'e2ee') {
                messageData.content = '[Encrypted]';
              }
              logger.debug('[MessagingService]', 'Message encrypted', {
                conversationId,
                mode: encryptionMode
              });
            }
          }
        } catch (encryptionError) {
          logger.error('[MessagingService]', 'Encryption failed — aborting send to prevent plaintext leak', { conversationId });
          throw encryptionError;
        }
      }

      // Add attachments if present
      if (hasAttachments) {
        messageData.attachmentIds = attachmentIds;
        messageData.messageType = attachmentMimeTypes && attachmentMimeTypes.length > 0
          ? this.determineMessageTypeFromMime(attachmentMimeTypes[0])
          : 'file';
      }

      // Choose event based on attachments
      const eventType = hasAttachments
        ? CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS
        : CLIENT_EVENTS.MESSAGE_SEND;

      // Send with timeout (WebSocket primary)
      const wsResult = await this.emitWithTimeout(socket, eventType, messageData, 10000);

      if (wsResult.success) {
        return {
          success: true,
          messageId: wsResult.messageId,
          clientMessageId: wsResult.clientMessageId,
        };
      }

      // On timeout: mark failed, do NOT fallback to REST (message:new may still arrive)
      if (wsResult.timedOut) {
        return { success: false, timedOut: true };
      }

      // Don't fallback to REST for E2EE messages (REST can't handle E2EE yet)
      if (messageData.encryptedContent && messageData.encryptionMetadata) {
        return { success: false };
      }

      // WebSocket ack error (not timeout) → REST fallback only if socket still connected
      if (!socket.connected) {
        return { success: false };
      }
      logger.warn('[MessagingService]', 'WebSocket ack failed, attempting REST fallback');
      return this.sendMessageViaRest(options);

    } catch (error) {
      logger.error('[MessagingService]', 'Error sending message', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * Edit a message
   */
  async editMessage(
    socket: TypedSocket | null,
    messageId: string,
    content: string
  ): Promise<boolean> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'editMessage: socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_EDIT, { messageId, content }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          logger.warn('[MessagingService]', 'Edit failed', response?.error || 'Unknown error');
          resolve(false);
        }
      });
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    socket: TypedSocket | null,
    messageId: string
  ): Promise<boolean> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'deleteMessage: socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_DELETE, { messageId }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          logger.warn('[MessagingService]', 'Delete failed', response?.error || 'Unknown error');
          resolve(false);
        }
      });
    });
  }

  /**
   * REST fallback when WebSocket send fails.
   *
   * An anonymous participant holds no JWT — only an `anon_*` session token —
   * so `POST /conversations/:id/messages` cannot authenticate them and the
   * fallback answered 401 for every anonymous sender: a WebSocket ack error
   * lost the message outright, with no recovery path. Their endpoint is the
   * share-link route, which authenticates on `X-Session-Token`.
   */
  private async sendMessageViaRest(options: MessageSendOptions): Promise<MessageAckResponse> {
    const { anonymousChatService } = await import('../anonymous-chat.service');
    if (anonymousChatService.canSendViaLink()) {
      return this.sendMessageViaLinkRest(anonymousChatService, options);
    }

    try {
      const { conversationsService } = await import('../conversations');

      const response = await conversationsService.sendMessage(options.conversationId, {
        clientMessageId: options.clientMessageId,
        content: options.content,
        originalLanguage: options.originalLanguage,
        messageType: options.attachmentIds?.length
          ? this.determineMessageTypeFromMime(options.attachmentMimeTypes?.[0] ?? '')
          : 'text',
        replyToId: options.replyToId,
        forwardedFromId: options.forwardedFromId,
        forwardedFromConversationId: options.forwardedFromConversationId,
        attachmentIds: options.attachmentIds,
      });

      logger.info('[MessagingService]', 'Message sent via REST fallback');
      const msg = response as Message & { data?: { id?: string } };
      return {
        success: true,
        messageId: msg.data?.id ?? msg.id,
        clientMessageId: options.clientMessageId,
      };
    } catch (error) {
      logger.error('[MessagingService]', 'REST fallback also failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * REST fallback for an anonymous sender, over the share-link route.
   *
   * The caller's `clientMessageId` travels with the request and comes back in
   * the 201 body: it is the only key linking the server message to the
   * optimistic row already on screen. Minting a fresh one here — or reading the
   * server's `messageId` alone — would leave the optimistic row unreconciled
   * and the message rendered twice.
   */
  private async sendMessageViaLinkRest(
    anonymousChatService: AnonymousChatService,
    options: MessageSendOptions
  ): Promise<MessageAckResponse> {
    try {
      const result = await anonymousChatService.sendMessage({
        content: options.content,
        originalLanguage: options.originalLanguage,
        replyToId: options.replyToId,
        clientMessageId: options.clientMessageId,
      });

      logger.info('[MessagingService]', 'Message sent via share-link REST fallback');
      return {
        success: true,
        messageId: result.messageId ?? result.message?.id,
        clientMessageId: result.message?.clientMessageId ?? options.clientMessageId,
      };
    } catch (error) {
      logger.error('[MessagingService]', 'Share-link REST fallback also failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * Emit event with timeout protection
   */
  private async emitWithTimeout(
    socket: TypedSocket,
    event: string,
    data: Record<string, unknown>,
    timeoutMs: number
  ): Promise<MessageAckResponse> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('[MessagingService]', 'Timeout: Server did not respond in time');
        resolve({ success: false, timedOut: true });
      }, timeoutMs);

      const callback = (response: { success?: boolean; data?: { messageId?: string; clientMessageId?: string }; message?: string; error?: string }) => {
        clearTimeout(timeout);
        if (response?.success) {
          resolve({
            success: true,
            messageId: response.data?.messageId,
            clientMessageId: response.data?.clientMessageId,
          });
        } else {
          const errorMsg = response?.message || response?.error || 'Error sending message';
          logger.warn('[MessagingService]', `Send failed: ${errorMsg}`);
          resolve({ success: false });
        }
      };

      (socket as unknown as { emit: (event: string, data: unknown, cb: typeof callback) => void }).emit(event, data, callback);
    });
  }

  /**
   * Determine message type from MIME type
   */
  private determineMessageTypeFromMime(mimeType: string): string {
    if (!mimeType) return 'text';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'file';
    if (mimeType.startsWith('text/')) return 'text';
    return 'file';
  }

  /**
   * Event listener: New message
   */
  onNewMessage(listener: MessageListener): UnsubscribeFn {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Event listener: Message edited
   */
  onMessageEdited(listener: MessageEditListener): UnsubscribeFn {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  /**
   * Event listener: Message deleted
   */
  onMessageDeleted(listener: MessageDeleteListener): UnsubscribeFn {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  /**
   * Event listener: un message masqué pour moi est revenu en vue.
   *
   * Pas de pendant `onMessageHiddenForMe` : le masquage est routé vers
   * `onMessageDeleted`, dont l'effet local est identique.
   */
  onMessageRestoredForMe(listener: (data: MessageRestoredForMeEventData) => void): UnsubscribeFn {
    this.messageRestoredForMeListeners.add(listener);
    return () => this.messageRestoredForMeListeners.delete(listener);
  }

  /**
   * Event listener: Mention created
   */
  onMentionCreated(listener: (data: unknown) => void): UnsubscribeFn {
    this.mentionListeners.add(listener);
    return () => this.mentionListeners.delete(listener);
  }

  onMessageConsumed(listener: (data: MessageConsumedEventData) => void): UnsubscribeFn {
    this.consumedListeners.add(listener);
    return () => this.consumedListeners.delete(listener);
  }

  onAttachmentStatusUpdated(listener: (data: AttachmentStatusUpdatedEventData) => void): UnsubscribeFn {
    this.attachmentStatusListeners.add(listener);
    return () => this.attachmentStatusListeners.delete(listener);
  }

  onMessageAttachmentUpdated(listener: (data: AttachmentUpdatedEventData) => void): UnsubscribeFn {
    this.messageAttachmentUpdatedListeners.add(listener);
    return () => this.messageAttachmentUpdatedListeners.delete(listener);
  }

  onPendingMessagesDelivered(listener: (data: { count: number; conversationIds: string[] }) => void): UnsubscribeFn {
    this.pendingDeliveredListeners.add(listener);
    return () => this.pendingDeliveredListeners.delete(listener);
  }

  onLinkMessageNew(listener: (data: LinkMessageNewEventData) => void): UnsubscribeFn {
    this.linkMessageNewListeners.add(listener);
    return () => this.linkMessageNewListeners.delete(listener);
  }

  onMessagePinned(listener: (data: MessagePinnedEventData) => void): UnsubscribeFn {
    this.messagePinnedListeners.add(listener);
    return () => this.messagePinnedListeners.delete(listener);
  }

  onMessageUnpinned(listener: (data: MessageUnpinnedEventData) => void): UnsubscribeFn {
    this.messageUnpinnedListeners.add(listener);
    return () => this.messageUnpinnedListeners.delete(listener);
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.messageListeners.clear();
    this.editListeners.clear();
    this.deleteListeners.clear();
    this.mentionListeners.clear();
    this.consumedListeners.clear();
    this.attachmentStatusListeners.clear();
    this.messageAttachmentUpdatedListeners.clear();
    this.pendingDeliveredListeners.clear();
    this.linkMessageNewListeners.clear();
    this.messagePinnedListeners.clear();
    this.messageUnpinnedListeners.clear();
    this.markReceivedTimers.forEach(timer => clearTimeout(timer));
    this.markReceivedTimers.clear();
    this.recentMessageIds.clear();
    this.currentUserId = null;
  }

  /**
   * Get listener counts for diagnostics
   */
  getListenerCounts(): { message: number; edit: number; delete: number } {
    return {
      message: this.messageListeners.size,
      edit: this.editListeners.size,
      delete: this.deleteListeners.size
    };
  }
}
