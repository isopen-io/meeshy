/**
 * Tests for services/websocket.service.ts
 *
 * The service is a singleton exported at module level (WebSocketService.getInstance()).
 * We mock all external deps before the dynamic import so the singleton is constructed
 * against our fakes.
 */

// ─── Mock socket.io-client ────────────────────────────────────────────────────

type SocketEventHandler = (...args: unknown[]) => void;

const eventHandlers: Record<string, SocketEventHandler[]> = {};

const mockSocket = {
  emit: jest.fn(),
  on: jest.fn((event: string, handler: SocketEventHandler) => {
    eventHandlers[event] = eventHandlers[event] || [];
    eventHandlers[event].push(handler);
  }),
  off: jest.fn(),
  removeAllListeners: jest.fn(() => {
    Object.keys(eventHandlers).forEach(k => delete eventHandlers[k]);
  }),
  disconnect: jest.fn(),
  connect: jest.fn(),
  connected: false,
  disconnected: true,
  id: 'mock-socket-id',
  io: { engine: { transport: { name: 'websocket' } }, uri: 'ws://localhost:3000' },
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// ─── Mock dependencies ────────────────────────────────────────────────────────

const mockGetAuthToken = jest.fn(() => 'jwt-token');
const mockGetAnonymousSession = jest.fn(() => null);
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/utils/client-message-id', () => ({
  generateClientMessageId: jest.fn(() => 'generated-msg-id'),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

let webSocketService: {
  joinConversation: (id: string) => void;
  leaveConversation: (id: string) => void;
  sendMessage: (convId: string, content: string, lang: string, replyToId?: string, clientMessageId?: string) => Promise<boolean>;
  sendMessageWithAttachments: (convId: string, content: string, attachmentIds: string[], lang: string, replyToId?: string, clientMsgId?: string) => Promise<boolean>;
  editMessage: (id: string, content: string) => Promise<boolean>;
  deleteMessage: (id: string) => Promise<boolean>;
  addReaction: (msgId: string, emoji: string) => Promise<boolean>;
  removeReaction: (msgId: string, emoji: string) => Promise<boolean>;
  startTyping: (convId: string) => void;
  stopTyping: (convId: string) => void;
  onNewMessage: (listener: unknown) => () => void;
  onMessageEdited: (listener: unknown) => () => void;
  onMessageDeleted: (listener: unknown) => () => void;
  onTranslation: (listener: unknown) => () => void;
  onTyping: (listener: unknown) => () => void;
  onUserStatus: (listener: unknown) => () => void;
  onAuthenticated: (listener: unknown) => () => void;
  onReactionAdded: (listener: unknown) => () => void;
  onReactionRemoved: (listener: unknown) => () => void;
  isConnected: () => boolean;
  getConnectionStatus: () => { isConnected: boolean; socketId: string | undefined; authenticated: boolean };
  getDiagnostics: () => Record<string, unknown>;
  reconnect: () => void;
};

beforeAll(async () => {
  jest.useFakeTimers();
  const module = await import('@/services/websocket.service');
  webSocketService = module.webSocketService as typeof webSocketService;
  // Advance past the 100ms autoConnect timeout
  jest.advanceTimersByTime(200);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Re-register event handler capture (cleared by clearAllMocks)
  mockSocket.on.mockImplementation((event: string, handler: SocketEventHandler) => {
    eventHandlers[event] = eventHandlers[event] || [];
    eventHandlers[event].push(handler);
  });
  mockSocket.removeAllListeners.mockImplementation(() => {
    Object.keys(eventHandlers).forEach(k => delete eventHandlers[k]);
  });
});

// Helper to simulate socket events
const triggerEvent = (event: string, ...args: unknown[]) => {
  (eventHandlers[event] || []).forEach(h => h(...args));
};

// ─── isConnected ──────────────────────────────────────────────────────────────

describe('isConnected', () => {
  it('returns false when socket is not connected', () => {
    mockSocket.connected = false;
    expect(webSocketService.isConnected()).toBe(false);
  });

  it('returns false when socket is connected but not authenticated', () => {
    mockSocket.connected = true;
    // isAuthenticated is internal, so we can only test via the public state
    // The socket starts disconnected; after the auth event with success we become authenticated
    // Since we don't trigger authenticated in this test, it remains false
    expect(webSocketService.isConnected()).toBe(false);
    mockSocket.connected = false;
  });
});

// ─── getConnectionStatus ──────────────────────────────────────────────────────

describe('getConnectionStatus', () => {
  it('returns a status object with expected shape', () => {
    const status = webSocketService.getConnectionStatus();
    expect(status).toHaveProperty('isConnected');
    expect(status).toHaveProperty('socketId');
    expect(status).toHaveProperty('authenticated');
  });

  it('isConnected is false when socket.connected is false', () => {
    mockSocket.connected = false;
    expect(webSocketService.getConnectionStatus().isConnected).toBe(false);
  });
});

// ─── getDiagnostics ───────────────────────────────────────────────────────────

describe('getDiagnostics', () => {
  it('returns diagnostic object with expected keys', () => {
    const diag = webSocketService.getDiagnostics();
    expect(diag).toHaveProperty('isConnected');
    expect(diag).toHaveProperty('hasSocket');
    expect(diag).toHaveProperty('authenticated');
    expect(diag).toHaveProperty('listenersCount');
  });

  it('hasSocket is true after module init', () => {
    expect(webSocketService.getDiagnostics().hasSocket).toBe(true);
  });
});

// ─── joinConversation ─────────────────────────────────────────────────────────

describe('joinConversation', () => {
  it('defers join when socket is not connected', () => {
    mockSocket.connected = false;
    webSocketService.joinConversation('conv-1');
    expect(mockSocket.emit).not.toHaveBeenCalledWith(expect.stringContaining('conversation:join'), expect.anything());
  });

  it('emits join event when socket is connected and authenticated', () => {
    mockSocket.connected = true;
    // Simulate authentication by triggering the authenticated event handler
    // The service listens for SERVER_EVENTS.AUTHENTICATED which is 'authenticated'
    triggerEvent('authenticated', { success: true });
    webSocketService.joinConversation('conv-abc');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      expect.stringContaining('conversation'),
      expect.objectContaining({ conversationId: 'conv-abc' })
    );
    mockSocket.connected = false;
  });
});

// ─── leaveConversation ────────────────────────────────────────────────────────

describe('leaveConversation', () => {
  it('does nothing when socket is not connected', () => {
    mockSocket.connected = false;
    webSocketService.leaveConversation('conv-1');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('emits leave event when socket is connected', () => {
    mockSocket.connected = true;
    webSocketService.leaveConversation('conv-2');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      expect.stringContaining('conversation'),
      expect.objectContaining({ conversationId: 'conv-2' })
    );
    mockSocket.connected = false;
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    const result = await webSocketService.sendMessage('conv-1', 'hello', 'en');
    expect(result).toBe(false);
  });

  it('emits message:send event and resolves true on success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    const result = await webSocketService.sendMessage('conv-1', 'hello', 'en');
    expect(result).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });

  it('resolves false when server returns failure', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_event: string, _data: unknown, cb: (r: { success: boolean; error: string }) => void) => {
      cb({ success: false, error: 'server error' });
    });
    const result = await webSocketService.sendMessage('conv-1', 'hello', 'en');
    expect(result).toBe(false);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });

  it('uses provided clientMessageId instead of generating one', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_event: string, data: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
      expect((data as Record<string, string>).clientMessageId).toBe('custom-id');
    });
    await webSocketService.sendMessage('conv-1', 'hello', 'en', undefined, 'custom-id');
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });

  it('resolves false on timeout', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation(() => { /* no callback */ });
    const promise = webSocketService.sendMessage('conv-1', 'hello', 'en');
    jest.advanceTimersByTime(11_000); // past 10s timeout
    const result = await promise;
    expect(result).toBe(false);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

// ─── sendMessageWithAttachments ───────────────────────────────────────────────

describe('sendMessageWithAttachments', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    const result = await webSocketService.sendMessageWithAttachments('conv-1', 'msg', ['att-1'], 'en');
    expect(result).toBe(false);
  });

  it('resolves true on server success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    const result = await webSocketService.sendMessageWithAttachments('conv-1', 'msg', ['att-1'], 'en');
    expect(result).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });

  it('resolves false on server failure', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: false });
    });
    const result = await webSocketService.sendMessageWithAttachments('conv-1', 'msg', ['att-1'], 'en');
    expect(result).toBe(false);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

// ─── editMessage ──────────────────────────────────────────────────────────────

describe('editMessage', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    const result = await webSocketService.editMessage('msg-1', 'new content');
    expect(result).toBe(false);
  });

  it('resolves true on success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    const result = await webSocketService.editMessage('msg-1', 'new content');
    expect(result).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('deleteMessage', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    const result = await webSocketService.deleteMessage('msg-1');
    expect(result).toBe(false);
  });

  it('resolves true on success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    const result = await webSocketService.deleteMessage('msg-1');
    expect(result).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

// ─── addReaction / removeReaction ─────────────────────────────────────────────

describe('addReaction', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    expect(await webSocketService.addReaction('msg-1', '👍')).toBe(false);
  });

  it('resolves true on success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    expect(await webSocketService.addReaction('msg-1', '👍')).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

describe('removeReaction', () => {
  it('returns false when socket is not connected', async () => {
    mockSocket.connected = false;
    expect(await webSocketService.removeReaction('msg-1', '👍')).toBe(false);
  });

  it('resolves true on success', async () => {
    mockSocket.connected = true;
    mockSocket.emit.mockImplementation((_e: string, _d: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });
    expect(await webSocketService.removeReaction('msg-1', '👍')).toBe(true);
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
  });
});

// ─── typing ───────────────────────────────────────────────────────────────────

describe('startTyping / stopTyping', () => {
  it('does nothing when socket is not connected', () => {
    mockSocket.connected = false;
    webSocketService.startTyping('conv-1');
    webSocketService.stopTyping('conv-1');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('emits typing start event when connected', () => {
    mockSocket.connected = true;
    webSocketService.startTyping('conv-1');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      expect.stringContaining('typing'),
      expect.objectContaining({ conversationId: 'conv-1' })
    );
    mockSocket.connected = false;
  });

  it('emits typing stop event when connected', () => {
    mockSocket.connected = true;
    webSocketService.stopTyping('conv-1');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      expect.stringContaining('typing'),
      expect.objectContaining({ conversationId: 'conv-1' })
    );
    mockSocket.connected = false;
  });
});

// ─── Event listeners ─────────────────────────────────────────────────────────

describe('event listener registration', () => {
  it('onNewMessage registers and returns an unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = webSocketService.onNewMessage(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onMessageEdited registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onMessageEdited(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onMessageDeleted registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onMessageDeleted(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onTranslation registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onTranslation(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onTyping registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onTyping(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onUserStatus registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onUserStatus(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onAuthenticated registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onAuthenticated(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onReactionAdded registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onReactionAdded(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('onReactionRemoved registers and returns an unsubscribe function', () => {
    const unsub = webSocketService.onReactionRemoved(jest.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('unsubscribe prevents listener from being called', () => {
    const listener = jest.fn();
    const unsub = webSocketService.onNewMessage(listener);
    unsub();
    // Trigger message:new event — listener should NOT be called
    triggerEvent('message:new', { id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'hi', createdAt: new Date().toISOString() });
    expect(listener).not.toHaveBeenCalled();
  });

  it('onNewMessage listener is called when message:new event fires', () => {
    const listener = jest.fn();
    const unsub = webSocketService.onNewMessage(listener);
    triggerEvent('message:new', {
      id: 'm2', conversationId: 'c1', senderId: 'u1',
      content: 'hello', createdAt: new Date().toISOString()
    });
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
