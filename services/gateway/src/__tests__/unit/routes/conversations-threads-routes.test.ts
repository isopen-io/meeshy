/**
 * conversations-threads-routes.test.ts
 *
 * Unit tests for src/routes/conversations/threads.ts
 * Covers: GET /conversations/:id/threads/:messageId
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {
    id: true,
    fileName: true,
    mimeType: true,
    fileSize: true,
    fileUrl: true,
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerThreadsRoutes } from '../../../routes/conversations/threads';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID  = '507f1f77bcf86cd799439011';
const CONV_ID  = '507f1f77bcf86cd799439012';
const MSG_ID   = '507f1f77bcf86cd799439013';
const REPLY_ID = '507f1f77bcf86cd799439014';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockMessage = {
  findFirst: jest.fn<any>(),
  findMany:  jest.fn<any>(),
};

const mockPrisma: any = {
  message: mockMessage,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });

  const requiredAuth = async (req: any) => {
    req.authContext = authContext ?? {
      isAuthenticated: true,
      type: 'registered',
      registeredUser: { id: USER_ID, role: 'USER' },
      userId: USER_ID,
    };
  };

  registerThreadsRoutes(app, mockPrisma, requiredAuth);
  return app;
}

function makeMessage(overrides: any = {}) {
  return {
    id: MSG_ID,
    content: 'Hello world',
    originalLanguage: 'en',
    conversationId: CONV_ID,
    senderId: 'part-1',
    messageType: 'text',
    messageSource: 'user',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    reactionSummary: {},
    reactionCount: 0,
    translations: [],
    validatedMentions: [],
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    sender: null,
    attachments: [],
    replyTo: null,
    _count: { reactions: 0, statusEntries: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /conversations/:id/threads/:messageId
// ---------------------------------------------------------------------------

describe('GET /conversations/:id/threads/:messageId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessage.findFirst.mockReset();
    mockMessage.findMany.mockReset();
    app = buildApp();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockMessage.findFirst.mockResolvedValue(makeMessage());
    mockMessage.findMany.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with parent message and empty replies', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.parent).toBeDefined();
    expect(body.data.replies).toHaveLength(0);
    expect(body.data.totalCount).toBe(0);
  });

  it('returns 200 with parent and one level of replies', async () => {
    await app.ready();
    const reply = makeMessage({ id: REPLY_ID, replyToId: MSG_ID });
    mockMessage.findMany
      .mockResolvedValueOnce([reply])
      .mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.replies).toHaveLength(1);
    expect(body.data.totalCount).toBe(1);
  });

  it('returns 404 when conversation not found', async () => {
    await app.ready();
    mockResolveConversationId.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user has no access to conversation', async () => {
    await app.ready();
    mockCanAccessConversation.mockResolvedValue(false);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when parent message not found', async () => {
    await app.ready();
    mockMessage.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('passes conversationId and messageId to findFirst query', async () => {
    await app.ready();

    await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(mockMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MSG_ID,
          conversationId: CONV_ID,
          deletedAt: null,
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockResolveConversationId.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });

  it('sorts replies by createdAt ascending', async () => {
    await app.ready();
    const later  = makeMessage({ id: REPLY_ID, replyToId: MSG_ID, createdAt: new Date('2024-01-15T12:00:00Z') });
    const earlier = makeMessage({ id: '507f1f77bcf86cd799439099', replyToId: MSG_ID, createdAt: new Date('2024-01-15T10:30:00Z') });
    mockMessage.findMany
      .mockResolvedValueOnce([later, earlier])
      .mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    const body = JSON.parse(res.body);
    expect(body.data.replies[0].createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(body.data.replies[1].createdAt).toBe('2024-01-15T12:00:00.000Z');
  });

  it('collects multi-level replies recursively (depth 2)', async () => {
    await app.ready();
    const level1 = makeMessage({ id: REPLY_ID, replyToId: MSG_ID });
    const level2 = makeMessage({ id: '507f1f77bcf86cd799439099', replyToId: REPLY_ID });
    mockMessage.findMany
      .mockResolvedValueOnce([level1])
      .mockResolvedValueOnce([level2])
      .mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/threads/${MSG_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.replies).toHaveLength(2);
    expect(body.data.totalCount).toBe(2);
  });
});
