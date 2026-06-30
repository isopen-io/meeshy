/**
 * Unit tests for userPreferencesRoutes (routes/me/preferences/index.ts)
 * Tests GET / (all prefs), DELETE / (reset all), and sub-route registration.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../../utils/socket-broadcast', () => ({
  broadcastToUser: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
}));

jest.mock('../../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { userPreferencesRoutes } from '../../../../../routes/me/preferences/index';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-pref-idx-0001';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({ id: 'pref-1' }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversationPreference: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn<any>().mockResolvedValue([]),
    ...overrides,
  } as any;
}

type AuthMode = 'authenticated' | 'unauthenticated';

async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  auth?: AuthMode;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), auth = 'authenticated' } = opts;

  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).auth = { userId: USER_ID, isAuthenticated: true };
    } else {
      (req as any).auth = { isAuthenticated: false };
    }
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  await app.register(userPreferencesRoutes);
  await app.ready();
  return app;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET / — get all preferences', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with all preference defaults when no prefs stored', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('notification');
  });

  it('returns 200 with stored prefs when they exist', async () => {
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest.fn<any>().mockResolvedValue({
      privacy: { showOnlineStatus: true },
      audio: { testField: true },
      message: null,
      notification: null,
      video: null,
      document: null,
      application: null,
    });
    const storedApp = await buildApp({ prisma });
    const res = await storedApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data).toHaveProperty('privacy');
    await storedApp.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── DELETE / ────────────────────────────────────────────────────────────────

describe('DELETE / — reset all preferences', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 on successful reset', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userPreferences.update = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── Sub-routes registration ──────────────────────────────────────────────────

describe('userPreferencesRoutes — sub-routes registration', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());

  it('registers /privacy sub-route (GET responds)', async () => {
    const res = await app.inject({ method: 'GET', url: '/privacy' });
    expect(res.statusCode).toBe(200);
  });

  it('registers /audio sub-route', async () => {
    const res = await app.inject({ method: 'GET', url: '/audio' });
    expect(res.statusCode).toBe(200);
  });

  it('registers /notification sub-route', async () => {
    const res = await app.inject({ method: 'GET', url: '/notification' });
    expect(res.statusCode).toBe(200);
  });

  it('registers /categories sub-route', async () => {
    const res = await app.inject({ method: 'GET', url: '/categories' });
    expect(res.statusCode).toBe(200);
  });
});

// ─── Guard: missing prisma ────────────────────────────────────────────────────

describe('userPreferencesRoutes — missing prisma guard', () => {
  it('returns early without crashing when prisma is not decorated', async () => {
    mockCreateAuth.mockImplementation(() => async () => {});
    const app = Fastify({ logger: false });
    await app.register(userPreferencesRoutes);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
