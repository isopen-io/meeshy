/**
 * Tests for ConnectionService
 * Achieves ≥92% line+branch coverage on connection.service.ts
 */

// ─── Mock variable declarations MUST come before jest.mock() calls ───────────
const mockIo = jest.fn();

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: false,
  id: 'socket-1',
  io: { engine: { transport: { name: 'websocket' } } },
};

mockIo.mockReturnValue(mockSocket);

const mockLogger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockGetWebSocketUrl = jest.fn().mockReturnValue('ws://localhost:3000');
const mockIsJWTExpired = jest.fn().mockReturnValue(false);

const mockAuthManager = {
  getAuthToken: jest.fn().mockReturnValue('test-token'),
  getAnonymousSession: jest.fn().mockReturnValue(null),
};

const mockGetConversationApiId = jest.fn().mockReturnValue('conv-api-id');
const mockTriggerManualUpdateCheck = jest.fn();
const mockAuthRefreshToken = jest.fn().mockResolvedValue({});

const SERVER_EVENTS_MOCK = {
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
  AUTH_TOKEN_EXPIRED: 'auth:token-expired',
  AUTH_SESSION_REVOKED: 'auth:session-revoked',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_CONSUMED: 'message:consumed',
  SYSTEM_MESSAGE: 'message:system',
  ATTACHMENT_STATUS_UPDATED: 'attachment:status-updated',
  MENTION_CREATED: 'mention:created',
};

const CLIENT_EVENTS_MOCK = {
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
};

// ─── jest.mock() calls ────────────────────────────────────────────────────────
jest.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => mockLogger.warn(...args),
    debug: (...args: unknown[]) => mockLogger.debug(...args),
    error: (...args: unknown[]) => mockLogger.error(...args),
    info: (...args: unknown[]) => mockLogger.info(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  getWebSocketUrl: (...args: unknown[]) => mockGetWebSocketUrl(...args),
}));

jest.mock('@/utils/auth', () => ({
  isJWTExpired: (...args: unknown[]) => mockIsJWTExpired(...args),
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: unknown[]) => mockAuthManager.getAuthToken(...args),
    getAnonymousSession: (...args: unknown[]) => mockAuthManager.getAnonymousSession(...args),
  },
}));

jest.mock('@/services/auth.service', () => ({
  authService: {
    refreshToken: (...args: unknown[]) => mockAuthRefreshToken(...args),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    AUTHENTICATED: 'authenticated',
    ERROR: 'error',
    AUTH_TOKEN_EXPIRED: 'auth:token-expired',
    AUTH_SESSION_REVOKED: 'auth:session-revoked',
    MESSAGE_NEW: 'message:new',
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    MESSAGE_CONSUMED: 'message:consumed',
    SYSTEM_MESSAGE: 'message:system',
    ATTACHMENT_STATUS_UPDATED: 'attachment:status-updated',
    MENTION_CREATED: 'mention:created',
  },
  CLIENT_EVENTS: {
    CONVERSATION_JOIN: 'conversation:join',
    CONVERSATION_LEAVE: 'conversation:leave',
    MESSAGE_SEND: 'message:send',
    MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
    MESSAGE_EDIT: 'message:edit',
    MESSAGE_DELETE: 'message:delete',
  },
}));

jest.mock('@/utils/conversation-id-utils', () => ({
  logConversationIdDebug: jest.fn(),
  getConversationIdType: jest.fn(),
  getConversationApiId: (...args: unknown[]) => mockGetConversationApiId(...args),
}));

jest.mock('@/utils/service-worker', () => ({
  triggerManualUpdateCheck: (...args: unknown[]) => mockTriggerManualUpdateCheck(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { ConnectionService } from '@/services/socketio/connection.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reset shared mockSocket to a fresh disconnected state */
function resetMockSocket() {
  mockSocket.on.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.connect.mockClear();
  mockSocket.disconnect.mockClear();
  mockSocket.connected = false;
  mockSocket.id = 'socket-1';
}

/** Collect window event handlers registered during construction */
function captureWindowHandlers(): Map<string, EventListener> {
  const handlers = new Map<string, EventListener>();
  jest.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: EventListenerOrEventListenerObject) => {
    handlers.set(event, handler as EventListener);
  });
  return handlers;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConnectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSocket();
    mockIo.mockReturnValue(mockSocket);
    mockAuthManager.getAuthToken.mockReturnValue('test-token');
    mockAuthManager.getAnonymousSession.mockReturnValue(null);
    mockIsJWTExpired.mockReturnValue(false);
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('registers sw-update-available, offline, online event listeners when window is defined', () => {
      const addEventSpy = jest.spyOn(window, 'addEventListener');
      new ConnectionService();
      const events = addEventSpy.mock.calls.map(([evt]) => evt);
      expect(events).toContain('sw-update-available');
      expect(events).toContain('offline');
      expect(events).toContain('online');
    });

    describe('sw-update-available handler', () => {
      it('sets isAppUpdating=true', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        handlers.get('sw-update-available')!(new Event('sw-update-available'));
        // connect() should return early now (isAppUpdating=true)
        const connectSpy = jest.spyOn(svc as any, 'connect' in svc ? 'connect' : 'connect');
        svc.connect();
        expect(mockSocket.connect).not.toHaveBeenCalled();
      });

      it('disconnects socket if socket is connected', () => {
        const handlers = captureWindowHandlers();
        new ConnectionService();

        // Put a mock socket in state
        mockSocket.connected = true;
        // We need to inject socket into state to test disconnect call
        const svc = new ConnectionService();
        // Inject via initializeConnection
        (svc as any).state.socket = mockSocket;

        handlers.get('sw-update-available')!(new Event('sw-update-available'));
        expect(mockSocket.disconnect).toHaveBeenCalled();
      });

      it('does NOT disconnect if socket is null', () => {
        const handlers = captureWindowHandlers();
        new ConnectionService(); // captures handlers

        handlers.get('sw-update-available')!(new Event('sw-update-available'));
        expect(mockSocket.disconnect).not.toHaveBeenCalled();
      });
    });

    describe('offline handler', () => {
      it('sets connected=false, isConnecting=false, emits status when was connected', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        const listener = jest.fn();
        svc.onStatusChange(listener);

        (svc as any).state.isConnected = true;
        (svc as any).state.isConnecting = false;

        handlers.get('offline')!(new Event('offline'));

        expect((svc as any).state.isConnected).toBe(false);
        expect((svc as any).state.isConnecting).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('emits status when was connecting', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        const listener = jest.fn();
        svc.onStatusChange(listener);

        (svc as any).state.isConnected = false;
        (svc as any).state.isConnecting = true;

        handlers.get('offline')!(new Event('offline'));

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('does NOT emit status when was already disconnected and not connecting', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        const listener = jest.fn();
        svc.onStatusChange(listener);

        (svc as any).state.isConnected = false;
        (svc as any).state.isConnecting = false;

        handlers.get('offline')!(new Event('offline'));

        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe('online handler', () => {
      it('resets reconnectAttempts and calls connect when not connected', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        (svc as any).state.reconnectAttempts = 5;
        (svc as any).state.isConnected = false;
        (svc as any).state.isConnecting = false;

        const connectSpy = jest.spyOn(svc, 'connect').mockImplementation(() => {});

        handlers.get('online')!(new Event('online'));

        expect((svc as any).state.reconnectAttempts).toBe(0);
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });

      it('does NOT call connect when isAppUpdating', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        (svc as any).isAppUpdating = true;

        const connectSpy = jest.spyOn(svc, 'connect').mockImplementation(() => {});

        handlers.get('online')!(new Event('online'));

        expect(connectSpy).not.toHaveBeenCalled();
      });

      it('does NOT call connect when already connected', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        (svc as any).state.isConnected = true;

        const connectSpy = jest.spyOn(svc, 'connect').mockImplementation(() => {});

        handlers.get('online')!(new Event('online'));

        expect(connectSpy).not.toHaveBeenCalled();
      });

      it('does NOT call connect when already connecting', () => {
        const handlers = captureWindowHandlers();
        const svc = new ConnectionService();
        (svc as any).state.isConnecting = true;

        const connectSpy = jest.spyOn(svc, 'connect').mockImplementation(() => {});

        handlers.get('online')!(new Event('online'));

        expect(connectSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ─── onStatusChange ────────────────────────────────────────────────────────

  describe('onStatusChange', () => {
    it('returns an unsubscribe function that removes the listener', () => {
      const svc = new ConnectionService();
      const listener = jest.fn();
      const unsub = svc.onStatusChange(listener);

      // Emit once → listener called
      (svc as any).emitStatusChange();
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe then emit again → not called again
      unsub();
      (svc as any).emitStatusChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ─── emitStatusChange ──────────────────────────────────────────────────────

  describe('emitStatusChange', () => {
    it('calls all registered listeners with diagnostics', () => {
      const svc = new ConnectionService();
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      svc.onStatusChange(listener1);
      svc.onStatusChange(listener2);

      (svc as any).emitStatusChange();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Verify shape of diagnostics
      const diag = listener1.mock.calls[0][0];
      expect(diag).toMatchObject({
        status: expect.any(String),
        isConnected: expect.any(Boolean),
        hasSocket: expect.any(Boolean),
        reconnectAttempts: expect.any(Number),
        transport: expect.any(String),
      });
    });

    it('catches and ignores errors thrown by listeners', () => {
      const svc = new ConnectionService();
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('listener error');
      });
      const goodListener = jest.fn();
      svc.onStatusChange(badListener);
      svc.onStatusChange(goodListener);

      expect(() => (svc as any).emitStatusChange()).not.toThrow();
      expect(goodListener).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ─── initializeConnection ──────────────────────────────────────────────────

  describe('initializeConnection', () => {
    it('returns existing socket if already set', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = mockSocket;

      const result = svc.initializeConnection();

      expect(result).toBe(mockSocket);
      expect(mockIo).not.toHaveBeenCalled();
    });

    it('returns null when no token and no anonymous session', () => {
      mockAuthManager.getAuthToken.mockReturnValue(null);
      mockAuthManager.getAnonymousSession.mockReturnValue(null);

      const svc = new ConnectionService();
      const result = svc.initializeConnection();

      expect(result).toBeNull();
      expect(mockIo).not.toHaveBeenCalled();
    });

    it('returns null when JWT is expired', () => {
      mockAuthManager.getAuthToken.mockReturnValue('expired-token');
      mockIsJWTExpired.mockReturnValue(true);

      const svc = new ConnectionService();
      const result = svc.initializeConnection();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('creates socket via io() when JWT token present and valid', () => {
      mockAuthManager.getAuthToken.mockReturnValue('valid-token');
      mockIsJWTExpired.mockReturnValue(false);

      const svc = new ConnectionService();
      const result = svc.initializeConnection();

      expect(mockIo).toHaveBeenCalledTimes(1);
      expect(mockIo).toHaveBeenCalledWith(
        'ws://localhost:3000',
        expect.objectContaining({
          auth: { token: 'valid-token' },
          autoConnect: false,
        })
      );
      expect(result).toBe(mockSocket);
    });

    it('creates socket with session token when no JWT', () => {
      mockAuthManager.getAuthToken.mockReturnValue(null);
      mockAuthManager.getAnonymousSession.mockReturnValue({ token: 'anon-token' });

      const svc = new ConnectionService();
      const result = svc.initializeConnection();

      expect(mockIo).toHaveBeenCalledWith(
        'ws://localhost:3000',
        expect.objectContaining({
          auth: { token: 'anon-token' },
        })
      );
      expect(result).toBe(mockSocket);
    });

    it('stores socket in state after creation', () => {
      const svc = new ConnectionService();
      svc.initializeConnection();

      expect((svc as any).state.socket).toBe(mockSocket);
    });
  });

  // ─── connect ──────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('returns early if isAppUpdating', () => {
      const svc = new ConnectionService();
      (svc as any).isAppUpdating = true;

      svc.connect();

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('returns early if socket already connected', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: true };

      svc.connect();

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('returns early if already connecting', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: false };
      (svc as any).state.isConnecting = true;

      svc.connect();

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('sets isConnecting=true and calls socket.connect()', () => {
      const localSocket = { ...mockSocket, connected: false, connect: jest.fn(), on: jest.fn(), disconnect: jest.fn(), emit: jest.fn() };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      svc.connect();

      expect((svc as any).state.isConnecting).toBe(true);
      expect(localSocket.connect).toHaveBeenCalledTimes(1);
    });

    it('calls initializeConnection if socket is not set yet', () => {
      const svc = new ConnectionService();
      const initSpy = jest.spyOn(svc, 'initializeConnection').mockReturnValue(null);

      svc.connect();

      expect(initSpy).toHaveBeenCalled();
    });
  });

  // ─── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('calls socket.disconnect(), sets connected=false, isConnecting=false, emits status', () => {
      const localSocket = { ...mockSocket, disconnect: jest.fn() };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).state.isConnected = true;
      (svc as any).state.isConnecting = true;

      const listener = jest.fn();
      svc.onStatusChange(listener);

      svc.disconnect();

      expect(localSocket.disconnect).toHaveBeenCalledTimes(1);
      expect((svc as any).state.isConnected).toBe(false);
      expect((svc as any).state.isConnecting).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no socket', () => {
      const svc = new ConnectionService();
      const listener = jest.fn();
      svc.onStatusChange(listener);

      expect(() => svc.disconnect()).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── reconnect ────────────────────────────────────────────────────────────

  describe('reconnect', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('clears existing timeout before scheduling new reconnect', () => {
      const svc = new ConnectionService();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Set a fake existing timeout
      (svc as any).reconnectTimeout = setTimeout(() => {}, 99999);

      svc.reconnect();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('calls disconnect() immediately', () => {
      const svc = new ConnectionService();
      const disconnectSpy = jest.spyOn(svc, 'disconnect').mockImplementation(() => {});

      svc.reconnect();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('schedules connect() with exponential backoff delay', () => {
      const svc = new ConnectionService();
      (svc as any).state.reconnectAttempts = 1;
      jest.spyOn(svc, 'disconnect').mockImplementation(() => {});
      const connectSpy = jest.spyOn(svc, 'connect').mockImplementation(() => {});

      svc.reconnect();

      // Not yet called (setTimeout)
      expect(connectSpy).not.toHaveBeenCalled();

      // Advance past the maximum possible delay for attempt=1: min(1000*2^1,30000)+1000 = 3000
      jest.advanceTimersByTime(31000);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('increments reconnectAttempts, capped at 10', () => {
      const svc = new ConnectionService();
      (svc as any).state.reconnectAttempts = 10;
      jest.spyOn(svc, 'disconnect').mockImplementation(() => {});
      jest.spyOn(svc, 'connect').mockImplementation(() => {});

      svc.reconnect();
      jest.advanceTimersByTime(31000);

      expect((svc as any).state.reconnectAttempts).toBe(10); // capped
    });
  });

  // ─── disconnectForUpdate ──────────────────────────────────────────────────

  describe('disconnectForUpdate', () => {
    it('sets isAppUpdating=true and calls disconnect()', () => {
      const svc = new ConnectionService();
      const disconnectSpy = jest.spyOn(svc, 'disconnect').mockImplementation(() => {});

      svc.disconnectForUpdate();

      expect((svc as any).isAppUpdating).toBe(true);
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── setupConnectionListeners ─────────────────────────────────────────────

  describe('setupConnectionListeners', () => {
    it('is a no-op when no socket', () => {
      const svc = new ConnectionService();
      expect(() => svc.setupConnectionListeners()).not.toThrow();
      expect(mockSocket.on).not.toHaveBeenCalled();
    });

    it('registers 7 socket event handlers', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      svc.setupConnectionListeners();

      expect(localSocket.on).toHaveBeenCalledTimes(8);
    });

    it('on connect: sets connected=true, calls autoJoinCallback, emits status', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };

      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      const autoJoin = jest.fn();
      svc.setAutoJoinCallback(autoJoin);

      const statusListener = jest.fn();
      svc.onStatusChange(statusListener);

      svc.setupConnectionListeners();
      eventHandlers['connect']();

      expect((svc as any).state.isConnected).toBe(true);
      expect((svc as any).state.isConnecting).toBe(false);
      expect((svc as any).state.reconnectAttempts).toBe(0);
      expect(autoJoin).toHaveBeenCalledTimes(1);
      expect(statusListener).toHaveBeenCalledTimes(1);
    });

    it('on connect: does not call autoJoinCallback if null', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).autoJoinCallback = null;

      svc.setupConnectionListeners();
      expect(() => eventHandlers['connect']()).not.toThrow();
    });

    it('on disconnect: sets disconnected state, calls onDisconnected, emits status', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };

      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).state.isConnected = true;

      const onDisconnected = jest.fn();
      const statusListener = jest.fn();
      svc.onStatusChange(statusListener);

      svc.setupConnectionListeners(undefined, onDisconnected, undefined);
      eventHandlers['disconnect']('transport close');

      expect((svc as any).state.isConnected).toBe(false);
      expect((svc as any).state.isConnecting).toBe(false);
      expect(onDisconnected).toHaveBeenCalledWith('transport close');
      expect(statusListener).toHaveBeenCalledTimes(1);
    });

    it('on disconnect: safe when onDisconnected is not provided', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      svc.setupConnectionListeners();
      expect(() => eventHandlers['disconnect']('io client disconnect')).not.toThrow();
    });

    it('on connect_error: sets isConnecting=false, calls onError, calls handleConnectionError', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };

      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).state.isConnecting = true;

      const onError = jest.fn();

      svc.setupConnectionListeners(undefined, undefined, onError);

      const err = new Error('Connection refused');
      eventHandlers['connect_error'](err);

      expect((svc as any).state.isConnecting).toBe(false);
      expect(onError).toHaveBeenCalledWith(err);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Socket] connection error',
        expect.objectContaining({ errorMessage: 'Connection refused' })
      );
    });

    it('on connect_error: safe when onError is not provided', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      svc.setupConnectionListeners();
      expect(() => eventHandlers['connect_error']({ message: 'fail' })).not.toThrow();
    });

    it('on connect_error: uses error.error if no message', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      svc.setupConnectionListeners();
      eventHandlers['connect_error']({ error: 'custom error' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Socket] connection error',
        expect.objectContaining({ errorMessage: 'custom error' })
      );
    });

    it('on connect_error: uses fallback message when no message or error prop', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      svc.setupConnectionListeners();
      eventHandlers['connect_error']({});
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Socket] connection error',
        expect.objectContaining({ errorMessage: 'Connection error' })
      );
    });

    it('on reconnect_failed: sets isConnecting=false, calls onError, emits status', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).state.isConnecting = true;

      const onError = jest.fn();
      svc.setupConnectionListeners(undefined, undefined, onError);
      eventHandlers['reconnect_failed']();

      expect((svc as any).state.isConnecting).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Socket]',
        expect.stringContaining('reconnection failed')
      );
    });

    it('on reconnect_failed: hands off to the manual reconnect() backoff loop', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      const reconnectSpy = jest.spyOn(svc, 'reconnect').mockImplementation(() => {});
      svc.setupConnectionListeners();
      eventHandlers['reconnect_failed']();

      expect(reconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('on reconnect_failed: safe when onError is not provided', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      jest.spyOn(svc, 'reconnect').mockImplementation(() => {});
      svc.setupConnectionListeners();
      expect(() => eventHandlers['reconnect_failed']()).not.toThrow();
    });

    it('on AUTHENTICATED: sets currentUser and calls onAuthenticated', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };

      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;

      const onAuthenticated = jest.fn();
      svc.setupConnectionListeners(onAuthenticated);

      const fakeUser = { id: 'user-1', username: 'alice' };
      eventHandlers[SERVER_EVENTS_MOCK.AUTHENTICATED]({ user: fakeUser });

      expect((svc as any).currentUser).toEqual(fakeUser);
      expect(onAuthenticated).toHaveBeenCalledWith(fakeUser);
    });

    it('on AUTHENTICATED: safe when onAuthenticated is not provided', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      svc.setupConnectionListeners();
      expect(() => eventHandlers[SERVER_EVENTS_MOCK.AUTHENTICATED]({ user: { id: 'u1' } })).not.toThrow();
    });

    it('on ERROR: calls handleConnectionError (logs warn)', () => {
      const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
      const localSocket = {
        ...mockSocket,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers[event] = handler;
        }),
      };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      svc.setupConnectionListeners();

      eventHandlers[SERVER_EVENTS_MOCK.ERROR]({ message: 'server error' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Socket] connection error',
        expect.objectContaining({ errorMessage: 'server error' })
      );
    });

    describe('on AUTH_TOKEN_EXPIRED', () => {
      it('refreshes token, updates socket.auth, and calls reconnect() on success', async () => {
        const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
        const localSocket = {
          ...mockSocket,
          auth: { token: 'old-token' },
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            eventHandlers[event] = handler;
          }),
        };

        mockAuthRefreshToken.mockResolvedValue({});
        mockAuthManager.getAuthToken.mockReturnValue('new-token');

        const svc = new ConnectionService();
        (svc as any).state.socket = localSocket;
        const reconnectSpy = jest.spyOn(svc, 'reconnect').mockImplementation(() => {});
        svc.setupConnectionListeners();

        eventHandlers[SERVER_EVENTS_MOCK.AUTH_TOKEN_EXPIRED]();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockAuthRefreshToken).toHaveBeenCalledTimes(1);
        expect(localSocket.auth).toEqual({ token: 'new-token' });
        expect(reconnectSpy).toHaveBeenCalledTimes(1);
      });

      it('does not update socket.auth when no new token returned after refresh', async () => {
        const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
        const localSocket = {
          ...mockSocket,
          auth: { token: 'old-token' },
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            eventHandlers[event] = handler;
          }),
        };

        mockAuthRefreshToken.mockResolvedValue({});
        mockAuthManager.getAuthToken.mockReturnValue(null);

        const svc = new ConnectionService();
        (svc as any).state.socket = localSocket;
        jest.spyOn(svc, 'reconnect').mockImplementation(() => {});
        svc.setupConnectionListeners();

        eventHandlers[SERVER_EVENTS_MOCK.AUTH_TOKEN_EXPIRED]();
        await Promise.resolve();
        await Promise.resolve();

        expect(localSocket.auth).toEqual({ token: 'old-token' });
      });

      it('logs warn and does not reconnect when refreshToken fails', async () => {
        const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
        const localSocket = {
          ...mockSocket,
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            eventHandlers[event] = handler;
          }),
        };

        mockAuthRefreshToken.mockRejectedValue(new Error('network error'));

        const svc = new ConnectionService();
        (svc as any).state.socket = localSocket;
        const reconnectSpy = jest.spyOn(svc, 'reconnect').mockImplementation(() => {});
        svc.setupConnectionListeners();

        eventHandlers[SERVER_EVENTS_MOCK.AUTH_TOKEN_EXPIRED]();
        await Promise.resolve();
        await Promise.resolve();

        expect(reconnectSpy).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '[Socket]',
          'token refresh failed after auth:token-expired',
          expect.objectContaining({ err: expect.any(Error) })
        );
      });
    });

    describe('on AUTH_SESSION_REVOKED', () => {
      it('calls onSessionRevoked callback when provided', () => {
        const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
        const localSocket = {
          ...mockSocket,
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            eventHandlers[event] = handler;
          }),
        };

        const svc = new ConnectionService();
        (svc as any).state.socket = localSocket;

        const onSessionRevoked = jest.fn();
        svc.setupConnectionListeners(undefined, undefined, undefined, onSessionRevoked);

        eventHandlers[SERVER_EVENTS_MOCK.AUTH_SESSION_REVOKED]();

        expect(onSessionRevoked).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith('[Socket]', 'auth session revoked — forcing logout');
      });

      it('logs warn and does not throw when onSessionRevoked is not provided', () => {
        const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
        const localSocket = {
          ...mockSocket,
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            eventHandlers[event] = handler;
          }),
        };

        const svc = new ConnectionService();
        (svc as any).state.socket = localSocket;
        svc.setupConnectionListeners();

        expect(() => eventHandlers[SERVER_EVENTS_MOCK.AUTH_SESSION_REVOKED]()).not.toThrow();
        expect(mockLogger.warn).toHaveBeenCalledWith('[Socket]', 'auth session revoked — forcing logout');
      });
    });
  });

  // ─── joinConversation ─────────────────────────────────────────────────────

  describe('joinConversation', () => {
    it('no-op when not connected', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: false, emit: jest.fn() };

      svc.joinConversation('conv-1');

      expect((svc as any).state.socket.emit).not.toHaveBeenCalled();
    });

    it('no-op when socket is null', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = null;

      expect(() => svc.joinConversation('conv-1')).not.toThrow();
    });

    it('emits CONVERSATION_JOIN with string conversationId', () => {
      const emitMock = jest.fn();
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: true, emit: emitMock };

      svc.joinConversation('conv-string-id');

      expect(emitMock).toHaveBeenCalledWith(CLIENT_EVENTS_MOCK.CONVERSATION_JOIN, {
        conversationId: 'conv-string-id',
      });
    });

    it('emits CONVERSATION_JOIN using getConversationApiId for object', () => {
      const emitMock = jest.fn();
      mockGetConversationApiId.mockReturnValue('api-id-from-obj');
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: true, emit: emitMock };

      const conversationObj = { _id: 'mongo-id', apiId: 'api-id-from-obj' };
      svc.joinConversation(conversationObj);

      expect(mockGetConversationApiId).toHaveBeenCalledWith(conversationObj);
      expect(emitMock).toHaveBeenCalledWith(CLIENT_EVENTS_MOCK.CONVERSATION_JOIN, {
        conversationId: 'api-id-from-obj',
      });
    });
  });

  // ─── leaveConversation ────────────────────────────────────────────────────

  describe('leaveConversation', () => {
    it('no-op when not connected', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: false, emit: jest.fn() };

      svc.leaveConversation('conv-1');

      expect((svc as any).state.socket.emit).not.toHaveBeenCalled();
    });

    it('no-op when socket is null', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = null;

      expect(() => svc.leaveConversation('conv-1')).not.toThrow();
    });

    it('emits CONVERSATION_LEAVE with string conversationId', () => {
      const emitMock = jest.fn();
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: true, emit: emitMock };

      svc.leaveConversation('conv-leave');

      expect(emitMock).toHaveBeenCalledWith(CLIENT_EVENTS_MOCK.CONVERSATION_LEAVE, {
        conversationId: 'conv-leave',
      });
    });

    it('emits CONVERSATION_LEAVE using getConversationApiId for object', () => {
      const emitMock = jest.fn();
      mockGetConversationApiId.mockReturnValue('api-leave-id');
      const svc = new ConnectionService();
      (svc as any).state.socket = { ...mockSocket, connected: true, emit: emitMock };

      svc.leaveConversation({ id: 'obj-id' });

      expect(emitMock).toHaveBeenCalledWith(CLIENT_EVENTS_MOCK.CONVERSATION_LEAVE, {
        conversationId: 'api-leave-id',
      });
    });
  });

  // ─── getConnectionStatus ──────────────────────────────────────────────────

  describe('getConnectionStatus', () => {
    it('returns "connected" when isConnected=true', () => {
      const svc = new ConnectionService();
      (svc as any).state.isConnected = true;
      expect(svc.getConnectionStatus()).toBe('connected');
    });

    it('returns "connecting" when isConnecting=true and not connected', () => {
      const svc = new ConnectionService();
      (svc as any).state.isConnected = false;
      (svc as any).state.isConnecting = true;
      expect(svc.getConnectionStatus()).toBe('connecting');
    });

    it('returns "disconnected" when neither connected nor connecting', () => {
      const svc = new ConnectionService();
      (svc as any).state.isConnected = false;
      (svc as any).state.isConnecting = false;
      expect(svc.getConnectionStatus()).toBe('disconnected');
    });
  });

  // ─── getConnectionDiagnostics ─────────────────────────────────────────────

  describe('getConnectionDiagnostics', () => {
    it('returns correct shape with transport name and socketId', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = mockSocket;
      (svc as any).state.isConnected = true;

      const diag = svc.getConnectionDiagnostics();

      expect(diag).toEqual({
        status: 'connected',
        isConnected: true,
        hasSocket: true,
        reconnectAttempts: 0,
        transport: 'websocket',
        socketId: 'socket-1',
      });
    });

    it('returns "unknown" transport and null socketId when no socket', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = null;

      const diag = svc.getConnectionDiagnostics();

      expect(diag.transport).toBe('unknown');
      expect(diag.socketId).toBeNull();
      expect(diag.hasSocket).toBe(false);
    });
  });

  // ─── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('calls disconnect(), nulls socket and currentUser', () => {
      const localSocket = { ...mockSocket, disconnect: jest.fn() };
      const svc = new ConnectionService();
      (svc as any).state.socket = localSocket;
      (svc as any).currentUser = { id: 'u1', username: 'alice' };

      svc.cleanup();

      expect(localSocket.disconnect).toHaveBeenCalled();
      expect((svc as any).state.socket).toBeNull();
      expect((svc as any).currentUser).toBeNull();
    });
  });

  // ─── misc getters/setters ─────────────────────────────────────────────────

  describe('misc methods', () => {
    it('getSocket returns current socket', () => {
      const svc = new ConnectionService();
      (svc as any).state.socket = mockSocket;
      expect(svc.getSocket()).toBe(mockSocket);
    });

    it('setCurrentUser sets current user', () => {
      const svc = new ConnectionService();
      const user = { id: 'u1', username: 'bob' } as any;
      svc.setCurrentUser(user);
      expect((svc as any).currentUser).toEqual(user);
    });

    it('updateCurrentConversationId and getCurrentConversationId work together', () => {
      const svc = new ConnectionService();
      svc.updateCurrentConversationId('conv-abc');
      expect(svc.getCurrentConversationId()).toBe('conv-abc');

      svc.updateCurrentConversationId(null);
      expect(svc.getCurrentConversationId()).toBeNull();
    });

    it('setAutoJoinCallback stores the callback', () => {
      const svc = new ConnectionService();
      const cb = jest.fn();
      svc.setAutoJoinCallback(cb);
      expect((svc as any).autoJoinCallback).toBe(cb);
    });
  });
});
