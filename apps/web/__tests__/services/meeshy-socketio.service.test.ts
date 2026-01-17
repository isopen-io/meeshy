/**
 * Tests for MeeshySocketIOService
 *
 * Tests the exported singleton and its public API
 * Note: Due to the complexity of Socket.IO and the singleton pattern,
 * we test the service through its exported interface
 */

// Mock all dependencies before any imports
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => null),
    getAnonymousSession: jest.fn(() => null),
    logout: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  getWebSocketUrl: jest.fn(() => 'wss://test.meeshy.me'),
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
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

jest.mock('@/utils/conversation-id-utils', () => ({
  logConversationIdDebug: jest.fn(),
  getConversationIdType: jest.fn((id: string) => {
    if (/^[a-f0-9]{24}$/i.test(id)) return 'objectId';
    return 'identifier';
  }),
  getConversationApiId: jest.fn((conv: any) => {
    if (typeof conv === 'string') return conv;
    return conv.id || conv._id;
  }),
}));

// Mock Socket.IO
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
    connected: false,
    disconnected: true,
    id: 'socket-id-123',
    io: {
      engine: {
        transport: {
          name: 'websocket',
        },
      },
    },
  })),
}));

describe('MeeshySocketIOService', () => {
  // Import after mocks are set up
  let meeshySocketIOService: any;
  let getSocketIOService: () => any;

  beforeAll(async () => {
    // Dynamic import after mocks
    const module = await import('@/services/meeshy-socketio.service');
    meeshySocketIOService = module.meeshySocketIOService;
    getSocketIOService = module.getSocketIOService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Export', () => {
    it('should export meeshySocketIOService', () => {
      expect(meeshySocketIOService).toBeDefined();
    });

    it('should export getSocketIOService function', () => {
      expect(typeof getSocketIOService).toBe('function');
    });

    it('should return the same instance from getSocketIOService', () => {
      const instance1 = getSocketIOService();
      const instance2 = getSocketIOService();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Public API availability', () => {
    it('should have joinConversation method', () => {
      expect(typeof meeshySocketIOService.joinConversation).toBe('function');
    });

    it('should have leaveConversation method', () => {
      expect(typeof meeshySocketIOService.leaveConversation).toBe('function');
    });

    it('should have sendMessage method', () => {
      expect(typeof meeshySocketIOService.sendMessage).toBe('function');
    });

    it('should have editMessage method', () => {
      expect(typeof meeshySocketIOService.editMessage).toBe('function');
    });

    it('should have deleteMessage method', () => {
      expect(typeof meeshySocketIOService.deleteMessage).toBe('function');
    });

    it('should have startTyping method', () => {
      expect(typeof meeshySocketIOService.startTyping).toBe('function');
    });

    it('should have stopTyping method', () => {
      expect(typeof meeshySocketIOService.stopTyping).toBe('function');
    });

    it('should have setCurrentUser method', () => {
      expect(typeof meeshySocketIOService.setCurrentUser).toBe('function');
    });

    it('should have cleanup method', () => {
      expect(typeof meeshySocketIOService.cleanup).toBe('function');
    });

    it('should have onNewMessage method', () => {
      expect(typeof meeshySocketIOService.onNewMessage).toBe('function');
    });

    it('should have onMessageEdited method', () => {
      expect(typeof meeshySocketIOService.onMessageEdited).toBe('function');
    });

    it('should have onMessageDeleted method', () => {
      expect(typeof meeshySocketIOService.onMessageDeleted).toBe('function');
    });

    it('should have onTranslation method', () => {
      expect(typeof meeshySocketIOService.onTranslation).toBe('function');
    });

    it('should have onTyping method', () => {
      expect(typeof meeshySocketIOService.onTyping).toBe('function');
    });

    it('should have onUserStatus method', () => {
      expect(typeof meeshySocketIOService.onUserStatus).toBe('function');
    });

    it('should have onReactionAdded method', () => {
      expect(typeof meeshySocketIOService.onReactionAdded).toBe('function');
    });

    it('should have getConnectionStatus method', () => {
      expect(typeof meeshySocketIOService.getConnectionStatus).toBe('function');
    });

    it('should have getCurrentConversationId method', () => {
      expect(typeof meeshySocketIOService.getCurrentConversationId).toBe('function');
    });
  });

  describe('Event listener registration', () => {
    it('should return unsubscribe function from onNewMessage', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onNewMessage(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function from onMessageEdited', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onMessageEdited(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function from onMessageDeleted', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onMessageDeleted(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function from onTranslation', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onTranslation(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function from onTyping', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onTyping(listener);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function from onUserStatus', () => {
      const listener = jest.fn();
      const unsubscribe = meeshySocketIOService.onUserStatus(listener);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Connection status', () => {
    it('should return connection status object', () => {
      const status = meeshySocketIOService.getConnectionStatus();

      expect(status).toHaveProperty('isConnected');
      expect(status).toHaveProperty('hasSocket');
      expect(typeof status.isConnected).toBe('boolean');
    });
  });

  describe('Conversation ID tracking', () => {
    it('should return null when no conversation joined', () => {
      // After cleanup, should be null
      meeshySocketIOService.cleanup();
      const id = meeshySocketIOService.getCurrentConversationId();
      expect(id).toBeNull();
    });
  });

  describe('Encryption handlers', () => {
    it('should have setEncryptionHandlers method', () => {
      expect(typeof meeshySocketIOService.setEncryptionHandlers).toBe('function');
    });

    it('should have clearEncryptionHandlers method', () => {
      expect(typeof meeshySocketIOService.clearEncryptionHandlers).toBe('function');
    });

    it('should have isConversationEncrypted method', () => {
      expect(typeof meeshySocketIOService.isConversationEncrypted).toBe('function');
    });

    it('should return false for isConversationEncrypted when no handler set', async () => {
      meeshySocketIOService.clearEncryptionHandlers();
      const result = await meeshySocketIOService.isConversationEncrypted('conv-123');
      expect(result).toBe(false);
    });
  });

  describe('Diagnostics', () => {
    it('should have getConnectionDiagnostics method', () => {
      expect(typeof meeshySocketIOService.getConnectionDiagnostics).toBe('function');
    });

    it('should return diagnostics object', () => {
      const diagnostics = meeshySocketIOService.getConnectionDiagnostics();

      expect(diagnostics).toHaveProperty('isConnected');
      expect(diagnostics).toHaveProperty('hasSocket');
      expect(diagnostics).toHaveProperty('hasToken');
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources without throwing', () => {
      expect(() => meeshySocketIOService.cleanup()).not.toThrow();
    });

    it('should reset connection status after cleanup', () => {
      meeshySocketIOService.cleanup();
      const status = meeshySocketIOService.getConnectionStatus();
      expect(status.isConnected).toBe(false);
    });
  });
});
