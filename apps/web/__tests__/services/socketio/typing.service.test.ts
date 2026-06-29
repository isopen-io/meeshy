/**
 * Unit tests for TypingService.
 * Covers socket event handling, typing indicators, throttle, and cleanup.
 */

const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
  },
  CLIENT_EVENTS: {
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
  },
}));

import { TypingService } from '@/services/socketio/typing.service';

function makeSocket(connected = true) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    connected,
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return { conversationId: 'conv-1', userId: 'user-1', ...overrides };
}

describe('TypingService', () => {
  let service: TypingService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new TypingService();
    mockLoggerWarn.mockClear();
    mockLoggerDebug.mockClear();
  });

  afterEach(() => {
    service.cleanup();
    jest.useRealTimers();
  });

  // ─── setupEventListeners ────────────────────────────────────────────────────

  describe('setupEventListeners', () => {
    it('registers typing:start and typing:stop handlers on the socket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      expect(socket.on).toHaveBeenCalledWith('typing:start', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('typing:stop', expect.any(Function));
    });

    it('notifies listeners when typing:start event fires', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTyping(listener);
      socket._trigger('typing:start', makeEvent());
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isTyping: true }));
    });

    it('notifies listeners with isTyping:false after typing:stop fires', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTyping(listener);
      socket._trigger('typing:start', makeEvent());
      socket._trigger('typing:stop', makeEvent());
      jest.advanceTimersByTime(3000);
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ isTyping: false }));
    });
  });

  // ─── typing start / stop state ──────────────────────────────────────────────

  describe('typing start state', () => {
    it('adds user to typingUsers for the conversation', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
    });

    it('auto-clears user after 15 seconds safety timeout', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
      jest.advanceTimersByTime(15000);
      expect(service.getTypingUsers('conv-1')).not.toContain('user-1');
    });

    it('replaces existing safety timeout when user types again', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      jest.advanceTimersByTime(10000);
      socket._trigger('typing:start', makeEvent()); // reset timeout
      jest.advanceTimersByTime(10000); // only 10s into the new 15s window
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
      jest.advanceTimersByTime(5001);
      expect(service.getTypingUsers('conv-1')).not.toContain('user-1');
    });

    it('tracks multiple users independently within the same conversation', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent({ userId: 'user-1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'user-2' }));
      expect(service.getTypingUsers('conv-1')).toEqual(expect.arrayContaining(['user-1', 'user-2']));
    });

    it('removes the conversation entry when the last user stops typing', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      socket._trigger('typing:stop', makeEvent());
      jest.advanceTimersByTime(3000);
      expect(service.getTypingUsers('conv-1')).toHaveLength(0);
    });
  });

  // ─── typing stop delay ──────────────────────────────────────────────────────

  describe('typing stop delay', () => {
    it('keeps indicator visible for 3s after stop', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTyping(listener);
      socket._trigger('typing:start', makeEvent());
      socket._trigger('typing:stop', makeEvent());
      jest.advanceTimersByTime(2999);
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
    });

    it('hides indicator exactly at 3s', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      socket._trigger('typing:stop', makeEvent());
      jest.advanceTimersByTime(3000);
      expect(service.getTypingUsers('conv-1')).not.toContain('user-1');
    });

    it('replaces previous delay when stop fires twice', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());
      socket._trigger('typing:stop', makeEvent());
      jest.advanceTimersByTime(1000);
      socket._trigger('typing:stop', makeEvent()); // reset delay
      jest.advanceTimersByTime(2000); // 3s from FIRST stop, only 2s from second
      expect(service.getTypingUsers('conv-1')).toContain('user-1');
      jest.advanceTimersByTime(1001);
      expect(service.getTypingUsers('conv-1')).not.toContain('user-1');
    });
  });

  // ─── startTyping ────────────────────────────────────────────────────────────

  describe('startTyping', () => {
    it('emits typing:start when socket is connected', () => {
      const socket = makeSocket(true);
      service.startTyping(socket as any, 'conv-1');
      expect(socket.emit).toHaveBeenCalledWith('typing:start', { conversationId: 'conv-1' });
    });

    it('does nothing when socket is null', () => {
      expect(() => service.startTyping(null, 'conv-1')).not.toThrow();
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('does nothing when socket is not connected', () => {
      const socket = makeSocket(false);
      service.startTyping(socket as any, 'conv-1');
      expect(socket.emit).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('throttles emits within TYPING_EMIT_THROTTLE_MS', () => {
      const socket = makeSocket(true);
      service.startTyping(socket as any, 'conv-1');
      service.startTyping(socket as any, 'conv-1'); // immediate re-call — throttled
      expect(socket.emit).toHaveBeenCalledTimes(1);
    });

    it('allows emit after throttle window expires', () => {
      const socket = makeSocket(true);
      service.startTyping(socket as any, 'conv-1');
      jest.advanceTimersByTime(2001);
      service.startTyping(socket as any, 'conv-1');
      expect(socket.emit).toHaveBeenCalledTimes(2);
    });

    it('throttles independently per conversationId', () => {
      const socket = makeSocket(true);
      service.startTyping(socket as any, 'conv-1');
      service.startTyping(socket as any, 'conv-2'); // different conversation, not throttled
      expect(socket.emit).toHaveBeenCalledTimes(2);
    });
  });

  // ─── stopTyping ─────────────────────────────────────────────────────────────

  describe('stopTyping', () => {
    it('emits typing:stop when socket is connected', () => {
      const socket = makeSocket(true);
      service.stopTyping(socket as any, 'conv-1');
      expect(socket.emit).toHaveBeenCalledWith('typing:stop', { conversationId: 'conv-1' });
    });

    it('does nothing when socket is null', () => {
      expect(() => service.stopTyping(null, 'conv-1')).not.toThrow();
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('does nothing when socket is not connected', () => {
      const socket = makeSocket(false);
      service.stopTyping(socket as any, 'conv-1');
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('clears the lastStartEmitAt throttle so next startTyping emits immediately', () => {
      const socket = makeSocket(true);
      service.startTyping(socket as any, 'conv-1');
      service.stopTyping(socket as any, 'conv-1');
      service.startTyping(socket as any, 'conv-1'); // throttle cleared — should emit
      expect(socket.emit).toHaveBeenCalledTimes(3);
    });
  });

  // ─── getTypingUsers ──────────────────────────────────────────────────────────

  describe('getTypingUsers', () => {
    it('returns empty array for unknown conversation', () => {
      expect(service.getTypingUsers('unknown')).toEqual([]);
    });

    it('returns current typing users as an array', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent({ userId: 'u1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'u2' }));
      const users = service.getTypingUsers('conv-1');
      expect(users).toHaveLength(2);
      expect(users).toEqual(expect.arrayContaining(['u1', 'u2']));
    });
  });

  // ─── listener registration ──────────────────────────────────────────────────

  describe('onTyping / onTypingStart / onTypingStop', () => {
    it('onTyping returns an unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.onTyping(listener);
      expect(service.getListenerCount()).toBe(1);
      unsub();
      expect(service.getListenerCount()).toBe(0);
    });

    it('onTypingStart and onTypingStop are aliases for onTyping', () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      service.onTypingStart(l1);
      service.onTypingStop(l2);
      expect(service.getListenerCount()).toBe(2);
    });
  });

  // ─── clearConversationTypingState ───────────────────────────────────────────

  describe('clearConversationTypingState', () => {
    it('removes typing users only for the specified conversation', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent({ userId: 'u1', conversationId: 'conv-1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'u2', conversationId: 'conv-2' }));

      service.clearConversationTypingState('conv-1');

      expect(service.getTypingUsers('conv-1')).toEqual([]);
      expect(service.getTypingUsers('conv-2')).toContain('u2');
    });

    it('notifies listeners with isTyping:false for each cleared user', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTyping(listener);
      socket._trigger('typing:start', makeEvent({ userId: 'u1', conversationId: 'conv-1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'u2', conversationId: 'conv-1' }));
      listener.mockClear();

      service.clearConversationTypingState('conv-1');

      const stoppedCalls = listener.mock.calls.filter(([e]) => e.isTyping === false);
      expect(stoppedCalls).toHaveLength(2);
      expect(stoppedCalls.map(([e]) => e.userId)).toEqual(expect.arrayContaining(['u1', 'u2']));
    });

    it('does not throw for unknown conversation', () => {
      expect(() => service.clearConversationTypingState('nonexistent')).not.toThrow();
    });

    it('cancels the safety timeout for users in the cleared conversation', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      socket._trigger('typing:start', makeEvent({ userId: 'u1', conversationId: 'conv-1' }));

      service.clearConversationTypingState('conv-1');

      service.onTyping(listener);
      jest.advanceTimersByTime(15000); // safety timeout would fire here
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── clearAllTypingState ────────────────────────────────────────────────────

  describe('clearAllTypingState', () => {
    it('immediately removes all typing users and notifies listeners with isTyping:false', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTyping(listener);
      socket._trigger('typing:start', makeEvent({ userId: 'user-1', conversationId: 'conv-1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'user-2', conversationId: 'conv-1' }));
      socket._trigger('typing:start', makeEvent({ userId: 'user-3', conversationId: 'conv-2' }));
      listener.mockClear();

      service.clearAllTypingState();

      // All conversations cleared
      expect(service.getTypingUsers('conv-1')).toEqual([]);
      expect(service.getTypingUsers('conv-2')).toEqual([]);
      // Listeners notified with isTyping: false for each cleared user
      const stoppedCalls = listener.mock.calls.filter(([e]) => e.isTyping === false);
      expect(stoppedCalls).toHaveLength(3);
    });

    it('cancels pending safety timeouts', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('typing:start', makeEvent());

      service.clearAllTypingState();

      // After clear, advancing time should NOT trigger additional listener calls
      const listener = jest.fn();
      service.onTyping(listener);
      jest.advanceTimersByTime(15000);
      expect(listener).not.toHaveBeenCalled();
    });

    it('preserves registered listeners after clearing state', () => {
      const listener = jest.fn();
      service.onTyping(listener);

      service.clearAllTypingState();

      expect(service.getListenerCount()).toBe(1);
    });

    it('does not throw when called with no active typing users', () => {
      expect(() => service.clearAllTypingState()).not.toThrow();
    });
  });

  // ─── cleanup ────────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears all listeners, timeouts and typing state', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      service.onTyping(jest.fn());
      socket._trigger('typing:start', makeEvent());
      service.cleanup();
      expect(service.getListenerCount()).toBe(0);
      expect(service.getTypingUsers('conv-1')).toEqual([]);
    });

    it('does not throw when called on a clean instance', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  // ─── getListenerCount ───────────────────────────────────────────────────────

  describe('getListenerCount', () => {
    it('starts at zero', () => {
      expect(service.getListenerCount()).toBe(0);
    });

    it('increments with each registered listener', () => {
      service.onTyping(jest.fn());
      service.onTyping(jest.fn());
      expect(service.getListenerCount()).toBe(2);
    });
  });
});
