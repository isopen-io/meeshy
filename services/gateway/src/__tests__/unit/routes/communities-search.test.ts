/**
 * Unit tests for communities/search.ts
 * Tests GET /communities/search
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
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
  },
}));

const mockValidatePagination = jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 });

jest.mock('../../../utils/pagination', () => ({
  validatePagination: (...a: any[]) => mockValidatePagination(...a),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSearchRoutes } from '../../../routes/communities/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockCommunity = {
  id: 'comm-1',
  name: 'Tech Enthusiasts',
  identifier: 'tech',
  description: 'A community for tech lovers',
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2025-01-01'),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members: [],
  _count: { members: 5, Conversation: 2 },
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    community: {
      findMany: jest.fn<any>().mockResolvedValue([mockCommunity]),
      count: jest.fn<any>().mockResolvedValue(1),
      ...overrides.community,
    },
    ...overrides,
  };
}

async function buildApp(prismaOverrides: any = {}, authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await registerSearchRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /communities/search — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /communities/search — missing or empty q', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    expect(res.json().pagination.total).toBe(0);
  });

  it('returns 200 with empty array when q is whitespace', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe('GET /communities/search — with results', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with community list when query matches', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Tech Enthusiasts');
    expect(body.data[0].memberCount).toBe(5);
    expect(body.data[0].conversationCount).toBe(2);
  });

  it('includes pagination metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech&limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    expect(res.json().pagination).toBeDefined();
    expect(res.json().pagination.total).toBe(1);
  });
});

describe('GET /communities/search — empty results', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      community: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when no communities match', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=nonexistent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    expect(res.json().pagination.total).toBe(0);
  });
});

describe('GET /communities/search — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      community: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
    expect(res.statusCode).toBe(500);
  });
});
