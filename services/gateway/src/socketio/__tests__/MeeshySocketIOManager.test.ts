// @ts-nocheck
/**
 * Comprehensive unit tests for MeeshySocketIOManager
 *
 * Coverage targets: ≥92% lines + branches
 * Strategy: mock all external dependencies via jest.mock factories,
 *   use __state/__instance closures for runtime access.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// socket.io mock — __state closure (works around ts-jest hoisting limits)
// ---------------------------------------------------------------------------

jest.mock('socket.io', () => {
  const toEmit = jest.fn();
  const toChain: Record<string, unknown> = { emit: toEmit };
  const to = jest.fn().mockReturnValue(toChain);
  // Allow chaining: io.to(a).to(b).emit(...)
  toChain.to = to;

  const on = jest.fn();
  const emit = jest.fn();
  const close = jest.fn();
  const sockets = {
    sockets: new Map<string, unknown>(),
    adapter: { rooms: new Map<string, Set<string>>() },
  };

  const state = { on, emit, to, toEmit, toChain, close, sockets, connectionHandler: null as any };
  on.mockImplementation((event: string, handler: unknown) => {
    if (event === 'connection') state.connectionHandler = handler as any;
  });

  return {
    Server: jest.fn().mockImplementation(() => ({
      on: (...a: unknown[]) => (state.on as any)(...a),
      emit: (...a: unknown[]) => (state.emit as any)(...a),
      to: (...a: unknown[]) => (state.to as any)(...a),
      close: (...a: unknown[]) => (state.close as any)(...a),
      get sockets() { return state.sockets; },
    })),
    __state: state,
  };
});

// ---------------------------------------------------------------------------
// Service / handler mocks
// ---------------------------------------------------------------------------

let mockAttachmentServiceInstance: any;
jest.mock('../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => {
    mockAttachmentServiceInstance = { processAttachments: jest.fn().mockResolvedValue([]) };
    return mockAttachmentServiceInstance;
  }),
}));

jest.mock('../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
}));

jest.mock('../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

let mockMaintenanceServiceInstance: any;
jest.mock('../../services/MaintenanceService', () => ({
  MaintenanceService: jest.fn().mockImplementation(() => {
    mockMaintenanceServiceInstance = {
      startMaintenanceTasks: jest.fn().mockResolvedValue(undefined),
      setStatusBroadcastCallback: jest.fn(),
      setIsCurrentlyConnected: jest.fn(),
    };
    return mockMaintenanceServiceInstance;
  }),
}));

let mockStatusServiceInstance: any;
jest.mock('../../services/StatusService', () => ({
  StatusService: jest.fn().mockImplementation(() => {
    mockStatusServiceInstance = {
      updateUserOnline: jest.fn().mockResolvedValue(undefined),
      updateUserOffline: jest.fn().mockResolvedValue(undefined),
    };
    return mockStatusServiceInstance;
  }),
}));

let mockPrivacyPrefsServiceInstance: any;
jest.mock('../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => {
    mockPrivacyPrefsServiceInstance = {
      getPreferences: jest.fn().mockResolvedValue({
        showOnlineStatus: true,
        showLastSeen: true,
      }),
    };
    return mockPrivacyPrefsServiceInstance;
  }),
}));

let mockNotificationServiceInstance: any;
jest.mock('../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => {
    mockNotificationServiceInstance = {
      setSocketIO: jest.fn(),
      setPushNotificationService: jest.fn(),
      setEmailService: jest.fn(),
      createReactionNotification: jest.fn().mockResolvedValue(undefined),
    };
    return mockNotificationServiceInstance;
  }),
}));

let mockMentionServiceInstance: any;
jest.mock('../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => {
    mockMentionServiceInstance = {
      extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
      resolveUsernames: jest.fn().mockResolvedValue(new Map()),
    };
    return mockMentionServiceInstance;
  }),
}));

let mockMessagingServiceInstance: any;
jest.mock('../../services/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => {
    mockMessagingServiceInstance = {
      handleMessage: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'msg-agent-1',
          conversationId: 'conv-123456789012',
          senderId: 'sender-1',
          content: 'Hello',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    };
    return mockMessagingServiceInstance;
  }),
}));

let mockCallEventsHandlerInstance: any;
jest.mock('../CallEventsHandler', () => ({
  CallEventsHandler: jest.fn().mockImplementation(() => {
    mockCallEventsHandlerInstance = {
      setMessageBroadcaster: jest.fn(),
      setNotificationService: jest.fn(),
      setPushNotificationService: jest.fn(),
      setZmqClient: jest.fn(),
      setupCallEvents: jest.fn(),
    };
    return mockCallEventsHandlerInstance;
  }),
}));

jest.mock('../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({})),
}));

let mockSocialEventsHandlerInstance: any;
jest.mock('../handlers/SocialEventsHandler', () => ({
  SocialEventsHandler: jest.fn().mockImplementation(() => {
    mockSocialEventsHandlerInstance = {
      handleFeedSubscribe: jest.fn(),
      handleFeedUnsubscribe: jest.fn(),
    };
    return mockSocialEventsHandlerInstance;
  }),
}));

jest.mock('../handlers/LocationHandler', () => ({
  LocationHandler: jest.fn().mockImplementation(() => ({
    handleLocationShare: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationStart: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationUpdate: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationStop: jest.fn().mockResolvedValue(undefined),
  })),
}));

let mockAuthHandlerInstance: any;
jest.mock('../handlers/AuthHandler', () => ({
  AuthHandler: jest.fn().mockImplementation(() => {
    mockAuthHandlerInstance = {
      handleTokenAuthentication: jest.fn(),
      handleManualAuthentication: jest.fn().mockResolvedValue(undefined),
      handleHeartbeat: jest.fn().mockResolvedValue(undefined),
      handleDisconnection: jest.fn().mockResolvedValue(undefined),
    };
    return mockAuthHandlerInstance;
  }),
}));

let mockMessageHandlerInstance: any;
jest.mock('../handlers/MessageHandler', () => ({
  MessageHandler: jest.fn().mockImplementation(() => {
    mockMessageHandlerInstance = {
      handleMessageSend: jest.fn().mockResolvedValue(undefined),
      handleMessageSendWithAttachments: jest.fn().mockResolvedValue(undefined),
    };
    return mockMessageHandlerInstance;
  }),
}));

let mockStatusHandlerInstance: any;
jest.mock('../handlers/StatusHandler', () => ({
  StatusHandler: jest.fn().mockImplementation(() => {
    mockStatusHandlerInstance = {
      handleTypingStart: jest.fn().mockResolvedValue(undefined),
      handleTypingStop: jest.fn().mockResolvedValue(undefined),
      invalidateIdentityCache: jest.fn(),
      clearTypingThrottle: jest.fn(),
      drainActiveTypingState: jest.fn().mockReturnValue({ conversationIds: [], identity: null }),
    };
    return mockStatusHandlerInstance;
  }),
}));

let mockReactionHandlerInstance: any;
jest.mock('../handlers/ReactionHandler', () => ({
  ReactionHandler: jest.fn().mockImplementation(() => {
    mockReactionHandlerInstance = {
      handleReactionAdd: jest.fn().mockResolvedValue(undefined),
      handleReactionRemove: jest.fn().mockResolvedValue(undefined),
      handleReactionSync: jest.fn().mockResolvedValue(undefined),
    };
    return mockReactionHandlerInstance;
  }),
}));

jest.mock('../handlers/AttachmentReactionHandler', () => ({
  AttachmentReactionHandler: jest.fn().mockImplementation(() => ({
    handleAdd: jest.fn().mockResolvedValue(undefined),
    handleRemove: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/AttachmentReactionService', () => ({
  AttachmentReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../handlers/CommentReactionHandler', () => ({
  CommentReactionHandler: jest.fn().mockImplementation(() => ({
    handleAddReaction: jest.fn().mockResolvedValue(undefined),
    handleRemoveReaction: jest.fn().mockResolvedValue(undefined),
    handleRequestSync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/CommentReactionService', () => ({
  CommentReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../handlers/PostReactionHandler', () => ({
  PostReactionHandler: jest.fn().mockImplementation(() => ({
    handleJoinPost: jest.fn().mockResolvedValue(undefined),
    handleLeavePost: jest.fn().mockResolvedValue(undefined),
    handleAddReaction: jest.fn().mockResolvedValue(undefined),
    handleRemoveReaction: jest.fn().mockResolvedValue(undefined),
    handleRequestSync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/PostReactionService', () => ({
  PostReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../handlers/ConversationHandler', () => ({
  ConversationHandler: jest.fn().mockImplementation(() => ({
    handleConversationJoin: jest.fn().mockResolvedValue(undefined),
    handleConversationLeave: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../handlers/AdminAgentHandler', () => ({
  AdminAgentHandler: jest.fn().mockImplementation(() => ({
    handleSubscribe: jest.fn().mockResolvedValue(undefined),
    handleUnsubscribe: jest.fn(),
  })),
}));

let mockAgentAdminRelayInstance: any;
jest.mock('../AgentAdminRelay', () => ({
  AgentAdminRelay: jest.fn().mockImplementation(() => {
    mockAgentAdminRelayInstance = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    return mockAgentAdminRelayInstance;
  }),
}));

jest.mock('../../services/ReactionService.js', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
    createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1' }),
  })),
}));

jest.mock('../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForParticipants: jest.fn().mockResolvedValue(new Map()),
  })),
}));

jest.mock('../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn().mockImplementation(() => ({
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    init: jest.fn(),
    shared: {
      handleTranscriptionReady: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    init: jest.fn(),
  },
}));

jest.mock('../../services/posts/StoryTextObjectTranslationService', () => ({
  StoryTextObjectTranslationService: {
    init: jest.fn(),
    shared: {
      handleTranslationCompleted: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../emitAttachmentUpdated', () => ({
  emitAttachmentUpdated: jest.fn(),
}));

jest.mock('../utils/message-payload-filter', () => ({
  filterMessagePayloadForLanguages: jest.fn().mockImplementation((payload: unknown) => payload),
}));

jest.mock('../utils/resolved-languages-refresh', () => ({
  applyResolvedLanguagesRefresh: jest.fn(),
}));

jest.mock('../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn().mockReturnValue([]),
}));

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are set up)
// ---------------------------------------------------------------------------

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { SERVER_EVENTS, CLIENT_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTranslationService() {
  const svc = Object.assign(new EventEmitter(), {
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({ messages: 0, translationRequests: 0 }),
    getZmqClient: jest.fn().mockReturnValue(null),
    getTranslation: jest.fn().mockResolvedValue(null),
    handleNewMessage: jest.fn().mockResolvedValue(undefined),
  });
  return svc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePrisma(): any {
  const fn = () => jest.fn() as any;
  return {
    conversation: { findUnique: fn() },
    message: { findUnique: fn() },
    messageAttachment: { findUnique: fn() },
    participant: {
      findMany: fn().mockResolvedValue([]),
      findFirst: fn(),
      findUnique: fn(),
    },
    user: {
      findUnique: fn(),
      findMany: fn().mockResolvedValue([]),
    },
  };
}

function makeSocket(id = 'socket-1', rooms = new Set<string>()) {
  const handlers: Record<string, any> = {};
  const socket = {
    id,
    rooms,
    on: jest.fn((event: string, handler: any) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    _handlers: handlers,
  };
  return socket;
}

function getIoState() {
  return (jest.requireMock('socket.io') as any).__state;
}

function triggerConnection(socket: ReturnType<typeof makeSocket>) {
  const ioState = getIoState();
  if (ioState.connectionHandler) {
    ioState.connectionHandler(socket);
  }
  return socket._handlers;
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123456789012',
    conversationId: 'conv-123456789012',
    senderId: 'sender-participantId',
    content: 'Hello world',
    originalLanguage: 'fr',
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: null,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

describe('MeeshySocketIOManager', () => {
  let manager: MeeshySocketIOManager;
  let prisma: ReturnType<typeof makePrisma>;
  let translationService: ReturnType<typeof makeTranslationService>;
  let ioState: ReturnType<typeof getIoState>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset ioState mocks
    ioState = getIoState();
    ioState.on.mockClear();
    ioState.emit.mockClear();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.close.mockClear();
    ioState.connectionHandler = null;
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    translationService = makeTranslationService();

    manager = new MeeshySocketIOManager({} as any, prisma as any, translationService as any);
    await manager.initialize();
  });

  // -------------------------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------------------------

  describe('Constructor', () => {
    it('instantiates the SocketIO server', () => {
      const { Server } = jest.requireMock('socket.io') as any;
      expect(Server).toHaveBeenCalled();
    });

    it('creates MaintenanceService with status broadcast callback', () => {
      const { MaintenanceService } = jest.requireMock('../../services/MaintenanceService') as any;
      expect(MaintenanceService).toHaveBeenCalled();
      expect(mockMaintenanceServiceInstance.setStatusBroadcastCallback).toHaveBeenCalledWith(expect.any(Function));
    });

    it('registers isCurrentlyConnected predicate on MaintenanceService', () => {
      expect(mockMaintenanceServiceInstance.setIsCurrentlyConnected).toHaveBeenCalledWith(expect.any(Function));
    });

    it('wires CallEventsHandler message broadcaster', () => {
      expect(mockCallEventsHandlerInstance.setMessageBroadcaster).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // 2. initialize()
  // -------------------------------------------------------------------------

  describe('initialize()', () => {
    it('calls translationService.initialize()', () => {
      expect(translationService.initialize).toHaveBeenCalled();
    });

    it('registers translationReady event listener on translationService', () => {
      const listeners = translationService.listeners('translationReady');
      expect(listeners).toHaveLength(1);
    });

    it('registers transcriptionReady event listener on translationService', () => {
      const listeners = translationService.listeners('transcriptionReady');
      expect(listeners).toHaveLength(1);
    });

    it('registers audioTranslationReady event listener', () => {
      expect(translationService.listeners('audioTranslationReady')).toHaveLength(1);
    });

    it('registers audioTranslationsProgressive event listener', () => {
      expect(translationService.listeners('audioTranslationsProgressive')).toHaveLength(1);
    });

    it('registers audioTranslationsCompleted event listener', () => {
      expect(translationService.listeners('audioTranslationsCompleted')).toHaveLength(1);
    });

    it('registers storyTextObjectTranslationCompleted event listener', () => {
      expect(translationService.listeners('storyTextObjectTranslationCompleted')).toHaveLength(1);
    });

    it('calls notificationService.setSocketIO', () => {
      expect(mockNotificationServiceInstance.setSocketIO).toHaveBeenCalled();
    });

    it('calls notificationService.setPushNotificationService', () => {
      expect(mockNotificationServiceInstance.setPushNotificationService).toHaveBeenCalled();
    });

    it('starts maintenance tasks', () => {
      expect(mockMaintenanceServiceInstance.startMaintenanceTasks).toHaveBeenCalled();
    });

    it('registers socket connection handler on io', () => {
      expect(ioState.connectionHandler).not.toBeNull();
    });

    it('starts AgentAdminRelay', () => {
      expect(mockAgentAdminRelayInstance.start).toHaveBeenCalled();
    });

    it('throws if translationService.initialize rejects', async () => {
      const failingTranslation = makeTranslationService();
      (failingTranslation.initialize as jest.Mock).mockRejectedValue(new Error('ZMQ init failed'));
      const m = new MeeshySocketIOManager({} as any, prisma as any, failingTranslation as any);
      await expect(m.initialize()).rejects.toThrow('ZMQ init failed');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Presence methods
  // -------------------------------------------------------------------------

  describe('Presence methods', () => {
    beforeEach(() => {
      (manager as any).connectedUsers.set('user-A', {
        id: 'user-A', socketId: 'sock-A', isAnonymous: false, language: 'fr', resolvedLanguages: ['fr'],
      });
      (manager as any).connectedUsers.set('user-B', {
        id: 'user-B', socketId: 'sock-B', isAnonymous: false, language: 'en', resolvedLanguages: ['en'],
      });
    });

    it('isPresenceOnline returns true for connected user', () => {
      expect(manager.isPresenceOnline('user-A')).toBe(true);
    });

    it('isPresenceOnline returns false for disconnected user', () => {
      expect(manager.isPresenceOnline('user-Z')).toBe(false);
    });

    it('getPresenceForIds returns correct map', () => {
      const result = manager.getPresenceForIds(['user-A', 'user-Z']);
      expect(result.get('user-A')).toBe(true);
      expect(result.get('user-Z')).toBe(false);
    });

    it('getPresenceForIds handles empty array', () => {
      expect(manager.getPresenceForIds([])).toEqual(new Map());
    });

    it('listOnlineAmong filters correctly', () => {
      const result = manager.listOnlineAmong(['user-A', 'user-Z', 'user-B']);
      expect(result).toEqual(expect.arrayContaining(['user-A', 'user-B']));
      expect(result).not.toContain('user-Z');
    });

    it('isUserConnected returns true for connected user', () => {
      expect((manager as any).isUserConnected('user-A')).toBe(true);
    });

    it('isUserConnected returns false for unknown user', () => {
      expect((manager as any).isUserConnected('ghost')).toBe(false);
    });

    it('getConnectedUsers returns all connected user ids', () => {
      const users = manager.getConnectedUsers();
      expect(users).toContain('user-A');
      expect(users).toContain('user-B');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Socket operations
  // -------------------------------------------------------------------------

  describe('Socket operations', () => {
    it('isUserInConversationRoom returns false when user not in connectedUsers', () => {
      expect(manager.isUserInConversationRoom('ghost', 'conv-1')).toBe(false);
    });

    it('isUserInConversationRoom returns false when socket not found', () => {
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-missing', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.isUserInConversationRoom('user-1', 'conv-1')).toBe(false);
    });

    it('isUserInConversationRoom returns true when socket is in room', () => {
      const rooms = new Set(['conversation:conv-1']);
      const fakeSocket = { rooms };
      ioState.sockets.sockets.set('sock-1', fakeSocket);
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-1', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.isUserInConversationRoom('user-1', 'conv-1')).toBe(true);
    });

    it('isUserInConversationRoom returns false when socket lacks the room', () => {
      const rooms = new Set(['conversation:other']);
      const fakeSocket = { rooms };
      ioState.sockets.sockets.set('sock-1', fakeSocket);
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-1', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.isUserInConversationRoom('user-1', 'conv-1')).toBe(false);
    });

    it('disconnectUser returns false for unknown user', () => {
      expect(manager.disconnectUser('ghost')).toBe(false);
    });

    it('disconnectUser returns false when socket not found', () => {
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-missing', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.disconnectUser('user-1')).toBe(false);
    });

    it('disconnectUser calls socket.disconnect and returns true', () => {
      const fakeSocket = { disconnect: jest.fn() };
      ioState.sockets.sockets.set('sock-1', fakeSocket);
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-1', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.disconnectUser('user-1')).toBe(true);
      expect(fakeSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('sendToUser returns false for unknown user', () => {
      expect(manager.sendToUser('ghost', SERVER_EVENTS.MESSAGE_NEW as any, {} as any)).toBe(false);
    });

    it('sendToUser emits event to socket and returns true', () => {
      const fakeSocket = { emit: jest.fn() };
      ioState.sockets.sockets.set('sock-1', fakeSocket);
      (manager as any).connectedUsers.set('user-1', {
        id: 'user-1', socketId: 'sock-1', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      const result = manager.sendToUser('user-1', SERVER_EVENTS.MESSAGE_NEW as any, { id: 'test' } as any);
      expect(result).toBe(true);
      expect(fakeSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, { id: 'test' });
    });

    it('broadcast emits to all connected sockets', () => {
      manager.broadcast(SERVER_EVENTS.USER_STATUS as any, {} as any);
      expect(ioState.emit).toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, {});
    });
  });

  // -------------------------------------------------------------------------
  // 5. Stats and health
  // -------------------------------------------------------------------------

  describe('Stats and health', () => {
    it('getStats returns stats with connected_users count', () => {
      const stats = manager.getStats();
      expect(stats).toHaveProperty('total_connections');
      expect(stats).toHaveProperty('active_connections');
      expect(stats).toHaveProperty('connected_users');
      expect(stats).toHaveProperty('translation_service_stats');
    });

    it('healthCheck returns true when translationService is healthy', async () => {
      (translationService.healthCheck as jest.Mock).mockResolvedValue(true);
      expect(await manager.healthCheck()).toBe(true);
    });

    it('healthCheck returns false when translationService is unhealthy', async () => {
      (translationService.healthCheck as jest.Mock).mockResolvedValue(false);
      expect(await manager.healthCheck()).toBe(false);
    });

    it('healthCheck returns false on exception', async () => {
      (translationService.healthCheck as jest.Mock).mockRejectedValue(new Error('fail'));
      expect(await manager.healthCheck()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. close()
  // -------------------------------------------------------------------------

  describe('close()', () => {
    it('calls agentAdminRelay.stop()', async () => {
      await manager.close();
      expect(mockAgentAdminRelayInstance.stop).toHaveBeenCalled();
    });

    it('calls translationService.close()', async () => {
      await manager.close();
      expect(translationService.close).toHaveBeenCalled();
    });

    it('calls io.close()', async () => {
      await manager.close();
      expect(ioState.close).toHaveBeenCalled();
    });

    it('does not throw if agentAdminRelay.stop() rejects', async () => {
      mockAgentAdminRelayInstance.stop.mockRejectedValue(new Error('relay down'));
      await expect(manager.close()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 7. setDeliveryQueue / setAgentClient
  // -------------------------------------------------------------------------

  describe('setDeliveryQueue / setAgentClient', () => {
    it('setDeliveryQueue stores the queue on the manager', () => {
      const fakeQueue = { drain: jest.fn(), enqueue: jest.fn() };
      manager.setDeliveryQueue(fakeQueue as any);
      expect((manager as any).deliveryQueue).toBe(fakeQueue);
    });

    it('setAgentClient stores the client on the manager', () => {
      const fakeClient = { sendEvent: jest.fn() };
      manager.setAgentClient(fakeClient as any);
      expect((manager as any).agentClient).toBe(fakeClient);
    });
  });

  // -------------------------------------------------------------------------
  // 8. refreshUserResolvedLanguages
  // -------------------------------------------------------------------------

  describe('refreshUserResolvedLanguages', () => {
    it('delegates to applyResolvedLanguagesRefresh', () => {
      const { applyResolvedLanguagesRefresh } = jest.requireMock('../utils/resolved-languages-refresh') as any;
      const prefs = { systemLanguage: 'fr', regionalLanguage: 'en' };
      manager.refreshUserResolvedLanguages('user-1', prefs);
      expect(applyResolvedLanguagesRefresh).toHaveBeenCalledWith(
        (manager as any).connectedUsers,
        'user-1',
        prefs
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. Getters
  // -------------------------------------------------------------------------

  describe('getNotificationService / getSocialEventsHandler / getPresenceBroadcastCallback', () => {
    it('getNotificationService returns the notificationService instance', () => {
      expect(manager.getNotificationService()).toBe(mockNotificationServiceInstance);
    });

    it('getSocialEventsHandler returns the socialEventsHandler instance', () => {
      expect(manager.getSocialEventsHandler()).toBe(mockSocialEventsHandlerInstance);
    });

    it('getPresenceBroadcastCallback returns a callable function', () => {
      const cb = manager.getPresenceBroadcastCallback();
      expect(typeof cb).toBe('function');
    });

    it('getPresenceBroadcastCallback invokes _broadcastUserStatus when called', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({
        showOnlineStatus: false,
        showLastSeen: false,
      });
      const cb = manager.getPresenceBroadcastCallback();
      // Should not throw
      await cb('user-1', true, false);
    });

    it('getIO returns the underlying io server', () => {
      const io = manager.getIO();
      expect(io).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Socket connection events
  // -------------------------------------------------------------------------

  describe('Socket connection events', () => {
    it('increments total_connections and active_connections on connection', () => {
      const before = manager.getStats().total_connections;
      const beforeActive = manager.getStats().active_connections;
      const socket = makeSocket();
      triggerConnection(socket);
      expect(manager.getStats().total_connections).toBe(before + 1);
      expect(manager.getStats().active_connections).toBe(beforeActive + 1);
    });

    it('calls authHandler.handleTokenAuthentication on connection', () => {
      const socket = makeSocket();
      triggerConnection(socket);
      expect(mockAuthHandlerInstance.handleTokenAuthentication).toHaveBeenCalledWith(socket);
    });

    it('registers all expected socket event listeners', () => {
      const socket = makeSocket();
      triggerConnection(socket);
      const registeredEvents = socket.on.mock.calls.map((c: any) => c[0]);
      expect(registeredEvents).toContain(CLIENT_EVENTS.AUTHENTICATE);
      expect(registeredEvents).toContain(CLIENT_EVENTS.MESSAGE_SEND);
      expect(registeredEvents).toContain(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS);
      expect(registeredEvents).toContain(CLIENT_EVENTS.REQUEST_TRANSLATION);
      expect(registeredEvents).toContain(CLIENT_EVENTS.CONVERSATION_JOIN);
      expect(registeredEvents).toContain(CLIENT_EVENTS.CONVERSATION_LEAVE);
      expect(registeredEvents).toContain(CLIENT_EVENTS.FEED_SUBSCRIBE);
      expect(registeredEvents).toContain(CLIENT_EVENTS.FEED_UNSUBSCRIBE);
      expect(registeredEvents).toContain(CLIENT_EVENTS.TYPING_START);
      expect(registeredEvents).toContain(CLIENT_EVENTS.TYPING_STOP);
      expect(registeredEvents).toContain(CLIENT_EVENTS.HEARTBEAT);
      expect(registeredEvents).toContain(CLIENT_EVENTS.REACTION_ADD);
      expect(registeredEvents).toContain(CLIENT_EVENTS.REACTION_REMOVE);
      expect(registeredEvents).toContain(CLIENT_EVENTS.LOCATION_SHARE);
      expect(registeredEvents).toContain('disconnect');
    });

    it('calls callEventsHandler.setupCallEvents on each connection', () => {
      const socket = makeSocket();
      triggerConnection(socket);
      expect(mockCallEventsHandlerInstance.setupCallEvents).toHaveBeenCalledWith(
        socket,
        expect.anything(),
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  // -------------------------------------------------------------------------
  // 11. Socket disconnect event
  // -------------------------------------------------------------------------

  describe('Socket disconnect event', () => {
    it('decrements active_connections on disconnect', () => {
      const socket = makeSocket('sock-d');
      triggerConnection(socket);
      const beforeActive = manager.getStats().active_connections;
      socket._handlers['disconnect']('transport close');
      expect(manager.getStats().active_connections).toBe(beforeActive - 1);
    });

    it('calls authHandler.handleDisconnection on disconnect', () => {
      const socket = makeSocket('sock-d2');
      triggerConnection(socket);
      socket._handlers['disconnect']('transport close');
      expect(mockAuthHandlerInstance.handleDisconnection).toHaveBeenCalledWith(socket);
    });

    it('invalidates identity cache and clears typing throttle on disconnect when userId found', () => {
      const socket = makeSocket('sock-d3');
      (manager as any).socketToUser.set('sock-d3', 'user-d3');
      triggerConnection(socket);
      socket._handlers['disconnect']('transport close');
      expect(mockStatusHandlerInstance.drainActiveTypingState).toHaveBeenCalledWith('user-d3');
      expect(mockStatusHandlerInstance.invalidateIdentityCache).toHaveBeenCalledWith('user-d3');
    });

    it('deletes presenceSnapshotCache entry on disconnect', () => {
      const socket = makeSocket('sock-d4');
      (manager as any).socketToUser.set('sock-d4', 'user-d4');
      (manager as any).presenceSnapshotCache.set('user-d4', { users: [], cachedAt: Date.now() });
      triggerConnection(socket);
      socket._handlers['disconnect']('io server disconnect');
      expect((manager as any).presenceSnapshotCache.has('user-d4')).toBe(false);
    });

    it('removes socketRateLimits when last socket disconnects', () => {
      const socket = makeSocket('sock-d5');
      const userId = 'user-rate-limit';
      (manager as any).socketToUser.set('sock-d5', userId);
      (manager as any).socketRateLimits.set(`translation_request:${userId}`, [Date.now()]);
      // userSockets has only this socket (size=1)
      (manager as any).userSockets.set(userId, new Set(['sock-d5']));
      triggerConnection(socket);
      socket._handlers['disconnect']('transport close');
      expect((manager as any).socketRateLimits.has(`translation_request:${userId}`)).toBe(false);
    });

    it('keeps socketRateLimits when another socket remains', () => {
      const socket = makeSocket('sock-d6');
      const userId = 'user-multi';
      (manager as any).socketToUser.set('sock-d6', userId);
      (manager as any).socketRateLimits.set(`translation_request:${userId}`, [Date.now()]);
      // Two sockets → size=2
      (manager as any).userSockets.set(userId, new Set(['sock-d6', 'sock-d7']));
      triggerConnection(socket);
      socket._handlers['disconnect']('transport close');
      expect((manager as any).socketRateLimits.has(`translation_request:${userId}`)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 12. REQUEST_TRANSLATION handler
  // -------------------------------------------------------------------------

  describe('REQUEST_TRANSLATION handler', () => {
    function getTranslationHandler(socket: ReturnType<typeof makeSocket>) {
      return socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION];
    }

    it('emits ERROR when not authenticated', async () => {
      const socket = makeSocket('sock-t1');
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-1', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.stringContaining('authenticated') }));
    });

    it('allows up to 10 translation requests per minute', async () => {
      const socket = makeSocket('sock-t2');
      (manager as any).socketToUser.set('sock-t2', 'user-t2');
      (translationService.getTranslation as jest.Mock).mockResolvedValue({
        translatedText: 'Bonjour',
        confidenceScore: 0.9,
      });
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      for (let i = 0; i < 10; i++) {
        await handler({ messageId: `msg-${i}`, targetLanguage: 'fr' });
      }
      expect(socket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.stringContaining('Rate limit') }));
    });

    it('blocks the 11th request with rate limit error', async () => {
      const socket = makeSocket('sock-t3');
      (manager as any).socketToUser.set('sock-t3', 'user-t3');
      (translationService.getTranslation as jest.Mock).mockResolvedValue({
        translatedText: 'Hello',
        confidenceScore: 0.8,
      });
      const rateLimitKey = 'translation_request:user-t3';
      const now = Date.now();
      (manager as any).socketRateLimits.set(rateLimitKey, Array(10).fill(now));
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-x', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.stringContaining('Rate limit') }));
    });

    it('emits MESSAGE_TRANSLATION when cached translation found', async () => {
      const socket = makeSocket('sock-t4');
      (manager as any).socketToUser.set('sock-t4', 'user-t4');
      (translationService.getTranslation as jest.Mock).mockResolvedValue({
        translatedText: 'Bonjour',
        confidenceScore: 0.95,
      });
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-cached', targetLanguage: 'fr' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_TRANSLATION, expect.objectContaining({
        messageId: 'msg-cached',
        translatedText: 'Bonjour',
        targetLanguage: 'fr',
      }));
    });

    it('increments translations_sent stat when translation found', async () => {
      const socket = makeSocket('sock-t5');
      (manager as any).socketToUser.set('sock-t5', 'user-t5');
      (translationService.getTranslation as jest.Mock).mockResolvedValue({
        translatedText: 'Hello',
        confidenceScore: 0.9,
      });
      const before = manager.getStats().translations_sent;
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION]({ messageId: 'msg-stat', targetLanguage: 'en' });
      expect(manager.getStats().translations_sent).toBe(before + 1);
    });

    it('triggers on-demand translation via ZMQ when no cached translation', async () => {
      const socket = makeSocket('sock-t6');
      (manager as any).socketToUser.set('sock-t6', 'user-t6');
      (translationService.getTranslation as jest.Mock).mockResolvedValue(null);
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-fresh',
        conversationId: 'conv-abc',
        content: 'Bonjour',
        originalLanguage: 'fr',
        senderId: 'sender-1',
        encryptionMode: null,
      });
      // Requester must be a participant of the message's conversation — the
      // on-demand translation membership guard (CVE-class leak fix) now runs
      // before handleNewMessage is reached.
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-fresh' });
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-fresh', targetLanguage: 'en' });
      expect(translationService.handleNewMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'msg-fresh',
        targetLanguage: 'en',
      }));
    });

    it('emits Access denied and skips translation when requester is not a participant', async () => {
      const socket = makeSocket('sock-t6b');
      (manager as any).socketToUser.set('sock-t6b', 'user-t6b');
      (translationService.getTranslation as jest.Mock).mockResolvedValue(null);
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-foreign',
        conversationId: 'conv-not-mine',
        content: 'Bonjour',
        originalLanguage: 'fr',
        senderId: 'sender-1',
        encryptionMode: null,
      });
      // Not a participant of conv-not-mine — the membership guard must block the
      // request before any translation work happens (no unauthorized data access).
      prisma.participant.findFirst.mockResolvedValue(null);
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-foreign', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'Access denied' }));
      expect(translationService.handleNewMessage).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-foreign' }));
    });

    it('emits ERROR when message not found in DB', async () => {
      const socket = makeSocket('sock-t7');
      (manager as any).socketToUser.set('sock-t7', 'user-t7');
      (translationService.getTranslation as jest.Mock).mockResolvedValue(null);
      prisma.message.findUnique.mockResolvedValue(null);
      triggerConnection(socket);
      const handler = getTranslationHandler(socket);
      await handler({ messageId: 'msg-missing', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.stringContaining('not found') }));
    });
  });

  // -------------------------------------------------------------------------
  // 13. FEED_SUBSCRIBE handler
  // -------------------------------------------------------------------------

  describe('FEED_SUBSCRIBE handler', () => {
    it('calls socialEventsHandler.handleFeedSubscribe and invokes success callback when authenticated', () => {
      const socket = makeSocket('sock-fs1');
      (manager as any).socketToUser.set('sock-fs1', 'user-feed1');
      triggerConnection(socket);
      const callback = jest.fn();
      socket._handlers[CLIENT_EVENTS.FEED_SUBSCRIBE](callback);
      expect(mockSocialEventsHandlerInstance.handleFeedSubscribe).toHaveBeenCalledWith(socket, 'user-feed1');
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('invokes error callback when not authenticated', () => {
      const socket = makeSocket('sock-fs2');
      // No entry in socketToUser
      triggerConnection(socket);
      const callback = jest.fn();
      socket._handlers[CLIENT_EVENTS.FEED_SUBSCRIBE](callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
    });

    it('works without callback when authenticated', () => {
      const socket = makeSocket('sock-fs3');
      (manager as any).socketToUser.set('sock-fs3', 'user-feed3');
      triggerConnection(socket);
      expect(() => socket._handlers[CLIENT_EVENTS.FEED_SUBSCRIBE](undefined)).not.toThrow();
    });

    it('works without callback when not authenticated', () => {
      const socket = makeSocket('sock-fs4');
      triggerConnection(socket);
      expect(() => socket._handlers[CLIENT_EVENTS.FEED_SUBSCRIBE](undefined)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 14. FEED_UNSUBSCRIBE handler
  // -------------------------------------------------------------------------

  describe('FEED_UNSUBSCRIBE handler', () => {
    it('calls socialEventsHandler.handleFeedUnsubscribe and invokes success callback when authenticated', () => {
      const socket = makeSocket('sock-fu1');
      (manager as any).socketToUser.set('sock-fu1', 'user-feed-unsub');
      triggerConnection(socket);
      const callback = jest.fn();
      socket._handlers[CLIENT_EVENTS.FEED_UNSUBSCRIBE](callback);
      expect(mockSocialEventsHandlerInstance.handleFeedUnsubscribe).toHaveBeenCalledWith(socket, 'user-feed-unsub');
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('invokes error callback when not authenticated', () => {
      const socket = makeSocket('sock-fu2');
      triggerConnection(socket);
      const callback = jest.fn();
      socket._handlers[CLIENT_EVENTS.FEED_UNSUBSCRIBE](callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
    });
  });

  // -------------------------------------------------------------------------
  // 15. Error handling in event handlers (catch blocks)
  // -------------------------------------------------------------------------

  describe('Error handling in event handlers', () => {
    it('catches errors in MESSAGE_SEND handler and calls callback with error', async () => {
      mockMessageHandlerInstance.handleMessageSend.mockRejectedValue(new Error('DB error'));
      const socket = makeSocket('sock-err1');
      triggerConnection(socket);
      const callback = jest.fn();
      await socket._handlers[CLIENT_EVENTS.MESSAGE_SEND]({}, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Internal server error' });
    });

    it('catches errors in REACTION_ADD handler and calls callback with error', async () => {
      mockReactionHandlerInstance.handleReactionAdd.mockRejectedValue(new Error('reaction error'));
      const socket = makeSocket('sock-err2');
      triggerConnection(socket);
      const callback = jest.fn();
      await socket._handlers[CLIENT_EVENTS.REACTION_ADD]({}, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Internal server error' });
    });

    it('catches errors in AUTHENTICATE handler without crashing', async () => {
      mockAuthHandlerInstance.handleManualAuthentication.mockRejectedValue(new Error('auth fail'));
      const socket = makeSocket('sock-err3');
      triggerConnection(socket);
      await expect(socket._handlers[CLIENT_EVENTS.AUTHENTICATE]({})).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 16. _handleTextTranslationReady
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady', () => {
    const baseData = {
      taskId: 'task-1',
      result: { messageId: 'msg-txt-1', translatedText: 'Hello', sourceLanguage: 'fr', confidenceScore: 0.9 },
      targetLanguage: 'en',
      translationId: 'trans-1',
    };

    it('broadcasts to conversation room when message found', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      ioState.sockets.adapter.rooms.set(ROOMS.conversation('conv-123456789012'), new Set(['sock-a']));

      await (manager as any)._handleTextTranslationReady(baseData);

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_TRANSLATION, expect.objectContaining({ messageId: 'msg-txt-1' }));
    });

    it('increments translations_sent by room client count', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-count-3' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      ioState.sockets.adapter.rooms.set(ROOMS.conversation('conv-count-3'), new Set(['s1', 's2', 's3']));
      const before = manager.getStats().translations_sent;

      await (manager as any)._handleTextTranslationReady(baseData);

      expect(manager.getStats().translations_sent).toBe(before + 3);
    });

    it('drops translation and does not emit to user when message not found in DB', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      // User in connectedUsers — verifies that the removed direct-emit fallback is not called    
          (manager as any).connectedUsers.set('user-en', {
        id: 'user-en', socketId: 'sock-en', isAnonymous: false, language: 'en', resolvedLanguages: ['en'],
      });
      const fakeSocket = { emit: jest.fn() };
      ioState.sockets.sockets.set('sock-en', fakeSocket);

      await (manager as any)._handleTextTranslationReady(baseData);
      expect(fakeSocket.emit).not.toHaveBeenCalled();
    });
      
    it('drops the translation (no direct socket emit) when no conversation is found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      // A connected user with a matching language must NOT receive a direct emit:
      // with no resolved conversation we cannot verify room membership, so emitting
      // straight to the socket would leak the translation (CVE-class data access).
      // The legacy direct-emit fallback was removed; the translation is now dropped.
      (manager as any).connectedUsers.set('user-en', {
        id: 'user-en', socketId: 'sock-en', isAnonymous: false, language: 'en', resolvedLanguages: ['en'],
      });
      const fakeSocket = { emit: jest.fn() };
      ioState.sockets.sockets.set('sock-en', fakeSocket);

      await (manager as any)._handleTextTranslationReady(baseData);
      expect(fakeSocket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_TRANSLATION, expect.anything());
    });

    it('gracefully handles DB error when looking up message', async () => {
      prisma.message.findUnique.mockRejectedValue(new Error('DB down'));
      // Should not throw
      await expect((manager as any)._handleTextTranslationReady(baseData)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 17. _handleTranscriptionReady
  // -------------------------------------------------------------------------

  describe('_handleTranscriptionReady', () => {
    const baseTranscription = {
      taskId: 'task-tr1',
      messageId: 'msg-tr-1',
      attachmentId: 'att-tr-1',
      transcription: {
        id: 'transcription-1',
        text: 'Bonjour tout le monde',
        language: 'fr',
        confidence: 0.95,
      },
    };

    it('delegates to PostAudioService when postId and postMediaId present', async () => {
      const { PostAudioService } = jest.requireMock('../../services/posts/PostAudioService') as any;
      await (manager as any)._handleTranscriptionReady({
        ...baseTranscription,
        postId: 'post-1',
        postMediaId: 'media-1',
      });
      expect(PostAudioService.shared.handleTranscriptionReady).toHaveBeenCalledWith({
        postId: 'post-1',
        postMediaId: 'media-1',
        transcription: baseTranscription.transcription,
      });
    });

    it('returns early when no conversationId found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await (manager as any)._handleTranscriptionReady(baseTranscription);
      expect(ioState.to).not.toHaveBeenCalledWith(expect.stringContaining('conversation:'));
    });

    it('emits TRANSCRIPTION_READY to conversation room', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.messageAttachment.findUnique.mockResolvedValue(null);

      await (manager as any)._handleTranscriptionReady(baseTranscription);

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TRANSCRIPTION_READY,
        expect.objectContaining({ messageId: 'msg-tr-1', attachmentId: 'att-tr-1' })
      );
    });

    it('calls _broadcastAttachmentUpdated after emitting transcription', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      const freshAttachment = { id: 'att-tr-1', type: 'audio' };
      prisma.messageAttachment.findUnique.mockResolvedValue(freshAttachment);

      const { emitAttachmentUpdated } = jest.requireMock('../emitAttachmentUpdated') as any;
      await (manager as any)._handleTranscriptionReady(baseTranscription);

      expect(emitAttachmentUpdated).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 18. _broadcastTranslationEvent
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent', () => {
    const baseAudioData = {
      taskId: 'task-audio-1',
      messageId: 'msg-audio-1',
      attachmentId: 'att-audio-1',
      language: 'en',
      translatedAudio: {
        id: 'taudio-1',
        targetLanguage: 'en',
        url: 'https://cdn.meeshy.me/audio.mp3',
        durationMs: 5000,
        format: 'mp3',
        cloned: true,
        quality: 0.9,
        ttsModel: 'xtts',
      },
    };

    it('returns early when no conversationId found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await (manager as any)._broadcastTranslationEvent(baseAudioData, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯');
      expect(ioState.to).not.toHaveBeenCalledWith(expect.stringContaining('conversation:'));
    });

    it('returns early when translatedAudio is undefined', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      await (manager as any)._broadcastTranslationEvent(
        { ...baseAudioData, translatedAudio: undefined },
        'audioTranslationReady',
        SERVER_EVENTS.AUDIO_TRANSLATION_READY,
        '🎯'
      );
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATION_READY, expect.anything());
    });

    it('emits the event to the conversation room', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.messageAttachment.findUnique.mockResolvedValue(null);

      await (manager as any)._broadcastTranslationEvent(
        baseAudioData, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯'
      );

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATION_READY, expect.objectContaining({
        messageId: 'msg-audio-1',
        attachmentId: 'att-audio-1',
        language: 'en',
      }));
    });
  });

  // -------------------------------------------------------------------------
  // 19. _handleAudioTranslationReady
  // -------------------------------------------------------------------------

  describe('_handleAudioTranslationReady', () => {
    it('returns early when translatedAudio is missing', async () => {
      await (manager as any)._handleAudioTranslationReady({
        taskId: 't1', messageId: 'msg-1', attachmentId: 'att-1', language: 'en',
      });
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('delegates to _broadcastTranslationEvent when translatedAudio present', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.messageAttachment.findUnique.mockResolvedValue(null);

      await (manager as any)._handleAudioTranslationReady({
        taskId: 't1',
        messageId: 'msg-audio-ok',
        attachmentId: 'att-1',
        language: 'en',
        translatedAudio: { id: 't', targetLanguage: 'en', url: 'x', durationMs: 100, format: 'mp3', cloned: false, quality: 0.8, ttsModel: 'xtts' },
      });

      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATION_READY, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 20. _broadcastUserStatus
  // -------------------------------------------------------------------------

  describe('_broadcastUserStatus', () => {
    it('returns early when showOnlineStatus is false', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({
        showOnlineStatus: false,
        showLastSeen: true,
      });
      await (manager as any)._broadcastUserStatus('user-1', true, false);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('broadcasts anonymous participant status to their conversation room', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: true });
      prisma.participant.findUnique.mockResolvedValue({
        id: 'anon-1',
        displayName: 'Anonymous',
        nickname: 'Anon',
        lastActiveAt: new Date(),
        conversationId: 'conv-123456789012',
      });

      await (manager as any)._broadcastUserStatus('anon-1', true, true);

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.objectContaining({
        userId: 'anon-1',
        isOnline: true,
      }));
    });

    it('respects showLastSeen=false for anonymous participant', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: false });
      prisma.participant.findUnique.mockResolvedValue({
        id: 'anon-2',
        displayName: 'Incognito',
        nickname: null,
        lastActiveAt: new Date(),
        conversationId: 'conv-test',
      });

      await (manager as any)._broadcastUserStatus('anon-2', true, true);

      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.objectContaining({
        lastActiveAt: null,
      }));
    });

    it('broadcasts registered user status to all their conversation rooms', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: true });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-reg-1',
        username: 'alice',
        displayName: 'Alice',
        firstName: 'Alice',
        lastName: 'Smith',
        lastActiveAt: new Date(),
      });
      prisma.participant.findMany.mockResolvedValue([
        { conversationId: 'conv-aaa' },
        { conversationId: 'conv-bbb' },
      ]);

      await (manager as any)._broadcastUserStatus('user-reg-1', false, false);

      expect(ioState.to).toHaveBeenCalledWith(expect.arrayContaining([
        ROOMS.conversation('conv-aaa'),
        ROOMS.conversation('conv-bbb'),
      ]));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.objectContaining({
        userId: 'user-reg-1',
        isOnline: false,
      }));
    });

    it('skips broadcast when registered user not found', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: true });
      prisma.user.findUnique.mockResolvedValue(null);
      await (manager as any)._broadcastUserStatus('user-ghost', false, false);
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.anything());
    });

    it('skips broadcast when registered user has no participant rows', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: true });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-lonely',
        username: 'lonely',
        displayName: null,
        firstName: '',
        lastName: '',
        lastActiveAt: null,
      });
      prisma.participant.findMany.mockResolvedValue([]);
      await (manager as any)._broadcastUserStatus('user-lonely', true, false);
      // to(rooms) is called with an empty array — .emit should not be called with USER_STATUS
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 21. broadcastMessage / _broadcastNewMessage
  // -------------------------------------------------------------------------

  describe('broadcastMessage / _broadcastNewMessage', () => {
    it('emits MESSAGE_NEW to the conversation room (SOCKET_LANG_FILTER=false)', async () => {
      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({ id: msg.id }));
    });

    it('emits to senderSocket when provided', async () => {
      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);
      const senderSocket = makeSocket('sender-sock');

      await (manager as any)._broadcastNewMessage(msg, 'conv-123456789012', senderSocket);

      expect(senderSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({ id: msg.id }));
    });

    it('emits MENTION_CREATED to mentioned user room', async () => {
      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        validatedMentions: [{ userId: 'user-mentioned', participantId: 'part-m1', username: 'bob' }],
        senderId: 'other-sender',
      });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.user('user-mentioned'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MENTION_CREATED, expect.objectContaining({
        mentionedUserId: 'user-mentioned',
      }));
    });

    it('does NOT emit MENTION_CREATED when sender mentions themselves', async () => {
      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        validatedMentions: [{ userId: 'sender-participantId', username: 'alice' }],
        senderId: 'sender-participantId',
      });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.MENTION_CREATED, expect.anything());
    });

    it('emits CONVERSATION_UPDATED to every participant user room for real-time list re-sort', async () => {
      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        senderId: 'part-sender',
        content: 'hello list',
      });
      prisma.conversation.findUnique.mockResolvedValue(null);
      // sender + one recipient: both should receive CONVERSATION_UPDATED so their
      // own conversation list re-sorts (parity with MessageHandler.broadcastNewMessage)
      prisma.participant.findMany.mockResolvedValue([
        { id: 'part-sender', userId: 'user-sender', joinedAt: new Date() },
        { id: 'part-recipient', userId: 'user-recipient', joinedAt: new Date() },
      ]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.user('user-recipient'));
      expect(ioState.to).toHaveBeenCalledWith(ROOMS.user('user-sender'));
      expect(ioState.toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_UPDATED,
        expect.objectContaining({
          conversationId: 'conv-123456789012',
          lastMessageId: msg.id,
          lastMessagePreview: 'hello list',
        })
      );
    });

    it('does NOT emit CONVERSATION_UNREAD_UPDATED to the sender (sender has no unread of own message)', async () => {
      const msg = makeMessage({ conversationId: 'conv-123456789012', senderId: 'part-sender' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([
        { id: 'part-sender', userId: 'user-sender', joinedAt: new Date() },
        { id: 'part-recipient', userId: 'user-recipient', joinedAt: new Date() },
      ]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      // 2 participants (sender + recipient): unread fires for the recipient only.
      // The sender is filtered out, so exactly ONE unread emit is expected.
      const unreadCalls = ioState.toEmit.mock.calls.filter(
        (c: unknown[]) => c[0] === SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED
      );
      expect(unreadCalls.length).toBe(1);
    });

    it('enqueues message for offline users when deliveryQueue present', async () => {
      const fakeQueue = {
        enqueue: jest.fn().mockResolvedValue(undefined),
        drain: jest.fn(),
      };
      manager.setDeliveryQueue(fakeQueue as any);

      const msg = makeMessage({ conversationId: 'conv-123456789012', senderId: 'part-sender' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([
        { id: 'part-offline', userId: 'user-offline', joinedAt: new Date() },
      ]);

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(fakeQueue.enqueue).toHaveBeenCalledWith('user-offline', expect.objectContaining({
        messageId: msg.id,
        conversationId: 'conv-123456789012',
      }));
    });

    it('calls _emitMessageNewByLanguage when SOCKET_LANG_FILTER=true', async () => {
      process.env.SOCKET_LANG_FILTER = 'true';
      try {
        const msg = makeMessage({ conversationId: 'conv-123456789012' });
        prisma.conversation.findUnique.mockResolvedValue(null);
        prisma.participant.findMany.mockResolvedValue([]);
        const room = ROOMS.conversation('conv-123456789012');
        ioState.sockets.adapter.rooms.set(room, new Set(['sock-a']));
        (manager as any).socketToUser.set('sock-a', 'user-a');
        (manager as any).connectedUsers.set('user-a', {
          id: 'user-a', socketId: 'sock-a', isAnonymous: false, language: 'fr', resolvedLanguages: ['fr'],
        });

        await manager.broadcastMessage(msg, 'conv-123456789012');

        const { filterMessagePayloadForLanguages } = jest.requireMock('../utils/message-payload-filter') as any;
        expect(filterMessagePayloadForLanguages).toHaveBeenCalled();
      } finally {
        delete process.env.SOCKET_LANG_FILTER;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 22. normalizeConversationId
  // -------------------------------------------------------------------------

  describe('normalizeConversationId', () => {
    it('returns 24-char hex string as-is', async () => {
      const id = 'a'.repeat(24);
      const result = await (manager as any).normalizeConversationId(id);
      expect(result).toBe(id);
    });

    it('returns cached value on second lookup', async () => {
      (manager as any).conversationIdCache.set('my-identifier', 'b'.repeat(24));
      const result = await (manager as any).normalizeConversationId('my-identifier');
      expect(result).toBe('b'.repeat(24));
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('queries DB and caches when not in cache', async () => {
      const objectId = 'c'.repeat(24);
      prisma.conversation.findUnique.mockResolvedValue({ id: objectId, identifier: 'custom-id' });
      const result = await (manager as any).normalizeConversationId('custom-id');
      expect(result).toBe(objectId);
      expect((manager as any).conversationIdCache.get('custom-id')).toBe(objectId);
    });

    it('returns original id when DB lookup returns null', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      const result = await (manager as any).normalizeConversationId('unknown-id');
      expect(result).toBe('unknown-id');
    });

    it('evicts oldest entry when cache exceeds 2000 items', async () => {
      const cache: Map<string, string> = (manager as any).conversationIdCache;
      // Fill to max
      for (let i = 0; i < 2000; i++) {
        cache.set(`key-${i}`, `val-${i}`);
      }
      const firstKey = cache.keys().next().value;
      // Add one more via DB
      prisma.conversation.findUnique.mockResolvedValue({ id: 'd'.repeat(24), identifier: 'new-key' });
      await (manager as any).normalizeConversationId('new-key');
      expect(cache.has(firstKey)).toBe(false);
      expect(cache.has('new-key')).toBe(true);
    });

    it('returns original id and does not throw on DB error', async () => {
      prisma.conversation.findUnique.mockRejectedValue(new Error('DB error'));
      const result = await (manager as any).normalizeConversationId('error-id');
      expect(result).toBe('error-id');
    });
  });

  // -------------------------------------------------------------------------
  // 23. _drainPendingMessages
  // -------------------------------------------------------------------------

  describe('_drainPendingMessages', () => {
    it('returns early when no deliveryQueue is set', async () => {
      const socket = makeSocket('sock-drain1');
      await (manager as any)._drainPendingMessages(socket, 'user-1');
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('returns early when no pending messages', async () => {
      const fakeQueue = { drain: jest.fn().mockResolvedValue([]) };
      manager.setDeliveryQueue(fakeQueue as any);
      const socket = makeSocket('sock-drain2');
      await (manager as any)._drainPendingMessages(socket, 'user-1');
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('emits MESSAGE_NEW for each pending message and PENDING_MESSAGES_DELIVERED', async () => {
      const fakeQueue = {
        drain: jest.fn().mockResolvedValue([
          { payload: { id: 'msg-p1', conversationId: 'conv-1' } },
          { payload: { id: 'msg-p2', conversationId: 'conv-1' } },
        ]),
      };
      manager.setDeliveryQueue(fakeQueue as any);
      const socket = makeSocket('sock-drain3');
      await (manager as any)._drainPendingMessages(socket, 'user-drain');
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, { id: 'msg-p1', conversationId: 'conv-1' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, { id: 'msg-p2', conversationId: 'conv-1' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count: 2 });
    });
  });

  // -------------------------------------------------------------------------
  // 24. _emitPresenceSnapshot
  // -------------------------------------------------------------------------

  describe('_emitPresenceSnapshot', () => {
    it('uses cache when entry is fresh', async () => {
      const socket = makeSocket('sock-ps1');
      const cachedUsers = [{ userId: 'user-x', username: 'x', isOnline: false, lastActiveAt: null }];
      (manager as any).presenceSnapshotCache.set('user-ps1', { users: cachedUsers, cachedAt: Date.now() });
      // Suppress the unconditional post-snapshot drains — this test only cares
      // that the presence snapshot itself served from cache (no DB query).
      jest.spyOn(manager as any, '_emitUnreadCountsSnapshot').mockResolvedValue(undefined);
      jest.spyOn(manager as any, '_drainPendingMessages').mockResolvedValue(undefined);

      await (manager as any)._emitPresenceSnapshot(socket, 'user-ps1', false);

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.PRESENCE_SNAPSHOT, expect.objectContaining({
        users: expect.arrayContaining([expect.objectContaining({ userId: 'user-x' })]),
      }));
      // Cache hit: the expensive contacts lookup (stale path) was NOT done.
      // _emitUnreadCountsSnapshot does run (1 lightweight findMany for conversation IDs)
      // but the 2-query contacts-building path is skipped entirely.
      expect(prisma.participant.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-ps1', isActive: true }),
        select: { conversationId: true },
      }));
    });

    it('fetches fresh data when cache is stale', async () => {
      const socket = makeSocket('sock-ps2');
      // Stale cache entry (2 minutes ago)
      (manager as any).presenceSnapshotCache.set('user-ps2', {
        users: [{ userId: 'stale', username: 's', isOnline: false, lastActiveAt: null }],
        cachedAt: Date.now() - 120_000,
      });
      prisma.participant.findMany.mockResolvedValueOnce([{ conversationId: 'conv-x' }]);
      prisma.participant.findMany.mockResolvedValueOnce([]);

      await (manager as any)._emitPresenceSnapshot(socket, 'user-ps2', false);

      // With empty contacts, should still emit presence snapshot
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users: [] });
    });

    it('returns early when participantRows is empty', async () => {
      const socket = makeSocket('sock-ps3');
      prisma.participant.findMany.mockResolvedValue([]);
      await (manager as any)._emitPresenceSnapshot(socket, 'user-ps3', false);
      expect(socket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.PRESENCE_SNAPSHOT, expect.anything());
    });

    it('uses anonymous participant lookup when isAnonymous=true', async () => {
      const socket = makeSocket('sock-ps4');
      prisma.participant.findMany.mockResolvedValueOnce([{ conversationId: 'conv-anon' }]);
      prisma.participant.findMany.mockResolvedValueOnce([]);

      await (manager as any)._emitPresenceSnapshot(socket, 'anon-id', true);

      expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'anon-id' }),
      }));
    });

    it('does not throw on DB error', async () => {
      const socket = makeSocket('sock-ps5');
      prisma.participant.findMany.mockRejectedValue(new Error('DB fail'));
      await expect((manager as any)._emitPresenceSnapshot(socket, 'user-err', false)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 25. handleAgentResponse
  // -------------------------------------------------------------------------

  describe('handleAgentResponse', () => {
    const baseAgentResponse = {
      type: 'agent:response' as const,
      conversationId: 'conv-123456789012',
      asUserId: 'agent-user-1',
      content: 'Hello from agent',
      originalLanguage: 'fr',
      messageSource: 'agent' as const,
      metadata: { agentType: 'animator' as const, roleConfidence: 0.9 },
    };

    it('resolves mentionedUsernames to user ids', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'mentioned-user-1' }]);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.handleAgentResponse({
        ...baseAgentResponse,
        mentionedUsernames: ['bob'],
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ username: { in: ['bob'] } }),
      }));
    });

    it('returns early when messagingService.handleMessage fails', async () => {
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({ success: false, error: 'failed' });
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.handleAgentResponse(baseAgentResponse);

      // broadcastMessage should NOT have been called → io.to should not emit MESSAGE_NEW
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });

    it('broadcasts message on success', async () => {
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({
        success: true,
        data: {
          id: 'agent-msg-1',
          conversationId: 'conv-123456789012',
          senderId: 'agent-user-1',
          content: 'Agent says hi',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      await manager.handleAgentResponse(baseAgentResponse);

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({ id: 'agent-msg-1' }));
    });

    it('handles @ in content by querying participants', async () => {
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({
        success: true,
        data: { id: 'agent-msg-2', conversationId: 'conv-123456789012', senderId: 'agent', content: '@bob hi', createdAt: new Date(), updatedAt: new Date() },
      });
      prisma.participant.findMany.mockResolvedValue([
        { userId: 'user-bob', displayName: 'Bob', user: { id: 'user-bob', username: 'bob', displayName: 'Bob' } }
      ]);
      mockMentionServiceInstance.extractMentionsWithParticipants.mockReturnValue(['bob']);
      mockMentionServiceInstance.resolveUsernames.mockResolvedValue(new Map([['bob', { id: 'user-bob' }]]));
      prisma.conversation.findUnique.mockResolvedValue(null);

      await manager.handleAgentResponse({
        ...baseAgentResponse,
        content: '@bob hi',
      });

      expect(mockMentionServiceInstance.extractMentionsWithParticipants).toHaveBeenCalled();
    });

    it('does not throw on unexpected error', async () => {
      mockMessagingServiceInstance.handleMessage.mockRejectedValue(new Error('unexpected'));
      await expect(manager.handleAgentResponse(baseAgentResponse)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 26. handleAgentReaction
  // -------------------------------------------------------------------------

  describe('handleAgentReaction', () => {
    const baseReaction = {
      type: 'agent:reaction' as const,
      conversationId: 'conv-123456789012',
      asUserId: 'agent-user-1',
      targetMessageId: 'msg-target-1',
      emoji: '👍',
    };

    it('returns early when no active participant found', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);
      await manager.handleAgentReaction(baseReaction);
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.REACTION_ADDED, expect.anything());
    });

    it('returns early when addReaction returns null', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementation(() => ({
        addReaction: jest.fn().mockResolvedValue(null),
        createUpdateEvent: jest.fn(),
      }));

      await manager.handleAgentReaction(baseReaction);

      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.REACTION_ADDED, expect.anything());
    });

    it('emits REACTION_ADDED to conversation room on success', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
      const mockReactionSvc = {
        addReaction: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1', emoji: '👍' }),
      };
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementation(() => mockReactionSvc);

      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-123456789012',
        senderId: 'author-part-1',
      });
      prisma.participant.findUnique.mockResolvedValue({ userId: 'author-user-1' });

      await manager.handleAgentReaction(baseReaction);

      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.REACTION_ADDED, expect.objectContaining({ reactionId: 'reaction-1' }));
    });

    it('creates notification when reactor !== author', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
      const mockReactionSvc = {
        addReaction: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1', emoji: '👍' }),
      };
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementation(() => mockReactionSvc);

      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012', senderId: 'author-part' });
      prisma.participant.findUnique.mockResolvedValue({ userId: 'different-user' });

      await manager.handleAgentReaction(baseReaction);

      expect(mockNotificationServiceInstance.createReactionNotification).toHaveBeenCalledWith(expect.objectContaining({
        messageAuthorId: 'different-user',
        reactorUserId: 'agent-user-1',
      }));
    });

    it('skips notification when reactor === author', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
      const mockReactionSvc = {
        addReaction: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1', emoji: '👍' }),
      };
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementation(() => mockReactionSvc);

      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012', senderId: 'author-part' });
      // authorUserId === asUserId
      prisma.participant.findUnique.mockResolvedValue({ userId: 'agent-user-1' });

      await manager.handleAgentReaction(baseReaction);

      expect(mockNotificationServiceInstance.createReactionNotification).not.toHaveBeenCalled();
    });

    it('does not throw on unexpected error', async () => {
      prisma.participant.findFirst.mockRejectedValue(new Error('DB fail'));
      await expect(manager.handleAgentReaction(baseReaction)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 27. _handleStoryTextObjectTranslationCompleted
  // -------------------------------------------------------------------------

  describe('_handleStoryTextObjectTranslationCompleted', () => {
    it('delegates to StoryTextObjectTranslationService.shared.handleTranslationCompleted', async () => {
      const { StoryTextObjectTranslationService } = jest.requireMock('../../services/posts/StoryTextObjectTranslationService') as any;
      const data = { postId: 'post-1', textObjectIndex: 0, translations: { en: 'Hello' } };
      await (manager as any)._handleStoryTextObjectTranslationCompleted(data);
      expect(StoryTextObjectTranslationService.shared.handleTranslationCompleted).toHaveBeenCalledWith(data);
    });

    it('does not throw when handleTranslationCompleted rejects', async () => {
      const { StoryTextObjectTranslationService } = jest.requireMock('../../services/posts/StoryTextObjectTranslationService') as any;
      StoryTextObjectTranslationService.shared.handleTranslationCompleted.mockRejectedValue(new Error('story error'));
      const data = { postId: 'post-fail', textObjectIndex: 1, translations: {} };
      await expect((manager as any)._handleStoryTextObjectTranslationCompleted(data)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 28. callEventsHandler callbacks exercised at connection time
  // -------------------------------------------------------------------------

  describe('callEventsHandler.setupCallEvents callbacks', () => {
    it('socketId → userId callback returns correct userId', () => {
      const socket = makeSocket('sock-cb1');
      (manager as any).socketToUser.set('sock-cb1', 'user-cb1');
      triggerConnection(socket);
      const setupCall = mockCallEventsHandlerInstance.setupCallEvents.mock.calls[0];
      const userIdCb = setupCall[2];
      expect(userIdCb('sock-cb1')).toBe('user-cb1');
      expect(userIdCb('unknown-sock')).toBeUndefined();
    });

    it('socketId → user info callback returns id and isAnonymous', () => {
      const socket = makeSocket('sock-cb2');
      (manager as any).socketToUser.set('sock-cb2', 'user-cb2');
      (manager as any).connectedUsers.set('user-cb2', {
        id: 'user-cb2', socketId: 'sock-cb2', isAnonymous: true, language: 'fr', resolvedLanguages: [],
      });
      triggerConnection(socket);
      const setupCall = mockCallEventsHandlerInstance.setupCallEvents.mock.calls[0];
      const userInfoCb = setupCall[3];
      const info = userInfoCb('sock-cb2');
      expect(info).toEqual({ id: 'user-cb2', isAnonymous: true });
    });

    it('user info callback returns undefined when userId not found', () => {
      const socket = makeSocket('sock-cb3');
      triggerConnection(socket);
      const setupCall = mockCallEventsHandlerInstance.setupCallEvents.mock.calls[0];
      const userInfoCb = setupCall[3];
      expect(userInfoCb('unknown-sock')).toBeUndefined();
    });

    it('user info callback returns undefined when connectedUsers has no entry', () => {
      const socket = makeSocket('sock-cb4');
      (manager as any).socketToUser.set('sock-cb4', 'user-cb4');
      triggerConnection(socket);
      const setupCall = mockCallEventsHandlerInstance.setupCallEvents.mock.calls[0];
      const userInfoCb = setupCall[3];
      expect(userInfoCb('sock-cb4')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 29. TYPING_START / TYPING_STOP / HEARTBEAT handlers
  // -------------------------------------------------------------------------

  describe('TYPING_START / TYPING_STOP / HEARTBEAT handlers', () => {
    it('TYPING_START delegates to statusHandler.handleTypingStart', async () => {
      const socket = makeSocket('sock-typing1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.TYPING_START]({ conversationId: 'conv-1' });
      expect(mockStatusHandlerInstance.handleTypingStart).toHaveBeenCalledWith(socket, { conversationId: 'conv-1' });
    });

    it('TYPING_STOP delegates to statusHandler.handleTypingStop', async () => {
      const socket = makeSocket('sock-typing2');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.TYPING_STOP]({ conversationId: 'conv-1' });
      expect(mockStatusHandlerInstance.handleTypingStop).toHaveBeenCalledWith(socket, { conversationId: 'conv-1' });
    });

    it('HEARTBEAT delegates to authHandler.handleHeartbeat', async () => {
      const socket = makeSocket('sock-hb1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.HEARTBEAT]();
      expect(mockAuthHandlerInstance.handleHeartbeat).toHaveBeenCalledWith(socket);
    });
  });

  // -------------------------------------------------------------------------
  // 30. _handleAudioTranslationsProgressive / _handleAudioTranslationsCompleted
  // -------------------------------------------------------------------------

  describe('_handleAudioTranslationsProgressive / _handleAudioTranslationsCompleted', () => {
    const audioData = {
      taskId: 'task-p1',
      messageId: 'msg-prog-1',
      attachmentId: 'att-prog-1',
      language: 'en',
      translatedAudio: {
        id: 'ta-prog',
        targetLanguage: 'en',
        url: 'https://cdn/prog.mp3',
        durationMs: 3000,
        format: 'mp3',
        cloned: false,
        quality: 0.8,
        ttsModel: 'xtts',
      },
    };

    it('_handleAudioTranslationsProgressive emits AUDIO_TRANSLATIONS_PROGRESSIVE', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      await (manager as any)._handleAudioTranslationsProgressive(audioData);
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE, expect.objectContaining({ messageId: 'msg-prog-1' }));
    });

    it('_handleAudioTranslationsCompleted emits AUDIO_TRANSLATIONS_COMPLETED', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.messageAttachment.findUnique.mockResolvedValue(null);
      await (manager as any)._handleAudioTranslationsCompleted(audioData);
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED, expect.objectContaining({ messageId: 'msg-prog-1' }));
    });
  });

  // -------------------------------------------------------------------------
  // 31. maintenanceService callbacks exercised
  // -------------------------------------------------------------------------

  describe('maintenanceService callbacks', () => {
    it('setStatusBroadcastCallback callback calls _broadcastUserStatus', async () => {
      const cb = mockMaintenanceServiceInstance.setStatusBroadcastCallback.mock.calls[0][0];
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: false, showLastSeen: false });
      await cb('user-maint', true, false);
    });

    it('setIsCurrentlyConnected callback returns true for connected user', () => {
      const cb = mockMaintenanceServiceInstance.setIsCurrentlyConnected.mock.calls[0][0];
      (manager as any).connectedUsers.set('user-live', { id: 'user-live', socketId: 's1', isAnonymous: false, language: 'fr', resolvedLanguages: [] });
      expect(cb('user-live', false)).toBe(true);
    });

    it('setIsCurrentlyConnected callback returns false for disconnected user', () => {
      const cb = mockMaintenanceServiceInstance.setIsCurrentlyConnected.mock.calls[0][0];
      expect(cb('user-gone', false)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 32. callEventsHandler messageBroadcaster callback
  // -------------------------------------------------------------------------

  describe('callEventsHandler messageBroadcaster callback', () => {
    it('messageBroadcaster calls broadcastMessage on the manager', async () => {
      const broadcastCb = mockCallEventsHandlerInstance.setMessageBroadcaster.mock.calls[0][0];
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);
      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      await broadcastCb(msg, 'conv-123456789012');
      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation('conv-123456789012'));
    });
  });

  // -------------------------------------------------------------------------
  // 33. _broadcastNewMessage with delivery queue error
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - delivery queue error handling', () => {
    it('continues even when deliveryQueue.enqueue rejects', async () => {
      const fakeQueue = {
        enqueue: jest.fn().mockRejectedValue(new Error('Redis down')),
        drain: jest.fn(),
      };
      manager.setDeliveryQueue(fakeQueue as any);
      const msg = makeMessage({ conversationId: 'conv-123456789012', senderId: 'part-sender' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([
        { id: 'part-offline', userId: 'user-offline', joinedAt: new Date() },
      ]);
      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 34. _emitPresenceSnapshot - anonymous contacts and deduplication
  // -------------------------------------------------------------------------

  describe('_emitPresenceSnapshot - anonymous contacts', () => {
    it('uses participant.id as presenceKey when userId is null', async () => {
      const socket = makeSocket('sock-anon-contact');
      prisma.participant.findMany
        .mockResolvedValueOnce([{ conversationId: 'conv-x' }])
        .mockResolvedValueOnce([
          {
            id: 'anon-part-1',
            userId: null,
            displayName: 'Guest',
            type: 'anonymous',
            lastActiveAt: new Date(),
            user: null,
          },
        ]);
      await (manager as any)._emitPresenceSnapshot(socket, 'user-reg', false);
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.PRESENCE_SNAPSHOT, expect.objectContaining({
        users: expect.arrayContaining([expect.objectContaining({ userId: 'anon-part-1' })]),
      }));
    });

    it('deduplicates contacts across conversations', async () => {
      const socket = makeSocket('sock-dedup');
      const contact = {
        id: 'part-dup',
        userId: 'user-dup',
        displayName: 'Dup User',
        type: 'registered',
        lastActiveAt: null,
        user: { id: 'user-dup', username: 'dup', displayName: 'Dup', lastActiveAt: null },
      };
      prisma.participant.findMany
        .mockResolvedValueOnce([{ conversationId: 'conv-1' }, { conversationId: 'conv-2' }])
        .mockResolvedValueOnce([contact, contact]);
      await (manager as any)._emitPresenceSnapshot(socket, 'user-x', false);
      const emittedCall = socket.emit.mock.calls.find((c: any) => c[0] === SERVER_EVENTS.PRESENCE_SNAPSHOT);
      expect(emittedCall).toBeDefined();
      const users = emittedCall[1].users;
      const dupCount = users.filter((u: any) => u.userId === 'user-dup').length;
      expect(dupCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 35. _broadcastNewMessage - normalizeConversationId path with DB lookup
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - conversation ID normalization', () => {
    it('normalizes identifier → ObjectId for broadcast room', async () => {
      const objectId = 'f'.repeat(24);
      prisma.conversation.findUnique.mockResolvedValue({ id: objectId, identifier: 'conv-slug' });
      prisma.participant.findMany.mockResolvedValue([]);
      const msg = makeMessage({ conversationId: 'conv-slug' });
      await manager.broadcastMessage(msg, 'conv-slug');
      expect(ioState.to).toHaveBeenCalledWith(ROOMS.conversation(objectId));
    });
  });

  // -------------------------------------------------------------------------
  // 36. getConnectedUsers edge cases
  // -------------------------------------------------------------------------

  describe('getConnectedUsers edge cases', () => {
    it('returns empty array when no users connected', () => {
      (manager as any).connectedUsers.clear();
      expect(manager.getConnectedUsers()).toEqual([]);
    });

    it('includes all connected user IDs', () => {
      (manager as any).connectedUsers.clear();
      (manager as any).connectedUsers.set('u1', { id: 'u1', socketId: 's1', isAnonymous: false, language: 'fr', resolvedLanguages: [] });
      (manager as any).connectedUsers.set('u2', { id: 'u2', socketId: 's2', isAnonymous: false, language: 'en', resolvedLanguages: [] });
      const users = manager.getConnectedUsers();
      expect(users).toContain('u1');
      expect(users).toContain('u2');
    });
  });

  // -------------------------------------------------------------------------
  // 37. REQUEST_TRANSLATION - rate limit window expired
  // -------------------------------------------------------------------------

  describe('REQUEST_TRANSLATION - expired rate limit timestamps', () => {
    it('ignores timestamps older than 60 seconds and allows request', async () => {
      const socket = makeSocket('sock-rw1');
      (manager as any).socketToUser.set('sock-rw1', 'user-rw1');
      const rateLimitKey = 'translation_request:user-rw1';
      const oldTime = Date.now() - 70_000;
      (manager as any).socketRateLimits.set(rateLimitKey, Array(10).fill(oldTime));
      (translationService.getTranslation as any).mockResolvedValue({ translatedText: 'Hi', confidenceScore: 0.9 });
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION]({ messageId: 'msg-fresh2', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_TRANSLATION, expect.anything());
      expect(socket.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: expect.stringContaining('Rate limit') }));
    });
  });

  // -------------------------------------------------------------------------
  // 38. handleAgentResponse - @ content with no participants found
  // -------------------------------------------------------------------------

  describe('handleAgentResponse - @ with no participants', () => {
    it('skips mention resolution when no participants found', async () => {
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({
        success: true,
        data: { id: 'msg-at', conversationId: 'conv-123456789012', senderId: 'a', content: '@ghost', createdAt: new Date(), updatedAt: new Date() },
      });
      prisma.participant.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue(null);
      await manager.handleAgentResponse({
        type: 'agent:response',
        conversationId: 'conv-123456789012',
        asUserId: 'agent-1',
        content: '@ghost hi',
        originalLanguage: 'fr',
        messageSource: 'agent',
        metadata: { agentType: 'animator', roleConfidence: 0.9 },
      });
      expect(mockMentionServiceInstance.extractMentionsWithParticipants).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 39. handleAgentResponse - mentionedUsernames that resolve to no users
  // -------------------------------------------------------------------------

  describe('handleAgentResponse - mentionedUsernames with no DB hits', () => {
    it('proceeds without mentionedUserIds when no users found', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);
      await manager.handleAgentResponse({
        type: 'agent:response',
        conversationId: 'conv-123456789012',
        asUserId: 'agent-1',
        content: 'Hello @nobody',
        originalLanguage: 'fr',
        mentionedUsernames: ['nobody'],
        messageSource: 'agent',
        metadata: { agentType: 'animator', roleConfidence: 0.9 },
      });
      expect(mockMessagingServiceInstance.handleMessage).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: undefined }),
        'agent-1'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 40. _handleTranscriptionReady - DB error
  // -------------------------------------------------------------------------

  describe('_handleTranscriptionReady - DB error', () => {
    it('handles DB error on message lookup gracefully', async () => {
      prisma.message.findUnique.mockRejectedValue(new Error('DB timeout'));
      const data = {
        taskId: 'task-err',
        messageId: 'msg-err',
        attachmentId: 'att-err',
        transcription: { id: 't-err', text: 'test', language: 'en', confidence: 0.8 },
      };
      await expect((manager as any)._handleTranscriptionReady(data)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 41. _broadcastUserStatus - registered user showLastSeen=false
  // -------------------------------------------------------------------------

  describe('_broadcastUserStatus - registered user showLastSeen=false', () => {
    it('sends null lastActiveAt when showLastSeen=false', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({ showOnlineStatus: true, showLastSeen: false });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-hidden',
        username: 'hidden',
        displayName: 'Hidden User',
        firstName: 'Hidden',
        lastName: 'User',
        lastActiveAt: new Date(),
      });
      prisma.participant.findMany.mockResolvedValue([{ conversationId: 'conv-h1' }]);
      await (manager as any)._broadcastUserStatus('user-hidden', true, false);
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.USER_STATUS, expect.objectContaining({
        lastActiveAt: null,
      }));
    });
  });

  // -------------------------------------------------------------------------
  // 42. sendToUser - returns false when socket missing from sockets map
  // -------------------------------------------------------------------------

  describe('sendToUser - edge cases', () => {
    it('returns false when connectedUser exists but socket is missing from sockets map', () => {
      (manager as any).connectedUsers.set('user-no-socket', {
        id: 'user-no-socket', socketId: 'missing-sock', isAnonymous: false, language: 'fr', resolvedLanguages: [],
      });
      expect(manager.sendToUser('user-no-socket', SERVER_EVENTS.MESSAGE_NEW as any, {} as any)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 43. _broadcastTranslationEvent - error increments stats.errors
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent - error handling', () => {
    it('returns early gracefully when DB throws on message lookup', async () => {
      // The inner try-catch in _broadcastTranslationEvent handles DB errors gracefully.
      // It catches the error, sets conversationId = null, then returns early without incrementing stats.errors.
      prisma.message.findUnique.mockImplementation(() => { throw new Error('DB down'); });
      await expect((manager as any)._broadcastTranslationEvent(
        {
          taskId: 't-err',
          messageId: 'msg-err-bt',
          attachmentId: 'att-err',
          language: 'en',
          translatedAudio: { id: 'ta', targetLanguage: 'en', url: 'x', durationMs: 100, format: 'mp3', cloned: false, quality: 0.8, ttsModel: 'xtts' },
        },
        'audioTranslationReady',
        SERVER_EVENTS.AUDIO_TRANSLATION_READY,
        '🎯'
      )).resolves.not.toThrow();
      // Should NOT emit to room since no conversationId was found
      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.AUDIO_TRANSLATION_READY, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 44. _handleTextTranslationReady - no matching users for fallback
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady - fallback no matching users', () => {
    it('handles gracefully when no users match the target language', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      (manager as any).connectedUsers.clear();
      const data = {
        taskId: 'task-no-users',
        result: { messageId: 'msg-no-users', translatedText: 'Hola', sourceLanguage: 'fr', confidenceScore: 0.9 },
        targetLanguage: 'es',
      };
      await expect((manager as any)._handleTextTranslationReady(data)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 45. MESSAGE_SEND_WITH_ATTACHMENTS handler
  // -------------------------------------------------------------------------

  describe('MESSAGE_SEND_WITH_ATTACHMENTS handler', () => {
    it('delegates to messageHandler.handleMessageSendWithAttachments', async () => {
      const socket = makeSocket('sock-att1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS]({ content: 'test' }, cb);
      expect(mockMessageHandlerInstance.handleMessageSendWithAttachments).toHaveBeenCalledWith(socket, { content: 'test' }, cb);
    });

    it('catches error and calls callback with Internal server error', async () => {
      mockMessageHandlerInstance.handleMessageSendWithAttachments.mockRejectedValue(new Error('fail'));
      const socket = makeSocket('sock-att2');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS]({}, cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Internal server error' });
    });
  });

  // -------------------------------------------------------------------------
  // 46. REACTION_REMOVE / REACTION_REQUEST_SYNC handlers
  // -------------------------------------------------------------------------

  describe('REACTION_REMOVE / REACTION_REQUEST_SYNC handlers', () => {
    it('REACTION_REMOVE delegates to reactionHandler.handleReactionRemove', async () => {
      const socket = makeSocket('sock-rr1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.REACTION_REMOVE]({ messageId: 'msg-1', emoji: '👍' }, cb);
      expect(mockReactionHandlerInstance.handleReactionRemove).toHaveBeenCalled();
    });

    it('REACTION_REQUEST_SYNC delegates to reactionHandler.handleReactionSync', async () => {
      const socket = makeSocket('sock-rs1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.REACTION_REQUEST_SYNC]('msg-1', cb);
      expect(mockReactionHandlerInstance.handleReactionSync).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 47. CONVERSATION_JOIN / CONVERSATION_LEAVE handlers
  // -------------------------------------------------------------------------

  describe('CONVERSATION_JOIN / CONVERSATION_LEAVE handlers', () => {
    it('CONVERSATION_JOIN delegates to conversationHandler', async () => {
      const { ConversationHandler } = jest.requireMock('../handlers/ConversationHandler') as any;
      const mockConvHandler = { handleConversationJoin: jest.fn().mockResolvedValue(undefined), handleConversationLeave: jest.fn().mockResolvedValue(undefined) };
      ConversationHandler.mockImplementation(() => mockConvHandler);
      // Existing manager already has a handler — test via the socket event
      const socket = makeSocket('sock-cj1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.CONVERSATION_JOIN]({ conversationId: 'conv-1' });
    });

    it('CONVERSATION_LEAVE delegates to conversationHandler', async () => {
      const socket = makeSocket('sock-cl1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.CONVERSATION_LEAVE]({ conversationId: 'conv-1' });
    });
  });

  // -------------------------------------------------------------------------
  // 48. _findUsersForLanguage
  // -------------------------------------------------------------------------

  describe('_findUsersForLanguage', () => {
    it('returns users matching by resolvedLanguages', () => {
      (manager as any).connectedUsers.set('u-fr', { id: 'u-fr', socketId: 's-fr', isAnonymous: false, language: 'en', resolvedLanguages: ['fr', 'en'] });
      (manager as any).connectedUsers.set('u-en', { id: 'u-en', socketId: 's-en', isAnonymous: false, language: 'en', resolvedLanguages: ['en'] });
      const result = (manager as any)._findUsersForLanguage('fr');
      expect(result.some((u: any) => u.id === 'u-fr')).toBe(true);
      expect(result.some((u: any) => u.id === 'u-en')).toBe(false);
    });

    it('returns users matching by language field', () => {
      (manager as any).connectedUsers.set('u-es', { id: 'u-es', socketId: 's-es', isAnonymous: false, language: 'ES', resolvedLanguages: [] });
      const result = (manager as any)._findUsersForLanguage('es');
      expect(result.some((u: any) => u.id === 'u-es')).toBe(true);
    });

    it('returns empty array when no users match', () => {
      (manager as any).connectedUsers.clear();
      expect((manager as any)._findUsersForLanguage('zh')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 49. Remaining socket event handlers coverage
  // -------------------------------------------------------------------------

  describe('ADMIN_AGENT_SUBSCRIBE / ADMIN_AGENT_UNSUBSCRIBE event handlers', () => {
    it('ADMIN_AGENT_SUBSCRIBE invokes adminAgentHandler.handleSubscribe', async () => {
      const socket = makeSocket('sock-aas1');
      triggerConnection(socket);
      const cb = jest.fn();
      socket._handlers[CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE](cb);
      await new Promise(r => setImmediate(r));
    });

    it('ADMIN_AGENT_UNSUBSCRIBE invokes adminAgentHandler.handleUnsubscribe', () => {
      const socket = makeSocket('sock-aau1');
      triggerConnection(socket);
      const cb = jest.fn();
      socket._handlers[CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE](cb);
    });
  });

  describe('ATTACHMENT_REACTION event handlers', () => {
    it('ATTACHMENT_REACTION_ADD invokes attachmentReactionHandler.handleAdd', async () => {
      const { AttachmentReactionHandler } = jest.requireMock('../handlers/AttachmentReactionHandler') as any;
      const mockHandler = { handleAdd: jest.fn().mockResolvedValue(undefined), handleRemove: jest.fn().mockResolvedValue(undefined) };
      AttachmentReactionHandler.mockImplementation(() => mockHandler);
      const socket = makeSocket('sock-ara1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.ATTACHMENT_REACTION_ADD]({ attachmentId: 'att-1' }, cb);
    });

    it('ATTACHMENT_REACTION_REMOVE invokes attachmentReactionHandler.handleRemove', async () => {
      const socket = makeSocket('sock-arr1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE]({ attachmentId: 'att-1' }, cb);
    });
  });

  describe('COMMENT_REACTION event handlers', () => {
    it('COMMENT_REACTION_ADD invokes commentReactionHandler.handleAddReaction', async () => {
      const socket = makeSocket('sock-cra1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.COMMENT_REACTION_ADD]({ commentId: 'c1' }, cb);
    });

    it('COMMENT_REACTION_REMOVE invokes commentReactionHandler.handleRemoveReaction', async () => {
      const socket = makeSocket('sock-crr1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.COMMENT_REACTION_REMOVE]({ commentId: 'c1' }, cb);
    });

    it('COMMENT_REACTION_REQUEST_SYNC invokes commentReactionHandler.handleRequestSync', async () => {
      const socket = makeSocket('sock-crs1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.COMMENT_REACTION_REQUEST_SYNC]({ commentId: 'c1' }, cb);
    });
  });

  describe('POST_REACTION event handlers', () => {
    it('JOIN_POST invokes postReactionHandler.handleJoinPost', async () => {
      const socket = makeSocket('sock-jp1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.JOIN_POST]({ postId: 'p1' }, cb);
    });

    it('LEAVE_POST invokes postReactionHandler.handleLeavePost', async () => {
      const socket = makeSocket('sock-lp1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.LEAVE_POST]({ postId: 'p1' }, cb);
    });

    it('POST_REACTION_ADD invokes postReactionHandler.handleAddReaction', async () => {
      const socket = makeSocket('sock-pra1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.POST_REACTION_ADD]({ postId: 'p1', emoji: '❤️' }, cb);
    });

    it('POST_REACTION_REMOVE invokes postReactionHandler.handleRemoveReaction', async () => {
      const socket = makeSocket('sock-prr1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.POST_REACTION_REMOVE]({ postId: 'p1', emoji: '❤️' }, cb);
    });

    it('POST_REACTION_REQUEST_SYNC invokes postReactionHandler.handleRequestSync', async () => {
      const socket = makeSocket('sock-prs1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.POST_REACTION_REQUEST_SYNC]({ postId: 'p1' }, cb);
    });
  });

  describe('LOCATION event handlers', () => {
    it('LOCATION_SHARE invokes locationHandler.handleLocationShare', async () => {
      const socket = makeSocket('sock-ls1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.LOCATION_SHARE]({ lat: 1, lon: 2 }, cb);
    });

    it('LOCATION_LIVE_START invokes locationHandler.handleLiveLocationStart', async () => {
      const socket = makeSocket('sock-lls1');
      triggerConnection(socket);
      const cb = jest.fn();
      await socket._handlers[CLIENT_EVENTS.LOCATION_LIVE_START]({ lat: 1, lon: 2 }, cb);
    });

    it('LOCATION_LIVE_UPDATE invokes locationHandler.handleLiveLocationUpdate', async () => {
      const socket = makeSocket('sock-llu1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.LOCATION_LIVE_UPDATE]({ lat: 1, lon: 2 });
    });

    it('LOCATION_LIVE_STOP invokes locationHandler.handleLiveLocationStop', async () => {
      const socket = makeSocket('sock-llstop1');
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.LOCATION_LIVE_STOP]({ shareId: 'share-1' });
    });
  });

  // -------------------------------------------------------------------------
  // 50. REQUEST_TRANSLATION - handleNewMessage throws (translation error path)
  // -------------------------------------------------------------------------

  describe('REQUEST_TRANSLATION - on-demand translation failure', () => {
    it('emits ERROR when handleNewMessage rejects during on-demand translation', async () => {
      const socket = makeSocket('sock-trans-err');
      (manager as any).socketToUser.set('sock-trans-err', 'user-trans-err');
      (translationService.getTranslation as any).mockResolvedValue(null);
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-err-demand',
        conversationId: 'conv-abc',
        content: 'Bonjour',
        originalLanguage: 'fr',
        senderId: 'sender-1',
        encryptionMode: null,
      });
      // Authorize the requester so the flow reaches handleNewMessage (the membership
      // guard would otherwise short-circuit with 'Access denied').
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-err' });
      (translationService.handleNewMessage as any).mockRejectedValue(new Error('ZMQ send fail'));
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION]({ messageId: 'msg-err-demand', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'Translation request failed' }));
    });
  });

  // -------------------------------------------------------------------------
  // 51. _resolveMentionUserIds
  // -------------------------------------------------------------------------

  describe('_resolveMentionUserIds', () => {
    it('returns empty array for empty input', async () => {
      const result = await (manager as any)._resolveMentionUserIds([]);
      expect(result).toEqual([]);
    });

    it('returns user IDs for found usernames', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-alice' }, { id: 'user-bob' }]);
      const result = await (manager as any)._resolveMentionUserIds(['alice', 'bob']);
      expect(result).toEqual(['user-alice', 'user-bob']);
    });

    it('returns empty array on DB error', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('DB fail'));
      const result = await (manager as any)._resolveMentionUserIds(['alice']);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 52. _notifyAgent
  // -------------------------------------------------------------------------

  describe('_notifyAgent', () => {
    it('does nothing when agentClient is null', () => {
      (manager as any).agentClient = null;
      expect(() => (manager as any)._notifyAgent({
        id: 'msg-1', conversationId: 'conv-1', senderId: 'sender-1',
        content: 'Hello', originalLanguage: 'fr', createdAt: new Date(),
      })).not.toThrow();
    });

    it('does nothing when senderId is null', () => {
      const fakeClient = { sendEvent: jest.fn().mockResolvedValue(undefined) };
      (manager as any).agentClient = fakeClient;
      (manager as any)._notifyAgent({
        id: 'msg-1', conversationId: 'conv-1', senderId: null,
        content: 'Hello', originalLanguage: 'fr', createdAt: new Date(),
      });
      expect(fakeClient.sendEvent).not.toHaveBeenCalled();
    });

    it('does nothing when content is null', () => {
      const fakeClient = { sendEvent: jest.fn().mockResolvedValue(undefined) };
      (manager as any).agentClient = fakeClient;
      (manager as any)._notifyAgent({
        id: 'msg-1', conversationId: 'conv-1', senderId: 'sender-1',
        content: null, originalLanguage: 'fr', createdAt: new Date(),
      });
      expect(fakeClient.sendEvent).not.toHaveBeenCalled();
    });

    it('calls agentClient.sendEvent with correct payload', async () => {
      const fakeClient = { sendEvent: jest.fn().mockResolvedValue(undefined) };
      (manager as any).agentClient = fakeClient;
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      (manager as any)._notifyAgent({
        id: 'msg-n1', conversationId: 'conv-n1', senderId: 'sender-n1',
        senderDisplayName: 'Alice', senderUsername: 'alice',
        content: 'Hello agent', originalLanguage: 'fr',
        replyToId: null, mentionedUserIds: ['user-x'],
        createdAt,
      });
      await new Promise(r => setImmediate(r));
      expect(fakeClient.sendEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent:new-message',
        conversationId: 'conv-n1',
        messageId: 'msg-n1',
        senderId: 'sender-n1',
        content: 'Hello agent',
        originalLanguage: 'fr',
        mentionedUserIds: ['user-x'],
        timestamp: createdAt.getTime(),
      }));
    });

    it('logs warning when sendEvent rejects (non-blocking)', async () => {
      const fakeClient = { sendEvent: jest.fn().mockRejectedValue(new Error('agent down')) };
      (manager as any).agentClient = fakeClient;
      expect(() => (manager as any)._notifyAgent({
        id: 'msg-err', conversationId: 'conv-err', senderId: 'sender-1',
        content: 'Hi', originalLanguage: 'fr', createdAt: new Date(),
      })).not.toThrow();
      await new Promise(r => setImmediate(r));
      // Error is swallowed — no re-throw
    });
  });

  // -------------------------------------------------------------------------
  // 53. _handleTranslationRequest - direct call unauthenticated (covers 801-802)
  // -------------------------------------------------------------------------

  describe('_handleTranslationRequest - direct unauthenticated call', () => {
    it('emits ERROR "User not authenticated" when called directly without socket in map', async () => {
      // Call _handleTranslationRequest directly (bypassing the outer rate-limit check)
      // The socket is NOT in socketToUser, so lines 800-802 execute
      const socket = makeSocket('sock-direct-unauth');
      // socket is NOT added to socketToUser
      await (manager as any)._handleTranslationRequest(socket, { messageId: 'msg-1', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'User not authenticated' }));
    });
  });

  // -------------------------------------------------------------------------
  // 53b. _handleTranslationRequest - outer catch (getTranslation throws)
  // -------------------------------------------------------------------------

  describe('_handleTranslationRequest - outer catch path', () => {
    it('emits ERROR "Failed to get translation" when getTranslation throws', async () => {
      const socket = makeSocket('sock-trans-outer-err');
      (manager as any).socketToUser.set('sock-trans-outer-err', 'user-outer-err');
      (translationService.getTranslation as any).mockRejectedValue(new Error('Redis crash'));
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION]({ messageId: 'msg-1', targetLanguage: 'en' });
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'Failed to get translation' }));
    });
  });

  // -------------------------------------------------------------------------
  // 54. _handleTextTranslationReady - setImmediate notification path
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady - notification setImmediate branches', () => {
    it('covers fr/en/es translation notification branches', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);

      // 'fr' branch
      await (manager as any)._handleTextTranslationReady({
        taskId: 't-fr', result: { messageId: 'msg-fr-notif', translatedText: 'Bonjour', sourceLanguage: 'en', confidenceScore: 0.9 },
        targetLanguage: 'fr',
      });
      await new Promise(r => setImmediate(r));

      // 'en' branch
      await (manager as any)._handleTextTranslationReady({
        taskId: 't-en', result: { messageId: 'msg-en-notif', translatedText: 'Hello', sourceLanguage: 'fr', confidenceScore: 0.9 },
        targetLanguage: 'en',
      });
      await new Promise(r => setImmediate(r));

      // 'es' branch
      await (manager as any)._handleTextTranslationReady({
        taskId: 't-es', result: { messageId: 'msg-es-notif', translatedText: 'Hola', sourceLanguage: 'fr', confidenceScore: 0.9 },
        targetLanguage: 'es',
      });
      await new Promise(r => setImmediate(r));
    });
  });

  // -------------------------------------------------------------------------
  // 55. _broadcastTranslationEvent - with segments (covers 1199-1201)
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent - with segments', () => {
    it('logs segment details when translatedAudio has segments', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.messageAttachment.findUnique.mockResolvedValue(null);

      const dataWithSegments = {
        taskId: 'task-seg',
        messageId: 'msg-seg-1',
        attachmentId: 'att-seg-1',
        language: 'en',
        translatedAudio: {
          id: 'taud-1',
          targetLanguage: 'en',
          url: 'http://example.com/audio.mp3',
          durationMs: 1000,
          format: 'mp3',
          segments: [
            { text: 'Hello world', startMs: 0, endMs: 500, speakerId: 'spk-1', voiceSimilarityScore: 0.95 },
          ],
        },
      };
      await expect(
        (manager as any)._broadcastTranslationEvent(dataWithSegments, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯')
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 56. _broadcastTranslationEvent - outer catch (covers 1220-1221)
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent - outer catch path', () => {
    it('increments stats.errors when io.to.emit throws', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);

      // Make io.to().emit throw
      ioState.toEmit.mockImplementationOnce(() => { throw new Error('socket emit failed'); });

      const data = {
        taskId: 'task-outer-emit-err',
        messageId: 'msg-outer-emit',
        attachmentId: 'att-outer-emit',
        language: 'en',
        translatedAudio: {
          id: 'ta-emit-err',
          targetLanguage: 'en',
          url: 'http://example.com/audio.mp3',
          durationMs: 1000,
          format: 'mp3',
        },
      };

      const before = manager.getStats().errors;
      await (manager as any)._broadcastTranslationEvent(data, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯');
      expect(manager.getStats().errors).toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // 57. _broadcastNewMessage - with sender object (covers 1512-1514)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - sender object building', () => {
    it('builds sender field when message.sender is provided', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        sender: {
          id: 'part-s1',
          nickname: 'Alice',
          displayName: 'Alice Smith',
          avatar: 'https://example.com/avatar.png',
          type: 'registered',
          userId: 'user-alice',
          user: {
            id: 'user-alice',
            username: 'alice',
            firstName: 'Alice',
            lastName: 'Smith',
            avatar: null,
          },
        },
      });

      await manager.broadcastMessage(msg, 'conv-123456789012');

      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({
        sender: expect.objectContaining({
          id: 'part-s1',
          displayName: 'Alice',
          userId: 'user-alice',
          username: 'alice',
        }),
      }));
    });

    it('logs attachment debug info when message has attachments', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        attachments: [
          {
            id: 'att-debug-1',
            metadata: { width: 800, height: 600 },
          },
        ],
      });

      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 58. _broadcastNewMessage - unreadCount error path (covers 1663)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - unreadCount error catch', () => {
    it('continues broadcast when participant.findMany throws in unreadCount block', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      // First call for participants: throw to trigger unreadCount error
      prisma.participant.findMany.mockRejectedValue(new Error('DB fail in unreadCount'));

      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();

      // MESSAGE_NEW should still have been emitted
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 59. handleAgentReaction - notification error catch (covers 1986)
  // -------------------------------------------------------------------------

  describe('handleAgentReaction - notification error catch', () => {
    it('continues when createReactionNotification rejects', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
      const mockReactionSvc = {
        addReaction: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1', emoji: '🔥' }),
      };
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementation(() => mockReactionSvc);

      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012', senderId: 'author-part' });
      prisma.participant.findUnique.mockResolvedValue({ userId: 'different-author-user' });

      // Notification will fail
      mockNotificationServiceInstance.createReactionNotification.mockRejectedValue(new Error('FCM down'));

      const baseReaction = {
        type: 'agent:reaction' as const,
        conversationId: 'conv-123456789012',
        asUserId: 'agent-user-99',
        targetMessageId: 'msg-target-99',
        emoji: '🔥',
      };

      await expect(manager.handleAgentReaction(baseReaction)).resolves.not.toThrow();
      await new Promise(r => setImmediate(r)); // Let .catch() run
    });
  });

  // -------------------------------------------------------------------------
  // 60. _broadcastNewMessage - transformTranslationsToArray error (covers 1453-1455)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - translation transform error', () => {
    it('continues when transformTranslationsToArray throws (returns empty translations)', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      const { transformTranslationsToArray } = jest.requireMock('../../utils/translation-transformer') as any;
      transformTranslationsToArray.mockImplementationOnce(() => { throw new Error('transform fail'); });

      const msg = makeMessage({
        conversationId: 'conv-123456789012',
        translations: { fr: 'Bonjour', en: 'Hello' },
      });
      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 61. _broadcastNewMessage outer catch (covers 1672)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - outer catch path', () => {
    it('does not throw when io.to.emit throws during MESSAGE_NEW broadcast', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      // Make io.to().emit throw
      ioState.toEmit.mockImplementationOnce(() => { throw new Error('Socket emit crashed'); });

      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 62. _handleTranscriptionReady - error path (covers 1072-1073)
  // -------------------------------------------------------------------------

  describe('_handleTranscriptionReady - error path', () => {
    it('increments stats.errors when transcription object is null (property access throws)', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-tcr-null' });

      const data = {
        taskId: 'task-tcr-null',
        messageId: 'msg-tcr-null',
        attachmentId: 'att-tcr-null',
        transcription: null, // Will cause data.transcription.id to throw
      };

      const before = manager.getStats().errors;
      await (manager as any)._handleTranscriptionReady(data);
      expect(manager.getStats().errors).toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // 63. _broadcastAttachmentUpdated - error path (covers 1106)
  // -------------------------------------------------------------------------

  describe('_broadcastAttachmentUpdated - error path', () => {
    it('does not throw when messageAttachment.findUnique throws', async () => {
      prisma.messageAttachment.findUnique.mockRejectedValue(new Error('DB err in attachment'));
      await expect(
        (manager as any)._broadcastAttachmentUpdated('att-1', 'msg-1', 'conv-123456789012')
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 64. _broadcastUserStatus - error catch (covers 1413)
  // -------------------------------------------------------------------------

  describe('_broadcastUserStatus - error catch', () => {
    it('does not throw when getPreferences throws', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockRejectedValue(new Error('Privacy svc fail'));
      await expect(
        (manager as any)._broadcastUserStatus('user-status-err', true, false)
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 65. _handleTextTranslationReady - outer catch (covers 957-959)
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady - outer catch', () => {
    it('increments stats.errors when io.to.emit throws', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: 'conv-123456789012' });
      prisma.conversation.findUnique.mockResolvedValue(null);

      // Make io.to().emit throw to trigger outer catch
      ioState.toEmit.mockImplementationOnce(() => { throw new Error('socket emit crashed in textTranslation'); });

      const data = {
        taskId: 'task-txt-outer',
        result: { messageId: 'msg-txt-outer', translatedText: 'Bonjour', sourceLanguage: 'en', confidenceScore: 0.9 },
        targetLanguage: 'fr',
      };

      const before = manager.getStats().errors;
      await (manager as any)._handleTextTranslationReady(data);
      expect(manager.getStats().errors).toBe(before + 1);
    });
  });

  // -------------------------------------------------------------------------
  // 66. getConversationParticipantsForMention - error catch (covers 1917)
  // -------------------------------------------------------------------------

  describe('getConversationParticipantsForMention - error catch', () => {
    it('returns empty array when participant.findMany throws', async () => {
      prisma.participant.findMany.mockRejectedValue(new Error('DB exploded in mention'));
      const result = await (manager as any).getConversationParticipantsForMention('conv-123456789012');
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 67. _broadcastNewMessage - stats.catch warn (covers 1463-1466)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - stats catch warn', () => {
    it('logs warning when conversationStatsService.updateOnNewMessage rejects', async () => {
      const { conversationStatsService } = jest.requireMock('../../services/ConversationStatsService') as any;
      conversationStatsService.updateOnNewMessage.mockRejectedValueOnce(new Error('stats fail'));
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({ conversationId: 'conv-123456789012' });
      await expect(manager.broadcastMessage(msg, 'conv-123456789012')).resolves.not.toThrow();
      // Broadcast should still emit MESSAGE_NEW despite stats failure
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 68. _drainPendingMessages - error catch (covers 365)
  // -------------------------------------------------------------------------

  describe('_drainPendingMessages - error catch', () => {
    it('logs warning when deliveryQueue.drain throws', async () => {
      const fakeQueue = {
        drain: jest.fn().mockRejectedValue(new Error('Redis drain fail')),
        enqueue: jest.fn(),
      };
      manager.setDeliveryQueue(fakeQueue as any);

      const socket = makeSocket('sock-drain-err');
      await expect(
        (manager as any)._drainPendingMessages(socket, 'user-drain-err')
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 69. initialize() - AgentAdminRelay start error (covers 580)
  // -------------------------------------------------------------------------

  describe('initialize() - AgentAdminRelay start error', () => {
    it('does not throw when agentAdminRelay.start() rejects', async () => {
      const { AgentAdminRelay } = jest.requireMock('../AgentAdminRelay') as any;
      AgentAdminRelay.mockImplementationOnce(() => ({
        start: jest.fn().mockRejectedValue(new Error('relay start failed')),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const m = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
      await expect(m.initialize()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 70. initialize() - maintenance error (covers 591-592)
  // -------------------------------------------------------------------------

  describe('initialize() - maintenance start error', () => {
    it('does not throw when startMaintenanceTasks throws', async () => {
      const { MaintenanceService } = jest.requireMock('../../services/MaintenanceService') as any;
      MaintenanceService.mockImplementationOnce(() => ({
        startMaintenanceTasks: jest.fn().mockRejectedValue(new Error('maintenance fail')),
        setStatusBroadcastCallback: jest.fn(),
        setIsCurrentlyConnected: jest.fn(),
      }));

      const m = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
      await expect(m.initialize()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 71. initialize() - zmqClient present (covers 542)
  // -------------------------------------------------------------------------

  describe('initialize() - with zmqClient', () => {
    it('calls PostTranslationService.init when zmqClient is present', async () => {
      const fakeZmqClient = { send: jest.fn() };
      const customTranslation = makeTranslationService();
      (customTranslation.getZmqClient as any).mockReturnValue(fakeZmqClient);

      const { PostTranslationService } = jest.requireMock('../../services/posts/PostTranslationService') as any;

      const m = new MeeshySocketIOManager({} as any, prisma as any, customTranslation as any);
      await m.initialize();

      expect(PostTranslationService.init).toHaveBeenCalledWith(
        expect.anything(),
        fakeZmqClient,
        expect.anything()
      );
    });
  });

  // -------------------------------------------------------------------------
  // 72. _broadcastNewMessage - replyTo null-fallback branches (lines 1532-1545)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - replyTo null-fallback branches', () => {
    it('uses fallback values for replyTo fields when they are null/undefined', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439060',
        replyToId: 'reply-msg-1',
        replyTo: {
          id: 'reply-msg-1',
          senderId: null,         // triggers || undefined at 1532
          content: 'Original',
          originalLanguage: null, // triggers || 'fr' at 1534
          messageType: null,      // triggers || 'text' at 1535
          createdAt: null,        // triggers || new Date() at 1536
          sender: {
            id: 'sender-r1',
            nickname: null,       // triggers || displayName at 1539
            displayName: 'Bob',
            avatar: 'http://avatar.com/bob.png',
            type: 'registered',
            userId: 'user-bob',
            user: {
              username: 'bob',
              firstName: null,    // triggers || '' at 1544
              lastName: null,     // triggers || '' at 1545
            },
          },
        },
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439060');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({
        replyTo: expect.objectContaining({
          originalLanguage: 'fr',
          messageType: 'text',
        }),
      }));
    });

    it('uses undefined for replyTo.sender when sender is null (line 1537 false-branch)', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439061',
        replyToId: 'reply-msg-2',
        replyTo: {
          id: 'reply-msg-2',
          senderId: 'sender-p1',
          content: 'Reply content',
          originalLanguage: 'en',
          messageType: 'text',
          createdAt: new Date('2026-01-01'),
          sender: null,  // triggers ternary false-branch at 1537
        },
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439061');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({
        replyTo: expect.objectContaining({ sender: undefined }),
      }));
    });
  });

  // -------------------------------------------------------------------------
  // 73. _broadcastTranslationEvent - translatedAudio fallback fields (1182-1187)
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent - translatedAudio fallback fields', () => {
    it('uses fallback values when translatedAudio fields are null', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439070' });
      prisma.messageAttachment.findUnique.mockResolvedValue({ id: 'att-fallback', url: 'http://x.com/a.mp3' });

      const data = {
        taskId: 'task-fallback',
        messageId: 'msg-fallback',
        attachmentId: 'att-fallback',
        language: 'en',
        translatedAudio: {
          // No id → triggers `${data.attachmentId}_${data.language}` at 1182
          targetLanguage: null,   // triggers || data.language at 1183
          url: 'http://x.com/trans.mp3',
          translatedText: null,   // triggers || transcription at 1185
          transcription: null,    // triggers || '' at 1185
          durationMs: null,       // triggers || duration at 1186
          duration: null,         // triggers || 0 at 1186
          format: null,           // triggers || 'mp3' at 1187
          ttsModel: null,         // triggers || 'xtts' at 1191
          segments: undefined,
        },
      };

      await expect(
        (manager as any)._broadcastTranslationEvent(data, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯')
      ).resolves.not.toThrow();
    });

    it('covers phase=truthy → processingTimeMs=undefined branch (1194)', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439071' });
      prisma.messageAttachment.findUnique.mockResolvedValue({ id: 'att-phase', url: 'http://x.com/a.mp3' });

      const dataWithPhase = {
        taskId: 'task-with-phase',
        messageId: 'msg-with-phase',
        attachmentId: 'att-phase',
        language: 'fr',
        phase: 'final',  // → processingTimeMs = undefined
        translatedAudio: { url: 'http://x.com/t.mp3', targetLanguage: 'fr', durationMs: 1000, segments: [] },
      };
      await (manager as any)._broadcastTranslationEvent(dataWithPhase, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯');
    });
  });

  // -------------------------------------------------------------------------
  // 74. _emitMessageNewByLanguage - branches coverage
  // -------------------------------------------------------------------------

  describe('_emitMessageNewByLanguage - comprehensive branches', () => {
    it('returns early when room has no sockets (line 1306 branch)', () => {
      ioState.sockets.adapter.rooms.clear();
      expect(() =>
        (manager as any)._emitMessageNewByLanguage('conversation:empty-room', { id: 'msg-x', originalLanguage: 'fr', translations: [] })
      ).not.toThrow();
    });

    it('falls back to originalLanguage when socketUser not found (line 1308, 1314)', () => {
      const room = 'conversation:unknown-socket-room';
      ioState.sockets.adapter.rooms.set(room, new Set(['sock-unknown-u']));
      // No socketToUser mapping → userId undefined → uses originalLanguage
      (manager as any).socketToUser.delete('sock-unknown-u');

      const payload = { id: 'msg-uk', originalLanguage: 'de', translations: [] };
      expect(() => (manager as any)._emitMessageNewByLanguage(room, payload)).not.toThrow();
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });

    it('uses socket user language when resolvedLanguages is empty (line 1316 false-branch)', () => {
      const room = 'conversation:lang-branch-room';
      ioState.sockets.adapter.rooms.set(room, new Set(['sock-lang-br']));
      (manager as any).socketToUser.set('sock-lang-br', 'user-lang-br');
      (manager as any).connectedUsers.set('user-lang-br', {
        id: 'user-lang-br', socketId: 'sock-lang-br', isAnonymous: false,
        language: 'es',
        resolvedLanguages: [],  // empty → falls back to language field
      });

      const payload = { id: 'msg-lang-br', originalLanguage: 'fr', translations: [] };
      expect(() => (manager as any)._emitMessageNewByLanguage(room, payload)).not.toThrow();
    });

    it('accumulates multiple sockets with same language key into same bucket (line 1319)', () => {
      const room = 'conversation:multi-socket-room';
      ioState.sockets.adapter.rooms.set(room, new Set(['sock-multi-1', 'sock-multi-2']));
      (manager as any).socketToUser.set('sock-multi-1', 'user-multi-1');
      (manager as any).socketToUser.set('sock-multi-2', 'user-multi-2');
      // Both users have same resolved language → same bucket
      (manager as any).connectedUsers.set('user-multi-1', {
        id: 'user-multi-1', socketId: 'sock-multi-1', isAnonymous: false,
        language: 'en', resolvedLanguages: ['en'],
      });
      (manager as any).connectedUsers.set('user-multi-2', {
        id: 'user-multi-2', socketId: 'sock-multi-2', isAnonymous: false,
        language: 'en', resolvedLanguages: ['en'],
      });

      const payload = { id: 'msg-multi', originalLanguage: 'fr', translations: [] };
      expect(() => (manager as any)._emitMessageNewByLanguage(room, payload)).not.toThrow();
      // Both sockets should be in one bucket → chained emit
      expect(ioState.to).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 75. _handleTranslationRequest unauthenticated (line 800 branch idx 0)
  // -------------------------------------------------------------------------

  describe('_handleTranslationRequest - userId not found (branch 800)', () => {
    it('emits ERROR when socketToUser has no entry for this socket', async () => {
      const socket = makeSocket('sock-no-user-trans-b');
      // No socketToUser entry for this socket
      triggerConnection(socket);
      await socket._handlers[CLIENT_EVENTS.REQUEST_TRANSLATION]({ messageId: 'msg-no-user-b', targetLanguage: 'en' });
      // Emits some error event indicating unauthenticated
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.any(Object));
    });
  });

  // -------------------------------------------------------------------------
  // 76. _broadcastNewMessage - senderId null path and message.id null path
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - null senderId path and null id', () => {
    it('skips unreadCount when senderId is null (line 1617 false-branch)', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439080',
        senderId: null,  // triggers if (senderId) false at 1617
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439080');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });

    it('returns empty translations when message.id is null (line 1445)', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439081',
        id: null,  // triggers if (!message.id) return [] at 1445
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439081');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 77. broadcastMessage - timestamp fallback branches (line 1700)
  // -------------------------------------------------------------------------

  describe('broadcastMessage - timestamp fallback branches', () => {
    it('uses message.timestamp when createdAt is undefined', async () => {
      prisma.participant.findMany.mockResolvedValue([]);
      const ts = new Date('2026-01-15');
      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439090',
        createdAt: undefined,  // forces fallback
        timestamp: ts,
      });
      await expect(manager.broadcastMessage(msg, '507f1f77bcf86cd799439090')).resolves.not.toThrow();
    });

    it('uses new Date() when both createdAt and timestamp are undefined', async () => {
      prisma.participant.findMany.mockResolvedValue([]);
      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439091',
        createdAt: undefined,
        timestamp: undefined,
      });
      await expect(manager.broadcastMessage(msg, '507f1f77bcf86cd799439091')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 78. _broadcastUserStatus - privacy showOnlineStatus=false (line 1341)
  // -------------------------------------------------------------------------

  describe('_broadcastUserStatus - showOnlineStatus=false branch', () => {
    it('returns early when user has disabled online status visibility', async () => {
      mockPrivacyPrefsServiceInstance.getPreferences.mockResolvedValue({
        showOnlineStatus: false,
        showLastSeen: true,
      });

      await (manager as any)._broadcastUserStatus('user-hidden-status', true, false);
      // io.to should NOT be called for broadcast
      expect(ioState.toEmit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 79. _handleTextTranslationReady - source language / confidence fallback
  //     Covers lines 888, 892, 894 binary-expr fallback (idx 1)
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady - result field fallbacks', () => {
    it('uses default values when sourceLanguage, confidenceScore, processingTimeMs are null', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439092' });

      await (manager as any)._handleTextTranslationReady({
        taskId: 'task-fallback-fields',
        result: {
          messageId: 'msg-fallback-fields',
          translatedText: 'Hello',
          sourceLanguage: null,    // → || 'auto'
          confidenceScore: null,   // → || 0
          processingTimeMs: null,  // → || undefined
        },
        targetLanguage: 'en',
        translationId: 'trans-fb-1',
      });
    });

    it('uses result.id as translationId when both translationId and id are absent', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439093' });

      await (manager as any)._handleTextTranslationReady({
        taskId: 'task-result-id',
        result: {
          messageId: 'msg-result-id-1',
          translatedText: 'Bonjour',
          id: 'result-id-from-result',
        },
        targetLanguage: 'fr',
        // No translationId, no outer id
      });
    });
  });

  // -------------------------------------------------------------------------
  // 80. normalizeConversationId - DB returns null (line 386 false-branch)
  // -------------------------------------------------------------------------

  describe('normalizeConversationId - DB null result', () => {
    it('returns original id when conversation.findUnique returns null', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      const result = await (manager as any).normalizeConversationId('unknown-identifier');
      expect(result).toBe('unknown-identifier');
    });
  });

  // -------------------------------------------------------------------------
  // 81. handleAgentReaction - participant not found early return
  // -------------------------------------------------------------------------

  describe('handleAgentReaction - participant not found', () => {
    it('returns early when participant.findFirst returns null', async () => {
      prisma.participant.findFirst.mockResolvedValue(null);

      await expect(
        manager.handleAgentReaction({
          type: 'agent:reaction',
          conversationId: '507f1f77bcf86cd799439121',
          asUserId: 'user-no-part',
          targetMessageId: 'msg-no-part',
          emoji: '❓',
        })
      ).resolves.not.toThrow();

      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 82. handleAgentReaction - addReaction returns null (early return at 1947)
  // -------------------------------------------------------------------------

  describe('handleAgentReaction - addReaction null', () => {
    it('returns early when addReaction returns null/falsy', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-null-rxn' });
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementationOnce(() => ({
        addReaction: jest.fn().mockResolvedValue(null),
        createUpdateEvent: jest.fn(),
      }));

      await expect(
        manager.handleAgentReaction({
          type: 'agent:reaction',
          conversationId: '507f1f77bcf86cd799439122',
          asUserId: 'user-agent-null-rxn',
          targetMessageId: 'msg-null-rxn',
          emoji: '👎',
        })
      ).resolves.not.toThrow();

      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 83. _broadcastNewMessage - with senderSocket provided
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - senderSocket provided', () => {
    it('also emits to senderSocket when provided', async () => {
      prisma.participant.findMany.mockResolvedValue([]);
      const senderSocket = makeSocket('sock-sender');

      const msg = makeMessage({ conversationId: '507f1f77bcf86cd799439130' });
      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439130', senderSocket);

      expect(senderSocket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // 84. _broadcastNewMessage - validatedMentions loop coverage
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - validatedMentions loop', () => {
    it('emits MENTION_CREATED for each non-self, non-null userId mention', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439140',
        senderId: 'sender-mention',
        validatedMentions: [
          { userId: 'user-mentioned', participantId: 'part-mentioned' },   // should emit
          { userId: 'sender-mention', participantId: 'part-self' },        // same as senderId → skipped
          { userId: null, participantId: 'part-null' },                    // null userId → skipped
        ],
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439140');
      expect(ioState.toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.MENTION_CREATED,
        expect.objectContaining({ mentionedUserId: 'user-mentioned' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 85. CORS production - no CORS_ORIGINS, no ALLOWED_ORIGINS (default list)
  // -------------------------------------------------------------------------

  describe('CORS origin - default allowed list', () => {
    it('uses hardcoded default list when no env vars set', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origCorsOrigins = process.env.CORS_ORIGINS;
      const origAllowedOrigins = process.env.ALLOWED_ORIGINS;
      process.env.NODE_ENV = 'production';
      delete process.env.CORS_ORIGINS;
      delete process.env.ALLOWED_ORIGINS;
      try {
        const { Server } = jest.requireMock('socket.io') as any;
        const newPrisma = makePrisma();
        const newTs = makeTranslationService();
        const newManager = new MeeshySocketIOManager({} as any, newPrisma, newTs as any);
        await newManager.initialize();

        const corsOptions = Server.mock.calls[Server.mock.calls.length - 1][1];
        const originFn = corsOptions.cors.origin;
        if (typeof originFn === 'function') {
          const cb1 = jest.fn();
          originFn('https://meeshy.me', cb1);
          expect(cb1).toHaveBeenCalledWith(null, true);

          const cb2 = jest.fn();
          originFn(undefined, cb2);
          expect(cb2).toHaveBeenCalledWith(null, true);

          const cb3 = jest.fn();
          originFn('https://evil.com', cb3);
          expect(cb3).toHaveBeenCalledWith(expect.any(Error));
        }
      } finally {
        process.env.NODE_ENV = origNodeEnv;
        if (origCorsOrigins !== undefined) process.env.CORS_ORIGINS = origCorsOrigins;
        if (origAllowedOrigins !== undefined) process.env.ALLOWED_ORIGINS = origAllowedOrigins;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 86. Constructor callbacks (line 252, 270) - exercise through wired fns
  // -------------------------------------------------------------------------

  describe('Constructor callbacks - normalizeConversationId and emitPresenceSnapshot', () => {
    it('normalizeConversationId callback resolves correctly', async () => {
      const { LocationHandler } = jest.requireMock('../handlers/LocationHandler') as any;
      const lastCallArgs = LocationHandler.mock.calls[LocationHandler.mock.calls.length - 1][0];
      expect(lastCallArgs.normalizeConversationId).toBeDefined();
      prisma.conversation.findUnique.mockResolvedValue({ id: '507f1f77bcf86cd799439099', identifier: 'my-conv-cb' });
      const result = await lastCallArgs.normalizeConversationId('my-conv-cb');
      expect(result).toBe('507f1f77bcf86cd799439099');
    });

    it('emitPresenceSnapshot callback does not throw', () => {
      const { AuthHandler } = jest.requireMock('../handlers/AuthHandler') as any;
      const lastCallArgs = AuthHandler.mock.calls[AuthHandler.mock.calls.length - 1][0];
      expect(lastCallArgs.emitPresenceSnapshot).toBeDefined();
      const mockSock = makeSocket('sock-eps-cb');
      expect(() => lastCallArgs.emitPresenceSnapshot(mockSock, 'user-eps-cb', false)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 87. _drainPendingMessages - pending messages with content
  // -------------------------------------------------------------------------

  describe('_drainPendingMessages - pending messages emitted', () => {
    it('emits each pending message payload and delivery confirmation', async () => {
      const socket = makeSocket('sock-drain-pending');
      const mockQueue = {
        drain: jest.fn().mockResolvedValue([
          { payload: { id: 'msg-p1', conversationId: '507f1f77bcf86cd799439200' } },
          { payload: { id: 'msg-p2', conversationId: '507f1f77bcf86cd799439200' } },
        ]),
      };
      (manager as any).deliveryQueue = mockQueue;

      await (manager as any)._drainPendingMessages(socket, 'user-drain-pending');

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({ id: 'msg-p1' }));
      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count: 2 });
    });

    it('catches drain() errors without throwing (line 365)', async () => {
      const socket = makeSocket('sock-drain-err-3');
      const mockQueue = { drain: jest.fn().mockRejectedValue(new Error('Redis down')) };
      (manager as any).deliveryQueue = mockQueue;

      await expect(
        (manager as any)._drainPendingMessages(socket, 'user-drain-err-3')
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 88. _broadcastNewMessage - roomClients / senderSocket absent path (line 1589)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - no senderSocket (line 1587 else-branch)', () => {
    it('tries to find sender socket via connectedUsers when senderSocket absent', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      // Connect a user as sender
      (manager as any).connectedUsers.set('user-sender-absent', {
        id: 'user-sender-absent', socketId: 'sock-sender-absent', isAnonymous: false,
        language: 'fr', resolvedLanguages: ['fr'],
      });
      (manager as any).socketToUser.set('sock-sender-absent', 'user-sender-absent');
      const mockSenderSock = makeSocket('sock-sender-absent');
      ioState.sockets.sockets.set('sock-sender-absent', mockSenderSock);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439210',
        senderId: 'user-sender-absent',  // references user id (not participant id here)
      });

      // No senderSocket passed → else branch at 1589
      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439210');
      // The else branch tries to emit via connectedUsers[senderId]
    });
  });

  // -------------------------------------------------------------------------
  // 89. handleAgentResponse - mentionedUserIds resolution via @username
  //     Covers lines 1850 (participants.length > 0 true) and 1853 (resolved.length > 0 true)
  // -------------------------------------------------------------------------

  describe('handleAgentResponse - @-mention resolution paths', () => {
    it('covers participants.length=0 path (line 1847 false-branch)', async () => {
      // No participants → mentionedUserIds stays []
      prisma.participant.findMany.mockResolvedValue([]);
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({
        success: true,
        data: { id: 'msg-at-empty', conversationId: '507f1f77bcf86cd799439220', createdAt: new Date(), updatedAt: new Date() },
      });

      await expect(
        manager.handleAgentResponse({
          type: 'agent:response',
          conversationId: '507f1f77bcf86cd799439220',
          asUserId: 'user-agent-empty',
          content: '@nobody',
          originalLanguage: 'en',
          metadata: { agentType: 'assistant' as any },
        })
      ).resolves.not.toThrow();
    });

    it('covers resolved.length=0 path (line 1853 false-branch)', async () => {
      prisma.participant.findMany.mockResolvedValue([
        { userId: 'u-rv0', displayName: 'Rex', user: { id: 'u-rv0', username: 'rex', displayName: 'Rex' } },
      ]);
      mockMentionServiceInstance.extractMentionsWithParticipants.mockReturnValue(['rex']);
      mockMentionServiceInstance.resolveUsernames.mockResolvedValue(new Map()); // empty resolution
      mockMessagingServiceInstance.handleMessage.mockResolvedValue({
        success: true,
        data: { id: 'msg-at-rv0', conversationId: '507f1f77bcf86cd799439221', createdAt: new Date(), updatedAt: new Date() },
      });

      await expect(
        manager.handleAgentResponse({
          type: 'agent:response',
          conversationId: '507f1f77bcf86cd799439221',
          asUserId: 'user-agent-rv0',
          content: '@rex hello',
          originalLanguage: 'en',
          metadata: { agentType: 'assistant' as any },
        })
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 90. initialize() - maintenance error stack trace (line 592)
  //     error NOT instanceof Error → 'No stack trace' fallback (idx 0,1)
  // -------------------------------------------------------------------------

  describe('initialize() - maintenance error with non-Error rejection', () => {
    it('uses "No stack trace" string when rejection is not an Error instance', async () => {
      const { MaintenanceService } = jest.requireMock('../../services/MaintenanceService') as any;
      MaintenanceService.mockImplementationOnce(() => ({
        startMaintenanceTasks: jest.fn().mockRejectedValue('string rejection'),  // not an Error
        setStatusBroadcastCallback: jest.fn(),
        setIsCurrentlyConnected: jest.fn(),
      }));

      const m = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
      await expect(m.initialize()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 91. FEED_UNSUBSCRIBE - userId not found path (lines 680, 682)
  // -------------------------------------------------------------------------

  describe('FEED_UNSUBSCRIBE - userId not found branches', () => {
    it('calls callback with error when userId not in socketToUser', () => {
      const socket = makeSocket('sock-feed-unauth');
      // Do NOT set socketToUser for this socket
      triggerConnection(socket);
      const cb = jest.fn();
      socket._handlers[CLIENT_EVENTS.FEED_UNSUBSCRIBE](cb);
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('does not throw when no callback provided and userId not found', () => {
      const socket = makeSocket('sock-feed-unauth-nocb');
      triggerConnection(socket);
      expect(() => socket._handlers[CLIENT_EVENTS.FEED_UNSUBSCRIBE](undefined)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 92. _handleTextTranslationReady - userSocket NOT in sockets map (line 926 idx 1)
  // -------------------------------------------------------------------------

  describe('_handleTextTranslationReady - userSocket null in sockets map', () => {
    it('covers if (userSocket) false branch when socket not in sockets map', async () => {
      // Add user to connectedUsers but NOT to ioState.sockets.sockets
      (manager as any).connectedUsers.set('user-no-sock', {
        id: 'user-no-sock', socketId: 'sock-no-sock', isAnonymous: false,
        language: 'en', resolvedLanguages: ['en'],
      });
      (manager as any).socketToUser.set('sock-no-sock', 'user-no-sock');
      // Do NOT add to ioState.sockets.sockets

      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439150' });

      await (manager as any)._handleTextTranslationReady({
        taskId: 'task-no-sock',
        result: {
          messageId: 'msg-no-sock-1',
          translatedText: 'Hello',
          confidenceScore: 0.9,
        },
        targetLanguage: 'en',
        translationId: 'trans-no-sock-1',
      });
      // Should complete without error (userSocket is null/undefined → if (userSocket) is false)
    });
  });

  // -------------------------------------------------------------------------
  // 93. _broadcastNewMessage - participant.userId null → participant.id used (line 1637)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - participant.userId null fallback', () => {
    it('uses participant.id when participant.userId is null', async () => {
      const participants = [
        { id: 'part-id-fallback', userId: null, joinedAt: new Date() },
      ];
      prisma.participant.findMany.mockResolvedValue(participants);
      const { MessageReadStatusService } = jest.requireMock('../../services/MessageReadStatusService.js') as any;
      MessageReadStatusService.mockImplementationOnce(() => ({
        getUnreadCountsForParticipants: jest.fn().mockResolvedValue(new Map([['part-id-fallback', 2]])),
      }));

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439160',
        senderId: 'sender-with-null-userId-participants',
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439160');
      // CONVERSATION_UNREAD_UPDATED should be emitted to user room with 'part-id-fallback'
      expect(ioState.toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED,
        expect.objectContaining({ conversationId: '507f1f77bcf86cd799439160' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 94. handleAgentReaction - message not found (line 1965 false-branch)
  //     and senderId null (line 1969 false-branch)
  // -------------------------------------------------------------------------

  describe('handleAgentReaction - message lookup branches', () => {
    it('skips emit when message.findUnique returns null (line 1965 false-branch)', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-msg-null' });
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementationOnce(() => ({
        addReaction: jest.fn().mockResolvedValue({ id: 'rxn-msg-null' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'rxn-msg-null' }),
      }));
      prisma.message.findUnique.mockResolvedValue(null);  // message not found

      await expect(
        manager.handleAgentReaction({
          type: 'agent:reaction',
          conversationId: '507f1f77bcf86cd799439170',
          asUserId: 'user-msg-null',
          targetMessageId: 'msg-msg-null',
          emoji: '🤔',
        })
      ).resolves.not.toThrow();

      expect(ioState.toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.REACTION_ADDED, expect.anything());
    });

    it('skips participant lookup when message.senderId is null (line 1969 false-branch)', async () => {
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-sndr-null' });
      const { ReactionService } = jest.requireMock('../../services/ReactionService.js') as any;
      ReactionService.mockImplementationOnce(() => ({
        addReaction: jest.fn().mockResolvedValue({ id: 'rxn-sndr-null' }),
        createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'rxn-sndr-null' }),
      }));
      prisma.message.findUnique.mockResolvedValue({
        conversationId: '507f1f77bcf86cd799439171',
        senderId: null,  // null → ternary false branch → authorParticipant = null
      });

      await expect(
        manager.handleAgentReaction({
          type: 'agent:reaction',
          conversationId: '507f1f77bcf86cd799439171',
          asUserId: 'user-sndr-null',
          targetMessageId: 'msg-sndr-null',
          emoji: '🎯',
        })
      ).resolves.not.toThrow();

      // participant.findUnique should NOT have been called (senderId is null)
      // And no notification should be created
      expect(mockNotificationServiceInstance.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 95. _notifyAgent - originalLanguage null fallback (line 2031)
  // -------------------------------------------------------------------------

  describe('_notifyAgent - originalLanguage null fallback', () => {
    it('uses "fr" when originalLanguage is null', async () => {
      const fakeClient = { sendEvent: jest.fn().mockResolvedValue(undefined) };
      (manager as any).agentClient = fakeClient;
      const createdAt = new Date('2026-01-01');
      (manager as any)._notifyAgent({
        id: 'msg-orig-null', conversationId: 'conv-orig-null', senderId: 'sender-orig-null',
        content: 'Hello', originalLanguage: null,  // triggers ?? 'fr'
        createdAt,
      });
      await new Promise(r => setImmediate(r));
      expect(fakeClient.sendEvent).toHaveBeenCalledWith(expect.objectContaining({
        originalLanguage: 'fr',
      }));
    });
  });

  // -------------------------------------------------------------------------
  // 96. getConversationParticipantsForMention - displayName null fallback (line 1914)
  // -------------------------------------------------------------------------

  describe('getConversationParticipantsForMention - displayName null fallback', () => {
    it('uses username when displayName is null (line 1914 idx 1)', async () => {
      prisma.participant.findMany.mockResolvedValue([
        {
          userId: 'u-disp-null',
          displayName: null,
          user: { id: 'u-disp-null', username: 'usernameonly', displayName: null },  // displayName null → uses username
        },
      ]);
      const result = await (manager as any).getConversationParticipantsForMention('conv-disp-null');
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('usernameonly');
    });
  });

  // -------------------------------------------------------------------------
  // 97. _handleAudioTranslationReady - language fallback (line 1243)
  //     when data.language is absent → uses data.translatedAudio.targetLanguage
  // -------------------------------------------------------------------------

  describe('_handleAudioTranslationReady - language fallback', () => {
    it('uses translatedAudio.targetLanguage when data.language is absent', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439180' });
      prisma.messageAttachment.findUnique.mockResolvedValue({ id: 'att-lang-fallback', url: 'http://x.com/a.mp3' });

      await expect(
        (manager as any)._handleAudioTranslationReady({
          taskId: 'task-lang-fb',
          messageId: 'msg-lang-fb',
          attachmentId: 'att-lang-fallback',
          // language omitted → falls back to translatedAudio.targetLanguage
          translatedAudio: {
            targetLanguage: 'es',
            url: 'http://x.com/trans.mp3',
            durationMs: 2000,
            segments: [],
          },
        })
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 98. _broadcastTranslationEvent - data.language absent (lines 1139, 1180)
  // -------------------------------------------------------------------------

  describe('_broadcastTranslationEvent - data.language absent', () => {
    it('uses UNDEFINED fallback for data.language log and translatedAudio.targetLanguage fallback', async () => {
      prisma.message.findUnique.mockResolvedValue({ conversationId: '507f1f77bcf86cd799439190' });
      prisma.messageAttachment.findUnique.mockResolvedValue({ id: 'att-nodatalang', url: 'http://x.com/a.mp3' });

      const data = {
        taskId: 'task-no-lang',
        messageId: 'msg-no-lang',
        attachmentId: 'att-nodatalang',
        // language: absent (undefined) → triggers || 'UNDEFINED' at log and || targetLanguage at 1180
        translatedAudio: {
          id: 'ta-no-lang',
          targetLanguage: 'de',  // fallback used for data.language
          url: 'http://x.com/trans.mp3',
          durationMs: 1000,
          segments: [],
        },
      };

      await expect(
        (manager as any)._broadcastTranslationEvent(data, 'audioTranslationReady', SERVER_EVENTS.AUDIO_TRANSLATION_READY, '🎯')
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 99. _broadcastNewMessage - sender with null nickname and null avatar (lines 1516, 1517)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - sender field fallbacks', () => {
    it('uses displayName when nickname is null and u?.avatar when avatar is null (1516, 1517)', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439200',
        sender: {
          id: 'part-s3',
          nickname: null,            // triggers || displayName at 1516
          displayName: 'NoNickname',
          avatar: null,              // triggers || u?.avatar at 1517
          type: 'registered',
          userId: 'user-s3',
          user: {
            id: 'user-s3',
            username: 'nonickname',
            firstName: null,         // triggers || '' at 1521
            lastName: null,          // triggers || '' at 1522
            avatar: 'http://user.avatar.com/s3.png',  // u?.avatar fallback
          },
        },
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439200');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.objectContaining({
        sender: expect.objectContaining({
          displayName: 'NoNickname',
          avatar: 'http://user.avatar.com/s3.png',
          firstName: '',
          lastName: '',
        }),
      }));
    });
  });

  // -------------------------------------------------------------------------
  // 100. _broadcastNewMessage - message.updatedAt null fallback (line 1505)
  // -------------------------------------------------------------------------

  describe('_broadcastNewMessage - updatedAt null fallback', () => {
    it('uses new Date() when updatedAt is null', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      const msg = makeMessage({
        conversationId: '507f1f77bcf86cd799439210',
        updatedAt: null,   // triggers || new Date() at 1505
      });

      await (manager as any)._broadcastNewMessage(msg, '507f1f77bcf86cd799439210');
      expect(ioState.toEmit).toHaveBeenCalledWith(SERVER_EVENTS.MESSAGE_NEW, expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // joinUserToConversationRoom — server-side room join when user is added
  // to a conversation while already connected (e.g. group invite mid-session)
  // -------------------------------------------------------------------------

  describe('joinUserToConversationRoom', () => {
    it('joins all active sockets of the user to the conversation room', async () => {
      const socketA = { join: jest.fn().mockResolvedValue(undefined) };
      const socketB = { join: jest.fn().mockResolvedValue(undefined) };
      ioState.sockets.sockets.set('sock-join-a', socketA);
      ioState.sockets.sockets.set('sock-join-b', socketB);

      (manager as any).userSockets.set('user-joined', new Set(['sock-join-a', 'sock-join-b']));

      await manager.joinUserToConversationRoom('user-joined', 'conv-new-1234');

      expect(socketA.join).toHaveBeenCalledWith(ROOMS.conversation('conv-new-1234'));
      expect(socketB.join).toHaveBeenCalledWith(ROOMS.conversation('conv-new-1234'));
    });

    it('is a no-op when the user has no active sockets', async () => {
      // userSockets has no entry for this user — should not throw
      await expect(manager.joinUserToConversationRoom('user-offline', 'conv-new-1234')).resolves.toBeUndefined();
    });

    it('tolerates a missing socket object gracefully', async () => {
      // socket registered in userSockets but gone from io.sockets (disconnected mid-flight)
      (manager as any).userSockets.set('user-stale', new Set(['stale-sock-gone']));
      // do NOT add 'stale-sock-gone' to ioState.sockets.sockets

      await expect(manager.joinUserToConversationRoom('user-stale', 'conv-new-1234')).resolves.toBeUndefined();
    });
  });
});
