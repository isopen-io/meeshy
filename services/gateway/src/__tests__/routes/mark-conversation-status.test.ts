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
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(),
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
    mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
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
    expect(body.data.markedCount).toBe(UNREAD_COUNT);
    expect(body.data.message).toBeUndefined();
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
// Badge reset: broadcastReadStatusUpdate must emit CONVERSATION_UNREAD_UPDATED
// to the reader's user room so multi-device badge is cleared after mark-as-read.
// ---------------------------------------------------------------------------

describe('broadcastReadStatusUpdate — CONVERSATION_UNREAD_UPDATED badge reset', () => {
  let app2: FastifyInstance;
  let mockEmit2: jest.Mock;
  let mockTo2: jest.Mock;

  beforeAll(async () => {
    mockEmit2 = jest.fn();
    mockTo2 = jest.fn().mockReturnValue({ emit: mockEmit2 });
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
    mockTo2.mockReturnValue({ emit: mockEmit2 });

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
    expect(mockTo2).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit2).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONVERSATION_ID,
      unreadCount: 0,
    });
    // read-status:updated (peer disclosure) must NOT fire when showReadReceipts=false.
    expect(mockEmit2).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
  });
});
