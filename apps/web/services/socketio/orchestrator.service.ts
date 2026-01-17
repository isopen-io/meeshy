/**
 * Socket.IO Orchestrator Service
 * Coordinates all specialized services and provides a unified API
 * This is the main entry point that replaces the monolithic MeeshySocketIOService
 */

'use client';

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

    const socket = this.connectionService.getSocket();
    if (!socket || !socket.connected) {
      return false;
    }

    // Extract conversation ID
    let conversationId: string;
    if (typeof conversationOrId === 'string') {
      conversationId = conversationOrId;
    } else {
      const { getConversationApiId } = require('@/utils/conversation-id-utils');
      conversationId = getConversationApiId(conversationOrId);
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
    this.connectionService.cleanup();
    this.messagingService.cleanup();
    this.typingService.cleanup();
    this.presenceService.cleanup();
    this.translationService.cleanup();
  }
}
