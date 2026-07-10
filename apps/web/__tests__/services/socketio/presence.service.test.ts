/**
 * Unit tests for PresenceService.
 * Covers all socket event handlers, listener registration/unsubscription,
 * read-status store side-effect, and cleanup.
 */

const mockUpdateReadStatusSummary = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: {
    getState: () => ({ updateReadStatusSummary: mockUpdateReadStatusSummary }),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    USER_STATUS: 'user:status',
    PRESENCE_SNAPSHOT: 'presence:snapshot',
    CONVERSATION_STATS: 'conversation:stats',
    CONVERSATION_ONLINE_STATS: 'conversation:online-stats',
    CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
    CONVERSATION_JOINED: 'conversation:joined',
    CONVERSATION_LEFT: 'conversation:left',
    REACTION_SYNC: 'reaction:sync',
    READ_STATUS_UPDATED: 'read-status:updated',
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
    CONVERSATION_NEW: 'conversation:new',
    CONVERSATION_DELETED: 'conversation:deleted',
    CONVERSATION_UPDATED: 'conversation:updated',
    CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
    CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
    CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
    CONVERSATION_CLOSED: 'conversation:closed',
    CONVERSATION_JOIN_ERROR: 'conversation:join-error',
  },
  CLIENT_EVENTS: {},
}));

import { PresenceService } from '@/services/socketio/presence.service';

function makeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    connected: true,
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(() => {
    service = new PresenceService();
    mockUpdateReadStatusSummary.mockClear();
    mockLoggerDebug.mockClear();
  });

  afterEach(() => {
    service.cleanup();
  });

  // ─── setupEventListeners ────────────────────────────────────────────────────

  describe('setupEventListeners', () => {
    it('registers all expected socket event handlers', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const expectedEvents = [
        'user:status',
        'presence:snapshot',
        'conversation:stats',
        'conversation:online-stats',
        'conversation:unread-updated',
        'reaction:added',
        'reaction:removed',
        'conversation:joined',
        'conversation:left',
        'reaction:sync',
        'read-status:updated',
        'participant:role-updated',
        'conversation:new',
        'conversation:deleted',
        'conversation:updated',
        'conversation:participant-left',
        'conversation:participant-banned',
        'conversation:participant-unbanned',
        'conversation:closed',
        'conversation:join-error',
      ];
      for (const event of expectedEvents) {
        expect(socket.on).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });

    it('forwards user:status events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onUserStatus(listener);
      const event = { userId: 'u1', status: 'online' };
      socket._trigger('user:status', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards presence:snapshot events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onPresenceSnapshot(listener);
      const event = { onlineUserIds: ['u1', 'u2'] };
      socket._trigger('presence:snapshot', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:stats events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationStats(listener);
      const event = { conversationId: 'conv-1', memberCount: 5 };
      socket._trigger('conversation:stats', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:online-stats events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationOnlineStats(listener);
      const event = { conversationId: 'conv-1', onlineCount: 3 };
      socket._trigger('conversation:online-stats', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:unread-updated events to listeners and logs', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onUnreadUpdated(listener);
      const event = { conversationId: 'conv-1', unreadCount: 7 };
      socket._trigger('conversation:unread-updated', event);
      expect(listener).toHaveBeenCalledWith(event);
      expect(mockLoggerDebug).toHaveBeenCalled();
    });

    it('forwards reaction:added events to reactionAdded listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onReactionAdded(listener);
      const event = { messageId: 'msg-1', emoji: '👍' };
      socket._trigger('reaction:added', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards reaction:removed events to reactionRemoved listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onReactionRemoved(listener);
      const event = { messageId: 'msg-1', emoji: '👍' };
      socket._trigger('reaction:removed', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:joined events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationJoined(listener);
      const event = { conversationId: 'conv-1', userId: 'u1' };
      socket._trigger('conversation:joined', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:left events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationLeft(listener);
      const event = { conversationId: 'conv-1', userId: 'u1' };
      socket._trigger('conversation:left', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards reaction:sync events to reactionAdded listeners (full reconciliation)', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onReactionAdded(listener);
      const event = { messageId: 'msg-1', reactions: [] };
      socket._trigger('reaction:sync', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards read-status:updated events to listeners AND updates the UI store', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onReadStatusUpdated(listener);
      const summary = { totalMembers: 5, deliveredCount: 4, readCount: 3 };
      const event = {
        conversationId: 'conv-1',
        participantId: 'u1',
        type: 'read' as const,
        updatedAt: new Date(),
        summary,
      };
      socket._trigger('read-status:updated', event);
      expect(listener).toHaveBeenCalledWith(event);
      expect(mockUpdateReadStatusSummary).toHaveBeenCalledWith('conv-1', summary);
    });

    it('forwards participant:role-updated events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onParticipantRoleUpdated(listener);
      const event = { conversationId: 'conv-1', userId: 'u1', newRole: 'MODERATOR' };
      socket._trigger('participant:role-updated', event);
      expect(listener).toHaveBeenCalledWith(event);
    });
  });

  // ─── multiple listeners ──────────────────────────────────────────────────────

  describe('multiple listeners', () => {
    it('notifies all registered status listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const l1 = jest.fn();
      const l2 = jest.fn();
      service.onUserStatus(l1);
      service.onUserStatus(l2);
      socket._trigger('user:status', { userId: 'u1', status: 'away' });
      expect(l1).toHaveBeenCalled();
      expect(l2).toHaveBeenCalled();
    });
  });

  // ─── unsubscribe ────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('onUserStatus returns a working unsubscribe function', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onUserStatus(listener);
      unsub();
      socket._trigger('user:status', { userId: 'u1', status: 'online' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onPresenceSnapshot unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onPresenceSnapshot(listener);
      unsub();
      socket._trigger('presence:snapshot', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onReactionAdded unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onReactionAdded(listener);
      unsub();
      socket._trigger('reaction:added', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onReactionRemoved unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onReactionRemoved(listener);
      unsub();
      socket._trigger('reaction:removed', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onConversationJoined unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationJoined(listener);
      unsub();
      socket._trigger('conversation:joined', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onConversationLeft unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationLeft(listener);
      unsub();
      socket._trigger('conversation:left', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onReadStatusUpdated unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onReadStatusUpdated(listener);
      unsub();
      socket._trigger('read-status:updated', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onUnreadUpdated unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onUnreadUpdated(listener);
      unsub();
      socket._trigger('conversation:unread-updated', { conversationId: 'c', unreadCount: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onParticipantRoleUpdated unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onParticipantRoleUpdated(listener);
      unsub();
      socket._trigger('participant:role-updated', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onConversationStats unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationStats(listener);
      unsub();
      socket._trigger('conversation:stats', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onConversationOnlineStats unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationOnlineStats(listener);
      unsub();
      socket._trigger('conversation:online-stats', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onConversationNew unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationNew(listener);
      unsub();
      socket._trigger('conversation:new', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── CONVERSATION_NEW ────────────────────────────────────────────────────────

  describe('conversation:new', () => {
    it('forwards conversation:new events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationNew(listener);
      const event = {
        conversationId: 'conv-123',
        conversationType: 'group',
        title: 'Team Chat',
        creatorId: 'user-1',
        participantIds: ['user-1', 'user-2'],
        createdAt: new Date().toISOString(),
      };
      socket._trigger('conversation:new', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:new to multiple listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listenerA = jest.fn();
      const listenerB = jest.fn();
      service.onConversationNew(listenerA);
      service.onConversationNew(listenerB);
      const event = { conversationId: 'c', conversationType: 'direct', title: null, creatorId: 'u1', participantIds: ['u1', 'u2'], createdAt: '' };
      socket._trigger('conversation:new', event);
      expect(listenerA).toHaveBeenCalledWith(event);
      expect(listenerB).toHaveBeenCalledWith(event);
    });
  });

  // ─── conversation:participant-left ──────────────────────────────────────────

  describe('conversation:participant-left', () => {
    it('forwards conversation:participant-left events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationParticipantLeft(listener);
      const event = { conversationId: 'conv-1', userId: 'user-2', displayName: 'Bob', leftAt: new Date().toISOString() };
      socket._trigger('conversation:participant-left', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('onConversationParticipantLeft unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationParticipantLeft(listener);
      unsub();
      socket._trigger('conversation:participant-left', { conversationId: 'c', userId: 'u' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── conversation:participant-banned ────────────────────────────────────────

  describe('conversation:participant-banned', () => {
    it('forwards conversation:participant-banned events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationParticipantBanned(listener);
      const event = { conversationId: 'conv-1', userId: 'user-2', bannedBy: { id: 'admin-1' }, bannedAt: new Date().toISOString() };
      socket._trigger('conversation:participant-banned', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('onConversationParticipantBanned unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationParticipantBanned(listener);
      unsub();
      socket._trigger('conversation:participant-banned', { conversationId: 'c', userId: 'u' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── conversation:participant-unbanned ──────────────────────────────────────

  describe('conversation:participant-unbanned', () => {
    it('forwards conversation:participant-unbanned events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationParticipantUnbanned(listener);
      const event = { conversationId: 'conv-1', userId: 'user-2' };
      socket._trigger('conversation:participant-unbanned', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('onConversationParticipantUnbanned unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationParticipantUnbanned(listener);
      unsub();
      socket._trigger('conversation:participant-unbanned', { conversationId: 'c', userId: 'u' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── conversation:join-error ────────────────────────────────────────────────

  describe('conversation:join-error', () => {
    it('forwards conversation:join-error events to registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onConversationJoinError(listener);
      const event = { conversationId: 'conv-1', reason: 'banned', message: 'You are banned' };
      socket._trigger('conversation:join-error', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards conversation:join-error to multiple listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const l1 = jest.fn();
      const l2 = jest.fn();
      service.onConversationJoinError(l1);
      service.onConversationJoinError(l2);
      socket._trigger('conversation:join-error', { conversationId: 'c', reason: 'not_a_member', message: 'Not a member' });
      expect(l1).toHaveBeenCalled();
      expect(l2).toHaveBeenCalled();
    });

    it('onConversationJoinError returns a working unsubscribe function', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onConversationJoinError(listener);
      unsub();
      socket._trigger('conversation:join-error', { conversationId: 'c', reason: 'banned', message: '' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── cleanup ────────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears all listener sets so no callbacks fire after cleanup', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onUserStatus(listener);
      service.onReactionAdded(listener);
      service.cleanup();
      // Triggering events after cleanup should NOT call the listener
      socket._trigger('user:status', {});
      socket._trigger('reaction:added', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not throw on a fresh instance', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  // ─── getListenerCount ───────────────────────────────────────────────────────

  describe('getListenerCount', () => {
    it('returns 0 on a fresh instance', () => {
      expect(service.getListenerCount()).toBe(0);
    });

    it('counts registered status listeners', () => {
      service.onUserStatus(jest.fn());
      service.onUserStatus(jest.fn());
      expect(service.getListenerCount()).toBe(2);
    });

    it('returns 0 after cleanup', () => {
      service.onUserStatus(jest.fn());
      service.cleanup();
      expect(service.getListenerCount()).toBe(0);
    });
  });
});
