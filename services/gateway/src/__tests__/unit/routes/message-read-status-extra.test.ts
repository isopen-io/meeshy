/**
 * Additional route tests for message-read-status.ts
 *
 * Covers branches NOT exercised by the existing test files:
 *   - mark-conversation-status.test.ts (POST mark-as-read / mark-as-received happy paths + 403)
 *   - delivery-receipt.test.ts (POST delivery-receipt happy paths)
 *
 * New coverage targets:
 *   - GET /messages/:messageId/read-status (lines 67-108) — all branches
 *   - GET /conversations/:conversationId/read-statuses (lines 124-169) — all branches
 *   - POST mark-as-read: resolveConversationId null (192), membership null (206),
 *     shouldShowReadReceipts=false badge-only path (248-249), socket error swallowed (232)
 *   - POST mark-as-received: resolveConversationId null (272),
 *     shouldShowReadReceipts=false no-socket path (304-312), socket error swallowed (319-320)
 *   - POST delivery-receipt: self-sender no-op (411), socket error swallowed (418-419)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../../routes/message-read-status';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const USER_ID = 'user-extra-1';

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared before imports, hoisted by Jest)
// ---------------------------------------------------------------------------

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

// Auth mock: checks Authorization header so 401 tests work.
// All other mocks (existing test files) skip the header check — we need it here.
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    request.authContext = { userId: USER_ID, type: 'registered', hasFullAccess: true };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// Mock MessageReadStatusService entirely so we don't hit Prisma internals.
const mockGetMessageReadStatus = jest.fn();
const mockGetConversationReadStatuses = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockMarkMessagesAsReceived = jest.fn();
const mockGetLatestMessageSummary = jest.fn();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: mockGetMessageReadStatus,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getUnreadCount: mockGetUnreadCount,
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    getLatestMessageSummary: mockGetLatestMessageSummary,
    // Static cache that the route's beforeEach helpers normally clear
  }))
}));

// Mock rate limiter: avoid Redis dependency; middleware is a no-op pass-through.
// Fastify 5 requires async hooks to accept at most 2 arguments (no done callback).
jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async (_req: unknown, _reply: unknown) => { /* no-op */ }
  })
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })
  }
}));

// ---------------------------------------------------------------------------
// Shared mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  participant: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  message: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn()
  },
  conversationReadCursor: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  }
};

// ---------------------------------------------------------------------------
// Socket.IO mock helpers
// ---------------------------------------------------------------------------

function makeSocketMocks() {
  const emitMock = jest.fn();
  const ioChain: any = { emit: emitMock };
  ioChain.to = jest.fn(() => ioChain);
  const io = { to: jest.fn(() => ioChain) };
  const socketIOHandler = { getManager: () => ({ getIO: () => io }) };
  return { emitMock, ioChain, io, socketIOHandler };
}

// Helper: attach Authorization header to all authenticated requests
const AUTH_HEADER = 'Bearer test-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearStaticCache() {
  // The real service uses a static Map; since we fully mock the class,
  // we don't need to clear it. Guard in case the mock leaks the real impl.
  try {
    (MessageReadStatusService as any).recentActionCache?.clear();
  } catch {
    // no-op
  }
}

// ===========================================================================
// 1. GET /messages/:messageId/read-status
// ===========================================================================

describe('GET /messages/:messageId/read-status', () => {
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
    clearStaticCache();

    // Happy-path defaults
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      conversation: {
        participants: [{ userId: USER_ID }]
      }
    });
    mockGetMessageReadStatus.mockResolvedValue({
      messageId: MESSAGE_ID,
      readCount: 1,
      deliveredCount: 2
    });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`
      // no Authorization header
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockGetMessageReadStatus).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a participant of the conversation', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      conversation: {
        participants: [] // empty — user not in conversation
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockGetMessageReadStatus).not.toHaveBeenCalled();
  });

  it('returns 200 with read status on success', async () => {
    const expectedStatus = { messageId: MESSAGE_ID, readCount: 3, deliveredCount: 5 };
    mockGetMessageReadStatus.mockResolvedValue(expectedStatus);

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject(expectedStatus);
    expect(mockGetMessageReadStatus).toHaveBeenCalledWith(MESSAGE_ID, CONVERSATION_ID);
  });

  it('returns 500 when readStatusService.getMessageReadStatus throws', async () => {
    mockGetMessageReadStatus.mockRejectedValue(new Error('DB connection lost'));

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when messageId is not a valid ObjectId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/messages/not-a-valid-id/read-status',
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.message.findUnique).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. GET /conversations/:conversationId/read-statuses
// ===========================================================================

describe('GET /conversations/:conversationId/read-statuses', () => {
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
    clearStaticCache();

    // Happy-path defaults
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([[MESSAGE_ID, { readCount: 1, deliveredCount: 2 }]])
    );
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`
      // no Authorization header
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when resolveConversationId returns null', async () => {
    mockResolveConversationId.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
  });

  it('returns 403 when participant.findFirst returns null', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
  });

  it('returns 400 when no messageIds query param is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses`,
      // no messageIds param
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
  });

  it('returns 200 with read statuses converted from Map on success', async () => {
    const statusMap = new Map([
      [MESSAGE_ID, { readCount: 2, deliveredCount: 3 }]
    ]);
    mockGetConversationReadStatuses.mockResolvedValue(statusMap);

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    // Map is serialised as a plain object
    expect(body.data[MESSAGE_ID]).toMatchObject({ readCount: 2, deliveredCount: 3 });
    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(
      CONVERSATION_ID,
      [MESSAGE_ID]
    );
  });

  it('returns 500 when getConversationReadStatuses throws', async () => {
    mockGetConversationReadStatuses.mockRejectedValue(new Error('service failure'));

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// 3. POST mark-as-read — edge cases
// ===========================================================================

describe('POST /conversations/:conversationId/mark-as-read — edge cases', () => {
  let app: FastifyInstance;
  let emitMock: jest.Mock;
  let ioChain: any;

  beforeAll(async () => {
    const mocks = makeSocketMocks();
    emitMock = mocks.emitMock;
    ioChain = mocks.ioChain;

    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', mocks.socketIOHandler as any);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearStaticCache();

    // Restore ioChain chaining after clearAllMocks
    ioChain.to.mockReturnValue(ioChain);

    // Happy-path defaults
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(false);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetUnreadCount.mockResolvedValue(3);
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
  });

  it('returns 404 when resolveConversationId returns null', async () => {
    mockResolveConversationId.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is null (user not in conversation)', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it('emits only CONVERSATION_UNREAD_UPDATED (not read-status:updated) when shouldShowReadReceipts=false', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // CONVERSATION_UNREAD_UPDATED must fire for badge reset
    expect(emitMock).toHaveBeenCalledWith(
      'conversation:unread-updated',
      { conversationId: CONVERSATION_ID, unreadCount: 0 }
    );
    // read-status:updated (peer disclosure) must NOT fire
    expect(emitMock).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
  });

  it('returns 200 even when broadcastReadStatusUpdate throws (socket error is caught)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Cause broadcastReadStatusUpdate to throw by making participant.findMany reject
    mockPrisma.participant.findMany = jest.fn().mockRejectedValue(new Error('socket failure'));

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    // Socket error is caught internally — route still returns 200
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.markedCount).toBe(3);
  });

  it('returns 500 when markMessagesAsRead throws (outer catch)', async () => {
    mockMarkMessagesAsRead.mockRejectedValue(new Error('db write failed'));

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 and broadcasts READ_STATUS_UPDATED when shouldShowReadReceipts=true (happy path)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // participant.findMany used inside broadcastReadStatusUpdate
    mockPrisma.participant.findMany = jest.fn().mockResolvedValue([{ userId: USER_ID }]);
    // cursor needed by broadcastReadStatusUpdate for type='read'
    mockPrisma.conversationReadCursor = {
      findUnique: jest.fn().mockResolvedValue({ lastReadAt: new Date() }),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn()
    };
    mockGetUnreadCount.mockResolvedValue(0);
    mockGetLatestMessageSummary.mockResolvedValue({ totalMembers: 2, deliveredCount: 2, readCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(emitMock).toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. POST mark-as-received — edge cases
// ===========================================================================

describe('POST /conversations/:conversationId/mark-as-received — edge cases', () => {
  let app: FastifyInstance;
  let emitMock: jest.Mock;
  let ioChain: any;

  beforeAll(async () => {
    const mocks = makeSocketMocks();
    emitMock = mocks.emitMock;
    ioChain = mocks.ioChain;

    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', mocks.socketIOHandler as any);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearStaticCache();

    ioChain.to.mockReturnValue(ioChain);

    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(false);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetUnreadCount.mockResolvedValue(2);
    mockMarkMessagesAsReceived.mockResolvedValue(undefined);
  });

  it('returns 404 when resolveConversationId returns null', async () => {
    mockResolveConversationId.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('does not emit any socket event when shouldShowReadReceipts=false', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    // No socket broadcast at all for mark-as-received when receipts disabled
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('returns 200 even when broadcastReadStatusUpdate throws (socket error is caught)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Cause broadcast to fail
    mockPrisma.participant.findMany = jest.fn().mockRejectedValue(new Error('socket pipe broken'));

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: { authorization: AUTH_HEADER }
    });

    // Socket error is caught — route still succeeds
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.markedCount).toBe(2);
  });

  it('returns 500 when markMessagesAsReceived throws (outer catch)', async () => {
    mockMarkMessagesAsReceived.mockRejectedValue(new Error('db write failed'));

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('returns 403 when membership is null (user not in conversation)', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. POST delivery-receipt — edge cases
// ===========================================================================

describe('POST /conversations/:conversationId/messages/:messageId/delivery-receipt — edge cases', () => {
  let app: FastifyInstance;
  let emitMock: jest.Mock;
  let ioChain: any;

  beforeAll(async () => {
    const mocks = makeSocketMocks();
    emitMock = mocks.emitMock;
    ioChain = mocks.ioChain;

    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', mocks.socketIOHandler as any);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (conversationId = CONVERSATION_ID, messageId = MESSAGE_ID) =>
    `/conversations/${conversationId}/messages/${messageId}/delivery-receipt`;

  beforeEach(() => {
    jest.clearAllMocks();
    clearStaticCache();

    ioChain.to.mockReturnValue(ioChain);

    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Recipient participant (not the sender)
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_PARTICIPANT_ID, // different from PARTICIPANT_ID
      deletedAt: null
    });
    mockMarkMessagesAsReceived.mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockResolvedValue({
      totalMembers: 2,
      deliveredCount: 1,
      readCount: 0
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ userId: USER_ID }]);
  });

  it('returns 200 "Aucune action requise" when caller is the message sender (self-delivery no-op)', async () => {
    // Make message.senderId match the participant's id
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      senderId: PARTICIPANT_ID, // same as membership.id → self-sender
      deletedAt: null
    });

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ message: 'Aucune action requise' });
    // Cursor must NOT be advanced for self-delivery
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('returns 200 even when broadcastReadStatusUpdate throws (socket error is caught)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Force broadcast failure
    mockPrisma.participant.findMany = jest.fn().mockRejectedValue(new Error('socket timeout'));

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    // Socket error swallowed — delivery cursor was already advanced
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ message: 'Message marqué comme livré' });
    // markMessagesAsReceived was called before the broadcast attempt
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when markMessagesAsReceived throws (outer catch)', async () => {
    mockMarkMessagesAsReceived.mockRejectedValue(new Error('db write failed'));

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when resolveConversationId returns null', async () => {
    mockResolveConversationId.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is null (user not in conversation)', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().success).toBe(false);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('returns 404 when message is not found', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('returns 200 and broadcasts when shouldShowReadReceipts=true (happy path broadcast)', async () => {
    // All mocks at defaults: shouldShowReadReceipts=true, participant.findMany returns users,
    // getLatestMessageSummary resolves — this exercises broadcastReadStatusUpdate success path.
    const response = await app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ message: 'Message marqué comme livré' });
    expect(emitMock).toHaveBeenCalledWith('read-status:updated', expect.any(Object));
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledTimes(1);
  });
});
