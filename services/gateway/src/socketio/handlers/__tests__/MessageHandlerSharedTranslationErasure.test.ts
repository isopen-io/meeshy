/**
 * @jest-environment node
 *
 * L'effacement des traductions PARTAGÉES (#9899) sur le transport SOCKET.
 *
 * `message:edit` et `message:delete` sont les transports PRIMAIRES du composer
 * web : les mêmes unités d'effets que les routes REST
 * (`applyMessageEditEffects`, `applyMessageRemovalEffects`) y sont appelées avec
 * un enregistrement que CE handler compose. Le jumeau REST de ce fichier est
 * `__tests__/unit/routes/message-shared-translation-erasure.test.ts` — même
 * table, même course rejouée, mêmes affirmations :
 *
 * - une ÉDITION efface les versions que le nouveau texte périme, ÉPARGNE celle
 *   qu'elle vient d'écrire (la ligne qu'un appareil a partagée entre l'écriture
 *   et l'effacement) et ne touche pas aux autres messages ;
 * - une SUPPRESSION efface toutes les versions ;
 * - une panne de l'effacement ne fait JAMAIS échouer l'opération de la
 *   personne : l'écriture est déjà committée quand l'effacement s'exécute.
 *
 * Les unités d'effets restent les VRAIES. La table `SharedTranslation` en
 * mémoire APPLIQUE le `where` qu'elle reçoit : les assertions lisent les lignes
 * qui RESTENT, jamais « `deleteMany` a été appelé ».
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import {
  ORIGINAL_SOURCE_VERSION,
  sharedOnEditWrite,
  sharedTranslationRow,
  sharedTranslationTable,
  useFakeDateOnly,
} from '../../../__tests__/helpers/shared-translation-table';

// ── Module-level mocks ─────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_n: unknown, fn: () => unknown) => fn()),
  },
}));

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...a: any[]) => mockGetConnectedUser(...a),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
}));

const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: (...a: any[]) => mockValidateSocketEvent(...a),
}));

const mockValidateMessageLength = jest.fn() as jest.Mock<any>;
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: (...a: any[]) => mockValidateMessageLength(...a),
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 5000 },
}));

const mockCheckLimit = jest.fn() as jest.Mock<any>;
const mockGetRateLimitInfo = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'socket:message:send-conv' },
    MESSAGE_EDIT: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:edit' },
    MESSAGE_DELETE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:delete' },
  },
}));

const mockIsBlockedBetween = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...a: any[]) => mockIsBlockedBetween(...a),
}));

const mockResolveParticipant = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...a: any[]) => mockResolveParticipant(...a),
}));

const mockGroupSocketsByLanguage = jest.fn() as jest.Mock<any>;
const mockFilterMessagePayloadForLanguages = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/message-payload-filter', () => ({
  groupSocketsByLanguage: (...a: any[]) => mockGroupSocketsByLanguage(...a),
  filterMessagePayloadForLanguages: (...a: any[]) => mockFilterMessagePayloadForLanguages(...a),
}));

const mockGetCacheStore = jest.fn() as jest.Mock<any>;
const mockCacheGet = jest.fn() as jest.Mock<any>;
const mockCacheSet = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockGetCacheStore(),
}));

const mockResolveMentionedUsers = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: jest.fn(),
  postReplyToFromMetadata: jest.fn(() => null),
  POST_REPLY_SNAPSHOT_SELECT: { id: true },
}));

jest.mock('../../serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: jest.fn((a: unknown) => a),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn(() => Promise.resolve()) },
}));

const mockOnMessageDeleted = jest.fn<any>(() => Promise.resolve());
const mockOnMessageEdited = jest.fn<any>(() => Promise.resolve());
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: jest.fn(() => Promise.resolve()),
    onMessageDeleted: (...a: any[]) => mockOnMessageDeleted(...a),
    onMessageEdited: (...a: any[]) => mockOnMessageEdited(...a),
  },
}));

// ── After all mocks, import the class ──────────────────────────────────────

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_MSG_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const OTHER_MSG_ID = 'b1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_CONV_ID = 'c1d2e3f4a5b6c1d2e3f4a5b6';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';

/** La version d'une édition ANTÉRIEURE : périmée elle aussi dès que le texte change encore. */
const PRIOR_EDIT_VERSION = '2026-10-09T08:00:00.000Z';
const EDITED_CONTENT = 'Edited content';

/** L'horloge du test : fixée, et déplacée par l'écriture d'une édition (voir `sharedOnEditWrite`). */
const CLOCK_START = new Date('2026-10-10T12:00:00.000Z');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSocket(overrides: Partial<Socket> = {}): jest.Mocked<Socket> {
  return {
    id: 'socket-1',
    emit: jest.fn(),
    broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
    ...overrides,
  } as unknown as jest.Mocked<Socket>;
}

/**
 * Un double d'émission PAR SALON. Le précédent en partageait un seul pour tous
 * les salons : « émis à `user:bob` » et « émis à `conversation:X` » y étaient
 * indistinguables, donc toute assertion de ciblage passait par accident — y
 * compris celles qui nommaient le mauvais salon.
 */
/**
 * Le double suit la CHAÎNE : `io.to(a).to(b).emit(e, p)` adresse a ET b, comme
 * le vrai Socket.IO. Rabattre la chaîne sur son premier salon (ce que faisait
 * `target.to.mockReturnValue(target)`) rendait un émetteur chaîné indiscernable
 * d'un émetteur qui aurait oublié tous les salons sauf le premier.
 */
function makeIO(): jest.Mocked<SocketIOServer> {
  const emitsByRoom = new Map<string, any[][]>();
  const chain = (rooms: readonly string[]): any => ({
    to: jest.fn((room: string) => chain([...rooms, room])),
    except: jest.fn(() => chain(rooms)),
    emit: jest.fn((...args: any[]) => {
      for (const room of rooms) emitsByRoom.set(room, [...(emitsByRoom.get(room) ?? []), args]);
      return true;
    }),
  });
  return {
    to: jest.fn((room: string) => chain([room])),
    sockets: { adapter: { rooms: new Map() } },
    __emitsByRoom: emitsByRoom,
  } as unknown as jest.Mocked<SocketIOServer>;
}

/** Les `(event, payload)` réellement émis vers CE salon, et eux seuls. */
function emitsTo(io: SocketIOServer, room: string): any[][] {
  return ((io as unknown as { __emitsByRoom: Map<string, any[][]> }).__emitsByRoom.get(room)) ?? [];
}

function makePrisma(overrides: Record<string, unknown> = {}): jest.Mocked<PrismaClient> {
  return {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    mention: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    post: { findUnique: jest.fn() },
    ...overrides,
  } as unknown as jest.Mocked<PrismaClient>;
}

function makeTranslationService() {
  return { retranslateMessageAsync: jest.fn(() => Promise.resolve()) } as any;
}

function makeAttachmentService() {
  return {
    getAttachment: jest.fn() as jest.Mock<any>,
    deleteAttachment: jest.fn(() => Promise.resolve()) as jest.Mock<any>,
  };
}

function makeReadStatusService() {
  return {
    getUnreadCountsForParticipants: jest.fn() as jest.Mock<any>,
    markMessagesAsReceived: jest.fn() as jest.Mock<any>,
    getLatestMessageSummary: jest.fn() as jest.Mock<any>,
  };
}

function makePrivacyService() {
  return {
    shouldShowReadReceipts: jest.fn() as jest.Mock<any>,
    getPreferencesForUsers: jest.fn() as jest.Mock<any>,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}): MessageHandlerDependencies {
  return {
    io: makeIO(),
    prisma: makePrisma(),
    messagingService: { handleMessage: jest.fn() } as any,
    translationService: makeTranslationService(),
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: { createMessageNotification: jest.fn() } as any,
    connectedUsers: new Map<string, any>(),
    socketToUser: new Map<string, string>(),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: null,
    attachmentService: makeAttachmentService() as any,
    readStatusService: makeReadStatusService() as any,
    privacyPreferencesService: makePrivacyService() as any,
    ...overrides,
  } as MessageHandlerDependencies;
}

function makeSocketUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID, socketId: 'socket-1', isAnonymous: false,
    language: 'fr', resolvedLanguages: ['fr'], userId: USER_ID,
    participantId: PARTICIPANT_ID, ...overrides,
  };
}

// `createdAt` est FRAIS : `admitMessageEdit` le compare à l'horloge, et la date
// factice de ce fichier est la même pour les deux bouts de la comparaison.
function makeMessageRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_MSG_ID,
    conversationId: VALID_CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'Original content',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date(),
    sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null },
    attachments: [],
    conversation: {
      createdAt: new Date('2024-01-01'),
      lastMessageAt: new Date('2024-05-01'),
      participants: [],
    },
    ...overrides,
  };
}

// ── Le monde ───────────────────────────────────────────────────────────────

/**
 * Trois lignes de départ : celle de la version d'ORIGINE et celle d'une édition
 * antérieure — toutes deux sur le message sous test, dans deux langues — et
 * celle d'un AUTRE message, que rien de ce qui touche le premier ne doit
 * emporter.
 */
function buildWorld() {
  const other = sharedTranslationRow({ messageId: OTHER_MSG_ID, sourceVersion: ORIGINAL_SOURCE_VERSION });
  const table = sharedTranslationTable([
    sharedTranslationRow({ messageId: VALID_MSG_ID, sourceVersion: ORIGINAL_SOURCE_VERSION, targetLanguage: 'fr' }),
    sharedTranslationRow({ messageId: VALID_MSG_ID, sourceVersion: PRIOR_EDIT_VERSION, targetLanguage: 'es' }),
    other,
  ]);
  const race = sharedOnEditWrite(table, { messageId: VALID_MSG_ID });
  const deps = makeDeps({ prisma: makePrisma({ sharedTranslation: table.delegate }) });
  const socket = makeSocket();
  const callback = jest.fn<any>();

  deps.socketToUser.set('socket-1', USER_ID);
  deps.connectedUsers.set(USER_ID, makeSocketUser());

  return { table, race, deps, socket, callback, other, handler: new MessageHandler(deps) };
}

type World = ReturnType<typeof buildWorld>;

/** Une panne de la table voisine : le `deleteMany` de l'effacement rejette. */
const withFailingErasure = (world: World): World => {
  world.table.deleteMany.mockRejectedValue(new Error('mongo: connexion perdue'));
  return world;
};

function setupEdit(world: World) {
  (world.deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
  (world.deps.prisma.message.updateMany as jest.Mock<any>).mockImplementation(async ({ data }: any) => {
    world.race.onWrite(data);
    return { count: 1 };
  });
}

function setupDelete(world: World) {
  (world.deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
    id: VALID_MSG_ID,
    conversationId: VALID_CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'trois petits mots',
    messageType: 'text',
    sender: { id: PARTICIPANT_ID, userId: USER_ID },
    conversation: { createdAt: new Date('2024-01-01'), lastMessageAt: new Date('2024-05-01') },
    attachments: [],
  });
  (world.deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
  (world.deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date('2024-06-01') });
  (world.deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  useFakeDateOnly(CLOCK_START);
  mockCheckLimit.mockResolvedValue(true);
  mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
  mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
  mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
    const u = map.get(id);
    return u ? { user: u, realUserId: u.id } : null;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MessageHandler.handleMessageEdit — traductions partagées', () => {
  beforeEach(() => {
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: EDITED_CONTENT },
    });
  });

  const edit = (world: World) =>
    world.handler.handleMessageEdit(
      world.socket,
      { messageId: VALID_MSG_ID, content: EDITED_CONTENT },
      world.callback
    );

  it("efface les traductions partagées des versions que l'édition périme", async () => {
    const world = buildWorld();
    setupEdit(world);

    await edit(world);

    expect(world.callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const written = world.race.writtenEditedAt().toISOString();
    const stale = world.table.remainingVersionsOf(VALID_MSG_ID).filter((version) => version !== written);
    expect(stale).toEqual([]);
  });

  it("épargne la version qu'elle vient d'écrire — celle qu'un appareil a pu partager dans l'intervalle", async () => {
    const world = buildWorld();
    setupEdit(world);

    await edit(world);

    expect(world.table.remainingVersionsOf(VALID_MSG_ID)).toEqual([world.race.writtenEditedAt().toISOString()]);
  });

  it("ne touche pas aux traductions partagées d'un AUTRE message", async () => {
    const world = buildWorld();
    setupEdit(world);

    await edit(world);

    expect(world.table.remainingIds()).toContain(world.other.id);
  });

  it("réussit quand l'effacement échoue : l'édition est écrite, l'acquittement reste un succès", async () => {
    const world = withFailingErasure(buildWorld());
    setupEdit(world);

    await edit(world);

    expect(world.table.deleteMany).toHaveBeenCalledTimes(1);
    expect(world.deps.prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: EDITED_CONTENT }) })
    );
    expect(world.callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('MessageHandler.handleMessageDelete — traductions partagées', () => {
  beforeEach(() => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  const remove = (world: World) =>
    world.handler.handleMessageDelete(world.socket, { messageId: VALID_MSG_ID }, world.callback);

  it('efface les traductions partagées du message supprimé — toutes versions, toutes langues', async () => {
    const world = buildWorld();
    setupDelete(world);

    await remove(world);

    expect(world.callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
    expect(world.table.remainingVersionsOf(VALID_MSG_ID)).toEqual([]);
  });

  it("ne touche pas aux traductions partagées d'un AUTRE message", async () => {
    const world = buildWorld();
    setupDelete(world);

    await remove(world);

    expect(world.table.remainingIds()).toEqual([world.other.id]);
  });

  it("réussit quand l'effacement échoue : le message est supprimé, l'acquittement reste un succès", async () => {
    const world = withFailingErasure(buildWorld());
    setupDelete(world);

    await remove(world);

    expect(world.table.deleteMany).toHaveBeenCalledTimes(1);
    expect(world.deps.prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
    expect(world.callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });
});
