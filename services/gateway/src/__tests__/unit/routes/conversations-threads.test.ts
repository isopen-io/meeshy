/**
 * Unit tests for conversations/threads.ts
 * Tests GET /conversations/:id/threads/:messageId
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
  },
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: { id: true, fileName: true, mimeType: true, fileUrl: true },
}));

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...a: any[]) => mockCanAccessConversation(...a),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerThreadsRoutes } from '../../../routes/conversations/threads';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'conv-aabbcc';
const CONV_RESOLVED_ID = 'conv-resolved-id';
const MESSAGE_ID = 'msg-111';

const MOCK_PARENT_MESSAGE = {
  id: MESSAGE_ID,
  content: 'Parent message',
  originalLanguage: 'fr',
  conversationId: CONV_RESOLVED_ID,
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
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  sender: null,
  attachments: [],
  replyTo: null,
  _count: { reactions: 0, statusEntries: 0 },
};

// ─── Factory ─────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE),
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.message,
    },
    ...overrides,
  };
}

async function buildApp({ authenticated = true, prismaOverrides = {} as any } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  const prisma = makePrisma(prismaOverrides);
  registerThreadsRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/threads/:messageId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /conversations/:id/threads/:messageId — conversation not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    await app.close();
  });

  it('returns 404 when conversation is not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/threads/:messageId — access denied', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(false);
    app = await buildApp();
  });
  afterAll(async () => {
    mockCanAccessConversation.mockResolvedValue(true);
    await app.close();
  });

  it('returns 403 when user has no access to the conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /conversations/:id/threads/:messageId — message not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when parent message is not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/threads/:messageId — success (no replies)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with parent message and empty replies', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/threads/:messageId — success (with replies)', () => {
  let app: FastifyInstance;
  const mockFindFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
  const mockFindMany = jest.fn<any>().mockResolvedValueOnce([
    { ...MOCK_PARENT_MESSAGE, id: 'reply-1', replyToId: MESSAGE_ID, createdAt: new Date('2025-01-02') },
  ]).mockResolvedValue([]); // depth 2: no more replies
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: { findFirst: mockFindFirst, findMany: mockFindMany },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with parent and collected replies', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/threads/:messageId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
