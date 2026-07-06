/**
 * Unit tests for routes/me/index.ts
 * Tests the root /me GET endpoint and sub-route registration.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
}));

// Mock sub-routes to avoid complex dependency chains
jest.mock('../../../../routes/me/preferences', () => ({
  userPreferencesRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../routes/me/delete-account', () => ({
  deleteAccountRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../routes/me/export', () => ({
  dataExportRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import meRoutes from '../../../../routes/me/index';
import type { UnifiedAuthRequest } from '../../../../middleware/auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-me-test-00001';

const mockUser = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  avatar: null,
  role: 'USER',
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
    },
    ...overrides,
  } as any;
}

type AuthState = 'authenticated' | 'unauthenticated';

async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  auth?: AuthState;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), auth = 'authenticated' } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Decorate fastify.prisma
  app.decorate('prisma', prisma);

  // Stub fastify.authenticate so preValidation runs without JWT verification
  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false };
    }
  });

  await app.register(meRoutes);
  await app.ready();
  return app;
}

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /me — authenticated user', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with user data', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(USER_ID);
    expect(body.data.username).toBe('alice');
  });
});

describe('GET /me — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const app = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /me — user not found in DB', () => {
  it('returns 404 when user is not in database', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Sub-route registration ───────────────────────────────────────────────────

describe('meRoutes — sub-route registration', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('builds the app successfully with all sub-routes', async () => {
    const { userPreferencesRoutes } = require('../../../../routes/me/preferences');
    const { deleteAccountRoutes } = require('../../../../routes/me/delete-account');
    const { dataExportRoutes } = require('../../../../routes/me/export');
    expect(userPreferencesRoutes).toHaveBeenCalled();
    expect(deleteAccountRoutes).toHaveBeenCalled();
    expect(dataExportRoutes).toHaveBeenCalled();
  });
});
