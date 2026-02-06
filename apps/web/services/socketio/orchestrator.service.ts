/**
 * Socket.IO Orchestrator Service
 * Coordinates all specialized services and provides a unified API
 * This is the main entry point that replaces the monolithic MeeshySocketIOService
 */

'use client';

import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import type { User, Message, SocketIOMessage } from '@/types';
import type {
  TypedSocket,
  ConnectionStatus,
  ConnectionDiagnostics,
  EncryptionHandlers,
  GetMessageByIdCallback,
  MessageSendOptions,
  UnsubscribeFn
} from './types';

import { ConnectionService } from './connection.service';
import { MessagingService } from './messaging.service';
import { TypingService } from './typing.service';
import { PresenceService } from './presence.service';
import { TranslationService } from './translation.service';

/**
 * Pending message in the queue
 */
interface PendingMessage {
  conversationId: string;
  content: string;
  originalLanguage?: string;
  replyToId?: string;
  mentionedUserIds?: string[];
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
  timestamp: number;
  resolve: (success: boolean) => void;
}

/**
 * SocketIOOrchestrator
 * Coordinates all Socket.IO services
 * Provides backward-compatible API
 */
export class SocketIOOrchestrator {
  private static instance: SocketIOOrchestrator | null = null;

  // Specialized services
  private connectionService: ConnectionService;
  private messagingService: MessagingService;
  private typingService: TypingService;
  private presenceService: PresenceService;
  private translationService: TranslationService;

  // Message conversion helper
  private messageConverter: ((msg: SocketIOMessage) => Message) | null = null;

  // Message queue for messages sent before socket is ready
  private pendingMessages: PendingMessage[] = [];
  private isProcessingQueue: boolean = false;
  private readonly MAX_QUEUE_SIZE = 10;
  private readonly MESSAGE_QUEUE_TIMEOUT = 30000; // 30 seconds max wait

  private constructor() {
    this.connectionService = new ConnectionService();
    this.messagingService = new MessagingService();
    this.typingService = new TypingService();
    this.presenceService = new PresenceService();
    this.translationService = new TranslationService();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SocketIOOrchestrator {
    if (!SocketIOOrchestrator.instance) {
      SocketIOOrchestrator.instance = new SocketIOOrchestrator();
    }
    return SocketIOOrchestrator.instance;
  }

  /**
   * Set message converter function
   */
  setMessageConverter(converter: (msg: SocketIOMessage) => Message): void {
    this.messageConverter = converter;
  }

  /**
   * Initialize connection and setup all listeners
   */
  initializeConnection(): void {
    // Initialize connection
    this.connectionService.initializeConnection();

    const socket = this.connectionService.getSocket();
    if (!socket) {
      return;
    }

    // Setup connection listeners
    this.connectionService.setupConnectionListeners(
      () => this.onAuthenticated(),
      (reason) => this.onDisconnected(reason),
      (error) => this.onError(error)
    );

    // Setup service listeners
    if (this.messageConverter) {
      this.messagingService.setupEventListeners(socket, this.messageConverter);
    }
    this.typingService.setupEventListeners(socket);
    this.presenceService.setupEventListeners(socket);
    this.translationService.setupEventListeners(socket);

    // Connect the socket
    this.connectionService.connect();
  }

  /**
   * Handle authenticated event
   */
  private onAuthenticated(): void {
    logger.debug('[SocketIOOrchestrator]', 'Authenticated successfully');
    // Auto-join logic is handled by connection service callback

    // Process pending messages queue
    this.processPendingMessages();
  }

  /**
   * Process pending messages queue after socket is connected
   */
  private async processPendingMessages(): Promise<void> {
    if (this.isProcessingQueue || this.pendingMessages.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    logger.debug('[SocketIOOrchestrator]', `Processing ${this.pendingMessages.length} pending messages`);

    const socket = this.connectionService.getSocket();
    if (!socket || !socket.connected) {
      this.isProcessingQueue = false;
      return;
    }

    // Process all pending messages
    while (this.pendingMessages.length > 0) {
      const pending = this.pendingMessages.shift();
      if (!pending) continue;

      // Check if message has expired
      if (Date.now() - pending.timestamp > this.MESSAGE_QUEUE_TIMEOUT) {
        logger.warn('[SocketIOOrchestrator]', 'Pending message expired, discarding');
        pending.resolve(false);
        continue;
      }

      try {
        const options: MessageSendOptions = {
          conversationId: pending.conversationId,
          content: pending.content,
          originalLanguage: pending.originalLanguage,
          replyToId: pending.replyToId,
          mentionedUserIds: pending.mentionedUserIds,
          attachmentIds: pending.attachmentIds,
          attachmentMimeTypes: pending.attachmentMimeTypes
        };

        const success = await this.messagingService.sendMessage(socket, options);
        pending.resolve(success);

        if (success) {
          logger.debug('[SocketIOOrchestrator]', 'Pending message sent successfully');
        }
      } catch (error) {
        logger.error('[SocketIOOrchestrator]', 'Error sending pending message', { error });
        pending.resolve(false);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Handle disconnected event
   */
  private onDisconnected(reason: string): void {
    logger.debug('[SocketIOOrchestrator]', 'Disconnected', { reason });
  }

  /**
   * Handle error event
   */
  private onError(error: Error): void {
    logger.error('[SocketIOOrchestrator]', 'Error', { error });
  }

  /**
   * Set auto-join callback
   */
  setAutoJoinCallback(callback: () => void): void {
    this.connectionService.setAutoJoinCallback(callback);
  }

  /**
   * Set current user
   */
  setCurrentUser(user: User): void {
    this.connectionService.setCurrentUser(user);

    // Check if we have tokens
    const hasAuthToken = typeof window !== 'undefined' && !!require('../auth-manager.service').authManager.getAuthToken();
    const hasSessionToken = typeof window !== 'undefined' && !!require('../auth-manager.service').authManager.getAnonymousSession()?.token;

    if (!hasAuthToken && !hasSessionToken) {
      // Retry with short delay
      let attempts = 0;
      const maxAttempts = 3;
      const retryInterval = setInterval(() => {
        attempts++;
        const retryAuthToken = require('../auth-manager.service').authManager.getAuthToken();
        const retryAnonymousToken = require('../auth-manager.service').authManager.getAnonymousSession()?.token;

        if ((retryAuthToken || retryAnonymousToken)) {
          clearInterval(retryInterval);
          this.initializeConnection();
        } else if (attempts >= maxAttempts) {
          clearInterval(retryInterval);
        }
      }, 200);
      return;
    }

    this.initializeConnection();
  }

  /**
   * Ensure connection is established
   */
  ensureConnection(): void {
    const socket = this.connectionService.getSocket();
    const status = this.connectionService.getConnectionStatus();

    if (socket && (status.isConnected || socket.connected)) {
      return;
    }

    // Check if tokens are available
    const hasAuthToken = typeof window !== 'undefined' && !!require('../auth-manager.service').authManager.getAuthToken();
    const hasSessionToken = typeof window !== 'undefined' && !!require('../auth-manager.service').authManager.getAnonymousSession()?.token;

    if (hasAuthToken || hasSessionToken) {
      this.initializeConnection();
    }
  }

  // ============ ENCRYPTION ============

  setEncryptionHandlers(handlers: EncryptionHandlers): void {
    this.messagingService.setEncryptionHandlers(handlers);
  }

  clearEncryptionHandlers(): void {
    this.messagingService.clearEncryptionHandlers();
  }

  async isConversationEncrypted(conversationId: string): Promise<boolean> {
    return this.messagingService.isConversationEncrypted(conversationId);
  }

  // ============ MESSAGE OPERATIONS ============

  setGetMessageByIdCallback(callback: GetMessageByIdCallback): void {
    this.messagingService.setGetMessageByIdCallback(callback);
  }

  async sendMessage(
    conversationOrId: any,
    content: string,
    originalLanguage?: string,
    replyToId?: string,
    mentionedUserIds?: string[],
    attachmentIds?: string[],
    attachmentMimeTypes?: string[]
  ): Promise<boolean> {
    this.ensureConnection();

    // Extract conversation ID first
    let conversationId: string;
    if (typeof conversationOrId === 'string') {
      conversationId = conversationOrId;
    } else {
      const { getConversationApiId } = require('@/utils/conversation-id-utils');
      conversationId = getConversationApiId(conversationOrId);
    }

    const socket = this.connectionService.getSocket();

    // If socket not ready, queue the message for later
    if (!socket || !socket.connected) {
      logger.debug('[SocketIOOrchestrator]', 'Socket not ready, queueing message');

      // Check queue size limit
      if (this.pendingMessages.length >= this.MAX_QUEUE_SIZE) {
        logger.warn('[SocketIOOrchestrator]', 'Message queue full, oldest message will be discarded');
        const oldest = this.pendingMessages.shift();
        if (oldest) {
          oldest.resolve(false);
        }
      }

      // Add to queue and return a promise that resolves when message is sent
      return new Promise<boolean>((resolve) => {
        const pending: PendingMessage = {
          conversationId,
          content,
          originalLanguage,
          replyToId,
          mentionedUserIds,
          attachmentIds,
          attachmentMimeTypes,
          timestamp: Date.now(),
          resolve
        };

        this.pendingMessages.push(pending);
        logger.debug('[SocketIOOrchestrator]', `Message queued (${this.pendingMessages.length} in queue)`);

        // Set a timeout to reject if not sent within MESSAGE_QUEUE_TIMEOUT
        setTimeout(() => {
          const index = this.pendingMessages.indexOf(pending);
          if (index !== -1) {
            this.pendingMessages.splice(index, 1);
            logger.warn('[SocketIOOrchestrator]', 'Message queue timeout, message discarded');
            resolve(false);
          }
        }, this.MESSAGE_QUEUE_TIMEOUT);
      });
    }

    const options: MessageSendOptions = {
      conversationId,
      content,
      originalLanguage,
      replyToId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes
    };

    return this.messagingService.sendMessage(socket, options);
  }

  async editMessage(messageId: string, content: string): Promise<boolean> {
    const socket = this.connectionService.getSocket();
    return this.messagingService.editMessage(socket, messageId, content);
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const socket = this.connectionService.getSocket();
    return this.messagingService.deleteMessage(socket, messageId);
  }

  // ============ TYPING INDICATORS ============

  startTyping(conversationId: string): void {
    const socket = this.connectionService.getSocket();
    this.typingService.startTyping(socket, conversationId);
  }

  stopTyping(conversationId: string): void {
    const socket = this.connectionService.getSocket();
    this.typingService.stopTyping(socket, conversationId);
  }

  // ============ CONVERSATION MANAGEMENT ============

  joinConversation(conversationOrId: any): void {
    this.ensureConnection();
    this.connectionService.joinConversation(conversationOrId);
  }

  leaveConversation(conversationOrId: any): void {
    this.connectionService.leaveConversation(conversationOrId);
  }

  triggerAutoJoin(): void {
    // Trigger auto-join callback if set
    const callback = (this.connectionService as any).autoJoinCallback;
    if (callback) {
      callback();
    }
  }

  updateCurrentConversationId(conversationId: string): void {
    this.connectionService.updateCurrentConversationId(conversationId);
  }

  getCurrentConversationId(): string | null {
    return this.connectionService.getCurrentConversationId();
  }

  // ============ CONNECTION MANAGEMENT ============

  reconnect(): void {
    this.connectionService.reconnect();
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionService.getConnectionStatus();
  }

  getConnectionDiagnostics(): ConnectionDiagnostics {
    const baseDiag = this.connectionService.getConnectionDiagnostics();
    const messagingCounts = this.messagingService.getListenerCounts();

    return {
      ...baseDiag,
      listenersCount: {
        message: messagingCounts.message,
        edit: messagingCounts.edit,
        delete: messagingCounts.delete,
        translation: this.translationService.getListenerCount(),
        typing: this.typingService.getListenerCount(),
        status: this.presenceService.getListenerCount()
      }
    };
  }

  getSocket(): TypedSocket | null {
    return this.connectionService.getSocket();
  }

  // ============ EVENT LISTENERS ============

  onNewMessage(listener: (message: Message) => void): UnsubscribeFn {
    return this.messagingService.onNewMessage(listener);
  }

  onMessageEdited(listener: (message: Message) => void): UnsubscribeFn {
    return this.messagingService.onMessageEdited(listener);
  }

  onMessageDeleted(listener: (messageId: string) => void): UnsubscribeFn {
    return this.messagingService.onMessageDeleted(listener);
  }

  onTranslation(listener: (data: any) => void): UnsubscribeFn {
    return this.translationService.onTranslation(listener);
  }

  onAudioTranslation(listener: (data: any) => void): UnsubscribeFn {
    return this.translationService.onAudioTranslation(listener);
  }

  onTranscription(listener: (data: any) => void): UnsubscribeFn {
    return this.translationService.onTranscription(listener);
  }

  onAudioTranslationsProgressive(listener: (data: any) => void): UnsubscribeFn {
    return this.translationService.onAudioTranslationsProgressive(listener);
  }

  onAudioTranslationsCompleted(listener: (data: any) => void): UnsubscribeFn {
    return this.translationService.onAudioTranslationsCompleted(listener);
  }

  onTyping(listener: (event: any) => void): UnsubscribeFn {
    return this.typingService.onTyping(listener);
  }

  onTypingStart(listener: (event: any) => void): UnsubscribeFn {
    return this.typingService.onTypingStart(listener);
  }

  onTypingStop(listener: (event: any) => void): UnsubscribeFn {
    return this.typingService.onTypingStop(listener);
  }

  onUserStatus(listener: (event: any) => void): UnsubscribeFn {
    return this.presenceService.onUserStatus(listener);
  }

  onConversationStats(listener: (data: any) => void): UnsubscribeFn {
    return this.presenceService.onConversationStats(listener);
  }

  onConversationOnlineStats(listener: (data: any) => void): UnsubscribeFn {
    return this.presenceService.onConversationOnlineStats(listener);
  }

  onReactionAdded(listener: (data: any) => void): UnsubscribeFn {
    return this.presenceService.onReactionAdded(listener);
  }

  onReactionRemoved(listener: (data: any) => void): UnsubscribeFn {
    return this.presenceService.onReactionRemoved(listener);
  }

  onConversationJoined(listener: (data: { conversationId: string; userId: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationJoined(listener);
  }

  // ============ CLEANUP ============

  cleanup(): void {
    // Reject all pending messages
    while (this.pendingMessages.length > 0) {
      const pending = this.pendingMessages.shift();
      if (pending) {
        pending.resolve(false);
      }
    }

    this.connectionService.cleanup();
    this.messagingService.cleanup();
    this.typingService.cleanup();
    this.presenceService.cleanup();
    this.translationService.cleanup();
  }

  /**
   * Get pending messages count (for diagnostics)
   */
  getPendingMessagesCount(): number {
    return this.pendingMessages.length;
  }
}
