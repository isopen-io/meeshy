/**
 * Unit tests for links/user.ts routes.
 * Tests GET /links and GET /links/stats
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockIsRegisteredUser = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  UnifiedAuthRequest: {},
  isRegisteredUser: (...a: any[]) => mockIsRegisteredUser(...a),
}));

const mockAuthMiddleware = jest.fn<any>();

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerUserRoutes } from '../../../routes/links/user';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockLink = {
  id: '507f1f77bcf86cd799439099',
  linkId: 'mshy_link_abc123',
  identifier: 'my-link',
  name: 'Test Link',
  isActive: true,
  currentUses: 5,
  maxUses: 100,
  expiresAt: null,
  createdAt: new Date('2025-01-01'),
  conversation: { id: 'conv-1', title: 'Test Chat', type: 'group' },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([mockLink]),
      count: jest.fn<any>().mockResolvedValue(1),
      aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
      ...overrides.conversationShareLink,
    },
    ...overrides,
  };
}

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(authContext: any = { registeredUser: { id: USER_ID } }): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    (req as any).authContext = authContext;
  });
  mockIsRegisteredUser.mockImplementation((ctx: any) => ctx?.registeredUser !== undefined);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma() as any);
  await registerUserRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /links ───────────────────────────────────────────────────────────────

describe('GET /links — not registered user', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ /* no registeredUser */ });
    mockIsRegisteredUser.mockReturnValue(false);
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when not a registered user', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links — success with links', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ registeredUser: { id: USER_ID } });
    mockIsRegisteredUser.mockReturnValue(true);
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with links list', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].linkId).toBe('mshy_link_abc123');
  });

  it('returns pagination metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/links?limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });
});

describe('GET /links — empty result', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prismaWithEmpty = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prismaWithEmpty as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty data array', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });
});

describe('GET /links — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prismaWithError = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prismaWithError as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /links — link with null maxUses and expiresAt, no conversation title', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const linkWithNulls = {
      ...mockLink,
      name: null,
      maxUses: null,
      expiresAt: null,
      conversation: null,
    };

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([linkWithNulls]),
        count: jest.fn<any>().mockResolvedValue(1),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null fields properly mapped', async () => {
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const item = res.json().data[0];
    expect(item.name).toBeNull();
    expect(item.maxUses).toBeNull();
    expect(item.expiresAt).toBeNull();
    expect(item.conversationTitle).toBeNull();
  });
});

// ─── GET /links/stats ─────────────────────────────────────────────────────────

describe('GET /links/stats — not registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(false);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = {};
    });
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma() as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when not a registered user', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/stats — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(3),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 42 } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.totalLinks).toBe(3);
    expect(data.totalUses).toBe(42);
  });
});

describe('GET /links/stats — null currentUses sum', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns totalUses as 0 when aggregate sum is null', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalUses).toBe(0);
  });
});

describe('GET /links/stats — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegisteredUser.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      (req as any).authContext = { registeredUser: { id: USER_ID } };
    });

    const prisma = makePrisma({
      conversationShareLink: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } }),
      },
    });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as any);
    await registerUserRoutes(app);
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(500);
  });
});
