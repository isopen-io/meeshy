/**
 * message-read-status-routes.test.ts
 *
 * Unit tests for src/routes/message-read-status.ts
 * Covers:
 *   - GET  /messages/:messageId/read-status
 *   - GET  /conversations/:conversationId/read-statuses
 *   - POST /conversations/:conversationId/mark-as-read
 *   - POST /conversations/:conversationId/mark-as-received
 *   - POST /conversations/:conversationId/messages/:messageId/delivery-receipt
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
    }),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { READ_STATUS_UPDATED: 'read-status:updated' },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

const mockCreateUnifiedAuth = jest.fn<any>();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuth(...args),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn().mockReturnValue(async () => {}),
  validateQuery:  jest.fn().mockReturnValue(async () => {}),
}));

jest.mock('../../../validation/message-read-status-schemas', () => ({
  MessageIdParamSchema:       {},
  ConversationIdParamSchema:  {},
  ReadStatusesQuerySchema:    {},
  DeliveryReceiptParamsSchema: {},
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockGetMessageReadStatus        = jest.fn<any>();
const mockGetConversationReadStatuses = jest.fn<any>();
const mockMarkMessagesAsRead          = jest.fn<any>();
const mockMarkMessagesAsReceived      = jest.fn<any>();
const mockGetUnreadCount              = jest.fn<any>();
const mockGetLatestMessageSummary     = jest.fn<any>();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus:        (...args: any[]) => mockGetMessageReadStatus(...args),
    getConversationReadStatuses: (...args: any[]) => mockGetConversationReadStatuses(...args),
    markMessagesAsRead:          (...args: any[]) => mockMarkMessagesAsRead(...args),
    markMessagesAsReceived:      (...args: any[]) => mockMarkMessagesAsReceived(...args),
    getUnreadCount:              (...args: any[]) => mockGetUnreadCount(...args),
    getLatestMessageSummary:     (...args: any[]) => mockGetLatestMessageSummary(...args),
  })),
}));

const mockShouldShowReadReceipts = jest.fn<any>();

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: (...args: any[]) => mockShouldShowReadReceipts(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import messageReadStatusRoutes from '../../../routes/message-read-status';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID        = '507f1f77bcf86cd799439011';
const MESSAGE_ID     = '507f1f77bcf86cd799439022';
const CONVERSATION_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID  = '507f1f77bcf86cd799439044';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockMessageFindUnique     = jest.fn<any>();
const mockParticipantFindFirst  = jest.fn<any>();

const mockPrisma: any = {
  message: {
    findUnique: (...args: any[]) => mockMessageFindUnique(...args),
  },
  participant: {
    findFirst: (...args: any[]) => mockParticipantFindFirst(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthCtx(overrides: any = {}): any {
  return {
    userId: USER_ID,
    isAnonymous: false,
    ...overrides,
  };
}

function buildApp(authCtx?: any): FastifyInstance {
  const ctx = authCtx ?? makeAuthCtx();
  const authMiddleware = async (req: any) => { req.authContext = ctx; };
  mockCreateUnifiedAuth.mockReturnValue(authMiddleware);

  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.register(messageReadStatusRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /messages/:messageId/read-status
// ---------------------------------------------------------------------------

describe('GET /messages/:messageId/read-status', () => {
  let app: FastifyInstance;

  const mockMessage = {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    conversation: {
      participants: [{ userId: USER_ID }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMessageReadStatus.mockReset();
    app = buildApp();
    mockMessageFindUnique.mockResolvedValue(mockMessage);
    mockGetMessageReadStatus.mockResolvedValue({
      messageId: MESSAGE_ID,
      readBy: [],
      receivedBy: [],
    });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with read status', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}/read-status` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBe(MESSAGE_ID);
  });

  it('calls getMessageReadStatus with messageId and conversationId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}/read-status` });
    expect(mockGetMessageReadStatus).toHaveBeenCalledWith(MESSAGE_ID, CONVERSATION_ID);
  });

  it('returns 404 when message not found', async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}/read-status` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a participant', async () => {
    mockMessageFindUnique.mockResolvedValue({
      ...mockMessage,
      conversation: { participants: [] },
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}/read-status` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockGetMessageReadStatus.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}/read-status` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /conversations/:conversationId/read-statuses
// ---------------------------------------------------------------------------

describe('GET /conversations/:conversationId/read-statuses', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversationReadStatuses.mockReset();
    mockResolveConversationId.mockReset();
    mockParticipantFindFirst.mockReset();
    app = buildApp();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockParticipantFindFirst.mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID });
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([[MESSAGE_ID, { readAt: new Date() }]])
    );
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with read statuses map', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 404 when conversation not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockParticipantFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when messageIds is empty', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    mockGetConversationReadStatuses.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /conversations/:conversationId/mark-as-read
// ---------------------------------------------------------------------------

describe('POST /conversations/:conversationId/mark-as-read', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMessagesAsRead.mockReset();
    mockGetUnreadCount.mockReset();
    mockResolveConversationId.mockReset();
    mockParticipantFindFirst.mockReset();
    mockShouldShowReadReceipts.mockReset();
    app = buildApp();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockParticipantFindFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetUnreadCount.mockResolvedValue(5);
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
    mockShouldShowReadReceipts.mockResolvedValue(false);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with markedCount', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.markedCount).toBe(5);
  });

  it('calls markMessagesAsRead with participantId and conversationId', async () => {
    await app.ready();
    await app.inject({ method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-read` });
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(PARTICIPANT_ID, CONVERSATION_ID);
  });

  it('returns 404 when conversation not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockParticipantFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockMarkMessagesAsRead.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /conversations/:conversationId/mark-as-received
// ---------------------------------------------------------------------------

describe('POST /conversations/:conversationId/mark-as-received', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMessagesAsReceived.mockReset();
    mockGetUnreadCount.mockReset();
    mockResolveConversationId.mockReset();
    mockParticipantFindFirst.mockReset();
    mockShouldShowReadReceipts.mockReset();
    app = buildApp();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockParticipantFindFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockGetUnreadCount.mockResolvedValue(3);
    mockMarkMessagesAsReceived.mockResolvedValue(undefined);
    mockShouldShowReadReceipts.mockResolvedValue(false);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with markedCount', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.markedCount).toBe(3);
  });

  it('returns 404 when conversation not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockParticipantFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockMarkMessagesAsReceived.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /conversations/:conversationId/messages/:messageId/delivery-receipt
// ---------------------------------------------------------------------------

describe('POST /conversations/:conversationId/messages/:messageId/delivery-receipt', () => {
  let app: FastifyInstance;

  const mockMessage = {
    conversationId: CONVERSATION_ID,
    senderId: 'other-participant',
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMessagesAsReceived.mockReset();
    mockResolveConversationId.mockReset();
    mockParticipantFindFirst.mockReset();
    mockMessageFindUnique.mockReset();
    mockShouldShowReadReceipts.mockReset();
    app = buildApp();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockParticipantFindFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockMessageFindUnique.mockResolvedValue(mockMessage);
    mockMarkMessagesAsReceived.mockResolvedValue(undefined);
    mockShouldShowReadReceipts.mockResolvedValue(false);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when delivery receipt processed', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Message marqué comme livré');
  });

  it('returns 200 with no-op message when sender acknowledges own message', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...mockMessage, senderId: PARTICIPANT_ID });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toBe('Aucune action requise');
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockParticipantFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when message does not belong to conversation', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...mockMessage, conversationId: 'other-conv' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when message is deleted', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...mockMessage, deletedAt: new Date() });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockMarkMessagesAsReceived.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
    });
    expect(res.statusCode).toBe(500);
  });
});
