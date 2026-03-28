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
import { useConversationUIStore } from '@/stores/conversation-ui-store';
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
  private conversationLeftListeners: Set<ConversationJoinedListener> = new Set();
  private readStatusListeners: Set<ReadStatusListener> = new Set();
  private unreadUpdatedListeners: Set<(data: { conversationId: string; unreadCount: number }) => void> = new Set();
  private participantRoleUpdatedListeners: Set<(data: { conversationId: string; userId: string; newRole: string }) => void> = new Set();

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
    socket.on(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, (data: { conversationId: string; unreadCount: number }) => {
      logger.debug('[PresenceService]', 'Unread count updated', {
        conversationId: data.conversationId,
        unreadCount: data.unreadCount
      });
      this.unreadUpdatedListeners.forEach(listener => listener(data));
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

    // Conversation left
    socket.on(SERVER_EVENTS.CONVERSATION_LEFT as any, (data: { conversationId: string; userId: string }) => {
      this.conversationLeftListeners.forEach(listener => listener(data));
    });

    // Reaction sync (full state reconciliation after reconnect)
    socket.on(SERVER_EVENTS.REACTION_SYNC as any, (data: any) => {
      this.reactionAddedListeners.forEach(listener => listener(data));
    });

    // Read status
    socket.on(SERVER_EVENTS.READ_STATUS_UPDATED, (data: {
      conversationId: string;
      participantId: string;
      type: 'read' | 'received';
      updatedAt: Date;
      summary: { totalMembers: number; deliveredCount: number; readCount: number };
    }) => {
      this.readStatusListeners.forEach(listener => listener(data));

      useConversationUIStore.getState().updateReadStatusSummary(data.conversationId, data.summary);
    });

    socket.on(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, (data: { conversationId: string; userId: string; newRole: string }) => {
      this.participantRoleUpdatedListeners.forEach(listener => listener(data));
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

  onConversationLeft(listener: ConversationJoinedListener): UnsubscribeFn {
    this.conversationLeftListeners.add(listener);
    return () => this.conversationLeftListeners.delete(listener);
  }

  /**
   * Event listener: Read status updated
   */
  onReadStatusUpdated(listener: ReadStatusListener): UnsubscribeFn {
    this.readStatusListeners.add(listener);
    return () => this.readStatusListeners.delete(listener);
  }

  /**
   * Event listener: Unread count updated
   */
  onUnreadUpdated(listener: (data: { conversationId: string; unreadCount: number }) => void): UnsubscribeFn {
    this.unreadUpdatedListeners.add(listener);
    return () => this.unreadUpdatedListeners.delete(listener);
  }

  onParticipantRoleUpdated(listener: (data: { conversationId: string; userId: string; newRole: string }) => void): UnsubscribeFn {
    this.participantRoleUpdatedListeners.add(listener);
    return () => this.participantRoleUpdatedListeners.delete(listener);
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
    this.conversationLeftListeners.clear();
    this.readStatusListeners.clear();
    this.unreadUpdatedListeners.clear();
    this.participantRoleUpdatedListeners.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.statusListeners.size;
  }
}
