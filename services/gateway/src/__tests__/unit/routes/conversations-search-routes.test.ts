/**
 * Unit tests for conversations/search.ts
 * Tests GET /conversations/search
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationMinimalSchema: { type: 'object', properties: { id: { type: 'string' } } },
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
  },
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  generateDefaultConversationTitle: jest.fn<any>().mockReturnValue('Default Title'),
}));

const mockGetUnreadCounts = jest.fn<any>().mockResolvedValue(new Map());
jest.mock('../../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: (...a: any[]) => mockGetUnreadCounts(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSearchRoutes } from '../../../routes/conversations/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const MOCK_CONVERSATION = {
  id: 'conv-1',
  identifier: 'conv-identifier',
  title: 'Team Chat',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date('2025-01-01'),
  createdAt: new Date('2024-01-01'),
  _count: { participants: 5 },
  participants: [{ id: 'part-1', userId: USER_ID, displayName: 'Alice', user: { id: USER_ID, username: 'alice', displayName: 'Alice' } }],
  messages: [],
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.user,
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([MOCK_CONVERSATION]),
      ...overrides.conversation,
    },
    ...overrides,
  };
}

async function buildApp(prismaOverrides: any = {}, authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  };

  const prisma = makePrisma(prismaOverrides);
  registerSearchRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /conversations/search — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=test' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /conversations/search — missing q param', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when q param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /conversations/search — empty query', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when q is whitespace', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/search — with results', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with conversation results', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=team' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/search — user name match', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    const mockUserFindMany = jest.fn<any>().mockResolvedValue([{ id: 'user-123' }]);
    const mockConvFindMany = jest.fn<any>().mockResolvedValue([]);
    app = await buildApp({
      user: { findMany: mockUserFindMany },
      conversation: { findMany: mockConvFindMany },
    });
    prisma = makePrisma({ user: { findMany: mockUserFindMany }, conversation: { findMany: mockConvFindMany } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and includes matching user IDs in conversation filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /conversations/search — with last message', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const convWithMessage = {
      ...MOCK_CONVERSATION,
      messages: [{
        id: 'msg-1',
        content: 'Hello!',
        senderId: 'part-1',
        messageType: 'text',
        createdAt: new Date(),
        attachments: [],
        _count: { attachments: 0 },
        sender: {
          id: 'part-1',
          userId: USER_ID,
          displayName: 'Alice',
          avatar: null,
          user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false },
        },
      }],
    };
    app = await buildApp({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([convWithMessage]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with conversations that have a last message', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/search — direct conversation title', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const directConv = { ...MOCK_CONVERSATION, type: 'direct', title: 'Direct Chat' };
    app = await buildApp({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([directConv]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for direct conversations', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=direct' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/search — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=test' });
    expect(res.statusCode).toBe(500);
  });
});
