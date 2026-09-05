/**
 * Doubles `jest.mock` de `message-new-producer-parity*.test.ts` — sortis des
 * fichiers hôtes pour ramener `message-new-producer-parity.test.ts` sous son
 * cliquet de taille après #3614 (issue #5263). Aucune logique de double n'a
 * changé : ce module ne fait que RECEVOIR, verbatim, les enregistrements
 * `jest.mock(...)` qui vivaient en tête des deux fichiers de témoins, avec
 * leurs chemins relatifs ajustés d'un niveau (`__tests__/helpers/` au lieu de
 * `__tests__/`).
 *
 * `jest.mock(modulePath, factory)` clé son registre sur le chemin RÉSOLU du
 * module, pas sur le fichier appelant — un mock enregistré ici intercepte donc
 * exactement les mêmes imports qu'un mock enregistré dans le fichier de test
 * lui-même, tant que chaque fichier hôte importe ce module (pour ses effets de
 * bord d'enregistrement) AVANT d'importer `MeeshySocketIOManager`. C'est le
 * même mécanisme que `setupFiles` de Jest, appliqué par import explicite.
 *
 * Chaque fichier de test a son propre registre de modules (Jest en instancie
 * un par fichier) : importer ce module dans deux fichiers de témoins distincts
 * enregistre les mocks séparément dans chacun, sans état partagé entre eux.
 *
 * `eslint-disable` : le harnais manipule des doubles `any`, comme l'hôte.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// socket.io mock — __state closure (works around ts-jest hoisting limits)
// ---------------------------------------------------------------------------

jest.mock('socket.io', () => {
  const toEmit = jest.fn();
  const toChain: Record<string, unknown> = { emit: toEmit };
  const to = jest.fn().mockReturnValue(toChain);
  // Allow chaining: io.to(a).to(b).emit(...)
  toChain.to = to;
  const except = jest.fn().mockReturnValue(toChain);
  // Allow chaining: io.to(a).except(socketIds).emit(...)
  toChain.except = except;

  const on = jest.fn();
  const emit = jest.fn();
  const close = jest.fn();
  const sockets = {
    sockets: new Map<string, unknown>(),
    adapter: { rooms: new Map<string, Set<string>>() },
  };

  const state = { on, emit, to, toEmit, toChain, except, close, sockets, connectionHandler: null as any };
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
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => {
    mockAttachmentServiceInstance = { processAttachments: jest.fn().mockResolvedValue([]) };
    return mockAttachmentServiceInstance;
  }),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

let mockMaintenanceServiceInstance: any;
jest.mock('../../../services/MaintenanceService', () => ({
  MaintenanceService: jest.fn().mockImplementation(() => {
    mockMaintenanceServiceInstance = {
      startMaintenanceTasks: jest.fn().mockResolvedValue(undefined),
      setStatusBroadcastCallback: jest.fn(),
      setIsCurrentlyConnected: jest.fn(),
      setSessionRevoker: jest.fn(),
    };
    return mockMaintenanceServiceInstance;
  }),
}));

let mockStatusServiceInstance: any;
jest.mock('../../../services/StatusService', () => ({
  StatusService: jest.fn().mockImplementation(() => {
    mockStatusServiceInstance = {
      updateUserOnline: jest.fn().mockResolvedValue(undefined),
      updateUserOffline: jest.fn().mockResolvedValue(undefined),
    };
    return mockStatusServiceInstance;
  }),
}));

let mockPrivacyPrefsServiceInstance: any;
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => {
    mockPrivacyPrefsServiceInstance = {
      getPreferences: jest.fn().mockResolvedValue({
        showOnlineStatus: true,
        showLastSeen: true,
      }),
      // Returns an empty Map by default → showReadReceipts falsy → drain delivery skipped
      getPreferencesForUsers: jest.fn().mockResolvedValue(new Map()),
    };
    return mockPrivacyPrefsServiceInstance;
  }),
}));

let mockNotificationServiceInstance: any;
// Double PROLONGÉ, jamais remplacé : ce module exporte aussi les fonctions PURES
// du masquage de protection (`protectedPreview`, `maskedAttachment`), que la
// composition de `message:new` appelle pour la citation. Un double partiel les
// rendait `undefined` — le broadcast levait, et les DEUX producteurs n'émettaient
// plus rien (cf. § « Un double PARTIEL d'un module perd en silence tout ce que le
// module GAGNE » du CLAUDE.md de la passerelle).
jest.mock('../../../services/notifications/NotificationService', () => ({
  ...(jest.requireActual('../../../services/notifications/NotificationService') as Record<string, unknown>),
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
const mockResolveUsernamesToIds = jest.fn().mockResolvedValue([]);
const mockResolveMentionedUsers = jest.fn().mockResolvedValue([]);
jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => {
    mockMentionServiceInstance = {
      extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
      resolveUsernames: jest.fn().mockResolvedValue(new Map()),
    };
    return mockMentionServiceInstance;
  }),
  resolveUsernamesToIds: (...a: any[]) => mockResolveUsernamesToIds(...a),
  // `MessageHandler.broadcastNewMessage` importe AUSSI `resolveMentionedUsers`.
  // Un double PARTIEL le laisserait `undefined` : l'appel lèverait un TypeError
  // SYNCHRONE que le `try` du broadcast avale, et aucune charge utile ne serait
  // émise — le témoin verrait « le producteur socket n'émet rien » au lieu du
  // désaccord qu'il instruit (cf. CLAUDE.md § « un double PARTIEL »).
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

let mockMessagingServiceInstance: any;
jest.mock('../../../services/MessagingService', () => ({
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
jest.mock('../../CallEventsHandler', () => ({
  CallEventsHandler: jest.fn().mockImplementation(() => {
    mockCallEventsHandlerInstance = {
      setMessageBroadcaster: jest.fn(),
      setMessageUpdateBroadcaster: jest.fn(),
      setNotificationService: jest.fn(),
      setPushNotificationService: jest.fn(),
      setZmqClient: jest.fn(),
      setupCallEvents: jest.fn(),
    };
    return mockCallEventsHandlerInstance;
  }),
}));

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({})),
}));

let mockSocialEventsHandlerInstance: any;
jest.mock('../../handlers/SocialEventsHandler', () => ({
  SocialEventsHandler: jest.fn().mockImplementation(() => {
    mockSocialEventsHandlerInstance = {
      handleFeedSubscribe: jest.fn(),
      handleFeedUnsubscribe: jest.fn(),
    };
    return mockSocialEventsHandlerInstance;
  }),
}));

jest.mock('../../handlers/LocationHandler', () => ({
  LocationHandler: jest.fn().mockImplementation(() => ({
    handleLiveLocationStart: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationUpdate: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationStop: jest.fn().mockResolvedValue(undefined),
    handleSocketDisconnecting: jest.fn(),
    replayLiveLocationsTo: jest.fn(),
    dispose: jest.fn(),
  })),
}));

let mockAuthHandlerInstance: any;
jest.mock('../../handlers/AuthHandler', () => ({
  AuthHandler: jest.fn().mockImplementation(() => {
    mockAuthHandlerInstance = {
      handleTokenAuthentication: jest.fn(),
      handleManualAuthentication: jest.fn().mockResolvedValue(undefined),
      handleHeartbeat: jest.fn().mockResolvedValue(undefined),
      handleEnginePong: jest.fn(),
      handleDisconnection: jest.fn().mockResolvedValue(undefined),
    };
    return mockAuthHandlerInstance;
  }),
}));

let mockStatusHandlerInstance: any;
jest.mock('../../handlers/StatusHandler', () => ({
  StatusHandler: jest.fn().mockImplementation(() => {
    mockStatusHandlerInstance = {
      handleTypingStart: jest.fn().mockResolvedValue(undefined),
      handleTypingStop: jest.fn().mockResolvedValue(undefined),
      invalidateIdentityCache: jest.fn(),
      clearTypingThrottle: jest.fn(),
      handleSocketDisconnecting: jest.fn().mockResolvedValue(undefined),
    };
    return mockStatusHandlerInstance;
  }),
}));

let mockReactionHandlerInstance: any;
jest.mock('../../handlers/ReactionHandler', () => ({
  ReactionHandler: jest.fn().mockImplementation(() => {
    mockReactionHandlerInstance = {
      handleReactionAdd: jest.fn().mockResolvedValue(undefined),
      handleReactionRemove: jest.fn().mockResolvedValue(undefined),
      handleReactionSync: jest.fn().mockResolvedValue(undefined),
      setDeliveryQueue: jest.fn(),
    };
    return mockReactionHandlerInstance;
  }),
}));

let mockAttachmentReactionHandlerInstance: any;
jest.mock('../../handlers/AttachmentReactionHandler', () => ({
  AttachmentReactionHandler: jest.fn().mockImplementation(() => {
    mockAttachmentReactionHandlerInstance = {
      handleAdd: jest.fn().mockResolvedValue(undefined),
      handleRemove: jest.fn().mockResolvedValue(undefined),
      setDeliveryQueue: jest.fn(),
    };
    return mockAttachmentReactionHandlerInstance;
  }),
}));

jest.mock('../../../services/AttachmentReactionService', () => ({
  AttachmentReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../handlers/CommentReactionHandler', () => ({
  CommentReactionHandler: jest.fn().mockImplementation(() => ({
    handleAddReaction: jest.fn().mockResolvedValue(undefined),
    handleRemoveReaction: jest.fn().mockResolvedValue(undefined),
    handleRequestSync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/CommentReactionService', () => ({
  CommentReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../handlers/PostReactionHandler', () => ({
  PostReactionHandler: jest.fn().mockImplementation(() => ({
    handleJoinPost: jest.fn().mockResolvedValue(undefined),
    handleLeavePost: jest.fn().mockResolvedValue(undefined),
    handleAddReaction: jest.fn().mockResolvedValue(undefined),
    handleRemoveReaction: jest.fn().mockResolvedValue(undefined),
    handleRequestSync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/PostReactionService', () => ({
  PostReactionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../handlers/ConversationHandler', () => ({
  ConversationHandler: jest.fn().mockImplementation(() => ({
    handleConversationJoin: jest.fn().mockResolvedValue(undefined),
    handleConversationLeave: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../handlers/AdminAgentHandler', () => ({
  AdminAgentHandler: jest.fn().mockImplementation(() => ({
    handleSubscribe: jest.fn().mockResolvedValue(undefined),
    handleUnsubscribe: jest.fn(),
  })),
}));

let mockAgentAdminRelayInstance: any;
jest.mock('../../AgentAdminRelay', () => ({
  AgentAdminRelay: jest.fn().mockImplementation(() => {
    mockAgentAdminRelayInstance = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    return mockAgentAdminRelayInstance;
  }),
}));

jest.mock('../../../services/ReactionService.js', () => ({
  ReactionService: jest.fn().mockImplementation(() => ({
    addReaction: jest.fn().mockResolvedValue({ reaction: { id: 'reaction-1' } }),
    createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1' }),
  })),
}));

jest.mock('../../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForParticipants: jest.fn().mockResolvedValue(new Map()),
    getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    markMessagesAsReceived: jest.fn().mockResolvedValue(undefined),
    getLatestMessageSummary: jest.fn().mockResolvedValue({
      totalMembers: 2, deliveredCount: 1, readCount: 0,
    }),
  })),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn().mockImplementation(() => ({
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    init: jest.fn(),
    shared: {
      handleTranscriptionReady: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    init: jest.fn(),
  },
}));

jest.mock('../../../services/posts/StoryTextObjectTranslationService', () => ({
  StoryTextObjectTranslationService: {
    init: jest.fn(),
    shared: {
      handleTranslationCompleted: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../emitAttachmentUpdated', () => ({
  emitAttachmentUpdated: jest.fn(),
}));

jest.mock('../../utils/message-payload-filter', () => ({
  // Keep the REAL `groupSocketsByLanguage` (which normalizes BCP-47 recipient
  // languages via the shared source of truth) so the manager's per-language
  // grouping is exercised against real normalization; only the pure trimming is
  // spied on so tests can assert exactly which languages were requested.
  ...(jest.requireActual('../../utils/message-payload-filter') as Record<string, unknown>),
  filterMessagePayloadForLanguages: jest.fn().mockImplementation((payload: unknown) => payload),
}));

jest.mock('../../utils/resolved-languages-refresh', () => ({
  applyResolvedLanguagesRefresh: jest.fn(),
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn().mockReturnValue([]),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

/**
 * Lit l'état du double `socket.io` de CE fichier de test — chaque fichier hôte
 * a son propre registre de mocks, donc son propre `__state`.
 */
export function getIoState() {
  return (jest.requireMock('socket.io') as any).__state;
}
