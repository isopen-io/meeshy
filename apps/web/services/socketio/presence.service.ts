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
  PresenceSnapshotListener,
  ConversationStatsListener,
  OnlineStatsListener,
  ReactionListener,
  ReadStatusListener,
  ConversationJoinedListener,
  ConversationNewListener,
  FriendRequestCancelledListener,
  FriendRequestNewListener,
  FriendRequestAcceptedListener,
  FriendRequestRejectedListener,
  ConversationDeletedListener,
  ConversationUpdatedListener,
  UnsubscribeFn
} from './types';

/**
 * PresenceService
 * Single Responsibility: Handle user presence and conversation stats
 */
export class PresenceService {
  private statusListeners: Set<UserStatusListener> = new Set();
  private snapshotListeners: Set<PresenceSnapshotListener> = new Set();
  private conversationStatsListeners: Set<ConversationStatsListener> = new Set();
  private onlineStatsListeners: Set<OnlineStatsListener> = new Set();
  private reactionAddedListeners: Set<ReactionListener> = new Set();
  private reactionRemovedListeners: Set<ReactionListener> = new Set();
  private conversationJoinedListeners: Set<ConversationJoinedListener> = new Set();
  private conversationLeftListeners: Set<ConversationJoinedListener> = new Set();
  private readStatusListeners: Set<ReadStatusListener> = new Set();
  private unreadUpdatedListeners: Set<(data: { conversationId: string; unreadCount: number }) => void> = new Set();
  private participantRoleUpdatedListeners: Set<(data: { conversationId: string; userId: string; newRole: string }) => void> = new Set();
  private conversationNewListeners: Set<ConversationNewListener> = new Set();
  private friendRequestCancelledListeners: Set<FriendRequestCancelledListener> = new Set();
  private friendRequestNewListeners: Set<FriendRequestNewListener> = new Set();
  private friendRequestAcceptedListeners: Set<FriendRequestAcceptedListener> = new Set();
  private friendRequestRejectedListeners: Set<FriendRequestRejectedListener> = new Set();
  private conversationDeletedListeners: Set<ConversationDeletedListener> = new Set();
  private conversationUpdatedListeners: Set<ConversationUpdatedListener> = new Set();
  private conversationParticipantLeftListeners: Set<(data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => void> = new Set();
  private conversationParticipantBannedListeners: Set<(data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => void> = new Set();
  private conversationParticipantUnbannedListeners: Set<(data: { conversationId: string; userId: string }) => void> = new Set();
  private conversationClosedListeners: Set<(data: { conversationId: string; closedBy: string; closedAt: string }) => void> = new Set();
  private conversationJoinErrorListeners: Set<(data: { conversationId: string; reason: string; message: string }) => void> = new Set();

  /**
   * Setup presence event listeners on socket
   */
  setupEventListeners(socket: TypedSocket): void {
    // User status changes
    socket.on(SERVER_EVENTS.USER_STATUS, (event) => {
      this.statusListeners.forEach(listener => listener(event));
    });

    // Presence snapshot — initial seed at socket auth
    socket.on(SERVER_EVENTS.PRESENCE_SNAPSHOT, (event) => {
      this.snapshotListeners.forEach(listener => listener(event));
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

    socket.on(SERVER_EVENTS.CONVERSATION_NEW as any, (data: any) => {
      this.conversationNewListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.FRIEND_REQUEST_CANCELLED as any, (data: any) => {
      this.friendRequestCancelledListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.FRIEND_REQUEST_NEW as any, (data: any) => {
      this.friendRequestNewListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED as any, (data: any) => {
      this.friendRequestAcceptedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.FRIEND_REQUEST_REJECTED as any, (data: any) => {
      this.friendRequestRejectedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_DELETED as any, (data: any) => {
      this.conversationDeletedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_UPDATED as any, (data: any) => {
      this.conversationUpdatedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT as any, (data: any) => {
      this.conversationParticipantLeftListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED as any, (data: any) => {
      this.conversationParticipantBannedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED as any, (data: any) => {
      this.conversationParticipantUnbannedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_CLOSED as any, (data: any) => {
      this.conversationClosedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.CONVERSATION_JOIN_ERROR as any, (data: { conversationId: string; reason: string; message: string }) => {
      logger.warn('[PresenceService]', 'conversation join rejected', { conversationId: data.conversationId, reason: data.reason });
      this.conversationJoinErrorListeners.forEach(listener => listener(data));
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
   * Event listener: Presence snapshot (emitted once at socket auth).
   * Carries the userIds online among the new arrival's contacts so the client
   * can seed its store without waiting for individual `user:status` events.
   */
  onPresenceSnapshot(listener: PresenceSnapshotListener): UnsubscribeFn {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
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

  onConversationNew(listener: ConversationNewListener): UnsubscribeFn {
    this.conversationNewListeners.add(listener);
    return () => this.conversationNewListeners.delete(listener);
  }

  onFriendRequestCancelled(listener: FriendRequestCancelledListener): UnsubscribeFn {
    this.friendRequestCancelledListeners.add(listener);
    return () => this.friendRequestCancelledListeners.delete(listener);
  }

  onFriendRequestNew(listener: FriendRequestNewListener): UnsubscribeFn {
    this.friendRequestNewListeners.add(listener);
    return () => this.friendRequestNewListeners.delete(listener);
  }

  onFriendRequestAccepted(listener: FriendRequestAcceptedListener): UnsubscribeFn {
    this.friendRequestAcceptedListeners.add(listener);
    return () => this.friendRequestAcceptedListeners.delete(listener);
  }

  onFriendRequestRejected(listener: FriendRequestRejectedListener): UnsubscribeFn {
    this.friendRequestRejectedListeners.add(listener);
    return () => this.friendRequestRejectedListeners.delete(listener);
  }

  onConversationDeleted(listener: ConversationDeletedListener): UnsubscribeFn {
    this.conversationDeletedListeners.add(listener);
    return () => this.conversationDeletedListeners.delete(listener);
  }

  onConversationUpdated(listener: ConversationUpdatedListener): UnsubscribeFn {
    this.conversationUpdatedListeners.add(listener);
    return () => this.conversationUpdatedListeners.delete(listener);
  }

  onConversationParticipantLeft(listener: (data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => void): UnsubscribeFn {
    this.conversationParticipantLeftListeners.add(listener);
    return () => this.conversationParticipantLeftListeners.delete(listener);
  }

  onConversationParticipantBanned(listener: (data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => void): UnsubscribeFn {
    this.conversationParticipantBannedListeners.add(listener);
    return () => this.conversationParticipantBannedListeners.delete(listener);
  }

  onConversationParticipantUnbanned(listener: (data: { conversationId: string; userId: string }) => void): UnsubscribeFn {
    this.conversationParticipantUnbannedListeners.add(listener);
    return () => this.conversationParticipantUnbannedListeners.delete(listener);
  }

  onConversationClosed(listener: (data: { conversationId: string; closedBy: string; closedAt: string }) => void): UnsubscribeFn {
    this.conversationClosedListeners.add(listener);
    return () => this.conversationClosedListeners.delete(listener);
  }

  onConversationJoinError(listener: (data: { conversationId: string; reason: string; message: string }) => void): UnsubscribeFn {
    this.conversationJoinErrorListeners.add(listener);
    return () => this.conversationJoinErrorListeners.delete(listener);
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.statusListeners.clear();
    this.snapshotListeners.clear();
    this.conversationStatsListeners.clear();
    this.onlineStatsListeners.clear();
    this.reactionAddedListeners.clear();
    this.reactionRemovedListeners.clear();
    this.conversationJoinedListeners.clear();
    this.conversationLeftListeners.clear();
    this.readStatusListeners.clear();
    this.unreadUpdatedListeners.clear();
    this.participantRoleUpdatedListeners.clear();
    this.conversationNewListeners.clear();
    this.friendRequestCancelledListeners.clear();
    this.friendRequestNewListeners.clear();
    this.friendRequestAcceptedListeners.clear();
    this.friendRequestRejectedListeners.clear();
    this.conversationDeletedListeners.clear();
    this.conversationUpdatedListeners.clear();
    this.conversationParticipantLeftListeners.clear();
    this.conversationParticipantBannedListeners.clear();
    this.conversationParticipantUnbannedListeners.clear();
    this.conversationClosedListeners.clear();
    this.conversationJoinErrorListeners.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.statusListeners.size;
  }
}
