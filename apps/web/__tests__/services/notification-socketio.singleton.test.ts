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

/**
 * Payload `notification:new` tel que la gateway l'émet :
 * `{...formatNotification(raw), title, subtitle}` — structure GROUPÉE, avec
 * `title`/`subtitle` calculés serveur dans la langue résolue du destinataire.
 * @see services/gateway/src/services/notifications/NotificationService.ts
 */
const makeNotificationData = (overrides: Record<string, any> = {}) => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'new_message',
  priority: 'normal',
  title: 'Alice',
  subtitle: 'Équipe produit',
  content: 'Salut !',
  actor: { id: 'actor-1', username: 'alice' },
  context: { conversationId: 'conv-1' },
  metadata: {},
  state: {
    isRead: false,
    readAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: null,
  },
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
    it('decodes the emitted payload and calls registered callbacks', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:new', makeNotificationData());

      expect(cb).toHaveBeenCalledTimes(1);
      const received = cb.mock.calls[0][0];
      expect(received.id).toBe('notif-1');
      expect(received.userId).toBe('user-1');
      expect(received.type).toBe('new_message');
      expect(received.priority).toBe('normal');
      expect(received.context).toEqual({ conversationId: 'conv-1' });
    });

    it('livre le title et le subtitle calculés serveur', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:new', makeNotificationData());

      const received = cb.mock.calls[0][0];
      expect(received.title).toBe('Alice');
      expect(received.subtitle).toBe('Équipe produit');
    });

    it('livre l’état lu sous state — horodatage serveur, pas horloge locale', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      const createdAt = '2024-06-01T12:00:00.000Z';
      const readAt = '2024-06-01T12:30:00.000Z';
      const expiresAt = '2024-12-31T23:59:59.000Z';
      currentSocketMock!._emit(
        'notification:new',
        makeNotificationData({ state: { isRead: true, readAt, createdAt, expiresAt } })
      );

      const received = cb.mock.calls[0][0];
      expect(received.state.isRead).toBe(true);
      expect(received.state.readAt).toEqual(new Date(readAt));
      expect(received.state.createdAt).toEqual(new Date(createdAt));
      expect(received.state.expiresAt).toEqual(new Date(expiresAt));
    });

    it('ne livre rien quand le payload n’a pas d’identité exploitable', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotification(cb);

      await notificationSocketIO.connect('tok');
      currentSocketMock!._emit('notification:new', makeNotificationData({ id: undefined }));

      expect(cb).not.toHaveBeenCalled();
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

  // ── setupEventListeners() → notification:read-bulk ───────────────────────

  describe('event: notification:read-bulk', () => {
    it('relaie le scope tel quel aux callbacks', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotificationReadBulk(cb);

      await notificationSocketIO.connect('tok');
      const payload = {
        scope: { kind: 'context', contextKey: 'conversationId', contextValue: 'conv-1' },
      };
      currentSocketMock!._emit('notification:read-bulk', payload);

      expect(cb).toHaveBeenCalledWith(payload);
    });

    it('se désabonne proprement', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onNotificationReadBulk(cb);

      await notificationSocketIO.connect('tok');
      unsub();
      currentSocketMock!._emit('notification:read-bulk', { scope: { kind: 'all' } });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── setupEventListeners() → notification:deleted-bulk ────────────────────

  describe('event: notification:deleted-bulk', () => {
    it('relaie le scope tel quel aux callbacks', async () => {
      const cb = jest.fn();
      notificationSocketIO.onNotificationDeletedBulk(cb);

      await notificationSocketIO.connect('tok');
      const payload = { scope: { kind: 'read' } };
      currentSocketMock!._emit('notification:deleted-bulk', payload);

      expect(cb).toHaveBeenCalledWith(payload);
    });

    it('se désabonne proprement', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onNotificationDeletedBulk(cb);

      await notificationSocketIO.connect('tok');
      unsub();
      currentSocketMock!._emit('notification:deleted-bulk', { scope: { kind: 'read' } });

      expect(cb).not.toHaveBeenCalled();
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
      const readBulkCb = jest.fn();
      const countsCb = jest.fn();
      const connectCb = jest.fn();
      const disconnectCb = jest.fn();

      notificationSocketIO.onNotification(notifCb);
      notificationSocketIO.onNotificationRead(readCb);
      notificationSocketIO.onNotificationReadBulk(readBulkCb);
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
      currentSocketMock!._emit('notification:read-bulk', { scope: { kind: 'all' } });
      currentSocketMock!._emit('notification:deleted', { notificationId: 'y' });
      currentSocketMock!._emit('notification:counts', { total: 0, unread: 0 });

      expect(notifCb).not.toHaveBeenCalled();
      expect(readCb).not.toHaveBeenCalled();
      expect(readBulkCb).not.toHaveBeenCalled();
      expect(deletedCb).not.toHaveBeenCalled();
      expect(countsCb).not.toHaveBeenCalled();
      expect(connectCb).not.toHaveBeenCalled();
      expect(disconnectCb).not.toHaveBeenCalled();
    });

    it('is safe to call when never connected', () => {
      expect(() => notificationSocketIO.reset()).not.toThrow();
    });

    it('clears sync-desync subscribers', async () => {
      const desyncCb = jest.fn();
      notificationSocketIO.onSyncDesync(desyncCb);

      await notificationSocketIO.connect('tok');
      notificationSocketIO.reset();

      await notificationSocketIO.connect('tok2');
      currentSocketMock!._emit('connect');
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 1 }));
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 9 }));

      expect(desyncCb).not.toHaveBeenCalled();
    });
  });

  // ── SyncEngine — détection de trou `_seq` + resync au reconnect ───────────

  describe('sync desync signalling', () => {
    const connectAndOpen = async (token = 'tok') => {
      await notificationSocketIO.connect(token);
      currentSocketMock!._emit('connect');
    };

    it('signals a gap when a _seq skips ahead', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 91230 }));
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 91234 }));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('gap');
    });

    it('stays silent on the very first _seq — there is no reference point yet', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 91230 }));

      expect(cb).not.toHaveBeenCalled();
    });

    it('stays silent across a contiguous stream', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      [4, 5, 6].forEach((seq) =>
        currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: seq }))
      );

      expect(cb).not.toHaveBeenCalled();
    });

    it('stays silent when the gateway emits without _seq (degraded allocation / older gateway)', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 4 }));
      currentSocketMock!._emit('notification:new', makeNotificationData());
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 5 }));

      expect(cb).not.toHaveBeenCalled();
    });

    it('still delivers the notification itself when a gap is detected', async () => {
      const notifCb = jest.fn();
      notificationSocketIO.onNotification(notifCb);
      notificationSocketIO.onSyncDesync(jest.fn());
      await connectAndOpen();

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 1 }));
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 8 }));

      expect(notifCb).toHaveBeenCalledTimes(2);
    });

    it('signals a reconnect on the SECOND connect, never on the first', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);

      await connectAndOpen();
      expect(cb).not.toHaveBeenCalled();

      currentSocketMock!._emit('disconnect', 'transport close');
      currentSocketMock!._emit('connect');

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('reconnect');
    });

    it('keeps the _seq cursor across a socket.io reconnect — that is what lets the hole show', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 40 }));
      currentSocketMock!._emit('disconnect', 'transport close');
      currentSocketMock!._emit('connect');
      cb.mockClear(); // discard the reconnect signal — the cursor is what is under test

      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 44 }));

      expect(cb).toHaveBeenCalledWith('gap');
    });

    it('drops the cursor on an explicit disconnect — a _seq belongs to ONE account', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen('tok-alice');
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 91230 }));

      notificationSocketIO.disconnect();
      await connectAndOpen('tok-bob');
      cb.mockClear();

      // Bob's own counter starts wherever the server left it — never a gap.
      currentSocketMock!._emit('notification:new', makeNotificationData({ _seq: 3 }));

      expect(cb).not.toHaveBeenCalled();
    });

    it('does not signal a reconnect on the first connect of a fresh session', async () => {
      const cb = jest.fn();
      notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen('tok-alice');
      currentSocketMock!._emit('disconnect', 'transport close');

      notificationSocketIO.disconnect();
      await connectAndOpen('tok-bob');

      expect(cb).not.toHaveBeenCalled();
    });

    it('returns a cleanup function that stops desync signals', async () => {
      const cb = jest.fn();
      const unsub = notificationSocketIO.onSyncDesync(cb);
      await connectAndOpen();

      currentSocketMock!._emit('disconnect', 'transport close');
      currentSocketMock!._emit('connect');
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      currentSocketMock!._emit('disconnect', 'transport close');
      currentSocketMock!._emit('connect');
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
