/**
 * Route tests — POST /conversations/:conversationId/mark-as-read
 *                POST /conversations/:conversationId/mark-as-received
 *
 * Pins the response contract: `data` MUST carry a numeric `markedCount`
 * (uniform with POST /conversations/:id/mark-read), never a free-text
 * `message` string. The iOS client decodes the body into a typed Int
 * payload; a String under `data.message` threw the production
 * `DecodingError: Type mismatch for type Int at path data.message`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../routes/message-read-status';
import { MessageReadStatusService } from '../../services/MessageReadStatusService';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const LATEST_MESSAGE_ID = '507f1f77bcf86cd799439013';
const UNREAD_COUNT = 5;

// --- module mocks (names must start with `mock` for jest hoisting) ---

const mockResolveConversationId = jest.fn();
jest.mock('../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = { userId: 'user-1', type: 'registered', hasFullAccess: true };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// --- mock Prisma ---

const mockPrisma: any = {
  participant: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  userPreference: { findMany: jest.fn() },
  userPreferences: { findMany: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  }
};

describe('POST mark-as-read / mark-as-received — numeric data.markedCount contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();

    // Happy-path defaults — individual tests override as needed.
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(false); // suppress Socket.IO broadcast
    // getUnreadCount() resolves the participant via findFirst, so it must carry
    // both id and joinedAt (the read floor when no cursor lastReadAt is set).
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: PARTICIPANT_ID,
      joinedAt: new Date('2020-01-01T00:00:00Z')
    });
    mockPrisma.participant.findUnique.mockResolvedValue(null); // skip notification sync
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({ id: LATEST_MESSAGE_ID, createdAt: new Date() });
    // getUnreadCount() now derives markedCount from a message.count() over the
    // read floor (cursor.lastReadAt ?? participant.joinedAt) — no longer a
    // cached cursor.unreadCount field.
    mockPrisma.message.count.mockResolvedValue(UNREAD_COUNT);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.userPreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);
    mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversationReadCursor.update.mockResolvedValue({});
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    // No cursor yet → read floor falls back to participant.joinedAt.
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
  });

  it('mark-as-received returns a numeric data.markedCount, never a message string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.markedCount).toBe('number');
    expect(body.data.message).toBeUndefined();
  });

  // #4179 — `markedCount` a une SEULE définition : le nombre d'entrées
  // RÉELLEMENT figées par ce marquage, jamais le compte de non-lus D'AVANT.
  // Les deux ensembles diffèrent (un message peut être livré depuis
  // longtemps et rester non lu) : ce témoin les met délibérément en désaccord
  // (`UNREAD_COUNT` = 5, deux entrées nouvellement livrées) pour prouver la
  // SOURCE — un mock `message.count` inchangé n'aurait pas fait tomber la
  // porte d'avant #4179, qui servait `UNREAD_COUNT` sans jamais regarder ce
  // qui a été figé.
  it('mark-as-received: markedCount is the frozen delivery count, decoupled from the pre-mark unread count', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-newly-delivered-1' },
      { id: 'msg-newly-delivered-2' }
    ]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 2 });

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.markedCount).toBe(2);
    expect(body.data.markedCount).not.toBe(UNREAD_COUNT);
  });

  it('mark-as-read returns a numeric data.markedCount, never a message string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.markedCount).toBe('number');
    expect(body.data.markedCount).toBe(UNREAD_COUNT);
    expect(body.data.message).toBeUndefined();
  });

  // Suivi de lecture exact — la webapp appelle CE point d'entrée, pas
  // /conversations/:id/mark-read. Doter l'un sans l'autre laisserait le web sur
  // le chemin par fenêtre, qui sur-déclare.
  // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md

  it('mark-as-read bounds the freeze to the reported messageIds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      payload: { messageIds: [LATEST_MESSAGE_ID] }
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [LATEST_MESSAGE_ID] } })
      })
    );
  });

  it('mark-as-read without a body keeps the legacy window path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    const freezeCall = mockPrisma.message.findMany.mock.calls[0];
    expect(freezeCall[0].where.id).toBeUndefined();
    expect(freezeCall[0].where.createdAt).toBeDefined();
  });

  it('mark-as-read rejects a malformed messageIds payload with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      payload: { messageIds: ['pas-un-objectid'] }
    });

    expect(response.statusCode).toBe(400);
  });

  it('mark-as-received still rejects a non-participant with 403', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Badge reset: broadcastReadStatus must emit CONVERSATION_UNREAD_UPDATED
// to the reader's user room so multi-device badge is cleared after mark-as-read.
// ---------------------------------------------------------------------------

describe('broadcastReadStatus — CONVERSATION_UNREAD_UPDATED badge reset', () => {
  let app2: FastifyInstance;
  let mockEmit2: jest.Mock;
  let mockTo2: jest.Mock;
  let mockExcept2: jest.Mock;

  beforeAll(async () => {
    mockEmit2 = jest.fn();
    // Chaine complete : `to` ET `except`. La diffusion d'un accuse de LECTURE
    // retire l'acteur de l'eventail, parce qu'il recoit a part une version du
    // payload enrichie de sa frontiere de lecture et de son arriere.
    mockExcept2 = jest.fn(() => ({ to: mockTo2, except: mockExcept2, emit: mockEmit2 }));
    mockTo2 = jest.fn(() => ({ to: mockTo2, except: mockExcept2, emit: mockEmit2 }));
    app2 = Fastify({ logger: false });
    app2.decorate('prisma', mockPrisma);
    app2.decorate('socketIOHandler', {
      getManager: () => ({
        getIO: () => ({ to: mockTo2 }),
      }),
    });
    await app2.register(messageReadStatusRoutes);
    await app2.ready();
  });

  afterAll(async () => {
    await app2.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    mockTo2.mockImplementation(() => ({ to: mockTo2, except: mockExcept2, emit: mockEmit2 }));
    mockExcept2.mockImplementation(() => ({ to: mockTo2, except: mockExcept2, emit: mockEmit2 }));

    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: PARTICIPANT_ID,
      joinedAt: new Date('2020-01-01T00:00:00Z'),
    });
    mockPrisma.participant.findUnique.mockResolvedValue(null);
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({ id: LATEST_MESSAGE_ID, createdAt: new Date() });
    mockPrisma.message.count.mockResolvedValue(UNREAD_COUNT);
    mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversationReadCursor.update.mockResolvedValue({});
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
  });

  it('mark-as-read emits CONVERSATION_UNREAD_UPDATED to reading user room for badge reset', async () => {
    const response = await app2.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });

    expect(response.statusCode).toBe(200);
    expect(mockTo2).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit2).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONVERSATION_ID,
      unreadCount: expect.any(Number),
      bridge: null,
    });
  });

  it('mark-as-read emits CONVERSATION_UNREAD_UPDATED even when showReadReceipts=false (badge reset is not a peer disclosure)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await app2.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });

    expect(response.statusCode).toBe(200);
    // Badge reset must still fire — it syncs the reader's OWN devices, not discloses to peers.
    // The count is sourced from the real post-mark getUnreadCount (mirrors the
    // showReadReceipts=true sibling test above), not a hardcoded value.
    expect(mockTo2).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit2).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONVERSATION_ID,
      unreadCount: expect.any(Number),
      bridge: null,
    });
    // read-status:updated (peer disclosure) must NOT fire when showReadReceipts=false.
    expect(mockEmit2).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
  });

  // Exact-read (spec 2026-07-24-read-exactness-design.md): a partial read reports only
  // a subset of messageIds (no caughtUpToMessageId), so the cursor advances only over the
  // contiguous read prefix and messages legitimately remain unread. The opted-out badge
  // reset previously hardcoded unreadCount: 0, wrongly clearing the reader's badge across
  // their devices. It must emit the REAL remaining unread, like the opted-in path does.
  it('mark-as-read badge reset reflects the real remaining unread on a partial read, not 0 (showReadReceipts=false)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);
    mockPrisma.message.findMany.mockResolvedValue([]);
    // Post-mark getUnreadCount resolves a nonzero remainder (partial read left messages unread).
    mockPrisma.message.count.mockResolvedValue(3);

    const response = await app2.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      payload: { messageIds: [LATEST_MESSAGE_ID] },
    });

    expect(response.statusCode).toBe(200);
    expect(mockTo2).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit2).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONVERSATION_ID,
      unreadCount: 3,
      bridge: null,
    });
  });
});
