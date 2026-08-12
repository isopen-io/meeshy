/**
 * Unit tests for conversations/stats.ts
 * Tests GET /conversations/:id/stats
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...a: any[]) => mockCanAccessConversation(...a),
}));

const mockGetStats = jest.fn<any>().mockResolvedValue({
  totalMessages: 42,
  participantStats: {},
  dailyActivity: {},
  languageDistribution: {},
});
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    getStats: (...a: any[]) => mockGetStats(...a),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerStatsRoutes } from '../../../routes/conversations/stats';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'conv-aabbcc';
const CONV_RESOLVED_ID = 'conv-resolved-id';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.user,
    },
    ...overrides,
  };
}

async function buildApp({ authenticated = true, prismaOverrides = {} as any } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) return reply.status(401).send({ success: false, error: 'Unauthorized' });
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerStatsRoutes(app, makePrisma(prismaOverrides) as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/stats — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /conversations/:id/stats — conversation not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    await app.close();
  });

  it('returns 404 when conversation not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/stats — access denied', () => {
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

  it('returns 403 when user has no access', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /conversations/:id/stats — success (empty stats)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetStats.mockResolvedValue({ totalMessages: 0, participantStats: {}, dailyActivity: {}, languageDistribution: {} });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/stats — success (with participant stats)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetStats.mockResolvedValue({
      totalMessages: 10,
      participantStats: { [USER_ID]: { count: 10 } },
      dailyActivity: { '2025-01-01': 5, '2025-01-02': 5 },
      languageDistribution: { fr: 8, en: 2 },
    });
    app = await buildApp({
      prismaOverrides: {
        user: {
          findMany: jest.fn<any>().mockResolvedValue([{ id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null }]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with enriched participant stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/stats — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetStats.mockRejectedValue(new Error('DB crash'));
    app = await buildApp();
  });
  afterAll(async () => {
    mockGetStats.mockResolvedValue({ totalMessages: 0, participantStats: {}, dailyActivity: {}, languageDistribution: {} });
    await app.close();
  });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(500);
  });
});
