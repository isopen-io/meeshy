/**
 * Presence Service
 * Handles user presence and status
 * - User online/offline status
 * - Conversation stats
 * - Online users tracking
 * - Read receipts
 * - Reactions
 */

'use client';

import { logger } from '@/utils/logger';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { UserStatusEvent } from '@/types';
import type {
  TypedSocket,
  UserStatusListener,
  ConversationStatsListener,
  OnlineStatsListener,
  ReactionListener,
  ReadStatusListener,
  ConversationJoinedListener,
  UnsubscribeFn
} from './types';

/**
 * PresenceService
 * Single Responsibility: Handle user presence and conversation stats
 */
export class PresenceService {
  private statusListeners: Set<UserStatusListener> = new Set();
  private conversationStatsListeners: Set<ConversationStatsListener> = new Set();
  private onlineStatsListeners: Set<OnlineStatsListener> = new Set();
  private reactionAddedListeners: Set<ReactionListener> = new Set();
  private reactionRemovedListeners: Set<ReactionListener> = new Set();
  private conversationJoinedListeners: Set<ConversationJoinedListener> = new Set();
  private readStatusListeners: Set<ReadStatusListener> = new Set();

  /**
   * Setup presence event listeners on socket
   */
  setupEventListeners(socket: TypedSocket): void {
    // User status changes
    socket.on(SERVER_EVENTS.USER_STATUS, (event) => {
      this.statusListeners.forEach(listener => listener(event));
    });

    // Conversation stats
    socket.on(SERVER_EVENTS.CONVERSATION_STATS as any, (data: any) => {
      this.conversationStatsListeners.forEach(listener => listener(data));
    });

    // Online stats
    socket.on(SERVER_EVENTS.CONVERSATION_ONLINE_STATS as any, (data: any) => {
      this.onlineStatsListeners.forEach(listener => listener(data));
    });

    // Unread count updated
    socket.on('conversation:unread-updated', (data: { conversationId: string; unreadCount: number }) => {
      logger.debug('[PresenceService]', 'Unread count updated', {
        conversationId: data.conversationId,
        unreadCount: data.unreadCount
      });

      // Update store
      const { useConversationStore } = require('@/stores/conversation-store');
      useConversationStore.getState().updateUnreadCount(data.conversationId, data.unreadCount);
    });

    // Reactions
    socket.on(SERVER_EVENTS.REACTION_ADDED, (data: any) => {
      this.reactionAddedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.REACTION_REMOVED, (data: any) => {
      this.reactionRemovedListeners.forEach(listener => listener(data));
    });

    // Conversation joined
    socket.on(SERVER_EVENTS.CONVERSATION_JOINED, (data: { conversationId: string; userId: string }) => {
      this.conversationJoinedListeners.forEach(listener => listener(data));
    });

    // Read status
    socket.on(SERVER_EVENTS.READ_STATUS_UPDATED, (data: { conversationId: string; userId: string; type: 'read' | 'received'; updatedAt: Date }) => {
      this.readStatusListeners.forEach(listener => listener(data));
    });
  }

  /**
   * Event listener: User status
   */
  onUserStatus(listener: UserStatusListener): UnsubscribeFn {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Event listener: Conversation stats
   */
  onConversationStats(listener: ConversationStatsListener): UnsubscribeFn {
    this.conversationStatsListeners.add(listener);
    return () => this.conversationStatsListeners.delete(listener);
  }

  /**
   * Event listener: Online stats
   */
  onConversationOnlineStats(listener: OnlineStatsListener): UnsubscribeFn {
    this.onlineStatsListeners.add(listener);
    return () => this.onlineStatsListeners.delete(listener);
  }

  /**
   * Event listener: Reaction added
   */
  onReactionAdded(listener: ReactionListener): UnsubscribeFn {
    this.reactionAddedListeners.add(listener);
    return () => this.reactionAddedListeners.delete(listener);
  }

  /**
   * Event listener: Reaction removed
   */
  onReactionRemoved(listener: ReactionListener): UnsubscribeFn {
    this.reactionRemovedListeners.add(listener);
    return () => this.reactionRemovedListeners.delete(listener);
  }

  /**
   * Event listener: Conversation joined
   */
  onConversationJoined(listener: ConversationJoinedListener): UnsubscribeFn {
    this.conversationJoinedListeners.add(listener);
    return () => this.conversationJoinedListeners.delete(listener);
  }

  /**
   * Event listener: Read status updated
   */
  onReadStatusUpdated(listener: ReadStatusListener): UnsubscribeFn {
    this.readStatusListeners.add(listener);
    return () => this.readStatusListeners.delete(listener);
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.statusListeners.clear();
    this.conversationStatsListeners.clear();
    this.onlineStatsListeners.clear();
    this.reactionAddedListeners.clear();
    this.reactionRemovedListeners.clear();
    this.conversationJoinedListeners.clear();
    this.readStatusListeners.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.statusListeners.size;
  }
}
