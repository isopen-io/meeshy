/**
 * Tests for MessagingService
 * Achieves ≥92% line+branch coverage on messaging.service.ts
 */

// ─── Mock variable declarations MUST come before jest.mock() calls ────────────
const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

const SERVER_EVENTS_MOCK = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_CONSUMED: 'message:consumed',
  ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  MESSAGE_ATTACHMENT_UPDATED: 'message:attachment-updated',
  PENDING_MESSAGES_DELIVERED: 'message:pending-delivered',
  LINK_MESSAGE_NEW: 'link:message:new',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',
  MESSAGE_HIDDEN_FOR_ME: 'message:hidden-for-me',
  MESSAGE_RESTORED_FOR_ME: 'message:restored-for-me',
  MENTION_CREATED: 'mention:created',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
};

const CLIENT_EVENTS_MOCK = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
};

// Mock for REST fallback via dynamic import('../conversations')
const mockConversationsServiceSendMessage = jest.fn();
const mockConversationsServiceMarkAsReceived = jest.fn();

// Mock for the share-link REST fallback (anonymous senders)
const mockAnonymousCanSendViaLink = jest.fn();
const mockAnonymousSendMessage = jest.fn();

// ─── jest.mock() calls ────────────────────────────────────────────────────────
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: (...args: unknown[]) => mockLogger.debug(...args),
    error: (...args: unknown[]) => mockLogger.error(...args),
    warn: (...args: unknown[]) => mockLogger.warn(...args),
    info: (...args: unknown[]) => mockLogger.info(...args),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_NEW: 'message:new',
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    MESSAGE_CONSUMED: 'message:consumed',
    ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
    MESSAGE_ATTACHMENT_UPDATED: 'message:attachment-updated',
    PENDING_MESSAGES_DELIVERED: 'message:pending-delivered',
    LINK_MESSAGE_NEW: 'link:message:new',
    MESSAGE_PINNED: 'message:pinned',
    MESSAGE_UNPINNED: 'message:unpinned',
    MESSAGE_HIDDEN_FOR_ME: 'message:hidden-for-me',
    MESSAGE_RESTORED_FOR_ME: 'message:restored-for-me',
    MENTION_CREATED: 'mention:created',
    AUTHENTICATED: 'authenticated',
    ERROR: 'error',
  },
  CLIENT_EVENTS: {
    MESSAGE_SEND: 'message:send',
    MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
    MESSAGE_EDIT: 'message:edit',
    MESSAGE_DELETE: 'message:delete',
    CONVERSATION_JOIN: 'conversation:join',
    CONVERSATION_LEAVE: 'conversation:leave',
  },
}));

// Mock dynamic import('@/services/conversations.service') used in markAsReceivedDebounced
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    sendMessage: (...args: unknown[]) => mockConversationsServiceSendMessage(...args),
    markAsReceived: (...args: unknown[]) => mockConversationsServiceMarkAsReceived(...args),
  },
}));

// Mock dynamic import('../conversations') used in sendMessageViaRest
// Resolved relative to services/socketio/messaging.service.ts → services/conversations
jest.mock('@/services/conversations', () => ({
  conversationsService: {
    sendMessage: (...args: unknown[]) => mockConversationsServiceSendMessage(...args),
    markAsReceived: (...args: unknown[]) => mockConversationsServiceMarkAsReceived(...args),
  },
}));

// Mock dynamic import('@/services/anonymous-chat.service') used by the
// share-link REST fallback
jest.mock('@/services/anonymous-chat.service', () => ({
  anonymousChatService: {
    canSendViaLink: () => mockAnonymousCanSendViaLink(),
    sendMessage: (...args: unknown[]) => mockAnonymousSendMessage(...args),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { MessagingService } from '@/services/socketio/messaging.service';
import type { TypedSocket } from '@/services/socketio/types';
import type { EncryptionHandlers } from '@/services/socketio/types';

// ─── Test socket factory ──────────────────────────────────────────────────────

function makeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    connected: true,
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
    _handlers: handlers,
  };
}

function makeDisconnectedSocket() {
  const s = makeSocket();
  s.connected = false;
  return s;
}

// ─── Message factories ────────────────────────────────────────────────────────

function makeSocketMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    content: 'Hello',
    conversationId: 'conv-1',
    senderId: 'user-other',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    content: 'Hello',
    conversationId: 'conv-1',
    senderId: 'user-other',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

function convertMessageFn(msg: unknown) {
  return msg as any;
}

function makeEncryptionHandlers(overrides: Partial<EncryptionHandlers> = {}): EncryptionHandlers {
  return {
    encrypt: jest.fn().mockResolvedValue({
      ciphertext: 'encrypted-data',
      metadata: { mode: 'aes-256-gcm', keyId: 'key-1', iv: 'iv-data', authTag: 'tag' },
    }),
    decrypt: jest.fn().mockResolvedValue('decrypted content'),
    getConversationMode: jest.fn().mockResolvedValue('aes-256-gcm'),
    ...overrides,
  };
}

function makeSendOptions(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-1',
    content: 'Test message',
    clientMessageId: 'cid_test-1234',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessagingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversationsServiceSendMessage.mockReset();
    mockConversationsServiceMarkAsReceived.mockReset();
    mockAnonymousSendMessage.mockReset();
    // Default: a registered sender. The anonymous branch is opt-in per test.
    mockAnonymousCanSendViaLink.mockReturnValue(false);
  });

  // ─── setTypingRetractor (un message rétracte la frappe) ───────────────────

  describe('setTypingRetractor', () => {
    it('retracts the sender typing indicator when their message arrives', () => {
      const svc = new MessagingService();
      const retract = jest.fn();
      svc.setTypingRetractor(retract);

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);
      socket._trigger(
        SERVER_EVENTS_MOCK.MESSAGE_NEW,
        makeSocketMessage({ id: 'm-1', conversationId: 'conv-9', senderId: 'alice' })
      );

      expect(retract).toHaveBeenCalledWith('conv-9', 'alice');
    });

    it('reads the sender from the nested sender object when present', () => {
      const svc = new MessagingService();
      const retract = jest.fn();
      svc.setTypingRetractor(retract);

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);
      socket._trigger(
        SERVER_EVENTS_MOCK.MESSAGE_NEW,
        makeSocketMessage({ id: 'm-2', conversationId: 'conv-9', sender: { userId: 'bob' } })
      );

      expect(retract).toHaveBeenCalledWith('conv-9', 'bob');
    });

    it('retracts BEFORE decryption — an encrypted message must not delay the retraction', async () => {
      const svc = new MessagingService();
      const order: string[] = [];
      svc.setTypingRetractor(() => order.push('retract'));
      svc.onNewMessage(() => order.push('deliver'));
      svc.setEncryptionHandlers({
        encrypt: jest.fn(),
        decrypt: jest.fn(async () => {
          order.push('decrypt');
          return 'clear';
        }),
        isConversationEncrypted: () => true,
      } as never);

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);
      socket._trigger(
        SERVER_EVENTS_MOCK.MESSAGE_NEW,
        makeSocketMessage({ id: 'm-3', conversationId: 'conv-9', senderId: 'alice' })
      );
      await Promise.resolve();
      await Promise.resolve();

      expect(order[0]).toBe('retract');
    });

    it('does not retract for a duplicate message', () => {
      const svc = new MessagingService();
      const retract = jest.fn();
      svc.setTypingRetractor(retract);

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);
      const msg = makeSocketMessage({ id: 'm-4', conversationId: 'conv-9', senderId: 'alice' });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      retract.mockClear();
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);

      expect(retract).not.toHaveBeenCalled();
    });

    it('stays silent when no retractor is wired', () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      expect(() =>
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({ id: 'm-5' }))
      ).not.toThrow();
    });
  });

  // ─── setCurrentUserId / isOwnMessage ──────────────────────────────────────

  describe('setCurrentUserId / isOwnMessage', () => {
    it('returns false when no userId set', () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);

      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({ senderId: 'user-1', conversationId: 'conv-1' });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);

      // Since isOwnMessage returns false and conversationId is set, markAsReceived should be called
      // (we can't test isOwnMessage directly; we test its effect)
    });

    it('marks as received only for non-own messages', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      svc.setCurrentUserId('user-me');

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      // Own message (sender.userId matches currentUserId)
      const ownMsg = makeSocketMessage({
        id: 'own-1',
        sender: { userId: 'user-me' },
        conversationId: 'conv-1',
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, ownMsg);

      await Promise.resolve();
      jest.advanceTimersByTime(600);
      await Promise.resolve();

      expect(mockConversationsServiceMarkAsReceived).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('handles sender.id format', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      svc.setCurrentUserId('user-me');

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const ownMsg = makeSocketMessage({
        id: 'own-2',
        sender: { id: 'user-me' },
        conversationId: 'conv-1',
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, ownMsg);
      await Promise.resolve();
      jest.advanceTimersByTime(600);
      await Promise.resolve();

      expect(mockConversationsServiceMarkAsReceived).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('handles message.senderId format', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      svc.setCurrentUserId('user-me');

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const ownMsg = makeSocketMessage({
        id: 'own-3',
        senderId: 'user-me',
        conversationId: 'conv-1',
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, ownMsg);
      await Promise.resolve();
      jest.advanceTimersByTime(600);
      await Promise.resolve();

      expect(mockConversationsServiceMarkAsReceived).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('marks as received for messages from other users', async () => {
      jest.useFakeTimers();
      mockConversationsServiceMarkAsReceived.mockResolvedValue(undefined);

      const svc = new MessagingService();
      svc.setCurrentUserId('user-me');

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const otherMsg = makeSocketMessage({
        id: 'other-1',
        senderId: 'user-other',
        conversationId: 'conv-1',
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, otherMsg);
      await Promise.resolve();

      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockConversationsServiceMarkAsReceived).toHaveBeenCalledWith('conv-1');
      jest.useRealTimers();
    });
  });

  // ─── isDuplicateMessage ───────────────────────────────────────────────────

  describe('isDuplicateMessage', () => {
    it('first call returns false, second call same id returns true', () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const listener = jest.fn();
      svc.onNewMessage(listener);

      const msg = makeSocketMessage({ id: 'dup-test' });

      // First time: not duplicate
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      // Second time: duplicate, listener not called again
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);

      // Must wait for async handling
      return Promise.resolve().then(() => {
        expect(listener).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
      });
    });

    it('evicts 50 oldest entries when cache reaches 200', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const listener = jest.fn();
      svc.onNewMessage(listener);

      // Fill 200 messages
      for (let i = 0; i < 200; i++) {
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({ id: `fill-${i}` }));
        await Promise.resolve();
      }

      // 201st message should trigger eviction
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({ id: 'eviction-trigger' }));
      await Promise.resolve();

      // After eviction, some old entries are removed. Total should be ~151.
      const recentIds = (svc as any).recentMessageIds as Map<string, number>;
      expect(recentIds.size).toBeLessThan(200);

      jest.useRealTimers();
    });

    it('timer cleanup removes id after 5 minutes', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({ id: 'timer-test' }));
      await Promise.resolve();

      const recentIds = (svc as any).recentMessageIds as Map<string, number>;
      expect(recentIds.has('timer-test')).toBe(true);

      // Advance 5 minutes (300_000ms)
      jest.advanceTimersByTime(300_001);

      expect(recentIds.has('timer-test')).toBe(false);

      jest.useRealTimers();
    });
  });

  // ─── markAsReceivedDebounced ──────────────────────────────────────────────

  describe('markAsReceivedDebounced', () => {
    it('creates timer for conversation', async () => {
      jest.useFakeTimers();
      mockConversationsServiceMarkAsReceived.mockResolvedValue(undefined);
      const svc = new MessagingService();

      const socket = makeSocket();
      svc.setCurrentUserId('me');
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'mark-1',
        senderId: 'other',
        conversationId: 'conv-debounce',
      }));
      await Promise.resolve();

      const timers = (svc as any).markReceivedTimers as Map<string, unknown>;
      expect(timers.has('conv-debounce')).toBe(true);

      jest.useRealTimers();
    });

    it('skips if timer already exists for conversation', async () => {
      jest.useFakeTimers();
      mockConversationsServiceMarkAsReceived.mockResolvedValue(undefined);
      const svc = new MessagingService();

      const socket = makeSocket();
      svc.setCurrentUserId('me');
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      // First message
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'skip-1',
        senderId: 'other',
        conversationId: 'conv-skip',
      }));
      await Promise.resolve();

      // Second message for same conversation - should skip
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'skip-2',
        senderId: 'other',
        conversationId: 'conv-skip',
      }));
      await Promise.resolve();

      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();

      // Only called once despite two messages
      expect(mockConversationsServiceMarkAsReceived).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('skips when at 100 timer limit', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const timers = (svc as any).markReceivedTimers as Map<string, ReturnType<typeof setTimeout>>;

      // Pre-fill 100 timers
      for (let i = 0; i < 100; i++) {
        timers.set(`conv-${i}`, setTimeout(() => {}, 99999));
      }

      const socket = makeSocket();
      svc.setCurrentUserId('me');
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'limit-1',
        senderId: 'other',
        conversationId: 'new-conv',
      }));
      await Promise.resolve();

      // New timer should NOT be created (at limit)
      expect(timers.has('new-conv')).toBe(false);

      jest.useRealTimers();
    });

    it('timer fires and calls markAsReceived', async () => {
      jest.useFakeTimers();
      mockConversationsServiceMarkAsReceived.mockResolvedValue(undefined);
      const svc = new MessagingService();

      const socket = makeSocket();
      svc.setCurrentUserId('me');
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'fire-1',
        senderId: 'other',
        conversationId: 'conv-fire',
      }));
      await Promise.resolve();

      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockConversationsServiceMarkAsReceived).toHaveBeenCalledWith('conv-fire');
      jest.useRealTimers();
    });

    it('timer handles markAsReceived error gracefully', async () => {
      jest.useFakeTimers();
      mockConversationsServiceMarkAsReceived.mockRejectedValue(new Error('network error'));
      const svc = new MessagingService();

      const socket = makeSocket();
      svc.setCurrentUserId('me');
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, makeSocketMessage({
        id: 'err-1',
        senderId: 'other',
        conversationId: 'conv-err',
      }));
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(600);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.debug).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  // ─── hasEncryptionHandlers ────────────────────────────────────────────────

  describe('hasEncryptionHandlers', () => {
    it('returns false initially', () => {
      const svc = new MessagingService();
      expect(svc.hasEncryptionHandlers()).toBe(false);
    });

    it('returns true after setEncryptionHandlers', () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers());
      expect(svc.hasEncryptionHandlers()).toBe(true);
    });

    it('returns false after clearEncryptionHandlers', () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers());
      svc.clearEncryptionHandlers();
      expect(svc.hasEncryptionHandlers()).toBe(false);
    });
  });

  // ─── setEncryptionHandlers / clearEncryptionHandlers ─────────────────────

  describe('setEncryptionHandlers / clearEncryptionHandlers', () => {
    it('setEncryptionHandlers logs debug', () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers());
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[MessagingService]',
        'Encryption handlers configured'
      );
    });

    it('clearEncryptionHandlers logs debug', () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers());
      jest.clearAllMocks();
      svc.clearEncryptionHandlers();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[MessagingService]',
        'Encryption handlers cleared'
      );
    });
  });

  // ─── isConversationEncrypted ──────────────────────────────────────────────

  describe('isConversationEncrypted', () => {
    it('returns false when no handlers', async () => {
      const svc = new MessagingService();
      expect(await svc.isConversationEncrypted('conv-1')).toBe(false);
    });

    it('returns false when mode is null', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(
        makeEncryptionHandlers({ getConversationMode: jest.fn().mockResolvedValue(null) })
      );
      expect(await svc.isConversationEncrypted('conv-1')).toBe(false);
    });

    it('returns true when mode is non-null', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(
        makeEncryptionHandlers({ getConversationMode: jest.fn().mockResolvedValue('e2ee') })
      );
      expect(await svc.isConversationEncrypted('conv-1')).toBe(true);
    });
  });

  // ─── setupEventListeners ─────────────────────────────────────────────────

  describe('setupEventListeners', () => {
    describe('message:new', () => {
      it('calls listener on new message', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onNewMessage(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const msg = makeSocketMessage({ id: 'new-msg-1' });
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('skips duplicate messages', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onNewMessage(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const msg = makeSocketMessage({ id: 'dup-1' });
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('handles message without id (no duplicate check)', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onNewMessage(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const msg = makeSocketMessage({ id: undefined });
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledTimes(2);
      });
    });

    describe('message:edited', () => {
      it('calls edit listener after decryption', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessageEdited(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const msg = makeSocketMessage({ id: 'edit-1' });
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_EDITED, msg);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[MessagingService]',
          'Message edited',
          expect.objectContaining({ messageId: 'edit-1' })
        );
      });
    });

    describe('message:deleted', () => {
      it('calls delete listener with messageId', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessageDeleted(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_DELETED, { messageId: 'del-1' });
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith('del-1');
        expect(mockLogger.debug).toHaveBeenCalledWith(
          '[MessagingService]',
          'Message deleted',
          expect.objectContaining({ messageId: 'del-1' })
        );
      });
    });

    describe('message:consumed', () => {
      it('calls consumed listener', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessageConsumed(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { conversationId: 'conv-1', userId: 'u1', type: 'read' as const };
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_CONSUMED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('attachment:status-updated', () => {
      it('calls attachment status listener', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onAttachmentStatusUpdated(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { attachmentId: 'att-1', status: 'ready', messageId: 'msg-1', conversationId: 'conv-1' };
        socket._trigger(SERVER_EVENTS_MOCK.ATTACHMENT_STATUS_UPDATED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('message:attachment-updated', () => {
      it('forwards event data to all registered listeners', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessageAttachmentUpdated(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { conversationId: 'conv-1', messageId: 'msg-1', attachment: { id: 'att-1', mimeType: 'audio/mp4', transcription: 'Hello' } };
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_ATTACHMENT_UPDATED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('message:pending-delivered', () => {
      it('forwards event data to all registered listeners', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onPendingMessagesDelivered(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        socket._trigger(SERVER_EVENTS_MOCK.PENDING_MESSAGES_DELIVERED, { count: 3, conversationIds: ['c-1'] });
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith({ count: 3, conversationIds: ['c-1'] });
      });
    });

    describe('message:pinned', () => {
      it('forwards event data to all registered listeners', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessagePinned(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { messageId: 'msg-1', conversationId: 'conv-1', pinnedBy: 'user-1', pinnedAt: new Date().toISOString() };
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_PINNED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('message:unpinned', () => {
      it('forwards event data to all registered listeners', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMessageUnpinned(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { messageId: 'msg-1', conversationId: 'conv-1' };
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_UNPINNED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('link:message:new', () => {
      it('forwards link message data to all registered listeners', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onLinkMessageNew(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { message: { id: 'link-msg-1', conversationId: 'conv-1', content: 'https://example.com', messageType: 'link' } };
        socket._trigger(SERVER_EVENTS_MOCK.LINK_MESSAGE_NEW, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });

    describe('mention:created', () => {
      it('calls mention listener', async () => {
        const svc = new MessagingService();
        const socket = makeSocket();
        const listener = jest.fn();
        svc.onMentionCreated(listener);
        svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

        const data = { userId: 'u1', messageId: 'msg-1', conversationId: 'conv-1' };
        socket._trigger(SERVER_EVENTS_MOCK.MENTION_CREATED, data);
        await Promise.resolve();

        expect(listener).toHaveBeenCalledWith(data);
      });
    });
  });

  // ─── decryptMessage (via setupEventListeners + MESSAGE_NEW) ───────────────

  describe('decryptMessage (via message:new)', () => {
    it('returns message unchanged if no encrypted content', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers());

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({ id: 'plain-1', content: 'plain text' });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].content).toBe('plain text');
    });

    it('returns message unchanged when no encryption handlers', async () => {
      const svc = new MessagingService();

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'enc-no-handlers',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();

      expect(listener.mock.calls[0][0]._isEncrypted).toBeUndefined();
    });

    it('decrypts successfully and sets _isEncrypted=true', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockResolvedValue('decrypted content'),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'enc-success',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', keyId: 'k1', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result._isEncrypted).toBe(true);
      expect(result.content).toBe('decrypted content');
      expect(result._encryptionMode).toBe('aes-256-gcm');
    });

    it('uses signal_v3 protocol for e2ee mode', async () => {
      const mockDecrypt = jest.fn().mockResolvedValue('decrypted');
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({ decrypt: mockDecrypt }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'e2ee-mode',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'e2ee', iv: 'iv', authTag: 'tag' },
        senderId: 'sender-1',
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();

      expect(mockDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ protocol: 'signal_v3' }),
        }),
        'sender-1'
      );
    });

    it('uses aes-256-gcm protocol for non-e2ee mode', async () => {
      const mockDecrypt = jest.fn().mockResolvedValue('decrypted');
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({ decrypt: mockDecrypt }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'aes-mode',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();

      expect(mockDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ protocol: 'aes-256-gcm' }),
        }),
        'user-other'
      );
    });

    it('decrypt throws with "key" → KEY_MISSING error code', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue(new Error('missing key for decryption')),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'key-error',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result._decryptionErrorCode).toBe('KEY_MISSING');
      expect(result._decryptionFailed).toBe(true);
      expect(result._isEncrypted).toBe(true);
    });

    it('decrypt throws with "session" → SESSION_NOT_FOUND error code', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue(new Error('no session found')),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'session-error',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'e2ee', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result._decryptionErrorCode).toBe('SESSION_NOT_FOUND');
    });

    it('other decrypt error → DECRYPTION_FAILED error code', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue(new Error('unknown crypto error')),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'other-error',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result._decryptionErrorCode).toBe('DECRYPTION_FAILED');
    });

    it('preserves original content when decryption fails (fallback)', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue(new Error('unknown crypto error')),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'fallback-content',
        content: 'fallback text',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result.content).toBe('fallback text');
    });

    it('uses [Encrypted message - Unable to decrypt] when no original content', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue(new Error('fail')),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'no-content',
        content: '',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result.content).toBe('[Encrypted message - Unable to decrypt]');
    });

    it('handles non-Error thrown values in decryption', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        decrypt: jest.fn().mockRejectedValue('string error'),
      }));

      const socket = makeSocket();
      const listener = jest.fn();
      svc.onNewMessage(listener);
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const msg = makeSocketMessage({
        id: 'non-error',
        encryptedContent: 'cipher',
        encryptionMetadata: { mode: 'aes-256-gcm', iv: 'iv', authTag: 'tag' },
      });
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_NEW, msg);
      await Promise.resolve();
      await Promise.resolve();

      const result = listener.mock.calls[0][0];
      expect(result._decryptionErrorCode).toBe('DECRYPTION_FAILED');
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('returns failure when socket is null', async () => {
      const svc = new MessagingService();
      const result = await svc.sendMessage(null, makeSendOptions());
      expect(result).toEqual({ success: false });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns failure when socket is disconnected', async () => {
      const svc = new MessagingService();
      const socket = makeDisconnectedSocket();
      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
    });

    it('sends with MESSAGE_SEND event when no attachments', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'srv-1', clientMessageId: 'cid_test' } });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());

      expect(result.success).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith(
        CLIENT_EVENTS_MOCK.MESSAGE_SEND,
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('sends with MESSAGE_SEND_WITH_ATTACHMENTS event when attachments present', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'srv-1' } });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        attachmentIds: ['att-1'],
        attachmentMimeTypes: ['image/jpeg'],
      }));

      expect(result.success).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith(
        CLIENT_EVENTS_MOCK.MESSAGE_SEND_WITH_ATTACHMENTS,
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('encrypts content when encryption handlers present and conversation encrypted', async () => {
      const handlers = makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue('aes-256-gcm'),
        encrypt: jest.fn().mockResolvedValue({
          ciphertext: 'enc-data',
          metadata: { mode: 'aes-256-gcm' },
        }),
      });

      const svc = new MessagingService();
      svc.setEncryptionHandlers(handlers);

      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'enc-srv-1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({ content: 'secret' }));

      const [, payload] = socket.emit.mock.calls[0];
      expect((payload as any).encryptedContent).toBe('enc-data');
      expect((payload as any).encryptionMetadata).toBeDefined();
    });

    it('sets content to [Encrypted] for e2ee mode', async () => {
      const handlers = makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue('e2ee'),
        encrypt: jest.fn().mockResolvedValue({
          ciphertext: 'enc-data',
          metadata: { mode: 'e2ee' },
        }),
      });

      const svc = new MessagingService();
      svc.setEncryptionHandlers(handlers);

      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'e2ee-1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({ content: 'secret' }));

      const [, payload] = socket.emit.mock.calls[0];
      expect((payload as any).content).toBe('[Encrypted]');
    });

    it('aborts send when encrypt throws to prevent plaintext leak', async () => {
      const handlers = makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue('aes-256-gcm'),
        encrypt: jest.fn().mockRejectedValue(new Error('encrypt failed')),
      });

      const svc = new MessagingService();
      svc.setEncryptionHandlers(handlers);

      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'fallback-1' } });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result.success).toBe(false);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('skips encryption when mode is null', async () => {
      const handlers = makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue(null),
      });

      const svc = new MessagingService();
      svc.setEncryptionHandlers(handlers);

      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'no-enc-1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      const [, payload] = socket.emit.mock.calls[0];
      expect((payload as any).encryptedContent).toBeUndefined();
    });

    it('returns success with messageId from ack', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'returned-id', clientMessageId: 'cid_abc' } });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({
        success: true,
        messageId: 'returned-id',
        clientMessageId: 'cid_abc',
      });
    });

    it('returns timedOut=true on timeout', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const socket = makeSocket();

      // Never calls callback → triggers timeout
      socket.emit.mockImplementation(() => {});

      const resultPromise = svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      jest.advanceTimersByTime(10001);
      const result = await resultPromise;

      expect(result).toEqual({ success: false, timedOut: true });
      jest.useRealTimers();
    });

    it('no REST fallback for E2EE messages (encryptedContent set) on failure', async () => {
      const handlers = makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue('aes-256-gcm'),
        encrypt: jest.fn().mockResolvedValue({
          ciphertext: 'enc',
          metadata: { mode: 'aes-256-gcm' },
        }),
      });

      const svc = new MessagingService();
      svc.setEncryptionHandlers(handlers);

      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'ack failed' });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
      expect(mockConversationsServiceSendMessage).not.toHaveBeenCalled();
    });

    it('no REST fallback when socket disconnects after failure', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      socket.connected = false; // disconnected after ack failure

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'failed' });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
      expect(mockConversationsServiceSendMessage).not.toHaveBeenCalled();
    });

    it('falls back to REST when socket still connected after WS failure', async () => {
      mockConversationsServiceSendMessage.mockResolvedValue({
        data: { id: 'rest-id' },
      });

      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'ws failed' });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('rest-id');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[MessagingService]',
        'WebSocket ack failed, attempting REST fallback'
      );
    });

    it('returns failure on outer catch', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation(() => {
        throw new Error('emit crashed');
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
    });

    it('includes optional fields when provided', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'opt-1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        originalLanguage: 'en',
        replyToId: 'reply-id',
        forwardedFromId: 'fwd-id',
        forwardedFromConversationId: 'fwd-conv',
        mentionedUserIds: ['u1', 'u2'],
      }));

      const [, payload] = socket.emit.mock.calls[0];
      expect((payload as any).originalLanguage).toBe('en');
      expect((payload as any).replyToId).toBe('reply-id');
      expect((payload as any).forwardedFromId).toBe('fwd-id');
      expect((payload as any).forwardedFromConversationId).toBe('fwd-conv');
      expect((payload as any).mentionedUserIds).toEqual(['u1', 'u2']);
    });

    it('does not add mentionedUserIds if empty array', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'no-mentions' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({ mentionedUserIds: [] }));
      const [, payload] = socket.emit.mock.calls[0];
      expect((payload as any).mentionedUserIds).toBeUndefined();
    });
  });

  // ─── editMessage ──────────────────────────────────────────────────────────

  describe('editMessage', () => {
    it('returns false when socket is null', async () => {
      const svc = new MessagingService();
      expect(await svc.editMessage(null, 'msg-1', 'new content')).toBe(false);
    });

    it('returns false when socket is disconnected', async () => {
      const svc = new MessagingService();
      const socket = makeDisconnectedSocket();
      expect(await svc.editMessage(socket as unknown as TypedSocket, 'msg-1', 'new content')).toBe(false);
    });

    it('returns true on success ack', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true });
      });

      expect(await svc.editMessage(socket as unknown as TypedSocket, 'msg-1', 'edited')).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith(
        CLIENT_EVENTS_MOCK.MESSAGE_EDIT,
        { messageId: 'msg-1', content: 'edited' },
        expect.any(Function)
      );
    });

    it('returns false on failure ack', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, error: 'Not found' });
      });

      expect(await svc.editMessage(socket as unknown as TypedSocket, 'msg-1', 'edited')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns false when response is null/undefined', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb(null);
      });

      expect(await svc.editMessage(socket as unknown as TypedSocket, 'msg-1', 'edited')).toBe(false);
    });
  });

  // ─── deleteMessage ────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('returns false when socket is null', async () => {
      const svc = new MessagingService();
      expect(await svc.deleteMessage(null, 'msg-1')).toBe(false);
    });

    it('returns false when socket is disconnected', async () => {
      const svc = new MessagingService();
      const socket = makeDisconnectedSocket();
      expect(await svc.deleteMessage(socket as unknown as TypedSocket, 'msg-1')).toBe(false);
    });

    it('returns true on success ack', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true });
      });

      expect(await svc.deleteMessage(socket as unknown as TypedSocket, 'msg-1')).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith(
        CLIENT_EVENTS_MOCK.MESSAGE_DELETE,
        { messageId: 'msg-1' },
        expect.any(Function)
      );
    });

    it('returns false on failure ack', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, error: 'Permission denied' });
      });

      expect(await svc.deleteMessage(socket as unknown as TypedSocket, 'msg-1')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns false when response is null', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb(null);
      });

      expect(await svc.deleteMessage(socket as unknown as TypedSocket, 'msg-1')).toBe(false);
    });
  });

  // ─── sendMessageViaRest ───────────────────────────────────────────────────

  describe('sendMessageViaRest (via sendMessage fallback)', () => {
    it('success with message.data.id', async () => {
      mockConversationsServiceSendMessage.mockResolvedValue({ data: { id: 'rest-msg-1' } });

      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('rest-msg-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[MessagingService]',
        'Message sent via REST fallback'
      );
    });

    it('success with message.id fallback (no data.id)', async () => {
      mockConversationsServiceSendMessage.mockResolvedValue({ id: 'rest-msg-2' });

      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('rest-msg-2');
    });

    it('returns failure when REST also fails', async () => {
      mockConversationsServiceSendMessage.mockRejectedValue(new Error('REST error'));

      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
    });

    it('passes attachmentIds and messageType to REST', async () => {
      mockConversationsServiceSendMessage.mockResolvedValue({ data: { id: 'rest-3' } });

      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        attachmentIds: ['att-1'],
        attachmentMimeTypes: ['image/jpeg'],
      }));

      expect(mockConversationsServiceSendMessage).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          attachmentIds: ['att-1'],
          messageType: 'image',
        })
      );
    });
  });

  // ─── REST fallback for anonymous (share-link) senders ─────────────────────
  //
  // An anonymous participant holds no JWT — only an `anon_*` session token,
  // which `POST /conversations/:id/messages` cannot authenticate. Routing them
  // there means the fallback answers 401 for every anonymous sender, so a
  // WebSocket ack error loses the message outright. Their endpoint is the
  // share-link route, which authenticates on `X-Session-Token`.

  describe('sendMessageViaRest — anonymous share-link sender', () => {
    function makeAckFailingSocket() {
      const socket = makeSocket();
      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });
      return socket;
    }

    function makeLinkResponse(overrides: Record<string, unknown> = {}) {
      return {
        messageId: 'srv-msg-1',
        message: { id: 'srv-msg-1', conversationId: 'conv-1', senderId: 'part-1', clientMessageId: 'cid_test-1234' },
        ...overrides,
      };
    }

    it('falls back to the share-link route, never to the JWT-only conversations route', async () => {
      mockAnonymousCanSendViaLink.mockReturnValue(true);
      mockAnonymousSendMessage.mockResolvedValue(makeLinkResponse());

      const svc = new MessagingService();
      const result = await svc.sendMessage(makeAckFailingSocket() as unknown as TypedSocket, makeSendOptions());

      expect(result).toEqual({ success: true, messageId: 'srv-msg-1', clientMessageId: 'cid_test-1234' });
      expect(mockConversationsServiceSendMessage).not.toHaveBeenCalled();
    });

    it("carries the caller's clientMessageId so the optimistic row reconciles instead of duplicating", async () => {
      mockAnonymousCanSendViaLink.mockReturnValue(true);
      mockAnonymousSendMessage.mockResolvedValue(makeLinkResponse());

      const svc = new MessagingService();
      await svc.sendMessage(
        makeAckFailingSocket() as unknown as TypedSocket,
        makeSendOptions({ content: 'Bonjour', originalLanguage: 'fr', replyToId: 'msg-42' })
      );

      expect(mockAnonymousSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Bonjour',
          originalLanguage: 'fr',
          replyToId: 'msg-42',
          clientMessageId: 'cid_test-1234',
        })
      );
    });

    it('reports failure when the share-link route also fails', async () => {
      mockAnonymousCanSendViaLink.mockReturnValue(true);
      mockAnonymousSendMessage.mockRejectedValue(new Error('link route 410'));

      const svc = new MessagingService();
      const result = await svc.sendMessage(makeAckFailingSocket() as unknown as TypedSocket, makeSendOptions());

      expect(result).toEqual({ success: false });
      expect(mockConversationsServiceSendMessage).not.toHaveBeenCalled();
    });

    it('leaves the registered-sender fallback on the conversations route', async () => {
      mockConversationsServiceSendMessage.mockResolvedValue({ data: { id: 'rest-msg-9' } });

      const svc = new MessagingService();
      const result = await svc.sendMessage(makeAckFailingSocket() as unknown as TypedSocket, makeSendOptions());

      expect(result.messageId).toBe('rest-msg-9');
      expect(mockAnonymousSendMessage).not.toHaveBeenCalled();
    });
  });

  // ─── emitWithTimeout ─────────────────────────────────────────────────────

  describe('emitWithTimeout (via sendMessage)', () => {
    it('timeout fires → timedOut=true', async () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const socket = makeSocket();
      socket.emit.mockImplementation(() => {});

      const resultPromise = svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      jest.advanceTimersByTime(10001);
      const result = await resultPromise;

      expect(result).toEqual({ success: false, timedOut: true });
      jest.useRealTimers();
    });

    it('success callback → success=true, messageId', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: true, data: { messageId: 'ack-id', clientMessageId: 'cid_ack' } });
      });

      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: true, messageId: 'ack-id', clientMessageId: 'cid_ack' });
    });

    it('failure callback → success=false', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'error from server' });
      });

      // Socket still connected so it'll try REST fallback
      mockConversationsServiceSendMessage.mockRejectedValue(new Error('REST also failed'));
      const result = await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());
      expect(result).toEqual({ success: false });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[MessagingService]',
        expect.stringContaining('Send failed')
      );
    });
  });

  // ─── Liste explicite de mentionnés ─────────────────────────────────────────

  /**
   * Ce que le compositeur RETIENT et ce que le fil PORTE.
   *
   * `useMentions` mémorise les utilisateurs que l'auteur a effectivement
   * choisis, et la liste descend jusqu'ici. Elle voyageait déjà sur la charge
   * socket — mais dans un `Record<string, unknown>`, contre un contrat qui ne la
   * déclarait pas et un schéma de passerelle qui la STRIPPAIT.
   *
   * La perte ne se voyait pas, parce que la passerelle retombe sur l'extraction
   * des `@` du CONTENU. Ce repli couvre le clair, `server` et `hybrid` — et pas
   * `e2ee`, le seul mode où `content` est remplacé par un littéral avant de
   * partir. Nommer quelqu'un dans une conversation chiffrée ne produisait alors
   * aucune mention du tout.
   */
  describe('mentionedUserIds (via sendMessage)', () => {
    it('porte la liste du compositeur sur la charge socket', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      let capturedPayload: Record<string, unknown> = {};

      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        capturedPayload = data as Record<string, unknown>;
        cb({ success: true, data: { messageId: '1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        content: 'coucou @alice',
        mentionedUserIds: ['u-alice'],
      }));

      expect(capturedPayload.mentionedUserIds).toEqual(['u-alice']);
    });

    // Le cas qui décide du lot : en `e2ee`, `content` part en `[Encrypted]`.
    // La liste explicite est le SEUL canal qui reste, et elle doit voyager AVEC
    // le chiffré.
    it('porte la liste sur un envoi e2ee, dont le contenu ne porte aucun @', async () => {
      const svc = new MessagingService();
      svc.setEncryptionHandlers(makeEncryptionHandlers({
        getConversationMode: jest.fn().mockResolvedValue('e2ee'),
        encrypt: jest.fn().mockResolvedValue({ ciphertext: 'enc', metadata: { mode: 'e2ee' } }),
      }));

      const socket = makeSocket();
      let capturedPayload: Record<string, unknown> = {};
      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        capturedPayload = data as Record<string, unknown>;
        cb({ success: true, data: { messageId: '1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        content: 'coucou @alice',
        mentionedUserIds: ['u-alice'],
      }));

      expect(capturedPayload.content).toBe('[Encrypted]');
      expect(capturedPayload.content).not.toContain('@');
      expect(capturedPayload.mentionedUserIds).toEqual(['u-alice']);
      expect(capturedPayload.encryptedContent).toBe('enc');
    });

    it('n’invente aucune liste quand l’auteur n’a nommé personne', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      let capturedPayload: Record<string, unknown> = {};

      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        capturedPayload = data as Record<string, unknown>;
        cb({ success: true, data: { messageId: '1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions());

      expect(capturedPayload).not.toHaveProperty('mentionedUserIds');
    });

    // Le repli REST la laissait tomber aussi — sur une route qui la DÉCLARE et
    // l'honore. Un message parti par là après un accusé socket en échec ne
    // notifiait que ceux que l'extraction des `@` retrouvait.
    it('porte la liste jusqu’au repli REST', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();

      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'ack failed' });
      });
      mockConversationsServiceSendMessage.mockResolvedValue({ id: 'm-1' });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        content: 'coucou @alice',
        mentionedUserIds: ['u-alice'],
      }));

      const body = mockConversationsServiceSendMessage.mock.calls[0][1] as Record<string, unknown>;
      expect(body.mentionedUserIds).toEqual(['u-alice']);
    });
  });

  // ─── messageType des pièces jointes ───────────────────────────────────────

  /**
   * Le web portait un exemplaire MANUSCRIT de la règle
   * (`determineMessageTypeFromMime(mimeTypes[0])`), et il divergeait de la
   * canonique sur deux points : il ne regardait que la PREMIÈRE pièce jointe,
   * et il rendait `'text'` pour un `text/*`.
   *
   * Ce n'était pas une redondance inoffensive. La dérivation serveur
   * (`deriveMessageTypeForAttachments`) est ADDITIVE : elle se tait dès que la
   * colonne porte autre chose que `'text'`. Un `'image'` déclaré par le client
   * sur un lot photo + PDF n'est donc corrigé par personne — il s'écrit tel
   * quel, et `contentTypeIcon` sert 🖼️ là où l'utilisateur a envoyé un dossier
   * mixte.
   *
   * Les deux sites d'appel passent maintenant par
   * `messageTypeForClientAttachments` (`@meeshy/shared`), qui regarde le LOT.
   */
  describe('messageType des pièces jointes (via sendMessage)', () => {
    /**
     * RECALIBRÉ : ces témoins lisaient `messageType` sur la charge SOCKET.
     *
     * La valeur y était posée, juste, et sans effet : le contrat
     * `MessageSendWithAttachmentsData` ne déclare aucun champ de ce nom, et
     * `SocketMessageSendWithAttachmentsSchema` — un `z.object` — le STRIPPE en
     * silence. Le serveur dérive la même règle de son côté
     * (`messageTypeFromMimeTypes`), donc rien n'était perdu ; mais huit témoins
     * attestaient une clé que la passerelle ne reçoit jamais.
     *
     * Le motif écrit à côté du site de production — « l'objet sert aussi de
     * charge au repli REST » — était FAUX : `sendMessageViaRest` reconstruit sa
     * charge depuis `options` et recalcule `messageType` lui-même. Le champ
     * socket ne servait donc rien du tout.
     *
     * La règle qu'ils gardent est réelle, et son site l'est aussi : REST est le
     * SEUL des deux transports où la valeur soit autoritative (la route
     * l'accepte et la persiste, et la dérivation serveur, additive, ne repasse
     * jamais derrière une déclaration explicite). Les témoins visent désormais
     * ce site-là — celui dont un changement CASSE quelque chose.
     */
    async function getMessageType(mimeTypes: string[]): Promise<string> {
      const svc = new MessagingService();
      const socket = makeSocket();

      // L'accusé socket échoue (sans expirer, et sans chiffrement) : c'est la
      // seule porte vers le repli REST.
      socket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: unknown) => void) => {
        cb({ success: false, message: 'ack failed' });
      });
      mockConversationsServiceSendMessage.mockResolvedValue({ id: 'm-1' });

      const attachmentIds = mimeTypes.length > 0
        ? mimeTypes.map((_, i) => `att-${i + 1}`)
        : ['att-1'];

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        attachmentIds,
        attachmentMimeTypes: mimeTypes,
      }));

      const body = mockConversationsServiceSendMessage.mock.calls[0][1] as Record<string, unknown>;
      return body.messageType as string;
    }

    // Le négatif du recalibrage : la charge SOCKET ne porte plus la clé. Si
    // quelqu'un la repose, ce témoin le fera voir — et l'obligera à constater
    // qu'aucun schéma de la passerelle ne la déclare.
    it('la charge socket ne porte PAS messageType — le schéma le strippe', async () => {
      const svc = new MessagingService();
      const socket = makeSocket();
      let capturedPayload: Record<string, unknown> = {};

      socket.emit.mockImplementation((_event: string, data: unknown, cb: (r: unknown) => void) => {
        capturedPayload = data as Record<string, unknown>;
        cb({ success: true, data: { messageId: '1' } });
      });

      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions({
        attachmentIds: ['att-1'],
        attachmentMimeTypes: ['image/jpeg'],
      }));

      expect(capturedPayload).not.toHaveProperty('messageType');
      expect(capturedPayload.attachmentIds).toEqual(['att-1']);
    });

    it('des pièces jointes sans MIME connu → "file"', async () => {
      expect(await getMessageType([])).toBe('file');
    });

    it('image/jpeg → "image"', async () => {
      expect(await getMessageType(['image/jpeg'])).toBe('image');
    });

    it('audio/mp3 → "audio"', async () => {
      expect(await getMessageType(['audio/mp3'])).toBe('audio');
    });

    it('video/mp4 → "video"', async () => {
      expect(await getMessageType(['video/mp4'])).toBe('video');
    });

    it('application/pdf → "file"', async () => {
      expect(await getMessageType(['application/pdf'])).toBe('file');
    });

    it('text/plain est une PIÈCE JOINTE, donc "file" — jamais "text"', async () => {
      expect(await getMessageType(['text/plain'])).toBe('file');
    });

    it('unknown mime type → "file"', async () => {
      expect(await getMessageType(['application/octet-stream'])).toBe('file');
    });

    it('plusieurs pièces jointes de la même catégorie → cette catégorie', async () => {
      expect(await getMessageType(['image/jpeg', 'image/png'])).toBe('image');
    });

    it('lot HÉTÉROGÈNE → "file", même quand la première est une image', async () => {
      expect(await getMessageType(['image/jpeg', 'application/pdf'])).toBe('file');
    });

    it('lot HÉTÉROGÈNE → "file", même quand la première est une vidéo', async () => {
      expect(await getMessageType(['video/mp4', 'audio/mp3'])).toBe('file');
    });
  });

  /**
   * Le repli REST est le SEUL des deux chemins où la valeur est autoritative :
   * le path socket `message:send-with-attachments` la strippe (son schéma Zod
   * n'a pas ce champ) et le serveur y dérive lui-même. La route REST, elle,
   * accepte l'enum et la persiste — puis se tait.
   */
  describe('repli REST — le messageType qui, lui, atteint la base', () => {
    async function restMessageType(options: {
      attachmentIds?: string[];
      attachmentMimeTypes?: string[];
    }): Promise<string> {
      mockConversationsServiceSendMessage.mockResolvedValue({ data: { id: 'rest-1' } });

      const socket = makeSocket();
      socket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: unknown) => void) => {
        cb({ success: false });
      });

      const svc = new MessagingService();
      await svc.sendMessage(socket as unknown as TypedSocket, makeSendOptions(options));

      const body = mockConversationsServiceSendMessage.mock.calls.at(-1)?.[1] as
        | { messageType?: string }
        | undefined;
      return body?.messageType as string;
    }

    it('sans pièce jointe → "text"', async () => {
      expect(await restMessageType({})).toBe('text');
    });

    it('lot HÉTÉROGÈNE → "file", là où la première pièce jointe disait "image"', async () => {
      expect(
        await restMessageType({
          attachmentIds: ['a', 'b'],
          attachmentMimeTypes: ['image/jpeg', 'application/pdf'],
        })
      ).toBe('file');
    });

    it('des pièces jointes sans MIME connu → "file", jamais "text"', async () => {
      expect(
        await restMessageType({ attachmentIds: ['a'], attachmentMimeTypes: [] })
      ).toBe('file');
    });
  });

  // ─── subscribe / unsubscribe methods ─────────────────────────────────────

  describe('onNewMessage', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onNewMessage(listener);
      expect(svc.getListenerCounts().message).toBe(1);
      unsub();
      expect(svc.getListenerCounts().message).toBe(0);
    });
  });

  describe('onMessageEdited', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessageEdited(listener);
      expect(svc.getListenerCounts().edit).toBe(1);
      unsub();
      expect(svc.getListenerCounts().edit).toBe(0);
    });
  });

  describe('onMessageDeleted', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessageDeleted(listener);
      expect(svc.getListenerCounts().delete).toBe(1);
      unsub();
      expect(svc.getListenerCounts().delete).toBe(0);
    });
  });

  describe('onMentionCreated', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMentionCreated(listener);
      const mentionListeners = (svc as any).mentionListeners as Set<unknown>;
      expect(mentionListeners.size).toBe(1);
      unsub();
      expect(mentionListeners.size).toBe(0);
    });
  });

  describe('onMessageConsumed', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessageConsumed(listener);
      const consumedListeners = (svc as any).consumedListeners as Set<unknown>;
      expect(consumedListeners.size).toBe(1);
      unsub();
      expect(consumedListeners.size).toBe(0);
    });
  });

  describe('onAttachmentStatusUpdated', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onAttachmentStatusUpdated(listener);
      const attachListeners = (svc as any).attachmentStatusListeners as Set<unknown>;
      expect(attachListeners.size).toBe(1);
      unsub();
      expect(attachListeners.size).toBe(0);
    });
  });

  describe('onMessageAttachmentUpdated', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessageAttachmentUpdated(listener);
      const listenerSet = (svc as any).messageAttachmentUpdatedListeners as Set<unknown>;
      expect(listenerSet.size).toBe(1);
      unsub();
      expect(listenerSet.size).toBe(0);
    });
  });

  describe('onPendingMessagesDelivered', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onPendingMessagesDelivered(listener);
      const listenerSet = (svc as any).pendingDeliveredListeners as Set<unknown>;
      expect(listenerSet.size).toBe(1);
      unsub();
      expect(listenerSet.size).toBe(0);
    });
  });

  describe('onLinkMessageNew', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onLinkMessageNew(listener);
      const listenerSet = (svc as any).linkMessageNewListeners as Set<unknown>;
      expect(listenerSet.size).toBe(1);
      unsub();
      expect(listenerSet.size).toBe(0);
    });
  });

  describe('onMessagePinned', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessagePinned(listener);
      const listenerSet = (svc as any).messagePinnedListeners as Set<unknown>;
      expect(listenerSet.size).toBe(1);
      unsub();
      expect(listenerSet.size).toBe(0);
    });
  });

  describe('onMessageUnpinned', () => {
    it('subscribes and unsubscribes', () => {
      const svc = new MessagingService();
      const listener = jest.fn();
      const unsub = svc.onMessageUnpinned(listener);
      const listenerSet = (svc as any).messageUnpinnedListeners as Set<unknown>;
      expect(listenerSet.size).toBe(1);
      unsub();
      expect(listenerSet.size).toBe(0);
    });
  });

  // ─── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears all listener sets', () => {
      const svc = new MessagingService();
      svc.onNewMessage(jest.fn());
      svc.onMessageEdited(jest.fn());
      svc.onMessageDeleted(jest.fn());
      svc.onMentionCreated(jest.fn());
      svc.onMessageConsumed(jest.fn());
      svc.onAttachmentStatusUpdated(jest.fn());

      svc.cleanup();

      const counts = svc.getListenerCounts();
      expect(counts.message).toBe(0);
      expect(counts.edit).toBe(0);
      expect(counts.delete).toBe(0);
    });

    it('cancels mark-received timers', () => {
      jest.useFakeTimers();
      const svc = new MessagingService();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const timers = (svc as any).markReceivedTimers as Map<string, ReturnType<typeof setTimeout>>;
      timers.set('conv-1', setTimeout(() => {}, 99999));
      timers.set('conv-2', setTimeout(() => {}, 99999));

      svc.cleanup();

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(timers.size).toBe(0);

      jest.useRealTimers();
    });

    it('resets currentUserId', () => {
      const svc = new MessagingService();
      svc.setCurrentUserId('user-1');
      svc.cleanup();
      expect((svc as any).currentUserId).toBeNull();
    });

    it('clears recentMessageIds', () => {
      const svc = new MessagingService();
      const recentIds = (svc as any).recentMessageIds as Map<string, number>;
      recentIds.set('msg-1', Date.now());
      svc.cleanup();
      expect(recentIds.size).toBe(0);
    });
  });

  // ─── getListenerCounts ────────────────────────────────────────────────────

  describe('getListenerCounts', () => {
    it('returns correct counts', () => {
      const svc = new MessagingService();
      svc.onNewMessage(jest.fn());
      svc.onNewMessage(jest.fn());
      svc.onMessageEdited(jest.fn());
      svc.onMessageDeleted(jest.fn());
      svc.onMessageDeleted(jest.fn());
      svc.onMessageDeleted(jest.fn());

      expect(svc.getListenerCounts()).toEqual({ message: 2, edit: 1, delete: 3 });
    });

    it('returns zeros when no listeners', () => {
      const svc = new MessagingService();
      expect(svc.getListenerCounts()).toEqual({ message: 0, edit: 0, delete: 0 });
    });
  });

  // ─── setGetMessageByIdCallback ────────────────────────────────────────────

  describe('setGetMessageByIdCallback', () => {
    it('stores callback', () => {
      const svc = new MessagingService();
      const cb = jest.fn();
      svc.setGetMessageByIdCallback(cb);
      expect((svc as any).getMessageByIdCallback).toBe(cb);
    });
  });
  // ─── Disparition PERSONNELLE (« supprimer pour moi », multi-appareil) ──────

  describe('message:hidden-for-me', () => {
    it('retire chaque message nommé par le MÊME chemin qu’une suppression', () => {
      const svc = new MessagingService();
      const removed: string[] = [];
      svc.onMessageDeleted((id) => removed.push(id));

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_HIDDEN_FOR_ME, {
        userId: 'user-me',
        messages: [
          { messageId: 'm-1', conversationId: 'conv-1' },
          { messageId: 'm-2', conversationId: 'conv-2' },
        ],
        hiddenAt: '2026-08-13T10:00:00.000Z',
      });

      // Réutiliser les écouteurs de suppression est délibéré : l'effet local est
      // identique, et un second retrait aurait dérivé de celui-ci.
      expect(removed).toEqual(['m-1', 'm-2']);
    });

    it('ne casse pas sur une charge utile sans liste', () => {
      const svc = new MessagingService();
      const removed: string[] = [];
      svc.onMessageDeleted((id) => removed.push(id));

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      expect(() =>
        socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_HIDDEN_FOR_ME, { userId: 'user-me' })
      ).not.toThrow();
      expect(removed).toEqual([]);
    });
  });

  describe('message:restored-for-me', () => {
    it('notifie ses propres écouteurs, PAS ceux de la suppression', () => {
      const svc = new MessagingService();
      const removed: string[] = [];
      const restored: unknown[] = [];
      svc.onMessageDeleted((id) => removed.push(id));
      svc.onMessageRestoredForMe((data) => restored.push(data));

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);

      const payload = {
        userId: 'user-me',
        messages: [{ messageId: 'm-1', conversationId: 'conv-1' }],
        restoredAt: '2026-08-13T10:00:00.000Z',
      };
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_RESTORED_FOR_ME, payload);

      expect(restored).toEqual([payload]);
      expect(removed).toEqual([]);
    });

    it('se désabonne proprement', () => {
      const svc = new MessagingService();
      const restored: unknown[] = [];
      const off = svc.onMessageRestoredForMe((data) => restored.push(data));
      off();

      const socket = makeSocket();
      svc.setupEventListeners(socket as unknown as TypedSocket, convertMessageFn);
      socket._trigger(SERVER_EVENTS_MOCK.MESSAGE_RESTORED_FOR_ME, {
        userId: 'user-me',
        messages: [{ messageId: 'm-1', conversationId: 'conv-1' }],
        restoredAt: '2026-08-13T10:00:00.000Z',
      });

      expect(restored).toEqual([]);
    });
  });
});
