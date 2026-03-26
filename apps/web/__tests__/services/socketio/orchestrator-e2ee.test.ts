/**
 * Tests for SocketIOOrchestrator E2EE handler wiring
 * Verifies that encryption handlers are set on authentication
 */

// Mock e2eeCrypto before import
const mockCreateEncryptionHandlers = jest.fn().mockReturnValue({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  getConversationMode: jest.fn(),
});
const mockInitializeForUser = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/encryption/e2ee-crypto', () => ({
  e2eeCrypto: {
    createEncryptionHandlers: mockCreateEncryptionHandlers,
    initializeForUser: mockInitializeForUser,
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Mock ConnectionService
const mockGetSocket = jest.fn();
const mockConnect = jest.fn();
const mockSetupConnectionListeners = jest.fn();
const mockInitializeConnection = jest.fn();
const mockSetCurrentUserConnection = jest.fn();
const mockGetConnectionStatus = jest.fn().mockReturnValue({ isConnected: false, hasSocket: false, currentUser: '' });
const mockJoinConversation = jest.fn();
const mockLeaveConversation = jest.fn();
const mockReconnect = jest.fn();
const mockGetConnectionDiagnostics = jest.fn().mockReturnValue({
  isConnected: false, hasSocket: false, hasToken: false, url: '', reconnectAttempts: 0,
});
const mockCleanupConnection = jest.fn();
const mockSetAutoJoinCallback = jest.fn();
const mockUpdateCurrentConversationId = jest.fn();
const mockGetCurrentConversationId = jest.fn().mockReturnValue(null);

jest.mock('@/services/socketio/connection.service', () => ({
  ConnectionService: jest.fn().mockImplementation(() => ({
    getSocket: mockGetSocket,
    connect: mockConnect,
    setupConnectionListeners: mockSetupConnectionListeners,
    initializeConnection: mockInitializeConnection,
    setCurrentUser: mockSetCurrentUserConnection,
    getConnectionStatus: mockGetConnectionStatus,
    joinConversation: mockJoinConversation,
    leaveConversation: mockLeaveConversation,
    reconnect: mockReconnect,
    getConnectionDiagnostics: mockGetConnectionDiagnostics,
    cleanup: mockCleanupConnection,
    setAutoJoinCallback: mockSetAutoJoinCallback,
    updateCurrentConversationId: mockUpdateCurrentConversationId,
    getCurrentConversationId: mockGetCurrentConversationId,
  })),
}));

// Mock MessagingService
const mockSetEncryptionHandlers = jest.fn();
const mockHasEncryptionHandlers = jest.fn().mockReturnValue(false);
const mockClearEncryptionHandlers = jest.fn();
const mockSetupEventListenersMessaging = jest.fn();
const mockIsConversationEncrypted = jest.fn().mockResolvedValue(false);
const mockGetListenerCounts = jest.fn().mockReturnValue({ message: 0, edit: 0, delete: 0 });
const mockCleanupMessaging = jest.fn();
const mockSetGetMessageByIdCallback = jest.fn();

jest.mock('@/services/socketio/messaging.service', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({
    setEncryptionHandlers: mockSetEncryptionHandlers,
    hasEncryptionHandlers: mockHasEncryptionHandlers,
    clearEncryptionHandlers: mockClearEncryptionHandlers,
    setupEventListeners: mockSetupEventListenersMessaging,
    isConversationEncrypted: mockIsConversationEncrypted,
    getListenerCounts: mockGetListenerCounts,
    cleanup: mockCleanupMessaging,
    setGetMessageByIdCallback: mockSetGetMessageByIdCallback,
    onNewMessage: jest.fn().mockReturnValue(() => {}),
    onMessageEdited: jest.fn().mockReturnValue(() => {}),
    onMessageDeleted: jest.fn().mockReturnValue(() => {}),
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    editMessage: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
  })),
}));

// Mock TypingService
jest.mock('@/services/socketio/typing.service', () => ({
  TypingService: jest.fn().mockImplementation(() => ({
    setupEventListeners: jest.fn(),
    cleanup: jest.fn(),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
    onTyping: jest.fn().mockReturnValue(() => {}),
    onTypingStart: jest.fn().mockReturnValue(() => {}),
    onTypingStop: jest.fn().mockReturnValue(() => {}),
    getListenerCount: jest.fn().mockReturnValue(0),
  })),
}));

// Mock PresenceService
jest.mock('@/services/socketio/presence.service', () => ({
  PresenceService: jest.fn().mockImplementation(() => ({
    setupEventListeners: jest.fn(),
    cleanup: jest.fn(),
    onUserStatus: jest.fn().mockReturnValue(() => {}),
    onConversationStats: jest.fn().mockReturnValue(() => {}),
    onConversationOnlineStats: jest.fn().mockReturnValue(() => {}),
    onReactionAdded: jest.fn().mockReturnValue(() => {}),
    onReactionRemoved: jest.fn().mockReturnValue(() => {}),
    onConversationJoined: jest.fn().mockReturnValue(() => {}),
    onUnreadUpdated: jest.fn().mockReturnValue(() => {}),
    getListenerCount: jest.fn().mockReturnValue(0),
  })),
}));

// Mock TranslationService
jest.mock('@/services/socketio/translation.service', () => ({
  TranslationService: jest.fn().mockImplementation(() => ({
    setupEventListeners: jest.fn(),
    cleanup: jest.fn(),
    onTranslation: jest.fn().mockReturnValue(() => {}),
    onAudioTranslation: jest.fn().mockReturnValue(() => {}),
    onTranscription: jest.fn().mockReturnValue(() => {}),
    onAudioTranslationsProgressive: jest.fn().mockReturnValue(() => {}),
    onAudioTranslationsCompleted: jest.fn().mockReturnValue(() => {}),
    getListenerCount: jest.fn().mockReturnValue(0),
  })),
}));

// Mock auth-manager to avoid dynamic require issues
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn().mockReturnValue('test-token'),
    getAnonymousSession: jest.fn().mockReturnValue(null),
  },
}));

describe('SocketIOOrchestrator E2EE', () => {
  let orchestrator: import('@/services/socketio/orchestrator.service').SocketIOOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    const mod = require('@/services/socketio/orchestrator.service');
    (mod.SocketIOOrchestrator as any).instance = null;
    orchestrator = mod.SocketIOOrchestrator.getInstance();
  });

  it('sets encryption handlers after authentication when none exist', () => {
    const fakeSocket = { connected: true, on: jest.fn(), emit: jest.fn() };
    mockGetSocket.mockReturnValue(fakeSocket);
    mockHasEncryptionHandlers.mockReturnValue(false);

    // Capture the onAuthenticated callback
    mockSetupConnectionListeners.mockImplementation(
      (onAuth: () => void, _onDisconnect: unknown, _onError: unknown) => {
        onAuth();
      }
    );

    orchestrator.initializeConnection();

    expect(mockHasEncryptionHandlers).toHaveBeenCalled();
    expect(mockCreateEncryptionHandlers).toHaveBeenCalled();
    expect(mockSetEncryptionHandlers).toHaveBeenCalled();
  });

  it('does not overwrite existing encryption handlers', () => {
    const fakeSocket = { connected: true, on: jest.fn(), emit: jest.fn() };
    mockGetSocket.mockReturnValue(fakeSocket);
    mockHasEncryptionHandlers.mockReturnValue(true);

    mockSetupConnectionListeners.mockImplementation(
      (onAuth: () => void, _onDisconnect: unknown, _onError: unknown) => {
        onAuth();
      }
    );

    orchestrator.initializeConnection();

    expect(mockHasEncryptionHandlers).toHaveBeenCalled();
    expect(mockCreateEncryptionHandlers).not.toHaveBeenCalled();
    expect(mockSetEncryptionHandlers).not.toHaveBeenCalled();
  });

  it('initializes E2EE for the current user on authentication', () => {
    const fakeSocket = { connected: true, on: jest.fn(), emit: jest.fn() };
    mockGetSocket.mockReturnValue(fakeSocket);
    mockHasEncryptionHandlers.mockReturnValue(false);

    // Set current user ID via direct property access (simulating setCurrentUser)
    (orchestrator as any).currentUserId = 'user-xyz';

    mockSetupConnectionListeners.mockImplementation(
      (onAuth: () => void, _onDisconnect: unknown, _onError: unknown) => {
        onAuth();
      }
    );

    orchestrator.initializeConnection();

    expect(mockInitializeForUser).toHaveBeenCalledWith('user-xyz');
  });

  it('handlers returned by createEncryptionHandlers contain encrypt/decrypt/getConversationMode', () => {
    const handlers = mockCreateEncryptionHandlers();

    expect(handlers).toHaveProperty('encrypt');
    expect(handlers).toHaveProperty('decrypt');
    expect(handlers).toHaveProperty('getConversationMode');
  });
});
