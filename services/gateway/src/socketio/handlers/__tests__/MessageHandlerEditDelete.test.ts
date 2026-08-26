/**
 * @jest-environment node
 *
 * Tests for MessageHandler.handleMessageEdit and handleMessageDelete.
 * These methods were added in feat(gateway): implement WebSocket message:edit
 * and message:delete handlers but had 0% test coverage.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';

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
const VALID_CONV_ID = 'c1d2e3f4a5b6c1d2e3f4a5b6';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';

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

// `createdAt` et `messageType` appartiennent au socle, pas aux surcharges.
//
// Le socle décrivait un enregistrement SANS `createdAt`. La charge utile
// diffusée n'en souffrait pas — `buildMessageEditedCore` replie les deux champs
// (`message.createdAt || new Date()`, `message.messageType || 'text'`), et c'est
// mesuré, pas supposé. Le dommage était en amont, sur la porte d'ADMISSION :
//
//   - `admitMessageEdit` lit `createdAt` pour la fenêtre de 24h. Absent, il
//     donne `NaN`, et la comparaison est écrite exprès de sorte que `!(NaN > w)`
//     ADMETTE. Presque tous les témoins de ce fichier franchissaient donc la
//     fenêtre par ABSENCE de date, jamais par fraîcheur — la porte était
//     traversée sans être exercée ;
//   - le seul témoin qui vérifie les sept champs requis par `SocketIOMessage`
//     avait donc besoin d'un vrai `createdAt`, et il l'a écrit en DATE ABSOLUE
//     (`2026-08-22T10:00:00Z`). Vingt-quatre heures plus tard la fenêtre l'a
//     refusé : plus aucune diffusion, et le gardien du CONTRAT tombait pour un
//     motif étranger au contrat qu'il garde. Un correctif pressé (repousser le
//     littéral) réarmerait la même bombe pour le lendemain.
//
// Le socle porte donc un message FRAIS et complet, et l'admission redevient un
// verdict sur la fraîcheur. Les témoins de fenêtre gardent leurs surcharges
// RELATIVES (`twentyFiveHoursAgo`, `tenMinutesAgo`) — l'idiome déjà employé
// partout ailleurs ici : une date d'entrée comparée à `Date.now()` ne s'écrit
// jamais en littéral absolu.
function makeMessageRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_MSG_ID,
    conversationId: VALID_CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'Original content',
    originalLanguage: 'fr',
    messageType: 'text',
    // RELATIF, jamais figé : `admitMessageEdit` compare `createdAt` à l'horloge
    // RÉELLE. Une date en dur passe le jour où elle est écrite puis expire
    // seule le lendemain — deux cas de cette suite sont partis au rouge ainsi.
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

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('MessageHandler — handleMessageEdit', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'Edited content' },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  it('returns error on schema validation failure', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid payload' });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Invalid payload' }));
  });

  it('returns error when user not in socketToUser map', async () => {
    deps.socketToUser.clear();

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns error when user is anonymous', async () => {
    deps.connectedUsers.set(USER_ID, makeSocketUser({ isAnonymous: true }));

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Authentication required') })
    );
  });

  it('returns error when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 45000 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('45') }));
  });

  it('returns error when message not found (not author or different user)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(null);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
  });

  it('returns error when edited content is empty and no attachments', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({ attachments: [] })
    );
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: '   ' },
    });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '   ' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('cannot be empty') })
    );
  });

  // L'ajustement des compteurs sur l'écart de longueur ne vivait que dans
  // `PUT /conversations/:id/messages/:mid`. Ce transport-ci est pourtant le
  // PRIMAIRE : `totalWords` et `totalCharacters` y restaient sur les longueurs
  // du texte d'origine, définitivement.
  it('ajuste les compteurs sur l\'écart de longueur', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({ content: 'trois petits mots' })
    );
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(mockOnMessageEdited).toHaveBeenCalledTimes(1);
    const [, conversationId, authorKey, previous, next] = mockOnMessageEdited.mock.calls[0];
    expect(conversationId).toBe(VALID_CONV_ID);
    expect(authorKey).toBe(USER_ID);
    expect(previous).toBe('trois petits mots');
    expect(next).toBe('Edited content');
  });

  it('allows edit with empty content when message has attachments', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({ attachments: [{ id: 'att-1' }] })
    );
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: '' },
    });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a non-privileged author editing a message older than the 24h window (parity with REST)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: twentyFiveHoursAgo,
        // Realistic Participant.role — never a global-role constant.
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null, role: 'member' },
      })
    );
    // The bypass reads the author's GLOBAL role (User.role), not the participant role.
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'USER' });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('24-hour') })
    );
    expect(deps.prisma.message.updateMany).not.toHaveBeenCalled();
    expect(deps.io.to).not.toHaveBeenCalled();
  });

  it('rejects a global-ADMIN author whose message is fresh via the normal path (bypass irrelevant within 24h)', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: tenMinutesAgo,
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    // Within the window, no global-role lookup is needed — the edit just succeeds.
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(deps.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows the author to edit a fresh (within 24h) message', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: tenMinutesAgo,
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(deps.prisma.message.updateMany).toHaveBeenCalled();
  });

  it('lets a global-ADMIN author edit a message past the 24h window (bypass keys on User.role, not Participant.role)', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: twentyFiveHoursAgo,
        // Realistic: the ADMIN is merely a "member" of THIS conversation. The
        // bypass must come from their global User.role, not this participant role.
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'ADMIN' });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(deps.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID }, select: { role: true } })
    );
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(deps.prisma.message.updateMany).toHaveBeenCalled();
  });

  it('lets a global-BIGBOSS author edit a message past the 24h window', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: twentyFiveHoursAgo,
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'BIGBOSS' });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(deps.prisma.message.updateMany).toHaveBeenCalled();
  });

  it('admet un modérateur GLOBAL membre actif sur le message de quelqu\'un d\'autre — le composer web le lui propose', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: new Date(),
        sender: { id: PARTICIPANT_ID, userId: 'user-someone-else', displayName: 'Bob', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
      id: PARTICIPANT_ID,
      user: { role: 'MODERATOR' },
    });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'contenu modéré' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    // La lecture ne doit plus ENCODER la règle : tant qu'elle filtre
    // `sender: { userId }`, la ligne n'atteint jamais la décision et aucun
    // modérateur ne peut être admis.
    const where = (deps.prisma.message.findFirst as jest.Mock<any>).mock.calls[0][0].where;
    expect(where).toEqual({ id: VALID_MSG_ID, deletedAt: null });
  });

  it('refuse un simple membre sur le message de quelqu\'un d\'autre, et n\'écrit rien', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({
        createdAt: new Date(),
        sender: { id: PARTICIPANT_ID, userId: 'user-someone-else', displayName: 'Bob', avatar: null, role: 'member' },
      })
    );
    (deps.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
      id: PARTICIPANT_ID,
      user: { role: 'USER' },
    });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'pas le mien' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(deps.prisma.message.updateMany).not.toHaveBeenCalled();
    expect(deps.io.to).not.toHaveBeenCalled();
  });

  it('updates message in database on success, guarded against a concurrent delete', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: VALID_MSG_ID, deletedAt: null },
      data: expect.objectContaining({ content: 'Edited content', isEdited: true, translations: null }),
    }));
  });

  it('rejects the edit and does not broadcast when the message was deleted between read and write', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 0 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
    expect(deps.io.to).not.toHaveBeenCalled();
  });

  it('broadcasts MESSAGE_EDITED to conversation room on success', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(deps.io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
    expect(emitsTo(deps.io, `conversation:${VALID_CONV_ID}`)).toContainEqual([
      'message:edited',
      expect.objectContaining({ id: VALID_MSG_ID, conversationId: VALID_CONV_ID }),
    ]);
  });

  // `message:edited` est déclaré `(message: SocketIOMessage) => void` — le MÊME
  // contrat que `message:new` — et `SocketIOMessage` rend sept champs
  // OBLIGATOIRES. Ce producteur-ci en servait quatre : il avait perdu
  // `senderId`, `messageType` et `createdAt`.
  //
  // Le coût n'était pas cosmétique. `APIMessage`, le décodeur iOS de
  // `message:edited`, lit `senderId` et `createdAt` par `try c.decode(...)`
  // SANS repli : une clé absente fait échouer le décodage du message ENTIER, et
  // `MessageSocketManager.decode(_:from:)` journalise `decode DROP` puis rend la
  // main. Une édition faite depuis le web n'atteignait donc AUCUN client iOS de
  // la conversation. Le web, qui fusionne `{ ...cached, ...payload }`, ne
  // montrait rien — le défaut était invisible du côté d'où venait l'édition.
  //
  // Les affirmations sont SÉPARÉES parce que la séparation est le diagnostic :
  // « le noyau requis manque » et « le noyau est là mais `senderId` porte la
  // mauvaise identité » sont deux pannes différentes, et la seconde serait le
  // résultat exact d'un correctif naïf (`senderId: message.senderId`).
  it('sert le noyau que `SocketIOMessage` EXIGE — sans quoi le décodeur iOS jette la charge utile entière', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    const edited = emitsTo(deps.io, `conversation:${VALID_CONV_ID}`)
      .find(([event]) => event === 'message:edited')?.[1] as Record<string, unknown>;

    expect(edited).toBeDefined();
    for (const required of ['id', 'conversationId', 'senderId', 'content', 'originalLanguage', 'messageType', 'createdAt']) {
      expect(Object.keys(edited)).toContain(required);
      expect(edited[required]).toBeDefined();
    }
  });

  // `Message.senderId` est un `Participant.id` ; les clients comparent le
  // `senderId` du fil à leur propre `User.id`. Servir la colonne brute
  // réparerait le décodage en installant une divergence de SENS, celle-là
  // muette — et les deux autres producteurs de `message:edited` servent bien
  // l'identité utilisateur.
  it('sert le `User.id` de l\'expéditeur, jamais le `Participant.id` de la colonne', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(emitsTo(deps.io, `conversation:${VALID_CONV_ID}`)).toContainEqual([
      'message:edited',
      expect.objectContaining({ senderId: USER_ID }),
    ]);
    expect(PARTICIPANT_ID).not.toBe(USER_ID);
  });

  it('fans conversation:updated to participant user rooms so list-screen viewers refresh the preview on edit', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    // The preview-fanout helper reads the active participants + latest message.
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { userId: USER_ID },
      { userId: 'user-B' },
    ]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    // `conversation:updated` part vers les salons PERSONNELS, jamais vers le
    // salon de conversation — c'est tout l'intérêt de l'éventail.
    const preview = ['conversation:updated', expect.objectContaining({
      conversationId: VALID_CONV_ID, lastMessageId: VALID_MSG_ID,
    })];
    expect(emitsTo(deps.io, `user:${USER_ID}`)).toContainEqual(preview);
    expect(emitsTo(deps.io, 'user:user-B')).toContainEqual(preview);
    expect(emitsTo(deps.io, `conversation:${VALID_CONV_ID}`)).not.toContainEqual(preview);
  });

  it('calls callback with success and messageId on success', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true, data: { messageId: VALID_MSG_ID },
    });
  });

  it('triggers retranslation asynchronously after edit', async () => {
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'Edited' },
    });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect((deps.translationService as any).retranslateMessageAsync).toHaveBeenCalledWith(
      VALID_MSG_ID,
      expect.objectContaining({ id: VALID_MSG_ID, content: 'Edited' })
    );
  });

  it('handles unexpected exception and returns error callback', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB failure'));

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Failed to edit') })
    );
  });

  it('works without callback (no crash)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('fail'));

    await expect(
      handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, undefined)
    ).resolves.not.toThrow();
  });

  it('enqueues the edit for an offline participant into the delivery queue', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineUserId = 'user-offline-edit-00112233445566';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: 'part-offline-edit', userId: offlineUserId },
    ]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineUserId, expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      eventType: 'edited',
      payload: expect.objectContaining({ id: VALID_MSG_ID, content: 'Edited content' }),
    }));
  });

  it('enqueues the edit for an offline anonymous participant keyed by participant id', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const anonPartId = 'anonpart-offline-edit-001122';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: anonPartId, userId: null },
    ]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(anonPartId, expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      eventType: 'edited',
    }));
  });
});

// ── handleMessageEdit : les gens que l'édition NOMME ────────────────────────
//
// `message:edit` est le transport d'édition PRIMAIRE, et il était le seul
// écrivain de la famille à ne toucher AUCUNE mention : ni ligne `Mention`, ni
// `validatedMentions`, ni notification. Éditer « salut @alice » en
// « salut @bob » laissait Alice mentionnée en base et ne nommait jamais Bob.

describe('MessageHandler — handleMessageEdit et les mentions', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;
  let notificationService: { createMentionNotificationsBatch: jest.Mock<any> };

  function makeMentionService(overrides: Record<string, any> = {}) {
    return {
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['bob']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(
        new Map([['bob', { id: 'u-bob', username: 'bob' }]])
      ),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-bob'] }),
      createMentions: jest.fn<any>().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  const emittedTo = (room: string) => emitsTo(deps.io, room);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'salut @bob' },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    notificationService = { createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(1) };
    deps = makeDeps({
      mentionService: makeMentionService(),
      notificationService: notificationService as any,
    });
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.mention.findMany as jest.Mock<any>).mockResolvedValue([{ mentionedUserId: 'u-alice' }]);
    (deps.prisma.mention.deleteMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
    (deps.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
      username: 'author', displayName: 'Author', avatar: null,
    });
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
      participants: [{ userId: USER_ID }, { userId: 'u-bob' }, { userId: 'u-alice' }],
    });
    // Cycle 123 bis — la notification d'un ENTRANT relit les drapeaux de
    // PROTECTION du message édité, et cette relecture est fail-CLOSED : un
    // double muet ferait passer tout message pour protégé et servirait un
    // placeholder. Ce bloc décrit un message ORDINAIRE.
    (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue({
      messageType: 'text', isEncrypted: false, isViewOnce: false,
      isBlurred: false, effectFlags: 0, expiresAt: null,
      createdAt: new Date('2026-08-24T10:00:00Z'),
    });
  });

  it('réconcilie les lignes Mention : le partant s’en va, l’entrant arrive', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    expect(deps.prisma.mention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: VALID_MSG_ID, mentionedUserId: { in: ['u-alice'] } },
    });
    expect(deps.mentionService!.createMentions).toHaveBeenCalledWith(VALID_MSG_ID, ['u-bob']);
  });

  it('persiste validatedMentions et le porte dans le payload message:edited', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    expect(deps.prisma.message.update).toHaveBeenCalledWith({
      where: { id: VALID_MSG_ID },
      data: { validatedMentions: ['bob'] },
    });
    const edited = emittedTo(`conversation:${VALID_CONV_ID}`)
      .find((call) => call[0] === 'message:edited');
    expect(edited?.[1]).toEqual(expect.objectContaining({ validatedMentions: ['bob'] }));
  });

  it('notifie le seul ENTRANT, jamais celui qui était déjà mentionné', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      ['u-bob'],
      expect.objectContaining({
        senderId: USER_ID,
        messageContent: 'salut @bob',
        conversationId: VALID_CONV_ID,
        messageId: VALID_MSG_ID,
      }),
      [USER_ID, 'u-bob', 'u-alice']
    );
  });

  // `message:edited` ne fan qu'au salon de la conversation : quelqu'un que
  // l'édition vient de nommer n'y est pas forcément.
  it('émet mention:created dans le salon PERSONNEL de l’entrant', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    const targetedRooms = (deps.io.to as jest.Mock<any>).mock.calls.map((c: any[]) => c[0]);
    expect(targetedRooms).toContain('user:u-bob');
    const mention = emittedTo('user:u-bob').find((call) => call[0] === 'mention:created');
    expect(mention?.[1]).toEqual(expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      mentionedUserId: 'u-bob',
      senderId: USER_ID,
      content: 'salut @bob',
    }));
  });

  it('ne se notifie pas soi-même quand l’auteur se nomme dans son édition', async () => {
    deps = makeDeps({
      mentionService: makeMentionService({
        extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['author']),
        resolveUsernames: jest.fn<any>().mockResolvedValue(
          new Map([['author', { id: USER_ID, username: 'author' }]])
        ),
        validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [USER_ID] }),
      }),
      notificationService: notificationService as any,
    });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.mention.findMany as jest.Mock<any>).mockResolvedValue([]);
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
      username: 'author', displayName: 'Author', avatar: null,
    });
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
      participants: [{ userId: USER_ID }],
    });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @author' }, callback);

    expect(emittedTo(`user:${USER_ID}`).map((call) => call[0])).not.toContain('mention:created');
    // L'édition, elle, a bien eu lieu et a bien été diffusée.
    expect(emittedTo(`conversation:${VALID_CONV_ID}`).map((call) => call[0])).toContain('message:edited');
  });

  // Préserver une mention périmée vaut mieux que détruire une mention vivante :
  // la première surligne quelqu'un de trop le temps d'une édition, la seconde
  // ne revient jamais. Le payload doit taire le champ pour la même raison —
  // les clients écrasent leur cache avec `{ ...cached, ...editedPayload }`.
  it('n’efface RIEN — ni en base, ni dans le payload — quand la résolution échoue', async () => {
    deps = makeDeps({
      mentionService: makeMentionService({
        resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      }),
      notificationService: notificationService as any,
    });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.mention.findMany as jest.Mock<any>).mockResolvedValue([{ mentionedUserId: 'u-alice' }]);
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    expect(deps.prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(deps.prisma.message.update).not.toHaveBeenCalled();
    const edited = emittedTo(`conversation:${VALID_CONV_ID}`)
      .find((call) => call[0] === 'message:edited');
    expect(edited?.[1]).not.toHaveProperty('validatedMentions');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // Un texte édité qui ne nomme plus personne DOIT effacer le champ : c'est un
  // vide ÉTABLI, pas un vide subi.
  it('efface validatedMentions quand le texte édité ne nomme plus personne', async () => {
    (deps.mentionService!.extractMentionsWithParticipants as jest.Mock<any>).mockReturnValue([]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'plus personne' }, callback);

    expect(deps.prisma.mention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: VALID_MSG_ID, mentionedUserId: { in: ['u-alice'] } },
    });
    expect(deps.prisma.message.update).toHaveBeenCalledWith({
      where: { id: VALID_MSG_ID },
      data: { validatedMentions: [] },
    });
    const edited = emittedTo(`conversation:${VALID_CONV_ID}`)
      .find((call) => call[0] === 'message:edited');
    expect(edited?.[1]).toEqual(expect.objectContaining({ validatedMentions: [] }));
  });

  it('édite normalement sans service de mentions câblé', async () => {
    deps = makeDeps({ notificationService: notificationService as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'salut @bob' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(deps.prisma.mention.findMany).not.toHaveBeenCalled();
    expect(notificationService.createMentionNotificationsBatch).not.toHaveBeenCalled();
  });
});

// ── handleMessageEdit et les liens traçables ───────────────────────────────

/**
 * `message:edit` est le transport d'édition PRIMAIRE (le web y émet
 * `CLIENT_EVENTS.MESSAGE_EDIT`) et il écrivait le texte BRUT : coller
 * `[[https://example.com]]` dans une édition laissait les crochets en dur, pour
 * toujours, alors que le même texte à l'envoi produit un `m+<token>`.
 */
describe('MessageHandler — handleMessageEdit et les liens traçables', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;
  let trackingLinkService: { processExplicitLinksInContent: jest.Mock<any> };

  const RAW = 'regarde [[https://example.com]]';
  const TRACKED = 'regarde m+abc123';

  const emittedTo = (room: string) => emitsTo(deps.io, room);

  function setup(overrides: Record<string, unknown> = {}) {
    deps = makeDeps({ trackingLinkService, ...overrides });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { messageId: VALID_MSG_ID, content: RAW } });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    trackingLinkService = {
      processExplicitLinksInContent: jest.fn<any>().mockResolvedValue({
        processedContent: TRACKED,
        trackingLinks: [{ token: 'abc123' }],
      }),
    };
    setup();
    socket = makeSocket();
    callback = jest.fn();

    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  it('persiste le contenu TRAITÉ, pas le texte brut collé par l’auteur', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: RAW }, callback);

    expect(trackingLinkService.processExplicitLinksInContent).toHaveBeenCalledWith({
      content: RAW,
      conversationId: VALID_CONV_ID,
      messageId: VALID_MSG_ID,
      createdBy: USER_ID,
    });
    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: TRACKED }),
    }));
  });

  // Un payload qui diffère de la base ferait afficher aux clients un texte que
  // le serveur ne porte pas : le prochain chargement le contredirait.
  it('diffuse le contenu TRAITÉ dans message:edited', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: RAW }, callback);

    const edited = emittedTo(`conversation:${VALID_CONV_ID}`).find((call) => call[0] === 'message:edited');
    expect(edited?.[1]).toEqual(expect.objectContaining({ content: TRACKED }));
  });

  // Retraduire le texte brut traduirait des crochets et une URL qui ne sont
  // plus dans le message — et écraserait la traduction du contenu réel.
  it('retraduit le contenu TRAITÉ', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: RAW }, callback);

    expect(deps.translationService.retranslateMessageAsync).toHaveBeenCalledWith(
      VALID_MSG_ID,
      expect.objectContaining({ content: TRACKED }),
    );
  });

  // Un lien perdu ne doit pas transformer une édition réussie en erreur : le
  // texte original est écrit et l'édition aboutit.
  it('écrit le contenu original et aboutit quand le traitement des liens lève', async () => {
    trackingLinkService.processExplicitLinksInContent.mockRejectedValue(new Error('tracking store down'));

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: RAW }, callback);

    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: RAW }),
    }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('ne touche PAS le service quand le texte édité ne porte aucune syntaxe traçable', async () => {
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'juste du texte https://example.com' },
    });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'juste du texte https://example.com' }, callback);

    expect(trackingLinkService.processExplicitLinksInContent).not.toHaveBeenCalled();
    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: 'juste du texte https://example.com' }),
    }));
  });
});

// ── handleMessageDelete ────────────────────────────────────────────────────

describe('MessageHandler — handleMessageDelete', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  function setupSuccessfulDelete(overrides: {
    senderUserId?: string | null;
    memberRole?: string;
    globalRole?: string;
    attachments?: { id: string; mimeType?: string | null }[];
    content?: string | null;
    messageType?: string;
  } = {}) {
    const {
      senderUserId = USER_ID, memberRole, globalRole, attachments = [],
      content = 'trois petits mots', messageType = 'text',
    } = overrides;
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      content,
      messageType,
      sender: { id: PARTICIPANT_ID, userId: senderUserId },
      conversation: {
        createdAt: new Date('2024-01-01'),
        lastMessageAt: new Date('2024-05-01'),
      },
      attachments,
    });
    // L'appartenance ne se lit plus dans le `include` du message : elle est lue
    // par `admitMessageDelete`, avec `isActive: true`, et seulement quand
    // l'acteur n'est pas l'auteur.
    (deps.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(
      memberRole ? { role: memberRole, user: { role: 'USER' } } : null
    );
    if (globalRole) {
      (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: globalRole });
    }
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date('2024-06-01') });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  // Le décompte des compteurs de conversation ne vivait QUE dans
  // `DELETE /conversations/:id/messages/:id`. Ce transport-ci — le PRIMAIRE du
  // composer web — retirait le message sans jamais rendre son crédit : il
  // n'existait aucun test parce qu'il n'existait aucun appel.
  it('débite les compteurs de la conversation', async () => {
    setupSuccessfulDelete({
      content: 'trois petits mots',
      messageType: 'text',
      attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }, { id: 'att-2', mimeType: null }],
    });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(mockOnMessageDeleted).toHaveBeenCalledTimes(1);
    const [, conversationId, authorKey, content, tokens, messageType] = mockOnMessageDeleted.mock.calls[0];
    expect(conversationId).toBe(VALID_CONV_ID);
    // La MÊME clé que celle créditée à l'envoi : l'utilisateur, pas son
    // Participant.
    expect(authorKey).toBe(USER_ID);
    expect(content).toBe('trois petits mots');
    // Les MIME sont ceux CAPTURÉS à l'admission : les `MessageAttachment` sont
    // supprimés avant que l'unité ne tourne, une relecture ne rendrait rien.
    expect(tokens).toEqual(['image', 'file']);
    expect(messageType).toBe('text');
  });

  it('retombe sur le Participant quand l\'auteur est anonyme', async () => {
    setupSuccessfulDelete({ senderUserId: null, globalRole: 'ADMIN' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(mockOnMessageDeleted.mock.calls[0][2]).toBe(PARTICIPANT_ID);
  });

  it('returns error on schema validation failure', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Invalid' }));
  });

  it('returns error when user not in socketToUser map', async () => {
    deps.socketToUser.clear();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns error when user is anonymous', async () => {
    deps.connectedUsers.set(USER_ID, makeSocketUser({ isAnonymous: true }));

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Authentication required') })
    );
  });

  it('returns error when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 20000 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('20') }));
  });

  it('returns error when message not found', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(null);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
  });

  it('allows message author to delete their own message', async () => {
    setupSuccessfulDelete({ senderUserId: USER_ID });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows conversation admin to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'admin' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows conversation moderator to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'moderator' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global ADMIN to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'ADMIN' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'ADMIN' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global BIGBOSS to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'BIGBOSS' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'BIGBOSS' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global MODERATOR to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'MODERATOR' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'MODERATOR' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('returns unauthorized when user has no delete permission', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: 'another-user-id' },
      conversation: {
        createdAt: new Date('2024-01-01'),
        participants: [{ role: 'member' }],
      },
      attachments: [],
    });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'USER' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not authorized') })
    );
  });

  it('soft-deletes message by setting deletedAt', async () => {
    setupSuccessfulDelete();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(deps.prisma.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: VALID_MSG_ID },
      data: expect.objectContaining({ deletedAt: expect.any(Date), translations: null }),
    }));
  });

  it('recomputes conversation lastMessageAt, guarded against cursor regression', async () => {
    const lastMsgDate = new Date('2024-06-15');
    const convLastMessageAt = new Date('2024-05-01');
    (deps.prisma.message.findFirst as jest.Mock<any>)
      .mockResolvedValueOnce({
        id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        sender: { id: PARTICIPANT_ID, userId: USER_ID },
        conversation: { createdAt: new Date('2024-01-01'), lastMessageAt: convLastMessageAt, participants: [] },
        attachments: [],
      })
      .mockResolvedValueOnce({ createdAt: lastMsgDate });
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
      createdAt: new Date('2024-01-01'), lastMessageAt: convLastMessageAt,
    });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    // Optimistic-concurrency guard: the write only lands while lastMessageAt is
    // still the value `applyMessageRemovalEffects` read just before writing — a
    // racing message:new advances it, the guard mismatches, and the cursor never
    // regresses onto the deleted message.
    expect(deps.prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: VALID_CONV_ID, lastMessageAt: convLastMessageAt },
      data: { lastMessageAt: lastMsgDate },
    });
  });

  it('falls back to conversation.createdAt when all messages are deleted', async () => {
    const convCreatedAt = new Date('2024-01-01');
    const convLastMessageAt = new Date('2024-05-01');
    (deps.prisma.message.findFirst as jest.Mock<any>)
      .mockResolvedValueOnce({
        id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        sender: { id: PARTICIPANT_ID, userId: USER_ID },
        conversation: { createdAt: convCreatedAt, lastMessageAt: convLastMessageAt, participants: [] },
        attachments: [],
      })
      .mockResolvedValueOnce(null);
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
      createdAt: convCreatedAt, lastMessageAt: convLastMessageAt,
    });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(deps.prisma.conversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastMessageAt: convCreatedAt },
    }));
  });

  it('broadcasts MESSAGE_DELETED to conversation room', async () => {
    setupSuccessfulDelete();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(deps.io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
    expect(emitsTo(deps.io, `conversation:${VALID_CONV_ID}`)).toContainEqual([
      'message:deleted',
      { messageId: VALID_MSG_ID, conversationId: VALID_CONV_ID },
    ]);
  });

  it('deletes attachments before soft-deleting message', async () => {
    setupSuccessfulDelete({ attachments: [{ id: 'att-1' }, { id: 'att-2' }] });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect((deps.attachmentService as any).deleteAttachment).toHaveBeenCalledWith('att-1');
    expect((deps.attachmentService as any).deleteAttachment).toHaveBeenCalledWith('att-2');
  });

  it('continues soft-delete even if attachment deletion fails', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: USER_ID },
      conversation: { createdAt: new Date('2024-01-01'), lastMessageAt: new Date('2024-05-01'), participants: [] },
      attachments: [{ id: 'att-bad' }],
    });
    (deps.attachmentService as any).deleteAttachment.mockRejectedValue(new Error('S3 error'));
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date() });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
    expect(deps.prisma.message.update).toHaveBeenCalled();
  });

  it('handles unexpected exception and returns error callback', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB crash'));

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Failed to delete') })
    );
  });

  it('works without callback (no crash)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('fail'));

    await expect(
      handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, undefined)
    ).resolves.not.toThrow();
  });

  it('enqueues the delete for an offline participant into the delivery queue', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineUserId = 'user-offline-del-00112233445566';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    setupSuccessfulDelete({ senderUserId: USER_ID });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: 'part-offline-del', userId: offlineUserId },
    ]);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineUserId, expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      eventType: 'deleted',
      payload: expect.objectContaining({ messageId: VALID_MSG_ID, conversationId: VALID_CONV_ID }),
    }));
  });

  // Un badge de non-lus compte des messages qui n'existent plus.
  //
  // `conversation:unread-updated` est le SEUL signal qui déplace la pastille en
  // vif, et aucun de ses sites d'émission n'était un chemin de SUPPRESSION : ils
  // sont tous des chemins d'ENVOI. La liste de conversations du web tourne en
  // `staleTime: Infinity` — sans poussée, la pastille garde sa valeur jusqu'au
  // prochain refetch complet, alors que le message qu'elle compte a disparu de
  // la conversation sous les yeux du lecteur.
  //
  // Le décompte lui-même est déjà juste : `getUnreadCountsForParticipants`
  // filtre `deletedAt: null`. Il ne manquait que de le redemander.
  it('repousse le badge de non-lus aux destinataires après une suppression', async () => {
    setupSuccessfulDelete();
    const recipientUserId = 'user-recipient-0011223344556677';
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date('2024-01-01') },
      { id: 'part-recipient', userId: recipientUserId, joinedAt: new Date('2024-01-01') },
    ]);
    (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(
      new Map([['part-recipient', 2]])
    );

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(emitsTo(deps.io, `user:${recipientUserId}`)).toContainEqual([
      'conversation:unread-updated',
      // La passe de ponts a tourné et n'annonce rien pour ce destinataire :
      // `null` AFFIRMÉ, jamais la forme courte, qui signifie désormais « je
      // n'ai pas calculé » (cycle 63).
      { conversationId: VALID_CONV_ID, unreadCount: 2, bridge: null },
    ]);
  });

  it('n\'échoue pas la suppression quand le recalcul du badge échoue', async () => {
    setupSuccessfulDelete();
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID, joinedAt: null },
      { id: 'part-recipient', userId: 'user-recipient-0011223344556677', joinedAt: null },
    ]);
    (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockRejectedValue(
      new Error('read cursor store down')
    );

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('enqueues the delete for the OFFLINE original author when an admin deletes their message', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineAuthorUserId = 'user-offline-author-001122334455';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);          // admin (the deleter) is online
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    // Admin USER_ID deletes a message AUTHORED by an offline user. The author's
    // participant id (message.senderId = PARTICIPANT_ID) is NOT the deleter — the
    // skip arg must exclude the deleter, never the author, or the offline author
    // never learns their moderated message was removed.
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: offlineAuthorUserId },
      conversation: {
        createdAt: new Date('2024-01-01'),
        lastMessageAt: new Date('2024-05-01'),
      },
      attachments: [],
    });
    // La ligne participant du SUPPRIMEUR, lue par `admitMessageDelete` : c'est
    // d'elle que vient le `Participant.id` à exclure. La lire là plutôt que dans
    // le `include` du message est ce qui empêche de retomber sur
    // `message.senderId`, qui désigne l'AUTEUR.
    (deps.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
      id: 'deleter-participant',
      role: 'admin',
      user: { role: 'USER' },
    });
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date('2024-06-01') });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: 'deleter-participant', userId: USER_ID },        // the deleter (online → skipped anyway)
      { id: PARTICIPANT_ID, userId: offlineAuthorUserId },   // the author == message.senderId, OFFLINE
    ]);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    // Before the fix the author was skipped (p.id === message.senderId) and the
    // enqueue never happened; only the deleter should be excluded.
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineAuthorUserId, expect.objectContaining({
      eventType: 'deleted',
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
    }));
  });
});
