/**
 * Tests for SocketIOOrchestrator
 * Achieves ≥92% line+branch coverage on orchestrator.service.ts
 */

// ─── Hoistable mock variables (jest.fn() only — no object literals) ──────────

// ConnectionService mocks
const mockConnInitializeConnection = jest.fn();
const mockConnGetSocket = jest.fn();
const mockConnSetupConnectionListeners = jest.fn();
const mockConnConnect = jest.fn();
const mockConnSetAutoJoinCallback = jest.fn();
const mockConnSetCurrentUser = jest.fn();
const mockConnJoinConversation = jest.fn();
const mockConnLeaveConversation = jest.fn();
const mockConnReconnect = jest.fn();
const mockConnDisconnectForUpdate = jest.fn();
const mockConnGetConnectionStatus = jest.fn();
const mockConnGetConnectionDiagnostics = jest.fn();
const mockConnOnStatusChange = jest.fn();
const mockConnUpdateCurrentConversationId = jest.fn();
const mockConnGetCurrentConversationId = jest.fn();
const mockConnCleanup = jest.fn();

// MessagingService mocks
const mockMsgHasEncryptionHandlers = jest.fn();
const mockMsgSetEncryptionHandlers = jest.fn();
const mockMsgClearEncryptionHandlers = jest.fn();
const mockMsgIsConversationEncrypted = jest.fn();
const mockMsgSetCurrentUserId = jest.fn();
const mockMsgSetupEventListeners = jest.fn();
const mockMsgSendMessage = jest.fn();
const mockMsgEditMessage = jest.fn();
const mockMsgDeleteMessage = jest.fn();
const mockMsgOnNewMessage = jest.fn();
const mockMsgOnMessageEdited = jest.fn();
const mockMsgOnMessageDeleted = jest.fn();
const mockMsgOnAttachmentStatusUpdated = jest.fn();
const mockMsgGetListenerCounts = jest.fn();
const mockMsgSetGetMessageByIdCallback = jest.fn();
const mockMsgCleanup = jest.fn();

// TypingService mocks
const mockTypSetupEventListeners = jest.fn();
const mockTypStartTyping = jest.fn();
const mockTypStopTyping = jest.fn();
const mockTypOnTyping = jest.fn();
const mockTypOnTypingStart = jest.fn();
const mockTypOnTypingStop = jest.fn();
const mockTypGetListenerCount = jest.fn();
const mockTypCleanup = jest.fn();
const mockTypClearAllTypingState = jest.fn();
const mockTypClearConversationTypingState = jest.fn();

// PresenceService mocks
const mockPresSetupEventListeners = jest.fn();
const mockPresOnUserStatus = jest.fn();
const mockPresOnPresenceSnapshot = jest.fn();
const mockPresOnConversationStats = jest.fn();
const mockPresOnConversationOnlineStats = jest.fn();
const mockPresOnReactionAdded = jest.fn();
const mockPresOnReactionRemoved = jest.fn();
const mockPresOnConversationJoined = jest.fn();
const mockPresOnConversationLeft = jest.fn();
const mockPresOnUnreadUpdated = jest.fn();
const mockPresOnParticipantRoleUpdated = jest.fn();
const mockPresGetListenerCount = jest.fn();
const mockPresCleanup = jest.fn();

// TranslationService mocks
const mockTransSetupEventListeners = jest.fn();
const mockTransOnTranslation = jest.fn();
const mockTransOnAudioTranslation = jest.fn();
const mockTransOnTranscription = jest.fn();
const mockTransOnAudioTranslationsProgressive = jest.fn();
const mockTransOnAudioTranslationsCompleted = jest.fn();
const mockTransGetListenerCount = jest.fn();
const mockTransCleanup = jest.fn();

// PreferencesSyncService mocks
const mockPrefSetupEventListeners = jest.fn();
const mockPrefOnPreferencesUpdated = jest.fn();
const mockPrefCleanup = jest.fn();

// e2eeCrypto mocks
const mockE2eeCreateEncryptionHandlers = jest.fn();
const mockE2eeInitializeForUser = jest.fn();

// generateClientMessageId mock
const mockGenerateClientMessageId = jest.fn();

// authManager mocks
const mockAuthGetAuthToken = jest.fn();
const mockAuthGetAnonymousSession = jest.fn();

// getConversationApiId mock
const mockGetConversationApiId = jest.fn();

// toast mock
const mockToast = jest.fn();

// logger mock
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();

// ─── jest.mock() calls ────────────────────────────────────────────────────────

jest.mock('@/services/socketio/connection.service', () => ({
  ConnectionService: jest.fn(() => ({
    initializeConnection: (...args: unknown[]) => mockConnInitializeConnection(...args),
    getSocket: (...args: unknown[]) => mockConnGetSocket(...args),
    setupConnectionListeners: (...args: unknown[]) => mockConnSetupConnectionListeners(...args),
    connect: (...args: unknown[]) => mockConnConnect(...args),
    setAutoJoinCallback: (...args: unknown[]) => mockConnSetAutoJoinCallback(...args),
    setCurrentUser: (...args: unknown[]) => mockConnSetCurrentUser(...args),
    joinConversation: (...args: unknown[]) => mockConnJoinConversation(...args),
    leaveConversation: (...args: unknown[]) => mockConnLeaveConversation(...args),
    reconnect: (...args: unknown[]) => mockConnReconnect(...args),
    disconnectForUpdate: (...args: unknown[]) => mockConnDisconnectForUpdate(...args),
    getConnectionStatus: (...args: unknown[]) => mockConnGetConnectionStatus(...args),
    getConnectionDiagnostics: (...args: unknown[]) => mockConnGetConnectionDiagnostics(...args),
    onStatusChange: (...args: unknown[]) => mockConnOnStatusChange(...args),
    updateCurrentConversationId: (...args: unknown[]) => mockConnUpdateCurrentConversationId(...args),
    getCurrentConversationId: (...args: unknown[]) => mockConnGetCurrentConversationId(...args),
    cleanup: (...args: unknown[]) => mockConnCleanup(...args),
  })),
}));

jest.mock('@/services/socketio/messaging.service', () => ({
  MessagingService: jest.fn(() => ({
    hasEncryptionHandlers: (...args: unknown[]) => mockMsgHasEncryptionHandlers(...args),
    setEncryptionHandlers: (...args: unknown[]) => mockMsgSetEncryptionHandlers(...args),
    clearEncryptionHandlers: (...args: unknown[]) => mockMsgClearEncryptionHandlers(...args),
    isConversationEncrypted: (...args: unknown[]) => mockMsgIsConversationEncrypted(...args),
    setCurrentUserId: (...args: unknown[]) => mockMsgSetCurrentUserId(...args),
    setupEventListeners: (...args: unknown[]) => mockMsgSetupEventListeners(...args),
    sendMessage: (...args: unknown[]) => mockMsgSendMessage(...args),
    editMessage: (...args: unknown[]) => mockMsgEditMessage(...args),
    deleteMessage: (...args: unknown[]) => mockMsgDeleteMessage(...args),
    onNewMessage: (...args: unknown[]) => mockMsgOnNewMessage(...args),
    onMessageEdited: (...args: unknown[]) => mockMsgOnMessageEdited(...args),
    onMessageDeleted: (...args: unknown[]) => mockMsgOnMessageDeleted(...args),
    onAttachmentStatusUpdated: (...args: unknown[]) => mockMsgOnAttachmentStatusUpdated(...args),
    getListenerCounts: (...args: unknown[]) => mockMsgGetListenerCounts(...args),
    setGetMessageByIdCallback: (...args: unknown[]) => mockMsgSetGetMessageByIdCallback(...args),
    cleanup: (...args: unknown[]) => mockMsgCleanup(...args),
  })),
}));

jest.mock('@/services/socketio/typing.service', () => ({
  TypingService: jest.fn(() => ({
    setupEventListeners: (...args: unknown[]) => mockTypSetupEventListeners(...args),
    startTyping: (...args: unknown[]) => mockTypStartTyping(...args),
    stopTyping: (...args: unknown[]) => mockTypStopTyping(...args),
    onTyping: (...args: unknown[]) => mockTypOnTyping(...args),
    onTypingStart: (...args: unknown[]) => mockTypOnTypingStart(...args),
    onTypingStop: (...args: unknown[]) => mockTypOnTypingStop(...args),
    getListenerCount: (...args: unknown[]) => mockTypGetListenerCount(...args),
    cleanup: (...args: unknown[]) => mockTypCleanup(...args),
    clearAllTypingState: (...args: unknown[]) => mockTypClearAllTypingState(...args),
    clearConversationTypingState: (...args: unknown[]) => mockTypClearConversationTypingState(...args),
  })),
}));

jest.mock('@/services/socketio/presence.service', () => ({
  PresenceService: jest.fn(() => ({
    setupEventListeners: (...args: unknown[]) => mockPresSetupEventListeners(...args),
    onUserStatus: (...args: unknown[]) => mockPresOnUserStatus(...args),
    onPresenceSnapshot: (...args: unknown[]) => mockPresOnPresenceSnapshot(...args),
    onConversationStats: (...args: unknown[]) => mockPresOnConversationStats(...args),
    onConversationOnlineStats: (...args: unknown[]) => mockPresOnConversationOnlineStats(...args),
    onReactionAdded: (...args: unknown[]) => mockPresOnReactionAdded(...args),
    onReactionRemoved: (...args: unknown[]) => mockPresOnReactionRemoved(...args),
    onConversationJoined: (...args: unknown[]) => mockPresOnConversationJoined(...args),
    onConversationLeft: (...args: unknown[]) => mockPresOnConversationLeft(...args),
    onUnreadUpdated: (...args: unknown[]) => mockPresOnUnreadUpdated(...args),
    onParticipantRoleUpdated: (...args: unknown[]) => mockPresOnParticipantRoleUpdated(...args),
    getListenerCount: (...args: unknown[]) => mockPresGetListenerCount(...args),
    cleanup: (...args: unknown[]) => mockPresCleanup(...args),
  })),
}));

jest.mock('@/services/socketio/translation.service', () => ({
  TranslationService: jest.fn(() => ({
    setupEventListeners: (...args: unknown[]) => mockTransSetupEventListeners(...args),
    onTranslation: (...args: unknown[]) => mockTransOnTranslation(...args),
    onAudioTranslation: (...args: unknown[]) => mockTransOnAudioTranslation(...args),
    onTranscription: (...args: unknown[]) => mockTransOnTranscription(...args),
    onAudioTranslationsProgressive: (...args: unknown[]) => mockTransOnAudioTranslationsProgressive(...args),
    onAudioTranslationsCompleted: (...args: unknown[]) => mockTransOnAudioTranslationsCompleted(...args),
    getListenerCount: (...args: unknown[]) => mockTransGetListenerCount(...args),
    cleanup: (...args: unknown[]) => mockTransCleanup(...args),
  })),
}));

jest.mock('@/services/socketio/preferences-sync.service', () => ({
  PreferencesSyncService: jest.fn(() => ({
    setupEventListeners: (...args: unknown[]) => mockPrefSetupEventListeners(...args),
    onPreferencesUpdated: (...args: unknown[]) => mockPrefOnPreferencesUpdated(...args),
    cleanup: (...args: unknown[]) => mockPrefCleanup(...args),
  })),
}));

jest.mock('@/lib/encryption/e2ee-crypto', () => ({
  e2eeCrypto: {
    createEncryptionHandlers: (...args: unknown[]) => mockE2eeCreateEncryptionHandlers(...args),
    initializeForUser: (...args: unknown[]) => mockE2eeInitializeForUser(...args),
  },
}));

jest.mock('@/utils/client-message-id', () => ({
  generateClientMessageId: (...args: unknown[]) => mockGenerateClientMessageId(...args),
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: unknown[]) => mockAuthGetAuthToken(...args),
    getAnonymousSession: (...args: unknown[]) => mockAuthGetAnonymousSession(...args),
  },
}));

jest.mock('@/utils/conversation-id-utils', () => ({
  getConversationApiId: (...args: unknown[]) => mockGetConversationApiId(...args),
}));

jest.mock('sonner', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { SocketIOOrchestrator } from '@/services/socketio/orchestrator.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', username: 'alice', ...overrides } as any;
}

function makeConnectedSocket() {
  return { connected: true, id: 'socket-1' } as any;
}

function makeDisconnectedSocket() {
  return { connected: false, id: 'socket-2' } as any;
}

function resetSingleton() {
  (SocketIOOrchestrator as any)['instance'] = null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SocketIOOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetSingleton();

    // Defaults
    mockConnGetSocket.mockReturnValue(null);
    mockConnGetConnectionStatus.mockReturnValue('disconnected');
    mockConnGetConnectionDiagnostics.mockReturnValue({
      status: 'disconnected',
      isConnected: false,
      hasSocket: false,
      reconnectAttempts: 0,
      transport: 'unknown',
      socketId: null,
    });
    mockMsgGetListenerCounts.mockReturnValue({ message: 0, edit: 0, delete: 0 });
    mockMsgHasEncryptionHandlers.mockReturnValue(false);
    mockMsgIsConversationEncrypted.mockResolvedValue(false);
    mockE2eeCreateEncryptionHandlers.mockReturnValue({ encrypt: jest.fn(), decrypt: jest.fn() });
    mockE2eeInitializeForUser.mockResolvedValue(undefined);
    mockGenerateClientMessageId.mockReturnValue('cid_generated');
    mockAuthGetAuthToken.mockReturnValue('token-xyz');
    mockAuthGetAnonymousSession.mockReturnValue(null);
    mockConnOnStatusChange.mockReturnValue(jest.fn());
    mockMsgOnNewMessage.mockReturnValue(jest.fn());
    mockMsgOnMessageEdited.mockReturnValue(jest.fn());
    mockMsgOnMessageDeleted.mockReturnValue(jest.fn());
    mockMsgOnAttachmentStatusUpdated.mockReturnValue(jest.fn());
    mockTransOnTranslation.mockReturnValue(jest.fn());
    mockTransOnAudioTranslation.mockReturnValue(jest.fn());
    mockTransOnTranscription.mockReturnValue(jest.fn());
    mockTransOnAudioTranslationsProgressive.mockReturnValue(jest.fn());
    mockTransOnAudioTranslationsCompleted.mockReturnValue(jest.fn());
    mockTypOnTyping.mockReturnValue(jest.fn());
    mockTypOnTypingStart.mockReturnValue(jest.fn());
    mockTypOnTypingStop.mockReturnValue(jest.fn());
    mockPresOnUserStatus.mockReturnValue(jest.fn());
    mockPresOnPresenceSnapshot.mockReturnValue(jest.fn());
    mockPresOnConversationStats.mockReturnValue(jest.fn());
    mockPresOnConversationOnlineStats.mockReturnValue(jest.fn());
    mockPresOnReactionAdded.mockReturnValue(jest.fn());
    mockPresOnReactionRemoved.mockReturnValue(jest.fn());
    mockPresOnConversationJoined.mockReturnValue(jest.fn());
    mockPresOnConversationLeft.mockReturnValue(jest.fn());
    mockPresOnUnreadUpdated.mockReturnValue(jest.fn());
    mockPresOnParticipantRoleUpdated.mockReturnValue(jest.fn());
    mockPrefOnPreferencesUpdated.mockReturnValue(jest.fn());
    mockTypGetListenerCount.mockReturnValue(0);
    mockPresGetListenerCount.mockReturnValue(0);
    mockTransGetListenerCount.mockReturnValue(0);
    mockConnGetCurrentConversationId.mockReturnValue(null);
  });

  afterEach(() => {
    // Clean up any pending messages to avoid timer leaks
    const instance = (SocketIOOrchestrator as any)['instance'];
    if (instance) {
      instance.cleanup();
    }
    jest.useRealTimers();
  });

  // ─── getInstance (singleton) ───────────────────────────────────────────────

  describe('getInstance', () => {
    it('returns the same instance on multiple calls', () => {
      const a = SocketIOOrchestrator.getInstance();
      const b = SocketIOOrchestrator.getInstance();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      const a = SocketIOOrchestrator.getInstance();
      resetSingleton();
      const b = SocketIOOrchestrator.getInstance();
      expect(a).not.toBe(b);
    });
  });

  // ─── setMessageConverter ───────────────────────────────────────────────────

  describe('setMessageConverter', () => {
    it('stores the converter and uses it during initializeConnection', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const converter = jest.fn();
      orchestrator.setMessageConverter(converter);

      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.initializeConnection();

      expect(mockMsgSetupEventListeners).toHaveBeenCalledWith(socket, converter);
    });

    it('does not call messagingService.setupEventListeners if converter is null', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.initializeConnection();

      expect(mockMsgSetupEventListeners).not.toHaveBeenCalled();
    });
  });

  // ─── initializeConnection ──────────────────────────────────────────────────

  describe('initializeConnection', () => {
    it('returns early when getSocket returns null', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      orchestrator.initializeConnection();

      expect(mockConnSetupConnectionListeners).not.toHaveBeenCalled();
      expect(mockConnConnect).not.toHaveBeenCalled();
    });

    it('calls all setup methods when socket is available', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.initializeConnection();

      expect(mockConnInitializeConnection).toHaveBeenCalledTimes(1);
      expect(mockConnSetupConnectionListeners).toHaveBeenCalledTimes(1);
      expect(mockTypSetupEventListeners).toHaveBeenCalledWith(socket);
      expect(mockPresSetupEventListeners).toHaveBeenCalledWith(socket);
      expect(mockTransSetupEventListeners).toHaveBeenCalledWith(socket);
      expect(mockPrefSetupEventListeners).toHaveBeenCalledWith(socket);
      expect(mockConnConnect).toHaveBeenCalledTimes(1);
    });

    it('passes onAuthenticated callback that triggers encryption handler setup', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(false);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      expect(mockE2eeCreateEncryptionHandlers).toHaveBeenCalledTimes(1);
      expect(mockMsgSetEncryptionHandlers).toHaveBeenCalledTimes(1);
    });

    it('does not set encryption handlers if already set', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      expect(mockMsgSetEncryptionHandlers).not.toHaveBeenCalled();
    });

    it('does not re-register event listeners when called again with the same underlying socket', () => {
      // Regression: ensureConnection()/setCurrentUser() can call initializeConnection()
      // repeatedly (e.g. every sendMessage() while the status flag briefly lags behind
      // socket.connected). connectionService.getSocket() keeps returning the SAME socket
      // instance across those calls — re-running setupEventListeners() on it must not
      // stack duplicate Socket.IO listeners (duplicate messages/receipts/reactions).
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.initializeConnection();
      orchestrator.initializeConnection();
      orchestrator.initializeConnection();

      expect(mockConnSetupConnectionListeners).toHaveBeenCalledTimes(1);
      expect(mockTypSetupEventListeners).toHaveBeenCalledTimes(1);
      expect(mockPresSetupEventListeners).toHaveBeenCalledTimes(1);
      expect(mockTransSetupEventListeners).toHaveBeenCalledTimes(1);
      expect(mockPrefSetupEventListeners).toHaveBeenCalledTimes(1);
    });

    it('re-registers event listeners when the underlying socket instance changes', () => {
      // A brand new socket (e.g. after a full logout/cleanup + re-login) has no
      // listeners attached yet, so it MUST get wired up again.
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socketA = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socketA);
      orchestrator.initializeConnection();

      const socketB = { connected: true, id: 'socket-3' } as any;
      mockConnGetSocket.mockReturnValue(socketB);
      orchestrator.initializeConnection();

      expect(mockConnSetupConnectionListeners).toHaveBeenCalledTimes(2);
      expect(mockTypSetupEventListeners).toHaveBeenCalledTimes(2);
      expect(mockTypSetupEventListeners).toHaveBeenNthCalledWith(2, socketB);
    });
  });

  // ─── onAuthenticated (via initializeConnection callback) ──────────────────

  describe('onAuthenticated', () => {
    it('initializes E2EE for current user when currentUserId is set', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(false);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      // setCurrentUser() triggers the initializeConnection() call that wires up
      // listeners on this (first) socket instance — listeners are only attached
      // once per socket, so the mock must be armed before this call.
      orchestrator.setCurrentUser(makeUser({ id: 'user-e2ee' }));
      capturedOnAuth?.();

      await Promise.resolve();

      expect(mockE2eeInitializeForUser).toHaveBeenCalledWith('user-e2ee');
    });

    it('logs error when E2EE initialization fails', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(false);
      mockE2eeInitializeForUser.mockRejectedValue(new Error('e2ee failed'));

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.setCurrentUser(makeUser({ id: 'user-e2ee-fail' }));
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();

      expect(mockLoggerError).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'E2EE initialization failed',
        expect.any(Object)
      );
    });

    it('does not call initializeForUser when currentUserId is null', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(false);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();

      expect(mockE2eeInitializeForUser).not.toHaveBeenCalled();
    });

    it('processes pending messages on authenticate', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      // Queue a message first (socket null)
      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'hello');

      // Now set up connected socket
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockResolvedValue({ success: true, messageId: 'srv-1' });

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await sendPromise;
      expect(result.success).toBe(true);
    });
  });

  // ─── processPendingMessages ────────────────────────────────────────────────

  describe('processPendingMessages', () => {
    it('returns early when queue is empty', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();

      expect(mockMsgSendMessage).not.toHaveBeenCalled();
    });

    it('returns early when isProcessingQueue is true', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      mockConnGetSocket.mockReturnValue(null);
      orchestrator.sendMessage('conv-1', 'msg1');

      (orchestrator as any).isProcessingQueue = true;

      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();

      expect(mockMsgSendMessage).not.toHaveBeenCalled();
    });

    it('returns early when socket is disconnected during processing', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      mockConnGetSocket.mockReturnValue(null);
      orchestrator.sendMessage('conv-1', 'msg1');

      const disconnectedSocket = makeDisconnectedSocket();
      mockConnGetSocket.mockReturnValue(disconnectedSocket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();

      expect(mockMsgSendMessage).not.toHaveBeenCalled();
    });

    it('discards expired messages and resolves with failure (via individual timeout)', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'expired-msg');

      // Advance time past MESSAGE_QUEUE_TIMEOUT (120000ms)
      jest.advanceTimersByTime(130000);

      // The timeout already resolved the promise
      const result = await sendPromise;
      expect(result.success).toBe(false);
    });

    it('discards messages expired by wall clock during processPendingMessages', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      const now = Date.now();
      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'wall-clock-expired');

      // Advance system time past MESSAGE_QUEUE_TIMEOUT so Date.now() > timestamp + 120000
      jest.setSystemTime(now + 130000);

      // Now trigger processPendingMessages with a connected socket
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();

      const result = await sendPromise;
      expect(result.success).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'Pending message expired, discarding'
      );
    });

    it('processes message with no entry in pendingMessageTimeouts (branch: pendingTimeout falsy)', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);
      mockMsgSendMessage.mockResolvedValue({ success: true });

      // Manually inject a pending message WITHOUT a pendingMessageTimeouts entry
      let resolveMsg!: (r: any) => void;
      const msgPromise = new Promise<any>((res) => { resolveMsg = res; });
      (orchestrator as any).pendingMessages.push({
        conversationId: 'conv-manual',
        content: 'manual-msg',
        clientMessageId: 'manual-cid',
        timestamp: Date.now(),
        resolve: resolveMsg,
      });
      // Do NOT add to pendingMessageTimeouts — so pendingTimeout will be undefined

      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await msgPromise;
      expect(result.success).toBe(true);
    });

    it('logs debug when send result is not successful (result.success false)', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);
      mockMsgSendMessage.mockResolvedValue({ success: false, error: 'some error' });

      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'send-fail-msg');

      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await sendPromise;
      expect(result.success).toBe(false);
      // result.success was false so the success log was NOT called
      expect(mockLoggerDebug).not.toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'Pending message sent successfully'
      );
    });

    it('registers exactly one timeout per queued message (no duplicate timeout leak)', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      const sendPromise = orchestrator.sendMessage('conv-1', 'single-timeout-msg');

      const pendingMessageTimeoutsMap = (orchestrator as any).pendingMessageTimeouts as Map<string, unknown>;
      expect(pendingMessageTimeoutsMap.size).toBe(1);
      expect(pendingMessageTimeoutsMap.has('cid_generated')).toBe(true);

      // Advance time past MESSAGE_QUEUE_TIMEOUT — the single tracked timeout fires
      jest.advanceTimersByTime(130000);

      const result = await sendPromise;
      expect(result.success).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'Message queue timeout, message discarded'
      );
      // After timeout fires, entry is removed from the map
      expect(pendingMessageTimeoutsMap.size).toBe(0);
    });

    it('discards message in processPendingMessages when timestamp is expired', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      // Queue a message with socket null
      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'stale-msg');

      // Advance system clock so Date.now() sees the message as expired,
      // WITHOUT advancing timers (so per-message timeouts don't fire).
      jest.setSystemTime(Date.now() + 130000);

      // Now provide a connected socket
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await sendPromise;
      expect(result.success).toBe(false);
      expect(mockMsgSendMessage).not.toHaveBeenCalled();
    });

    it('resolves pending message with failure when send throws', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgHasEncryptionHandlers.mockReturnValue(true);

      mockConnGetSocket.mockReturnValue(null);
      const sendPromise = orchestrator.sendMessage('conv-1', 'fail-msg');

      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockRejectedValue(new Error('send failed'));

      let capturedOnAuth: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((onAuth: () => void) => {
        capturedOnAuth = onAuth;
      });

      orchestrator.initializeConnection();
      capturedOnAuth?.();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await sendPromise;
      expect(result.success).toBe(false);
    });
  });

  // ─── setCurrentUser ────────────────────────────────────────────────────────

  describe('setCurrentUser', () => {
    it('sets currentUserId and delegates to sub-services', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.setCurrentUser(makeUser({ id: 'user-42' }));

      expect(mockMsgSetCurrentUserId).toHaveBeenCalledWith('user-42');
      expect(mockConnSetCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-42' }));
    });

    it('calls initializeConnection when auth token is present', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockAuthGetAuthToken.mockReturnValue('valid-token');

      orchestrator.setCurrentUser(makeUser());

      expect(mockConnInitializeConnection).toHaveBeenCalled();
    });

    it('calls initializeConnection when anonymous session token is present', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue({ token: 'anon-token' });

      orchestrator.setCurrentUser(makeUser());

      expect(mockConnInitializeConnection).toHaveBeenCalled();
    });

    it('does not call initializeConnection when no tokens available', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue(null);

      orchestrator.setCurrentUser(makeUser());

      expect(mockConnInitializeConnection).not.toHaveBeenCalled();
    });

    it('retry succeeds when auth token becomes available on first attempt', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue(null);

      orchestrator.setCurrentUser(makeUser());

      mockAuthGetAuthToken.mockReturnValue('new-token');

      jest.advanceTimersByTime(200);

      expect(mockConnInitializeConnection).toHaveBeenCalled();
    });

    it('retry succeeds when anonymous token becomes available on second attempt', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue(null);

      orchestrator.setCurrentUser(makeUser());

      jest.advanceTimersByTime(200);
      expect(mockConnInitializeConnection).not.toHaveBeenCalled();

      mockAuthGetAnonymousSession.mockReturnValue({ token: 'anon-token' });
      jest.advanceTimersByTime(200);

      expect(mockConnInitializeConnection).toHaveBeenCalledTimes(1);
    });

    it('stops retry after maxAttempts without token', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue(null);

      orchestrator.setCurrentUser(makeUser());

      jest.advanceTimersByTime(200);
      jest.advanceTimersByTime(200);
      jest.advanceTimersByTime(200);
      jest.advanceTimersByTime(200);

      expect(mockConnInitializeConnection).not.toHaveBeenCalled();
    });
  });

  // ─── ensureConnection ──────────────────────────────────────────────────────

  describe('ensureConnection', () => {
    it('returns early when socket is connected (status=connected)', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockConnGetConnectionStatus.mockReturnValue('connected');

      orchestrator.ensureConnection();

      expect(mockConnInitializeConnection).not.toHaveBeenCalled();
    });

    it('returns early when socket.connected is true', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockConnGetConnectionStatus.mockReturnValue('disconnected');

      orchestrator.ensureConnection();

      expect(mockConnInitializeConnection).not.toHaveBeenCalled();
    });

    it('calls initializeConnection when disconnected and auth token available', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);
      mockConnGetConnectionStatus.mockReturnValue('disconnected');
      mockAuthGetAuthToken.mockReturnValue('valid-token');

      orchestrator.ensureConnection();

      expect(mockConnInitializeConnection).toHaveBeenCalled();
    });

    it('calls initializeConnection when disconnected and session token available', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);
      mockConnGetConnectionStatus.mockReturnValue('disconnected');
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue({ token: 'anon-token' });

      orchestrator.ensureConnection();

      expect(mockConnInitializeConnection).toHaveBeenCalled();
    });

    it('does not call initializeConnection when no tokens available', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);
      mockConnGetConnectionStatus.mockReturnValue('disconnected');
      mockAuthGetAuthToken.mockReturnValue(null);
      mockAuthGetAnonymousSession.mockReturnValue(null);

      orchestrator.ensureConnection();

      expect(mockConnInitializeConnection).not.toHaveBeenCalled();
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('sends directly when socket is connected', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockResolvedValue({ success: true, messageId: 'srv-1' });

      const result = await orchestrator.sendMessage('conv-123456789012345678901234', 'hello');

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({
          conversationId: 'conv-123456789012345678901234',
          content: 'hello',
        })
      );
      expect(result.success).toBe(true);
    });

    it('uses getConversationApiId when conversationOrId is an object', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockGetConversationApiId.mockReturnValue('abc123def456abc123def456');
      mockMsgSendMessage.mockResolvedValue({ success: true });

      const convObj = { id: 'meeshy' };
      await orchestrator.sendMessage(convObj, 'hello');

      expect(mockGetConversationApiId).toHaveBeenCalledWith(convObj);
      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({ conversationId: 'abc123def456abc123def456' })
      );
    });

    it('resolves non-objectId via getCurrentConversationId', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockConnGetCurrentConversationId.mockReturnValue('abc123def456abc123def456');
      mockMsgSendMessage.mockResolvedValue({ success: true });

      await orchestrator.sendMessage('meeshy', 'hello');

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({ conversationId: 'abc123def456abc123def456' })
      );
    });

    it('keeps original non-objectId when getCurrentConversationId returns null', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockConnGetCurrentConversationId.mockReturnValue(null);
      mockMsgSendMessage.mockResolvedValue({ success: true });

      await orchestrator.sendMessage('slug-id', 'hello');

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({ conversationId: 'slug-id' })
      );
    });

    it('uses provided clientMessageId', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockResolvedValue({ success: true });

      await orchestrator.sendMessage('conv-1', 'hi', undefined, undefined, undefined, undefined, undefined, 'cid_custom');

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({ clientMessageId: 'cid_custom' })
      );
    });

    it('generates clientMessageId when not provided', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockResolvedValue({ success: true });
      mockGenerateClientMessageId.mockReturnValue('cid_auto');

      await orchestrator.sendMessage('conv-1', 'hi');

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({ clientMessageId: 'cid_auto' })
      );
    });

    it('queues message when socket is null', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      const promise = orchestrator.sendMessage('conv-1', 'queued');

      expect(orchestrator.getPendingMessagesCount()).toBe(1);

      jest.advanceTimersByTime(130000);
      await promise;
    });

    it('queues message when socket is not connected', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(makeDisconnectedSocket());

      const promise = orchestrator.sendMessage('conv-1', 'queued-disconnected');

      expect(orchestrator.getPendingMessagesCount()).toBe(1);

      jest.advanceTimersByTime(130000);
      await promise;
    });

    it('discards oldest message when queue is full', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      const promises: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(orchestrator.sendMessage('conv-1', `msg-${i}`));
      }

      expect(orchestrator.getPendingMessagesCount()).toBe(50);

      const extraPromise = orchestrator.sendMessage('conv-1', 'extra');

      expect(orchestrator.getPendingMessagesCount()).toBe(50);

      const oldestResult = await promises[0];
      expect(oldestResult.success).toBe(false);

      jest.advanceTimersByTime(130000);
      await extraPromise;
    });

    it('pending message individual timeout resolves with failure', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      const promise = orchestrator.sendMessage('conv-1', 'timeout-msg');

      jest.advanceTimersByTime(120001);

      const result = await promise;
      expect(result.success).toBe(false);
    });

    it('tracked timeout fires exactly once and removes its entry from pendingMessageTimeouts', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);
      mockGenerateClientMessageId.mockReturnValue('cid-single-timeout');

      const promise = orchestrator.sendMessage('conv-1', 'single-timeout-msg');

      const pendingMessageTimeouts: Map<string, ReturnType<typeof setTimeout>> = (orchestrator as any).pendingMessageTimeouts;
      expect(pendingMessageTimeouts.has('cid-single-timeout')).toBe(true);

      jest.advanceTimersByTime(120001);

      const result = await promise;
      expect(result.success).toBe(false);
      // Tracked entry is cleaned up after timeout fires
      expect(pendingMessageTimeouts.has('cid-single-timeout')).toBe(false);
    });

    it('passes all optional fields to messagingService.sendMessage', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgSendMessage.mockResolvedValue({ success: true });

      await orchestrator.sendMessage(
        'conv-abc123def456abc123def456',
        'content',
        'en',
        'reply-id',
        ['user-1'],
        ['att-1'],
        ['image/jpeg'],
        'cid_xxx',
        'fwd-id',
        'fwd-conv-id'
      );

      expect(mockMsgSendMessage).toHaveBeenCalledWith(
        socket,
        expect.objectContaining({
          content: 'content',
          originalLanguage: 'en',
          replyToId: 'reply-id',
          mentionedUserIds: ['user-1'],
          attachmentIds: ['att-1'],
          attachmentMimeTypes: ['image/jpeg'],
          clientMessageId: 'cid_xxx',
          forwardedFromId: 'fwd-id',
          forwardedFromConversationId: 'fwd-conv-id',
        })
      );
    });
  });

  // ─── editMessage ──────────────────────────────────────────────────────────

  describe('editMessage', () => {
    it('delegates to messagingService with current socket', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgEditMessage.mockResolvedValue(true);

      const result = await orchestrator.editMessage('msg-1', 'edited content');

      expect(mockMsgEditMessage).toHaveBeenCalledWith(socket, 'msg-1', 'edited content');
      expect(result).toBe(true);
    });

    it('delegates with null socket when not connected', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);
      mockMsgEditMessage.mockResolvedValue(false);

      const result = await orchestrator.editMessage('msg-1', 'content');

      expect(mockMsgEditMessage).toHaveBeenCalledWith(null, 'msg-1', 'content');
      expect(result).toBe(false);
    });
  });

  // ─── deleteMessage ────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('delegates to messagingService with current socket', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockMsgDeleteMessage.mockResolvedValue(true);

      const result = await orchestrator.deleteMessage('msg-1');

      expect(mockMsgDeleteMessage).toHaveBeenCalledWith(socket, 'msg-1');
      expect(result).toBe(true);
    });
  });

  // ─── typing ───────────────────────────────────────────────────────────────

  describe('startTyping / stopTyping', () => {
    it('delegates startTyping to typingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.startTyping('conv-1');

      expect(mockTypStartTyping).toHaveBeenCalledWith(socket, 'conv-1');
    });

    it('delegates stopTyping to typingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      orchestrator.stopTyping('conv-1');

      expect(mockTypStopTyping).toHaveBeenCalledWith(socket, 'conv-1');
    });
  });

  // ─── conversation management ───────────────────────────────────────────────

  describe('joinConversation', () => {
    it('calls ensureConnection then joinConversation on connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);
      mockConnGetConnectionStatus.mockReturnValue('connected');

      orchestrator.joinConversation('conv-1');

      expect(mockConnJoinConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('leaveConversation', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.leaveConversation('conv-1');

      expect(mockConnLeaveConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('triggerAutoJoin', () => {
    it('calls autoJoinCallback when set on connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const autoJoinCb = jest.fn();
      (orchestrator as any).connectionService.autoJoinCallback = autoJoinCb;

      orchestrator.triggerAutoJoin();

      expect(autoJoinCb).toHaveBeenCalledTimes(1);
    });

    it('does nothing when autoJoinCallback is null', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      (orchestrator as any).connectionService.autoJoinCallback = null;

      expect(() => orchestrator.triggerAutoJoin()).not.toThrow();
    });

    it('does nothing when autoJoinCallback is undefined', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      (orchestrator as any).connectionService.autoJoinCallback = undefined;

      expect(() => orchestrator.triggerAutoJoin()).not.toThrow();
    });
  });

  describe('updateCurrentConversationId', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.updateCurrentConversationId('conv-new');

      expect(mockConnUpdateCurrentConversationId).toHaveBeenCalledWith('conv-new');
    });
  });

  describe('getCurrentConversationId', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetCurrentConversationId.mockReturnValue('conv-current');

      expect(orchestrator.getCurrentConversationId()).toBe('conv-current');
    });
  });

  // ─── connection management ────────────────────────────────────────────────

  describe('reconnect', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.reconnect();

      expect(mockConnReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnectForUpdate', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.disconnectForUpdate();

      expect(mockConnDisconnectForUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConnectionStatus', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetConnectionStatus.mockReturnValue('connecting');

      expect(orchestrator.getConnectionStatus()).toBe('connecting');
    });
  });

  describe('getConnectionDiagnostics', () => {
    it('aggregates diagnostics from all services', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      mockConnGetConnectionDiagnostics.mockReturnValue({
        status: 'connected',
        isConnected: true,
        hasSocket: true,
        reconnectAttempts: 0,
        transport: 'websocket',
        socketId: 'socket-1',
      });
      mockMsgGetListenerCounts.mockReturnValue({ message: 3, edit: 1, delete: 2 });
      mockTransGetListenerCount.mockReturnValue(4);
      mockTypGetListenerCount.mockReturnValue(5);
      mockPresGetListenerCount.mockReturnValue(6);

      const diag = orchestrator.getConnectionDiagnostics();

      expect(diag.status).toBe('connected');
      expect(diag.listenersCount).toEqual({
        message: 3,
        edit: 1,
        delete: 2,
        translation: 4,
        typing: 5,
        status: 6,
      });
    });
  });

  describe('onStatusChange', () => {
    it('delegates to connectionService and returns unsub function', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const unsub = jest.fn();
      mockConnOnStatusChange.mockReturnValue(unsub);

      const cb = jest.fn();
      const result = orchestrator.onStatusChange(cb);

      expect(mockConnOnStatusChange).toHaveBeenCalledWith(cb);
      expect(result).toBe(unsub);
    });
  });

  describe('getSocket', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      expect(orchestrator.getSocket()).toBe(socket);
    });
  });

  // ─── encryption delegation ────────────────────────────────────────────────

  describe('setEncryptionHandlers', () => {
    it('delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const handlers = { encrypt: jest.fn(), decrypt: jest.fn() } as any;

      orchestrator.setEncryptionHandlers(handlers);

      expect(mockMsgSetEncryptionHandlers).toHaveBeenCalledWith(handlers);
    });
  });

  describe('clearEncryptionHandlers', () => {
    it('delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.clearEncryptionHandlers();

      expect(mockMsgClearEncryptionHandlers).toHaveBeenCalledTimes(1);
    });
  });

  describe('isConversationEncrypted', () => {
    it('delegates to messagingService', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockMsgIsConversationEncrypted.mockResolvedValue(true);

      const result = await orchestrator.isConversationEncrypted('conv-1');

      expect(mockMsgIsConversationEncrypted).toHaveBeenCalledWith('conv-1');
      expect(result).toBe(true);
    });
  });

  // ─── setGetMessageByIdCallback ────────────────────────────────────────────

  describe('setGetMessageByIdCallback', () => {
    it('delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const cb = jest.fn();

      orchestrator.setGetMessageByIdCallback(cb);

      expect(mockMsgSetGetMessageByIdCallback).toHaveBeenCalledWith(cb);
    });
  });

  // ─── setAutoJoinCallback ──────────────────────────────────────────────────

  describe('setAutoJoinCallback', () => {
    it('delegates to connectionService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const cb = jest.fn();

      orchestrator.setAutoJoinCallback(cb);

      expect(mockConnSetAutoJoinCallback).toHaveBeenCalledWith(cb);
    });
  });

  // ─── event listener delegation ────────────────────────────────────────────

  describe('event listener delegation', () => {
    it('onNewMessage delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onNewMessage(listener);
      expect(mockMsgOnNewMessage).toHaveBeenCalledWith(listener);
    });

    it('onMessageEdited delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onMessageEdited(listener);
      expect(mockMsgOnMessageEdited).toHaveBeenCalledWith(listener);
    });

    it('onMessageDeleted delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onMessageDeleted(listener);
      expect(mockMsgOnMessageDeleted).toHaveBeenCalledWith(listener);
    });

    it('onAttachmentStatusUpdated delegates to messagingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onAttachmentStatusUpdated(listener);
      expect(mockMsgOnAttachmentStatusUpdated).toHaveBeenCalledWith(listener);
    });

    it('onTranslation delegates to translationService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onTranslation(listener);
      expect(mockTransOnTranslation).toHaveBeenCalledWith(listener);
    });

    it('onAudioTranslation delegates to translationService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onAudioTranslation(listener);
      expect(mockTransOnAudioTranslation).toHaveBeenCalledWith(listener);
    });

    it('onTranscription delegates to translationService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onTranscription(listener);
      expect(mockTransOnTranscription).toHaveBeenCalledWith(listener);
    });

    it('onAudioTranslationsProgressive delegates to translationService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onAudioTranslationsProgressive(listener);
      expect(mockTransOnAudioTranslationsProgressive).toHaveBeenCalledWith(listener);
    });

    it('onAudioTranslationsCompleted delegates to translationService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onAudioTranslationsCompleted(listener);
      expect(mockTransOnAudioTranslationsCompleted).toHaveBeenCalledWith(listener);
    });

    it('onTyping delegates to typingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onTyping(listener);
      expect(mockTypOnTyping).toHaveBeenCalledWith(listener);
    });

    it('onTypingStart delegates to typingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onTypingStart(listener);
      expect(mockTypOnTypingStart).toHaveBeenCalledWith(listener);
    });

    it('onTypingStop delegates to typingService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onTypingStop(listener);
      expect(mockTypOnTypingStop).toHaveBeenCalledWith(listener);
    });

    it('onUserStatus delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onUserStatus(listener);
      expect(mockPresOnUserStatus).toHaveBeenCalledWith(listener);
    });

    it('onPresenceSnapshot delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onPresenceSnapshot(listener);
      expect(mockPresOnPresenceSnapshot).toHaveBeenCalledWith(listener);
    });

    it('onConversationStats delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onConversationStats(listener);
      expect(mockPresOnConversationStats).toHaveBeenCalledWith(listener);
    });

    it('onConversationOnlineStats delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onConversationOnlineStats(listener);
      expect(mockPresOnConversationOnlineStats).toHaveBeenCalledWith(listener);
    });

    it('onReactionAdded delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onReactionAdded(listener);
      expect(mockPresOnReactionAdded).toHaveBeenCalledWith(listener);
    });

    it('onReactionRemoved delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onReactionRemoved(listener);
      expect(mockPresOnReactionRemoved).toHaveBeenCalledWith(listener);
    });

    it('onConversationJoined delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onConversationJoined(listener);
      expect(mockPresOnConversationJoined).toHaveBeenCalledWith(listener);
    });

    it('onConversationLeft delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onConversationLeft(listener);
      expect(mockPresOnConversationLeft).toHaveBeenCalledWith(listener);
    });

    it('onUnreadUpdated delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onUnreadUpdated(listener);
      expect(mockPresOnUnreadUpdated).toHaveBeenCalledWith(listener);
    });

    it('onPreferencesUpdated delegates to preferencesSyncService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onPreferencesUpdated(listener);
      expect(mockPrefOnPreferencesUpdated).toHaveBeenCalledWith(listener);
    });

    it('onParticipantRoleUpdated delegates to presenceService', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const listener = jest.fn();
      orchestrator.onParticipantRoleUpdated(listener);
      expect(mockPresOnParticipantRoleUpdated).toHaveBeenCalledWith(listener);
    });
  });

  // ─── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('rejects all pending messages', async () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      const promise1 = orchestrator.sendMessage('conv-1', 'msg1');
      const promise2 = orchestrator.sendMessage('conv-1', 'msg2');

      expect(orchestrator.getPendingMessagesCount()).toBe(2);

      orchestrator.cleanup();

      expect(orchestrator.getPendingMessagesCount()).toBe(0);

      const [r1, r2] = await Promise.all([promise1, promise2]);
      expect(r1.success).toBe(false);
      expect(r2.success).toBe(false);
    });

    it('calls cleanup on all services', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      orchestrator.cleanup();

      expect(mockConnCleanup).toHaveBeenCalledTimes(1);
      expect(mockMsgCleanup).toHaveBeenCalledTimes(1);
      expect(mockTypCleanup).toHaveBeenCalledTimes(1);
      expect(mockPresCleanup).toHaveBeenCalledTimes(1);
      expect(mockTransCleanup).toHaveBeenCalledTimes(1);
      expect(mockPrefCleanup).toHaveBeenCalledTimes(1);
    });

    it('handles empty pending messages queue gracefully', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();

      expect(() => orchestrator.cleanup()).not.toThrow();
    });
  });

  // ─── getPendingMessagesCount ───────────────────────────────────────────────

  describe('getPendingMessagesCount', () => {
    it('returns 0 initially', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      expect(orchestrator.getPendingMessagesCount()).toBe(0);
    });

    it('returns count after queuing messages', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      mockConnGetSocket.mockReturnValue(null);

      orchestrator.sendMessage('conv-1', 'msg1');
      orchestrator.sendMessage('conv-1', 'msg2');

      expect(orchestrator.getPendingMessagesCount()).toBe(2);
    });
  });

  // ─── onDisconnected / onError (private, via callback) ─────────────────────

  describe('onDisconnected and onError (via connection callbacks)', () => {
    it('onDisconnected callback logs debug without throwing', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnDisconnect: ((reason: string) => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation((_onAuth: unknown, onDisconnect: (r: string) => void) => {
        capturedOnDisconnect = onDisconnect;
      });

      orchestrator.initializeConnection();

      expect(() => capturedOnDisconnect?.('transport close')).not.toThrow();
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'Disconnected',
        expect.objectContaining({ reason: 'transport close' })
      );
    });

    it('onError callback logs error without throwing', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnError: ((error: Error) => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation(
        (_onAuth: unknown, _onDisconnect: unknown, onError: (e: Error) => void) => {
          capturedOnError = onError;
        }
      );

      orchestrator.initializeConnection();

      const error = new Error('connection error');
      expect(() => capturedOnError?.(error)).not.toThrow();
      expect(mockLoggerError).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        'Error',
        expect.objectContaining({ error })
      );
    });

    it('onSessionRevoked callback dispatches meeshy:session-revoked DOM event and logs warn', () => {
      const orchestrator = SocketIOOrchestrator.getInstance();
      const socket = makeConnectedSocket();
      mockConnGetSocket.mockReturnValue(socket);

      let capturedOnSessionRevoked: (() => void) | null = null;
      mockConnSetupConnectionListeners.mockImplementation(
        (_onAuth: unknown, _onDisconnect: unknown, _onError: unknown, onRevoked: () => void) => {
          capturedOnSessionRevoked = onRevoked;
        }
      );

      orchestrator.initializeConnection();

      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
      expect(() => capturedOnSessionRevoked?.()).not.toThrow();

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'meeshy:session-revoked' })
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        '[SocketIOOrchestrator]',
        expect.stringContaining('Session revoked by server')
      );
    });
  });
});
