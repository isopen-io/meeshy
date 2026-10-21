/**
 * @jest-environment node
 *
 * MessageHandler.handleMessageDelete, séparé de `MessageHandlerEditDelete.test.ts`
 * (budget de taille des suites, #4531) : permission, motif du tiers et trace (#11149).
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
    adminAuditLog: { create: jest.fn(async () => ({ id: 'audit-1' })) },
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
    conversationType?: string;
    reason?: string;
  } = {}) {
    const {
      senderUserId = USER_ID, memberRole, globalRole, attachments = [],
      content = 'trois petits mots', messageType = 'text', conversationType = 'group',
      reason = senderUserId === USER_ID ? undefined : 'Propos hors charte',
    } = overrides;
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: reason === undefined ? { messageId: VALID_MSG_ID } : { messageId: VALID_MSG_ID, reason },
    });
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({ type: conversationType, title: 'Les Amis' });
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

  it('#11149 — exige un motif du tiers, et ne supprime rien sans lui', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'admin', reason: '  ' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'MODERATION_REASON_REQUIRED' }));
    expect(deps.prisma.message.update).not.toHaveBeenCalled();
  });

  it('#11149 — refuse le tiers dans une conversation directe, même BIGBOSS', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'BIGBOSS', conversationType: 'direct' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringContaining('not authorized') }));
    expect(deps.prisma.message.update).not.toHaveBeenCalled();
  });

  it('#11149 — admet le créateur, et journalise REMOVE_CONTENT avec le motif', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'creator', reason: 'Spam répété' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
    expect(deps.prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'REMOVE_CONTENT', entity: 'Message', entityId: VALID_MSG_ID, adminId: USER_ID, userId: 'other-user',
        metadata: JSON.stringify({ reason: 'Spam répété', via: 'app' }),
      }),
    });
  });

  it("#11149 — l'auteur supprime sans motif et sans trace d'audit", async () => {
    setupSuccessfulDelete({ senderUserId: USER_ID, conversationType: 'direct' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
    expect(deps.prisma.adminAuditLog.create).not.toHaveBeenCalled();
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
    (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({ type: 'group' });
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { messageId: VALID_MSG_ID, reason: 'Hors charte' } });
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
