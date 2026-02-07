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

import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  Message,
  SocketIOMessage
} from '@/types';
import type { EncryptedPayload } from '@meeshy/shared/types/encryption';
import type {
  TypedSocket,
  MessageListener,
  MessageEditListener,
  MessageDeleteListener,
  UnsubscribeFn,
  EncryptionHandlers,
  GetMessageByIdCallback,
  MessageSendOptions
} from './types';

/**
 * MessagingService
 * Single Responsibility: Handle all message operations
 */
export class MessagingService {
  private messageListeners: Set<MessageListener> = new Set();
  private editListeners: Set<MessageEditListener> = new Set();
  private deleteListeners: Set<MessageDeleteListener> = new Set();

  private encryptionHandlers: EncryptionHandlers | null = null;
  private getMessageByIdCallback: GetMessageByIdCallback | null = null;

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

  /**
   * Set callback for retrieving messages by ID
   */
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
      let message: Message = convertMessageFn(socketMessage);

      // E2EE: Decrypt message if encrypted
      message = await this.decryptMessage(socketMessage, message);

      this.messageListeners.forEach(listener => listener(message));
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
  }

  /**
   * Decrypt message if it has encrypted content
   */
  private async decryptMessage(socketMessage: SocketIOMessage, message: Message): Promise<Message> {
    const encryptedContent = (socketMessage as any).encryptedContent;
    const encryptionMetadata = (socketMessage as any).encryptionMetadata;

    if (!encryptedContent || !encryptionMetadata || !this.encryptionHandlers?.decrypt) {
      return message;
    }

    try {
      const encryptedPayload: EncryptedPayload = {
        ciphertext: encryptedContent,
        metadata: encryptionMetadata
      };
      const senderId = socketMessage.senderId || (socketMessage as any).anonymousSenderId;
      const decryptedContent = await this.encryptionHandlers.decrypt(encryptedPayload, senderId);

      return {
        ...message,
        content: decryptedContent,
        _isEncrypted: true,
        _encryptionMode: encryptionMetadata.mode
      } as Message & { _isEncrypted?: boolean; _encryptionMode?: string };

    } catch (decryptionError) {
      console.error('[MessagingService] Decryption failed:', decryptionError);
      return {
        ...message,
        content: message.content || '[Encrypted message - Unable to decrypt]',
        _isEncrypted: true,
        _decryptionFailed: true
      } as Message & { _isEncrypted?: boolean; _decryptionFailed?: boolean };
    }
  }

  /**
   * Send a message
   */
  async sendMessage(
    socket: TypedSocket | null,
    options: MessageSendOptions
  ): Promise<boolean> {
    if (!socket || !socket.connected) {
      toast.error('Socket not connected');
      return false;
    }

    const {
      conversationId,
      content,
      originalLanguage,
      replyToId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes
    } = options;

    try {
      const hasAttachments = attachmentIds && attachmentIds.length > 0;

      // Build base message payload
      const messageData: any = {
        conversationId,
        content,
        ...(originalLanguage && { originalLanguage }),
        ...(replyToId && { replyToId }),
        ...(mentionedUserIds && mentionedUserIds.length > 0 && { mentionedUserIds })
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
          console.error('[MessagingService] Encryption failed:', encryptionError);
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

      if (wsResult) {
        return true;
      }

      // Don't fallback to REST for E2EE messages (REST can't handle E2EE yet)
      if (messageData.encryptedContent && messageData.encryptionMetadata) {
        return false;
      }

      // WebSocket failed → REST fallback
      logger.warn('[MessagingService]', 'WebSocket send failed, attempting REST fallback');
      return this.sendMessageViaRest(options);

    } catch (error) {
      console.error('[MessagingService] Error sending message:', error);
      toast.error('Error sending message');
      return false;
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
      console.error('[MessagingService] Socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_EDIT, { messageId, content }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          toast.error(response?.error || 'Error editing message');
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
      console.error('[MessagingService] Socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_DELETE, { messageId }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          toast.error(response?.error || 'Error deleting message');
          resolve(false);
        }
      });
    });
  }

  /**
   * REST fallback when WebSocket send fails
   */
  private async sendMessageViaRest(options: MessageSendOptions): Promise<boolean> {
    try {
      const { conversationsService } = await import('../conversations');

      await conversationsService.sendMessage(options.conversationId, {
        content: options.content,
        originalLanguage: options.originalLanguage,
        messageType: options.attachmentIds?.length
          ? this.determineMessageTypeFromMime(options.attachmentMimeTypes?.[0] ?? '')
          : 'text',
        replyToId: options.replyToId,
        attachmentIds: options.attachmentIds,
      });

      logger.info('[MessagingService]', 'Message sent via REST fallback');
      toast.success('Message envoyé (connexion alternative)');
      return true;
    } catch (error) {
      console.error('[MessagingService] REST fallback also failed:', error);
      return false;
    }
  }

  /**
   * Emit event with timeout protection
   */
  private async emitWithTimeout(
    socket: TypedSocket,
    event: string,
    data: any,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        toast.error('Timeout: Server did not respond in time');
        resolve(false);
      }, timeoutMs);

      socket.emit(event as any, data, (response: any) => {
        clearTimeout(timeout);
        if (response?.success) {
          resolve(true);
        } else {
          const errorMsg = response?.message || response?.error || 'Error sending message';
          toast.error(`Error: ${errorMsg}`);
          resolve(false);
        }
      });
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
   * Cleanup all listeners
   */
  cleanup(): void {
    this.messageListeners.clear();
    this.editListeners.clear();
    this.deleteListeners.clear();
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
