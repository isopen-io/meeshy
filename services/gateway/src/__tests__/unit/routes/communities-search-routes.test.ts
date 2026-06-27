import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Module mocks (must come before all imports — jest hoisting) ──────────────

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import Fastify, { FastifyInstance } from 'fastify';
import { registerSearchRoutes } from '../../../routes/communities/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439099';

// ─── Mock prisma setup ────────────────────────────────────────────────────────

const mockCommunity = {
  findMany: jest.fn<any>(),
  count: jest.fn<any>(),
};
const mockPrisma: any = { community: mockCommunity };

// ─── App builder ──────────────────────────────────────────────────────────────

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
    req.authContext = { isAuthenticated: true, userId: USER_ID };
  });
  app.register(registerSearchRoutes);
  return app;
}

// ─── Test data factories ──────────────────────────────────────────────────────

function makeCommunity(overrides: Record<string, any> = {}) {
  return {
    id: 'comm-1',
    name: 'Dev Community',
    identifier: 'mshy_dev',
    description: 'For developers',
    avatar: null,
    isPrivate: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
    members: [],
    _count: { members: 10, Conversation: 3 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('registerSearchRoutes — GET /communities/search', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Early return: missing q ───────────────────────────────────────────────

  it('returns 200 with empty data array when q is not provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/communities/search',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockCommunity.findMany).not.toHaveBeenCalled();
    expect(mockCommunity.count).not.toHaveBeenCalled();
  });

  // ── Early return: whitespace-only q ──────────────────────────────────────

  it('returns 200 with empty data array when q is whitespace only', async () => {
    // Fastify schema enforces minLength:1 on q so an actual empty string (?q=)
    // yields a 400 before the handler runs.  A whitespace value passes schema
    // validation but is caught by the q.trim().length === 0 guard in the handler.
    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=%20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockCommunity.findMany).not.toHaveBeenCalled();
    expect(mockCommunity.count).not.toHaveBeenCalled();
  });

  // ── Successful search with one result ────────────────────────────────────

  it('returns 200 with matching communities when q is provided', async () => {
    const community = makeCommunity();
    mockCommunity.findMany.mockResolvedValue([community]);
    mockCommunity.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=dev',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: Record<string, unknown>[];
      pagination: { total: number; offset: number; limit: number; hasMore: boolean };
    };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const result = body.data[0];
    expect(result.id).toBe('comm-1');
    expect(result.name).toBe('Dev Community');
    expect(result.identifier).toBe('mshy_dev');
    expect(result.description).toBe('For developers');
    expect(result.avatar).toBeNull();
    expect(result.isPrivate).toBe(false);
    expect(result.memberCount).toBe(10);
    expect(result.conversationCount).toBe(3);
    // The response schema declares creator as `{ type: 'object' }` with no
    // explicit properties, so fast-json-stringify returns it as a plain object.
    expect(result.creator).toBeDefined();
    expect(result.members).toEqual([]);
  });

  // ── _count mapping: members → memberCount, Conversation → conversationCount

  it('maps _count.members to memberCount and _count.Conversation to conversationCount', async () => {
    const community = makeCommunity({ _count: { members: 42, Conversation: 7 } });
    mockCommunity.findMany.mockResolvedValue([community]);
    mockCommunity.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=test',
    });

    const body = JSON.parse(res.body) as { data: Record<string, unknown>[] };
    expect(body.data[0].memberCount).toBe(42);
    expect(body.data[0].conversationCount).toBe(7);
  });

  // ── Pagination metadata ───────────────────────────────────────────────────

  it('returns correct pagination metadata with offset and limit params', async () => {
    const communities = Array.from({ length: 10 }, (_, i) =>
      makeCommunity({ id: `comm-${i}`, name: `Community ${i}` })
    );
    mockCommunity.findMany.mockResolvedValue(communities);
    mockCommunity.count.mockResolvedValue(50);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=community&offset=10&limit=10',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      pagination: { total: number; offset: number; limit: number; hasMore: boolean };
    };
    expect(body.pagination.total).toBe(50);
    expect(body.pagination.offset).toBe(10);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.hasMore).toBe(true);
  });

  // ── Multiple communities returned ─────────────────────────────────────────

  it('returns multiple communities correctly mapped', async () => {
    const communities = [
      makeCommunity({ id: 'comm-1', name: 'Dev Community', _count: { members: 10, Conversation: 3 } }),
      makeCommunity({ id: 'comm-2', name: 'Design Community', _count: { members: 5, Conversation: 1 } }),
      makeCommunity({ id: 'comm-3', name: 'QA Community', _count: { members: 20, Conversation: 8 } }),
    ];
    mockCommunity.findMany.mockResolvedValue(communities);
    mockCommunity.count.mockResolvedValue(3);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=community',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: Record<string, unknown>[];
      pagination: { total: number; hasMore: boolean };
    };
    expect(body.data).toHaveLength(3);
    expect(body.data[0].id).toBe('comm-1');
    expect(body.data[1].id).toBe('comm-2');
    expect(body.data[2].id).toBe('comm-3');
    expect(body.data[2].memberCount).toBe(20);
    expect(body.pagination.total).toBe(3);
    expect(body.pagination.hasMore).toBe(false);
  });

  // ── hasMore false when all results fit ───────────────────────────────────

  it('sets hasMore to false when result count equals total', async () => {
    mockCommunity.findMany.mockResolvedValue([makeCommunity()]);
    mockCommunity.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=dev',
    });

    const body = JSON.parse(res.body) as { pagination: { hasMore: boolean } };
    expect(body.pagination.hasMore).toBe(false);
  });

  // ── 500 on DB error ───────────────────────────────────────────────────────

  it('returns 500 when prisma.community.findMany rejects', async () => {
    mockCommunity.findMany.mockRejectedValue(new Error('DB connection lost'));
    mockCommunity.count.mockResolvedValue(0);

    const res = await app.inject({
      method: 'GET',
      url: '/communities/search?q=dev',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { success: boolean };
    expect(body.success).toBe(false);
  });
});
