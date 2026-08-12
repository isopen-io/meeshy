/**
 * Unit tests for links validation routes (validation.ts)
 * Tests GET /links/check-identifier/:identifier.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerValidationRoutes } from '../../../../routes/links/validation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  auth?: 'registered' | 'none';
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { auth = 'registered', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, username: 'alice' },
      };
    } else {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
        userId: null,
        registeredUser: null,
      };
    }
  });

  await registerValidationRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /links/check-identifier/:identifier — available ─────────────────────

describe('GET /links/check-identifier/:identifier — available', () => {
  it('returns 200 with available: true when identifier is free', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/links/check-identifier/my-new-link' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.identifier).toBe('my-new-link');
    await app.close();
  });
});

// ─── GET /links/check-identifier/:identifier — taken ─────────────────────────

describe('GET /links/check-identifier/:identifier — taken', () => {
  it('returns 200 with available: false when identifier is already used', async () => {
    const prisma = makePrisma({
      conversationShareLink: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: 'link-001', linkId: 'existing-link' }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/check-identifier/existing-link' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(false);
    await app.close();
  });
});

// ─── GET /links/check-identifier/:identifier — DB error ──────────────────────

describe('GET /links/check-identifier/:identifier — DB error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      conversationShareLink: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/links/check-identifier/some-link' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
