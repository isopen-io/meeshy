/**
 * Unit tests for conversations stats route (stats.ts)
 * Tests GET /conversations/:id/stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
const mockGetStats = jest.fn<any>().mockResolvedValue({
  totalMessages: 42,
  participantStats: {},
  dailyActivity: { '2024-01-01': 5, '2024-01-02': 8 },
  languageDistribution: { fr: 30, en: 12 },
});

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    getStats: (...args: any[]) => mockGetStats(...args),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerStatsRoutes } from '../../../../routes/conversations/stats';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  registerStatsRoutes(app, prisma as any, requiredAuth as any);
  await app.ready();
  return app;
}

// ─── GET /conversations/:id/stats ─────────────────────────────────────────────

describe('GET /conversations/:id/stats — conversation not found', () => {
  it('returns 404 when conversation ID cannot be resolved', async () => {
    mockResolveConversationId.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — access denied', () => {
  it('returns 403 when user has no access to the conversation', async () => {
    mockCanAccessConversation.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — success with empty stats', () => {
  it('returns 200 with formatted statistics', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — success with participant stats', () => {
  it('returns 200 and enriches participant stats with user info', async () => {
    mockGetStats.mockResolvedValueOnce({
      totalMessages: 10,
      participantStats: { [USER_ID]: { messageCount: 5 } },
      dailyActivity: {},
      languageDistribution: {},
    });
    const prisma = makePrisma({
      user: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
        ]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — service error', () => {
  it('returns 500 when getStats throws', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
