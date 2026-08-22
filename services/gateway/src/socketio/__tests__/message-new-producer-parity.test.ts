/**
 * `message:new` a DEUX producteurs, et un seul décodeur par client.
 *
 * - `MessageHandler.broadcastNewMessage` sert le transport socket
 *   (`message:send`) ;
 * - `MeeshySocketIOManager._broadcastNewMessage` sert le transport REST/ZMQ
 *   (`POST /conversations/:id/messages`, retour du traducteur, messages
 *   d'agent, routes de lien).
 *
 * Les deux construisent leur charge utile À LA MAIN, chacun dans son fichier.
 * Chaque moitié est cohérente avec elle-même — c'est la « quatrième famille »
 * (cf. `services/gateway/CLAUDE.md`) : rien ne garde contre deux producteurs du
 * MÊME événement qui ne disent pas la même chose du MÊME message. Les témoins
 * existants sont eux-mêmes en JUMELLES (un par producteur, chacun dans le
 * harnais de sa classe), donc structurellement incapables de voir un désaccord.
 *
 * Ce fichier fait se rencontrer les DEUX PRODUCTIONS RÉELLES : un seul
 * `MeeshySocketIOManager` est construit, et il porte le vrai `MessageHandler`
 * (non doublé ici, contrairement au harnais du manager). Le même message
 * traverse les deux chemins, et les deux charges utiles sont confrontées.
 *
 * Les affirmations sont SÉPARÉES parce que la séparation EST le diagnostic :
 * enveloppe E2EE, plafond de vue-unique, provenance de transfert, réponse à un
 * post — la première qui tombe nomme la famille de champs perdue, là où un
 * unique `toEqual` laisserait chercher partout.
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
      // Returns an empty Map by default → showReadReceipts falsy → drain delivery skipped
      getPreferencesForUsers: jest.fn().mockResolvedValue(new Map()),
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
const mockResolveUsernamesToIds = jest.fn().mockResolvedValue([]);
const mockResolveMentionedUsers = jest.fn().mockResolvedValue([]);
jest.mock('../../services/MentionService', () => ({
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
      setMessageUpdateBroadcaster: jest.fn(),
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
    handleLiveLocationStart: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationUpdate: jest.fn().mockResolvedValue(undefined),
    handleLiveLocationStop: jest.fn().mockResolvedValue(undefined),
    handleSocketDisconnecting: jest.fn(),
    replayLiveLocationsTo: jest.fn(),
    dispose: jest.fn(),
  })),
}));

let mockAuthHandlerInstance: any;
jest.mock('../handlers/AuthHandler', () => ({
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
jest.mock('../handlers/StatusHandler', () => ({
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
jest.mock('../handlers/ReactionHandler', () => ({
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
jest.mock('../handlers/AttachmentReactionHandler', () => ({
  AttachmentReactionHandler: jest.fn().mockImplementation(() => {
    mockAttachmentReactionHandlerInstance = {
      handleAdd: jest.fn().mockResolvedValue(undefined),
      handleRemove: jest.fn().mockResolvedValue(undefined),
      setDeliveryQueue: jest.fn(),
    };
    return mockAttachmentReactionHandlerInstance;
  }),
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
    addReaction: jest.fn().mockResolvedValue({ reaction: { id: 'reaction-1' } }),
    createUpdateEvent: jest.fn().mockResolvedValue({ reactionId: 'reaction-1' }),
  })),
}));

jest.mock('../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForParticipants: jest.fn().mockResolvedValue(new Map()),
    getUnreadCountsForUser: jest.fn().mockResolvedValue(new Map()),
    markMessagesAsReceived: jest.fn().mockResolvedValue(undefined),
    getLatestMessageSummary: jest.fn().mockResolvedValue({
      totalMembers: 2, deliveredCount: 1, readCount: 0,
    }),
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
  // Keep the REAL `groupSocketsByLanguage` (which normalizes BCP-47 recipient
  // languages via the shared source of truth) so the manager's per-language
  // grouping is exercised against real normalization; only the pure trimming is
  // spied on so tests can assert exactly which languages were requested.
  ...(jest.requireActual('../utils/message-payload-filter') as Record<string, unknown>),
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
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Harnais
// ---------------------------------------------------------------------------

function makeTranslationService() {
  return Object.assign(new EventEmitter(), {
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({ messages: 0, translationRequests: 0 }),
    getZmqClient: jest.fn().mockReturnValue(null),
    getTranslation: jest.fn().mockResolvedValue(null),
    handleNewMessage: jest.fn().mockResolvedValue(undefined),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePrisma(): any {
  const fn = () => jest.fn() as any;
  return {
    conversation: { findUnique: fn().mockResolvedValue(null) },
    message: { findUnique: fn().mockResolvedValue(null), findFirst: fn().mockResolvedValue(null) },
    // `broadcastNewMessage` consulte le post cité quand `storyReplyToId` est
    // posé sans snapshot. Sans cette table le double lèverait un TypeError
    // avalé par le `try` du broadcast — donc aucune émission, donc un témoin
    // qui tombe pour la mauvaise raison.
    post: { findUnique: fn().mockResolvedValue(null) },
    messageAttachment: { findUnique: fn().mockResolvedValue(null) },
    participant: {
      findMany: fn().mockResolvedValue([]),
      findFirst: fn().mockResolvedValue(null),
      findUnique: fn().mockResolvedValue(null),
    },
    user: { findUnique: fn().mockResolvedValue(null), findMany: fn().mockResolvedValue([]) },
  };
}

function getIoState() {
  return (jest.requireMock('socket.io') as any).__state;
}

const CONVERSATION_ID = 'conv-123456789012';

/**
 * Message de référence : il porte UNE valeur de chaque famille du contrat de
 * fil, pour qu'aucun producteur ne puisse rester vert en omettant une famille
 * entière. `content` est VIDE parce que c'est ce que `MessageProcessor` écrit
 * pour un message chiffré (`content: isEncrypted ? '' : …`) — le texte vit
 * dans `encryptedContent`, et un destinataire qui ne reçoit pas l'enveloppe
 * E2EE reçoit donc une bulle VIDE, pas un message dégradé.
 */
function makeContractMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123456789012',
    conversationId: CONVERSATION_ID,
    senderId: 'sender-participantId',
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    translations: [],
    attachments: [],
    validatedMentions: [],
    sender: {
      id: 'sender-participantId',
      userId: 'sender-userId',
      displayName: 'Alice',
      avatar: null,
      type: 'member',
      user: { id: 'sender-userId', username: 'alice', firstName: 'Ali', lastName: 'Ce', avatar: null },
    },
    isEncrypted: true,
    encryptionMode: 'e2ee',
    encryptedContent: 'Y2lwaGVydGV4dA==',
    encryptionMetadata: { iv: 'aXY=', authTag: 'dGFn' },
    isViewOnce: true,
    maxViewOnceCount: 3,
    forwardedFromId: 'msg-forwarded-source',
    forwardedFromConversationId: 'conv-forwarded-source',
    storyReplyToId: 'post-999999999999',
    ...overrides,
  } as any;
}

describe('message:new — les DEUX producteurs disent la même chose du même message', () => {
  let manager: any;
  let messageHandler: any;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;

  /** Charge utile `message:new` réellement passée à `emit`, par producteur. */
  function emittedMessageNew(): Record<string, unknown> | undefined {
    const call = (ioState.toEmit.mock.calls as any[]).find(
      (c) => c[0] === SERVER_EVENTS.MESSAGE_NEW
    );
    return call?.[1] as Record<string, unknown> | undefined;
  }

  async function payloadFromRestPath(message: unknown): Promise<Record<string, unknown>> {
    ioState.toEmit.mockClear();
    await manager.broadcastMessage(message as any, CONVERSATION_ID);
    const payload = emittedMessageNew();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  async function payloadFromSocketPath(message: unknown): Promise<Record<string, unknown>> {
    ioState.toEmit.mockClear();
    await messageHandler.broadcastNewMessage(message as any, CONVERSATION_ID);
    const payload = emittedMessageNew();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    // Le VRAI handler que le manager a construit — pas un second exemplaire :
    // les deux productions confrontées ici sont exactement celles que la
    // passerelle exécute.
    messageHandler = manager.messageHandler;
    expect(typeof messageHandler?.broadcastNewMessage).toBe('function');
  });

  it("l'enveloppe E2EE voyage par les DEUX transports", async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    // Le chemin socket la sert déjà — c'est la référence du contrat.
    expect(socketPayload.isEncrypted).toBe(true);
    expect(socketPayload.encryptionMode).toBe('e2ee');
    expect(socketPayload.encryptedContent).toBe('Y2lwaGVydGV4dA==');

    // Le chemin REST est celui de TOUT message chiffré envoyé depuis iOS
    // (`socketFirstEligible` exclut les DM chiffrés). Sans ces champs, et avec
    // `content` vide par construction, le destinataire reçoit une bulle vide
    // qu'il ne sait même pas être chiffrée.
    expect(restPayload.isEncrypted).toBe(true);
    expect(restPayload.encryptionMode).toBe('e2ee');
    expect(restPayload.encryptedContent).toBe('Y2lwaGVydGV4dA==');
    expect(restPayload.encryptionMetadata).toEqual({ iv: 'aXY=', authTag: 'dGFn' });
    expect(restPayload.encryptedPayload).toEqual(
      expect.objectContaining({ ciphertext: 'Y2lwaGVydGV4dA==' })
    );
  });

  it('le plafond de vue-unique voyage par les DEUX transports', async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    // `isViewOnce` seul ne dit pas COMBIEN de vues restent : les deux moitiés
    // du réglage doivent voyager ensemble, sinon le lecteur applique un
    // plafond qu'il a inventé.
    expect(socketPayload.isViewOnce).toBe(true);
    expect(socketPayload.maxViewOnceCount).toBe(3);
    expect(restPayload.isViewOnce).toBe(true);
    expect(restPayload.maxViewOnceCount).toBe(3);
  });

  it("la provenance d'un transfert voyage par les DEUX transports", async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect(socketPayload.forwardedFromId).toBe('msg-forwarded-source');
    expect(socketPayload.forwardedFromConversationId).toBe('conv-forwarded-source');
    expect(restPayload.forwardedFromId).toBe('msg-forwarded-source');
    expect(restPayload.forwardedFromConversationId).toBe('conv-forwarded-source');
  });

  it('la réponse à un post voyage par les DEUX transports', async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect(socketPayload.storyReplyToId).toBe('post-999999999999');
    expect(restPayload.storyReplyToId).toBe('post-999999999999');
  });

  it("le pseudo d'un expéditeur SANS COMPTE voyage par les DEUX transports", async () => {
    // Un invité de lien partagé n'a pas de ligne `User` : son `displayName`
    // tient lieu de handle. Le chemin REST le sert déjà ; sans lui la bulle
    // temps réel affiche un « @ » vide.
    const message = makeContractMessage({
      sender: {
        id: 'anon-participantId',
        userId: null,
        displayName: 'Invité',
        avatar: null,
        type: 'anonymous',
        user: null,
      },
    });

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect((restPayload.sender as Record<string, unknown>).username).toBe('Invité');
    expect((socketPayload.sender as Record<string, unknown>).username).toBe('Invité');
  });

  it('les DEUX producteurs déclarent le MÊME jeu de clés de contrat', async () => {
    // Le cliquet de la famille : il tombe le jour où un producteur gagne un
    // champ que l'autre n'a pas, quelle que soit la famille — y compris une
    // famille que ce fichier n'a pas encore nommée.
    const message = makeContractMessage();

    const socketKeys = Object.keys(await payloadFromSocketPath(message));
    const restKeys = Object.keys(await payloadFromRestPath(message));

    // `forwardedFrom` / `forwardedFromConversation` / `postReplyTo` /
    // `mentionedUsers` sont des ENRICHISSEMENTS que seul le chemin socket va
    // chercher en base ; ils ne sont pas au contrat de ce témoin, qui garde la
    // charge utile DÉRIVÉE DU MESSAGE. `replyTo` est délibérément de forme
    // différente entre les deux (cf. les commentaires jumeaux aux deux sites).
    // `metadata` et `originalContent` restent HORS contrat PAR DÉCISION, et la
    // décision est écrite ici pour qu'elle ne se relise pas comme un oubli :
    //   - `originalContent` n'est pas une colonne, il DUPLIQUE `content` sur le
    //     fil ; l'ajouter au chemin socket doublerait le poids texte du chemin
    //     le plus chaud du service pour un alias que le web lit en second.
    //   - `metadata` est l'enveloppe brute d'où le chemin socket HISSE ce dont
    //     les clients ont besoin ; seul le chemin REST produit les familles de
    //     messages système (`callSummary`, `joinNotice`) qu'iOS y lit encore.
    // Les retirer du chemin REST serait un RETRAIT, qui demande d'abord de
    // relever leurs consommateurs sur les trois clients — donc un lot à part.
    const enrichments = new Set([
      'forwardedFrom', 'forwardedFromConversation', 'postReplyTo', 'mentionedUsers',
      'trackingLinks', 'location', 'replyTo',
      'metadata', 'originalContent',
    ]);
    const contractOf = (keys: string[]) =>
      keys.filter((k) => !enrichments.has(k)).sort();

    expect(contractOf(restKeys)).toEqual(contractOf(socketKeys));
  });
});
