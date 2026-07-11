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
  MessageAckResponse,
  UnsubscribeFn
} from './types';

import { ConnectionService } from './connection.service';
import { MessagingService } from './messaging.service';
import { TypingService } from './typing.service';
import { PresenceService } from './presence.service';
import { TranslationService } from './translation.service';
import { PreferencesSyncService } from './preferences-sync.service';
import { e2eeCrypto } from '@/lib/encryption/e2ee-crypto';
import { generateClientMessageId } from '@/utils/client-message-id';

/**
 * Pending message in the queue.
 *
 * `clientMessageId` is **mandatory** here — the orchestrator generates one
 * via `generateClientMessageId()` before queueing so the gateway dedup
 * contract holds even when the same logical send is retried after a flaky
 * reconnect.
 */
interface PendingMessage {
  conversationId: string;
  content: string;
  clientMessageId: string;
  originalLanguage?: string;
  replyToId?: string;
  forwardedFromId?: string;
  forwardedFromConversationId?: string;
  mentionedUserIds?: string[];
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
  timestamp: number;
  resolve: (result: MessageAckResponse) => void;
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
  private preferencesSyncService: PreferencesSyncService;

  // Message conversion helper
  private messageConverter: ((msg: SocketIOMessage) => Message) | null = null;

  // Socket instance for which listeners were last wired up. `initializeConnection()`
  // is called repeatedly on reconnect-adjacent paths (ensureConnection() before every
  // send, setCurrentUser() retries); the underlying socket is reused across those calls
  // (ConnectionService.initializeConnection returns the existing socket if one exists),
  // so re-running setupEventListeners() on it would stack duplicate Socket.IO listeners.
  private listenersAttachedSocket: TypedSocket | null = null;

  // Current user ID for E2EE initialization
  private currentUserId: string | null = null;

  // Message queue for messages sent before socket is ready
  private pendingMessages: PendingMessage[] = [];
  private pendingMessageTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private isProcessingQueue: boolean = false;
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly MESSAGE_QUEUE_TIMEOUT = 120000; // 2 minutes — handles brief offline gaps

  private constructor() {
    this.connectionService = new ConnectionService();
    this.messagingService = new MessagingService();
    this.typingService = new TypingService();
    this.presenceService = new PresenceService();
    this.translationService = new TranslationService();
    this.preferencesSyncService = new PreferencesSyncService();
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

    if (socket !== this.listenersAttachedSocket) {
      // Setup connection listeners
      this.connectionService.setupConnectionListeners(
        () => this.onAuthenticated(),
        (reason) => this.onDisconnected(reason),
        (error) => this.onError(error),
        () => this.onSessionRevoked()
      );

      // Setup service listeners
      if (this.messageConverter) {
        this.messagingService.setupEventListeners(socket, this.messageConverter);
      }
      this.typingService.setupEventListeners(socket);
      this.presenceService.setupEventListeners(socket);
      this.translationService.setupEventListeners(socket);
      this.preferencesSyncService.setupEventListeners(socket);

      this.listenersAttachedSocket = socket;
    }

    // Connect the socket
    this.connectionService.connect();
  }

  /**
   * Handle authenticated event
   */
  private onAuthenticated(): void {
    logger.debug('[SocketIOOrchestrator]', 'Authenticated successfully');
    // Auto-join logic is handled by connection service callback

    // Wire real E2EE handlers using Web Crypto API (AES-256-GCM)
    if (!this.messagingService.hasEncryptionHandlers()) {
      this.messagingService.setEncryptionHandlers(e2eeCrypto.createEncryptionHandlers());
    }

    // Initialize E2EE keys for the current user
    if (this.currentUserId) {
      e2eeCrypto.initializeForUser(this.currentUserId).catch((err) => {
        logger.error('[SocketIOOrchestrator]', 'E2EE initialization failed', { error: err });
      });
    }

    // Process pending messages queue
    this.processPendingMessages();
  }

  // Annule et oublie le timeout individuel d'un message en attente. Appelé sur
  // chaque chemin qui retire un message de la file (traité, expulsé, cleanup) —
  // sans quoi le timer resterait armé et l'entrée de la Map fuiterait sur onglet
  // longue durée.
  private clearPendingTimeout(clientMessageId: string): void {
    const timeout = this.pendingMessageTimeouts.get(clientMessageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingMessageTimeouts.delete(clientMessageId);
    }
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

      // Annuler le timeout individuel puisqu'on traite maintenant le message
      this.clearPendingTimeout(pending.clientMessageId);

      // Check if message has expired
      if (Date.now() - pending.timestamp > this.MESSAGE_QUEUE_TIMEOUT) {
        logger.warn('[SocketIOOrchestrator]', 'Pending message expired, discarding');
        pending.resolve({ success: false });
        continue;
      }

      try {
        const options: MessageSendOptions = {
          conversationId: pending.conversationId,
          content: pending.content,
          clientMessageId: pending.clientMessageId,
          originalLanguage: pending.originalLanguage,
          replyToId: pending.replyToId,
          forwardedFromId: pending.forwardedFromId,
          forwardedFromConversationId: pending.forwardedFromConversationId,
          mentionedUserIds: pending.mentionedUserIds,
          attachmentIds: pending.attachmentIds,
          attachmentMimeTypes: pending.attachmentMimeTypes,
        };

        const result = await this.messagingService.sendMessage(socket, options);
        pending.resolve(result);

        if (result.success) {
          logger.debug('[SocketIOOrchestrator]', 'Pending message sent successfully');
        }
      } catch (error) {
        logger.error('[SocketIOOrchestrator]', 'Error sending pending message', { error });
        pending.resolve({ success: false });
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Handle disconnected event
   */
  private onDisconnected(reason: string): void {
    logger.debug('[SocketIOOrchestrator]', 'Disconnected', { reason });
    // Clear stale typing indicators immediately — server-side state is gone.
    // Without this, indicators linger until the 15-second safety timeout fires.
    this.typingService.clearAllTypingState();
  }

  /**
   * Handle error event
   */
  private onError(error: Error): void {
    logger.error('[SocketIOOrchestrator]', 'Error', { error });
  }

  /**
   * Handle session revoked event — server explicitly invalidated this session.
   * Dispatches a DOM event so the React layer can trigger logout without a
   * circular import between the socket service and the auth store.
   */
  private onSessionRevoked(): void {
    logger.warn('[SocketIOOrchestrator]', 'Session revoked by server — dispatching meeshy:session-revoked');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('meeshy:session-revoked'));
    }
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
    this.currentUserId = user.id;
    this.messagingService.setCurrentUserId(user.id);
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

    if (socket && (status === 'connected' || socket.connected)) {
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
    attachmentMimeTypes?: string[],
    clientMessageId?: string,
    forwardedFromId?: string,
    forwardedFromConversationId?: string,
  ): Promise<MessageAckResponse> {
    this.ensureConnection();

    // Extract conversation ID first
    let conversationId: string;
    if (typeof conversationOrId === 'string') {
      conversationId = conversationOrId;
    } else {
      const { getConversationApiId } = require('@/utils/conversation-id-utils');
      conversationId = getConversationApiId(conversationOrId);
    }

    // Resolve identifier (e.g. "meeshy") → ObjectId using the normalized ID
    // from the CONVERSATION_JOINED event. Without this, the REST fallback
    // would POST to /conversations/meeshy/messages and get a 500.
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(conversationId);
    if (!isObjectId) {
      const normalizedId = this.getCurrentConversationId();
      if (normalizedId) {
        conversationId = normalizedId;
      }
    }

    // Generate a clientMessageId before queueing/sending so the same id is
    // used whether we hit the WS fast path or the offline queue, and so the
    // gateway dedup contract (`(conversationId, clientMessageId)`) survives
    // a reconnect-driven retry.
    const resolvedClientMessageId = clientMessageId ?? generateClientMessageId();

    const socket = this.connectionService.getSocket();

    // If socket not ready, queue the message for later
    if (!socket || !socket.connected) {
      logger.debug('[SocketIOOrchestrator]', 'Socket not ready, queueing message');

      // Check queue size limit
      if (this.pendingMessages.length >= this.MAX_QUEUE_SIZE) {
        logger.warn('[SocketIOOrchestrator]', 'Message queue full, oldest message will be discarded');
        const oldest = this.pendingMessages.shift();
        if (oldest) {
          this.clearPendingTimeout(oldest.clientMessageId);
          oldest.resolve({ success: false });
        }
      }

      // Add to queue and return a promise that resolves when message is sent
      return new Promise<MessageAckResponse>((resolve) => {
        const pending: PendingMessage = {
          conversationId,
          content,
          clientMessageId: resolvedClientMessageId,
          originalLanguage,
          replyToId,
          forwardedFromId,
          forwardedFromConversationId,
          mentionedUserIds,
          attachmentIds,
          attachmentMimeTypes,
          timestamp: Date.now(),
          resolve
        };

        // Timeout par message pour éviter la fuite mémoire sur onglet longue durée
        const timeoutId = setTimeout(() => {
          const idx = this.pendingMessages.indexOf(pending);
          if (idx !== -1) {
            this.pendingMessages.splice(idx, 1);
            this.pendingMessageTimeouts.delete(resolvedClientMessageId);
            logger.warn('[SocketIOOrchestrator]', 'Message queue timeout, message discarded');
            resolve({ success: false });
          }
        }, this.MESSAGE_QUEUE_TIMEOUT);
        this.pendingMessageTimeouts.set(resolvedClientMessageId, timeoutId);

        this.pendingMessages.push(pending);
        logger.debug('[SocketIOOrchestrator]', `Message queued (${this.pendingMessages.length} in queue)`);
      });
    }

    const options: MessageSendOptions = {
      conversationId,
      content,
      clientMessageId: resolvedClientMessageId,
      originalLanguage,
      replyToId,
      forwardedFromId,
      forwardedFromConversationId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes,
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
    const conversationId = typeof conversationOrId === 'string'
      ? conversationOrId
      : (conversationOrId?.id ?? conversationOrId?.identifier ?? '');
    this.typingService.clearConversationTypingState(conversationId);
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

  disconnectForUpdate(): void {
    this.connectionService.disconnectForUpdate();
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

  onStatusChange(callback: (diag: ConnectionDiagnostics) => void): () => void {
    return this.connectionService.onStatusChange(callback);
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

  onAttachmentStatusUpdated(listener: (data: any) => void): UnsubscribeFn {
    return this.messagingService.onAttachmentStatusUpdated(listener);
  }

  onMessageAttachmentUpdated(listener: (data: any) => void): UnsubscribeFn {
    return this.messagingService.onMessageAttachmentUpdated(listener);
  }

  onPendingMessagesDelivered(listener: (data: { count: number; conversationIds: string[] }) => void): UnsubscribeFn {
    return this.messagingService.onPendingMessagesDelivered(listener);
  }

  onLinkMessageNew(listener: (data: { message: Record<string, unknown> }) => void): UnsubscribeFn {
    return this.messagingService.onLinkMessageNew(listener);
  }

  onMessagePinned(listener: (data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => void): UnsubscribeFn {
    return this.messagingService.onMessagePinned(listener);
  }

  onMessageUnpinned(listener: (data: { messageId: string; conversationId: string }) => void): UnsubscribeFn {
    return this.messagingService.onMessageUnpinned(listener);
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

  onTranslationFailed(listener: Parameters<TranslationService['onTranslationFailed']>[0]): UnsubscribeFn {
    return this.translationService.onTranslationFailed(listener);
  }

  onAudioTranslationFailed(listener: Parameters<TranslationService['onAudioTranslationFailed']>[0]): UnsubscribeFn {
    return this.translationService.onAudioTranslationFailed(listener);
  }

  onTranscriptionFailed(listener: Parameters<TranslationService['onTranscriptionFailed']>[0]): UnsubscribeFn {
    return this.translationService.onTranscriptionFailed(listener);
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

  onPresenceSnapshot(listener: (event: any) => void): UnsubscribeFn {
    return this.presenceService.onPresenceSnapshot(listener);
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

  onConversationLeft(listener: (data: { conversationId: string; userId: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationLeft(listener);
  }

  onUnreadUpdated(listener: (data: { conversationId: string; unreadCount: number }) => void): UnsubscribeFn {
    return this.presenceService.onUnreadUpdated(listener);
  }

  onPreferencesUpdated(
    listener: (data: import('@meeshy/shared/types/socketio-events').UserPreferencesUpdatedEventData) => void,
  ): UnsubscribeFn {
    return this.preferencesSyncService.onPreferencesUpdated(listener);
  }

  onCategoryChanged(listener: () => void): UnsubscribeFn {
    return this.preferencesSyncService.onCategoryChanged(listener);
  }

  onParticipantRoleUpdated(listener: (data: { conversationId: string; userId: string; newRole: string }) => void): UnsubscribeFn {
    return this.presenceService.onParticipantRoleUpdated(listener);
  }

  onConversationNew(listener: import('./types').ConversationNewListener): UnsubscribeFn {
    return this.presenceService.onConversationNew(listener);
  }

  onFriendRequestCancelled(listener: import('./types').FriendRequestCancelledListener): UnsubscribeFn {
    return this.presenceService.onFriendRequestCancelled(listener);
  }

  onFriendRequestNew(listener: import('./types').FriendRequestNewListener): UnsubscribeFn {
    return this.presenceService.onFriendRequestNew(listener);
  }

  onFriendRequestAccepted(listener: import('./types').FriendRequestAcceptedListener): UnsubscribeFn {
    return this.presenceService.onFriendRequestAccepted(listener);
  }

  onFriendRequestRejected(listener: import('./types').FriendRequestRejectedListener): UnsubscribeFn {
    return this.presenceService.onFriendRequestRejected(listener);
  }

  onUserUpdated(listener: import('./types').UserUpdatedListener): UnsubscribeFn {
    return this.presenceService.onUserUpdated(listener);
  }

  onConversationDeleted(listener: import('./types').ConversationDeletedListener): UnsubscribeFn {
    return this.presenceService.onConversationDeleted(listener);
  }

  onConversationUpdated(listener: import('./types').ConversationUpdatedListener): UnsubscribeFn {
    return this.presenceService.onConversationUpdated(listener);
  }

  onConversationParticipantLeft(listener: (data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationParticipantLeft(listener);
  }

  onConversationParticipantBanned(listener: (data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationParticipantBanned(listener);
  }

  onConversationParticipantUnbanned(listener: (data: { conversationId: string; userId: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationParticipantUnbanned(listener);
  }

  onConversationClosed(listener: (data: { conversationId: string; closedBy: string; closedAt: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationClosed(listener);
  }

  onConversationJoinError(listener: (data: { conversationId: string; reason: string; message: string }) => void): UnsubscribeFn {
    return this.presenceService.onConversationJoinError(listener);
  }

  // ============ CLEANUP ============

  cleanup(): void {
    // Reject all pending messages and clear their armed timers
    while (this.pendingMessages.length > 0) {
      const pending = this.pendingMessages.shift();
      if (pending) {
        this.clearPendingTimeout(pending.clientMessageId);
        pending.resolve({ success: false });
      }
    }

    this.connectionService.cleanup();
    this.messagingService.cleanup();
    this.typingService.cleanup();
    this.presenceService.cleanup();
    this.translationService.cleanup();
    this.preferencesSyncService.cleanup();
    this.listenersAttachedSocket = null;
  }

  /**
   * Get pending messages count (for diagnostics)
   */
  getPendingMessagesCount(): number {
    return this.pendingMessages.length;
  }
}
