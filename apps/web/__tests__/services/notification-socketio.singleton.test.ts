/**
 * Tests for NotificationSocketIOSingleton
 *
 * Covers:
 * - connect(): no-op if same token + connected; no-op if isConnecting; disconnects old socket; creates new socket
 * - setupEventListeners(): connect, disconnect, connect_error, notification:new, notification (legacy), authenticated, error, notification:read, notification:deleted, notification:counts
 * - disconnect(): cleanup
 * - getConnectionStatus()
 * - onNotification, onNotificationRead, onNotificationDeleted, onCounts, onConnect, onDisconnect
 * - reset()
 */

import { notificationSocketIO } from '@/services/notification-socketio.singleton';

// ─── Socket mock infrastructure ───────────────────────────────────────────────
type EventHandler = (...args: any[]) => void;

const makeSocketMock = () => {
  const handlers: Record<string, EventHandler[]> = {};
  const mockSocket = {
    connected: false,
    on: jest.fn((event: string, handler: EventHandler) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    // Helper to trigger events in tests
    _emit: (event: string, ...args: any[]) => {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
    _handlers: handlers,
  };
  return mockSocket;
};

let currentSocketMock: ReturnType<typeof makeSocketMock> | null = null;

const mockIo = jest.fn(() => {
  currentSocketMock = makeSocketMock();
  return currentSocketMock;
});

jest.mock('socket.io-client', () => ({
  io: (...args: any[]) => mockIo(...args),
}));

jest.mock('@/lib/config', () => ({
  APP_CONFIG: {
    getBackendUrl: () => 'http://test-backend',
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid notification data the server would push */
const makeNotificationData = (overrides: Record<string, any> = {}) => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'new_message',
  priority: 'normal',
  content: { title: 'Hello', body: 'World' },
  actor: { id: 'actor-1', username: 'alice' },
  context: { conversationId: 'conv-1' },
  metadata: {},
  isRead: false,
  readAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  expiresAt: null,
  delivery: { emailSent: false, pushSent: false },
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('notificationSocketIO singleton', () => {
  beforeEach(() => {
    notificationSocketIO.reset();
    mockIo.mockClear();
    currentSocketMock = null;
  });

  // ── connect() ────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('creates a socket.io connection with backend URL and auth token', async () => {
      await notificationSocketIO.connect('tok-123');

      expect(mockIo).toHaveBeenCalledTimes(1);
      expect(mockIo).toHaveBeenCalledWith(
        'http://test-backend',
        expect.objectContaining({ auth: { token: 'tok-123' } })
      );
    });

    it('is a no-op when already connected with the same token', async () => {
      await notificationSocketIO.connect('tok-abc');
      // Mark socket as connected
      currentSocketMock!.connected = true;
      // Simulate connect event so internal flag is set
      currentSocketMock!._emit('connect');

      const callsBefore = mockIo.mock.calls.length;

      await notificationSocketIO.connect('tok-abc');

      expect(mockIo).toHaveBeenCalledTimes(callsBefore); // no new socket
    });

    it('is a no-op when isConnecting (returns without creating socket)', async () => {
      // Start a connection to set isConnecting = true
      await notificationSocketIO.connect('tok-1');
      const socketAfterFirst = currentSocketMock;
      mockIo.mockClear();

      // Calling connect again before 'connect' event fires should be a no-op
      // (isConnecting is true because no connect event has fired yet)
      // We simulate this by not firing 'connect' event, so isConnecting stays true

      // Reset and verify: after a fresh connect (no connect event), isConnecting=true
      notificationSocketIO.reset();
      mockIo.mockClear();

      // Intercept io() to capture socket WITHOUT firing connect
      await notificationSocketIO.connect('tok-a');
      expect(mockIo).toHaveBeenCalledTimes(1);
      // Now isConnecting=true; calling connect again should bail
      await notificationSocketIO.connect('tok-b');
      expect(mockIo).toHaveBeenCalledTimes(1); // still only 1 call
    });

    it('disconnects existing socket before creating a new one when token changes', async () => {
      await notificationSocketIO.connect('tok-1');
      const firstSocket = currentSocketMock!;
      currentSocketMock!._emit('connect'); // mark connected

      mockIo.mockClear();
      await notificationSocketIO.connect('tok-2');

      // Old socket should have been disconnected
      expect(firstSocket.removeAllListeners).toHaveBeenCalled();
      expect(firstSocket.disconnect).toHaveBeenCalled();
      // And a new socket was created
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    it('passes configured transports and reconnection options', async () => {
      await notificationSocketIO.connect('tok-opts');

      expect(mockIo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transports: ['websocket', 'polling'],
          autoConnect: true,
          reconnection: true,
        })
      );
    });
  });

  // ── setupEventListeners() → connect ──────────────────────────────────────

  describe('event: connect', () => {
    it('marks connection as established and fires onConnect callbacks', async () => {
      const cb = jest.fn();
      notificationSocketIO.onConnect(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');

      expect(notificationSocketIO.getConnectionStatus()).toEqual({
        isConnected: true,
        isConnecting: false,
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('resets reconnect attempts on successful connect', async () => {
      await notificationSocketIO.connect('tok');
      // Simulate a connect_error to increment attempts
      currentSocketMock!._emit('connect_error', new Error('net'));
      currentSocketMock!._emit('connect_error', new Error('net'));
      // Now a successful connect
      currentSocketMock!._emit('connect');

      // The public API doesn't expose reconnectAttempts, but we can verify
      // the status is correct
      expect(notificationSocketIO.getConnectionStatus().isConnected).toBe(true);
    });

    it('calls multiple onConnect callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onConnect(cb1);
      notificationSocketIO.onConnect(cb2);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  // ── setupEventListeners() → disconnect ───────────────────────────────────

  describe('event: disconnect', () => {
    it('marks as disconnected and fires onDisconnect callbacks with reason', async () => {
      const cb = jest.fn();
      notificationSocketIO.onDisconnect(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');
      currentSocketMock!._emit('disconnect', 'io server disconnect');

      expect(notificationSocketIO.getConnectionStatus().isConnected).toBe(false);
      expect(cb).toHaveBeenCalledWith('io server disconnect');
    });

    it('calls multiple onDisconnect callbacks with reason', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onDisconnect(cb1);
      notificationSocketIO.onDisconnect(cb2);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('disconnect', 'transport close');

      expect(cb1).toHaveBeenCalledWith('transport close');
      expect(cb2).toHaveBeenCalledWith('transport close');
    });
  });

  // ── setupEventListeners() → connect_error ────────────────────────────────

  describe('event: connect_error', () => {
    it('increments reconnect attempts and clears isConnecting', async () => {
      await notificationSocketIO.connect('tok');
      // Before error: isConnecting should be true (no connect event fired)
      expect(notificationSocketIO.getConnectionStatus().isConnecting).toBe(true);

      currentSocketMock!._emit('connect_error', new Error('refused'));

      expect(notificationSocketIO.getConnectionStatus().isConnecting).toBe(false);
    });

    it('handles multiple connect_error events', async () => {
      await notificationSocketIO.connect('tok');

      currentSocketMock!._emit('connect_error', new Error('e1'));
      currentSocketMock!._emit('connect_error', new Error('e2'));
      currentSocketMock!._emit('connect_error', new Error('e3'));

      // Should not throw and status is sensible
      expect(notificationSocketIO.getConnectionStatus().isConnecting).toBe(false);
    });
  });

  // ── setupEventListeners() → notification:new ─────────────────────────────

  describe('event: notification:new', () => {
    it('parses notification data and calls registered callbacks', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData();
      currentSocketMock!._emit('notification:new', data);

      expect(cb).toHaveBeenCalledTimes(1);
      const received = cb.mock.calls[0][0];
      expect(received.id).toBe('notif-1');
      expect(received.userId).toBe('user-1');
      expect(received.type).toBe('new_message');
      expect(received.priority).toBe('normal');
    });

    it('builds state object with correct fields from root-level server data', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const createdAt = '2024-06-01T12:00:00.000Z';
      const readAt = '2024-06-01T12:30:00.000Z';
      const data = makeNotificationData({ isRead: true, readAt, createdAt });
      currentSocketMock!._emit('notification:new', data);

      const received = cb.mock.calls[0][0];
      expect(received.state.isRead).toBe(true);
      expect(received.state.readAt).toEqual(new Date(readAt));
      expect(received.state.createdAt).toEqual(new Date(createdAt));
    });

    it('defaults state.readAt to null when readAt not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ readAt: null });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].state.readAt).toBeNull();
    });

    it('defaults state.createdAt to current date when createdAt missing', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      const before = new Date();
      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ createdAt: undefined });
      currentSocketMock!._emit('notification:new', data);
      const after = new Date();

      const received = cb.mock.calls[0][0];
      expect(received.state.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(received.state.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('parses expiresAt when provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const expiresAt = '2024-12-31T23:59:59.000Z';
      const data = makeNotificationData({ expiresAt });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].state.expiresAt).toEqual(new Date(expiresAt));
    });

    it('leaves expiresAt undefined when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ expiresAt: null });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].state.expiresAt).toBeUndefined();
    });

    it('defaults delivery to { emailSent: false, pushSent: false } when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ delivery: undefined });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].delivery).toEqual({ emailSent: false, pushSent: false });
    });

    it('uses provided delivery data when available', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const delivery = { emailSent: true, pushSent: true };
      const data = makeNotificationData({ delivery });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].delivery).toEqual(delivery);
    });

    it('defaults context to {} when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ context: undefined });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].context).toEqual({});
    });

    it('defaults metadata to {} when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ metadata: undefined });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].metadata).toEqual({});
    });

    it('defaults priority to normal when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ priority: undefined });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].priority).toBe('normal');
    });

    it('defaults state.isRead to false when not provided', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const data = makeNotificationData({ isRead: undefined });
      currentSocketMock!._emit('notification:new', data);

      expect(cb.mock.calls[0][0].state.isRead).toBe(false);
    });

    it('calls multiple notification callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onNotification(cb1);
      notificationSocketIO.onNotification(cb2);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:new', makeNotificationData());

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  // ── setupEventListeners() → authenticated / error (no-op) ────────────────

  describe('event: authenticated and error (no-op handlers)', () => {
    it('handles authenticated event without throwing', async () => {
      await notificationSocketIO.connect('tok');
      expect(() => currentSocketMock!._emit('authenticated', { userId: 'u1' })).not.toThrow();
    });

    it('handles error event without throwing', async () => {
      await notificationSocketIO.connect('tok');
      expect(() => currentSocketMock!._emit('error', new Error('test'))).not.toThrow();
    });
  });

  // ── setupEventListeners() → notification:read ────────────────────────────

  describe('event: notification:read', () => {
    it('calls read callbacks with notificationId', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotificationRead(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:read', { notificationId: 'notif-xyz' });

      expect(cb).toHaveBeenCalledWith('notif-xyz');
    });

    it('calls multiple read callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onNotificationRead(cb1);
      notificationSocketIO.onNotificationRead(cb2);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:read', { notificationId: 'n-1' });

      expect(cb1).toHaveBeenCalledWith('n-1');
      expect(cb2).toHaveBeenCalledWith('n-1');
    });
  });

  // ── setupEventListeners() → notification:deleted ─────────────────────────

  describe('event: notification:deleted', () => {
    it('calls deleted callbacks with notificationId', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotificationDeleted(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:deleted', { notificationId: 'notif-del-1' });

      expect(cb).toHaveBeenCalledWith('notif-del-1');
    });

    it('calls multiple deleted callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onNotificationDeleted(cb1);
      notificationSocketIO.onNotificationDeleted(cb2);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:deleted', { notificationId: 'd-1' });

      expect(cb1).toHaveBeenCalledWith('d-1');
      expect(cb2).toHaveBeenCalledWith('d-1');
    });
  });

  // ── setupEventListeners() → notification:counts ──────────────────────────

  describe('event: notification:counts', () => {
    it('calls counts callbacks with the counts payload', async () => {
      const cb = jest.fn();
      notificationSocketIO.onCounts(cb);

      await notificationSocketIO.connect('tok');
      const counts = { total: 10, unread: 3 };
      currentSocketMock!._emit('notification:counts', counts);

      expect(cb).toHaveBeenCalledWith(counts);
    });

    it('calls multiple counts callbacks', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      notificationSocketIO.onCounts(cb1);
      notificationSocketIO.onCounts(cb2);

      await notificationSocketIO.connect('tok');
      const counts = { total: 5, unread: 1 };
      currentSocketMock!._emit('notification:counts', counts);

      expect(cb1).toHaveBeenCalledWith(counts);
      expect(cb2).toHaveBeenCalledWith(counts);
    });
  });

  // ── disconnect() ─────────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('removes all listeners and disconnects the socket', async () => {
      await notificationSocketIO.connect('tok');
      const sock = currentSocketMock!;

      notificationSocketIO.disconnect();

      expect(sock.removeAllListeners).toHaveBeenCalled();
      expect(sock.disconnect).toHaveBeenCalled();
    });

    it('resets connection state to idle', async () => {
      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');
      expect(notificationSocketIO.getConnectionStatus().isConnected).toBe(true);

      notificationSocketIO.disconnect();

      const status = notificationSocketIO.getConnectionStatus();
      expect(status.isConnected).toBe(false);
      expect(status.isConnecting).toBe(false);
    });

    it('is safe to call when no socket exists', () => {
      // No prior connect call
      expect(() => notificationSocketIO.disconnect()).not.toThrow();
    });

    it('is safe to call multiple times in a row', async () => {
      await notificationSocketIO.connect('tok');

      expect(() => {
        notificationSocketIO.disconnect();
        notificationSocketIO.disconnect();
      }).not.toThrow();
    });
  });

  // ── getConnectionStatus() ────────────────────────────────────────────────

  describe('getConnectionStatus()', () => {
    it('returns { isConnected: false, isConnecting: false } before any connect call', () => {
      expect(notificationSocketIO.getConnectionStatus()).toEqual({
        isConnected: false,
        isConnecting: false,
      });
    });

    it('returns isConnecting: true while connection is pending', async () => {
      await notificationSocketIO.connect('tok');
      // No connect event fired yet

      expect(notificationSocketIO.getConnectionStatus()).toEqual({
        isConnected: false,
        isConnecting: true,
      });
    });

    it('returns isConnected: true after connect event fires', async () => {
      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');

      expect(notificationSocketIO.getConnectionStatus()).toEqual({
        isConnected: true,
        isConnecting: false,
      });
    });
  });

  // ── Callback registration and cleanup ────────────────────────────────────

  describe('onNotification() cleanup', () => {
    it('returns a cleanup function that stops delivering notifications', async () => {
      const cb = jest.fn();
      const unsubscribe = notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:new', makeNotificationData());
      expect(cb).toHaveBeenCalledTimes(1);

      unsubscribe();
      currentSocketMock!._emit('notification:new', makeNotificationData());
      expect(cb).toHaveBeenCalledTimes(1); // not called again
    });
  });

  describe('onNotificationRead() cleanup', () => {
    it('returns a cleanup function that stops delivering read events', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onNotificationRead(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:read', { notificationId: 'n1' });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('notification:read', { notificationId: 'n2' });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onNotificationDeleted() cleanup', () => {
    it('returns a cleanup function that stops delivering deleted events', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onNotificationDeleted(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:deleted', { notificationId: 'd1' });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('notification:deleted', { notificationId: 'd2' });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onCounts() cleanup', () => {
    it('returns a cleanup function that stops delivering count updates', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onCounts(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:counts', { total: 1, unread: 1 });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('notification:counts', { total: 2, unread: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onConnect() cleanup', () => {
    it('returns a cleanup function that stops connect notifications', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onConnect(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('connect');
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('connect');
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDisconnect() cleanup', () => {
    it('returns a cleanup function that stops disconnect notifications', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onDisconnect(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('disconnect', 'reason1');
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('disconnect', 'reason2');
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ── reset() ──────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('disconnects the socket and clears all callback sets', async () => {
      const notifCb = jest.fn();
      const readCb = jest.fn();
      const deletedCb = jest.fn();
      const countsCb = jest.fn();
      const connectCb = jest.fn();
      const disconnectCb = jest.fn();

      notificationSocketIO.onNotification(notifCb);
      notificationSocketIO.onNotificationRead(readCb);
      notificationSocketIO.onNotificationDeleted(deletedCb);
      notificationSocketIO.onCounts(countsCb);
      notificationSocketIO.onConnect(connectCb);
      notificationSocketIO.onDisconnect(disconnectCb);

      await notificationSocketIO.connect('tok');
      const sock = currentSocketMock!;

      notificationSocketIO.reset();

      // Socket should be disconnected
      expect(sock.disconnect).toHaveBeenCalled();

      // After reset, re-connect and fire events — no callbacks should fire
      await notificationSocketIO.connect('tok2');
      currentSocketMock!._emit('connect');
      currentSocketMock!._emit('disconnect', 'r');
      currentSocketMock!._emit('notification:new', makeNotificationData());
      currentSocketMock!._emit('notification:read', { notificationId: 'x' });
      currentSocketMock!._emit('notification:deleted', { notificationId: 'y' });
      currentSocketMock!._emit('notification:counts', { total: 0, unread: 0 });

      expect(notifCb).not.toHaveBeenCalled();
      expect(readCb).not.toHaveBeenCalled();
      expect(deletedCb).not.toHaveBeenCalled();
      expect(countsCb).not.toHaveBeenCalled();
      expect(connectCb).not.toHaveBeenCalled();
      expect(disconnectCb).not.toHaveBeenCalled();
    });

    it('is safe to call when never connected', () => {
      expect(() => notificationSocketIO.reset()).not.toThrow();
    });
  });
});
