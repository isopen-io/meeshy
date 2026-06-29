/**
 * Unit tests for links user routes (user.ts)
 * Tests GET /links, GET /links/stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerUserRoutes } from '../../../../routes/links/user';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockLink = {
  id: 'link-001',
  linkId: 'mshy_abc123',
  identifier: 'my-link',
  name: 'Test Link',
  isActive: true,
  currentUses: 5,
  maxUses: null,
  expiresAt: null,
  createdAt: new Date('2024-01-01'),
  conversation: { id: 'conv-1', title: 'My Conversation', type: 'group' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue([mockLink]),
      count: jest.fn<any>().mockResolvedValue(1),
      aggregate: jest.fn<any>().mockResolvedValue({ _sum: { currentUses: 5 } }),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'registered' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'registered', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
        hasFullAccess: true,
      };
    } else {
      (req as any)._testAuthContext = null;
    }
  });

  await registerUserRoutes(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /links — forbidden ───────────────────────────────────────────────────

describe('GET /links — not registered user', () => {
  it('returns 403 when auth context has no registeredUser', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /links — success ─────────────────────────────────────────────────────

describe('GET /links — success', () => {
  it('returns 200 with paginated link list', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    await app.close();
  });
});

describe('GET /links — with pagination params', () => {
  it('returns 200 with limit and offset applied', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/links?limit=10&offset=5' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /links — empty result', () => {
  it('returns 200 with empty array when user has no links', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findMany = jest.fn<any>().mockResolvedValue([]);
    prisma.conversationShareLink.count = jest.fn<any>().mockResolvedValue(0);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    await app.close();
  });
});

describe('GET /links — DB error', () => {
  it('returns 500 when findMany throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findMany = jest.fn<any>().mockRejectedValue(new Error('DB error'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /links/stats — forbidden ────────────────────────────────────────────

describe('GET /links/stats — not registered user', () => {
  it('returns 403 when auth context has no registeredUser', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── GET /links/stats — success ──────────────────────────────────────────────

describe('GET /links/stats — success', () => {
  it('returns 200 with aggregated stats', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalLinks).toBe(1);
    expect(body.data.activeLinks).toBe(1);
    expect(body.data.totalUses).toBe(5);
    await app.close();
  });
});

describe('GET /links/stats — zero uses', () => {
  it('returns 0 for totalUses when aggregate sum is null', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.aggregate = jest.fn<any>().mockResolvedValue({ _sum: { currentUses: null } });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalUses).toBe(0);
    await app.close();
  });
});

describe('GET /links/stats — DB error', () => {
  it('returns 500 when count throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.count = jest.fn<any>().mockRejectedValue(new Error('DB error'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/stats' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
