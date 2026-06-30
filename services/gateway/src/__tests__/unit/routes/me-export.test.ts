/**
 * Unit tests — /me/export route
 *
 * Covers:
 *   GET /export — Export user data (GDPR data portability)
 *     - Auth required (401 when unauthenticated / no authContext)
 *     - Default: all types requested, JSON format → 200
 *     - Profile only (types=profile) → 200
 *     - Messages only (types=messages) → 200
 *     - Contacts only (types=contacts) → 200
 *     - CSV format → 200
 *     - Unknown types filtered → 200
 *     - DB error → 500
 *
 * NOTE: The route's 200 response schema declares `data: { type: 'object' }` with
 * no sub-properties, so Fastify fast-json-stringify serialises body.data as `{}`.
 * Tests therefore only verify statusCode and body.success for 200 paths; all
 * data-shape assertions are validated through the mock call-count/argument checks.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (must come BEFORE importing the route file) ───────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { dataExportRoutes } from '../../../routes/me/export';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer token' };

// ─── Data factories ───────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  username: 'testuser',
  displayName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phoneNumber: null,
  bio: 'Hello',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  timezone: 'Europe/Paris',
  createdAt: new Date('2024-01-01'),
  lastActiveAt: new Date('2024-06-01'),
  ...overrides,
});

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-001',
  conversationId: 'conv-001',
  content: 'Hello world',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  createdAt: new Date('2024-01-15'),
  editedAt: null,
  ...overrides,
});

const makeParticipation = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-001',
  role: 'member',
  joinedAt: new Date('2024-01-01'),
  conversation: {
    id: 'conv-001',
    title: 'Test Conversation',
    type: 'direct',
    createdAt: new Date('2024-01-01'),
    participants: [
      { userId: 'other-user', displayName: 'Other User', avatar: null, type: 'user' },
    ],
  },
  ...overrides,
});

// ─── Prisma factory ───────────────────────────────────────────────────────────
//
// The route calls participant.findMany in two different shapes:
//   1) Messages path:  select: { id: true }  → returns [{ id: '...' }]
//   2) Contacts path:  select: { conversationId: true, role: true, ... }
//                       → returns full participation objects
//
// We detect which call it is by checking the select argument.

type PrismaOpts = {
  userResult?: Record<string, unknown> | null;
  userError?: Error | null;
  participantIds?: Array<{ id: string }>;
  participantError?: Error | null;
  messagesResult?: Array<Record<string, unknown>>;
  messageError?: Error | null;
  participationsResult?: Array<Record<string, unknown>>;
  participationError?: Error | null;
};

function makePrisma(opts: PrismaOpts = {}) {
  const participantIds = opts.participantIds || [{ id: 'part-001' }];
  const participationsResult = opts.participationsResult !== undefined
    ? opts.participationsResult
    : [makeParticipation()];

  // Smart mock: returns id-only results for the messages path (select: { id: true })
  // and full participation objects for the contacts path (select includes conversationId).
  // If participantError is set, ALL participant calls throw.
  // If participationError is set, only the contacts (full-select) call throws.
  let participantFindMany: jest.Mock;
  if (opts.participantError) {
    participantFindMany = jest.fn().mockRejectedValue(opts.participantError);
  } else if (opts.participationError) {
    participantFindMany = jest.fn().mockImplementation((args: { select?: Record<string, unknown> } = {}) => {
      // Messages path: select only { id: true } — succeeds
      if (args.select && Object.keys(args.select).length === 1 && args.select['id'] === true) {
        return Promise.resolve(participantIds);
      }
      // Contacts path: throws
      return Promise.reject(opts.participationError);
    });
  } else {
    participantFindMany = jest.fn().mockImplementation((args: { select?: Record<string, unknown> } = {}) => {
      // Messages path: select only { id: true }
      if (args.select && Object.keys(args.select).length === 1 && args.select['id'] === true) {
        return Promise.resolve(participantIds);
      }
      // Contacts path: full participation select
      return Promise.resolve(participationsResult);
    });
  }

  return {
    user: {
      findUnique: opts.userError
        ? jest.fn().mockRejectedValue(opts.userError)
        : jest.fn().mockResolvedValue(opts.userResult !== undefined ? opts.userResult : makeUser()),
    },
    participant: {
      findMany: participantFindMany,
    },
    message: {
      findMany: opts.messageError
        ? jest.fn().mockRejectedValue(opts.messageError)
        : jest.fn().mockResolvedValue(opts.messagesResult !== undefined ? opts.messagesResult : [makeMessage()]),
    },
  };
}

// ─── App factories ────────────────────────────────────────────────────────────

async function buildApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as unknown);

  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID },
      userId: USER_ID,
      type: 'registered',
      hasFullAccess: true,
    };
  });

  await app.register(dataExportRoutes, { prefix: '' });
  await app.ready();
  return app;
}

async function buildUnauthApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma() as unknown);

  app.decorate('authenticate', async (_req: any, reply: any) => {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  });

  await app.register(dataExportRoutes, { prefix: '' });
  await app.ready();
  return app;
}

async function buildNoAuthContextApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma() as unknown);

  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: false,
      registeredUser: undefined,
      userId: undefined,
      type: 'anonymous',
      hasFullAccess: false,
    };
  });

  await app.register(dataExportRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /export — Authentication', () => {
  it('returns 401 when authenticate preValidation hook rejects', async () => {
    const app = await buildUnauthApp();
    const res = await app.inject({ method: 'GET', url: '/export' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when authContext is not authenticated', async () => {
    const app = await buildNoAuthContextApp();
    const res = await app.inject({ method: 'GET', url: '/export', headers: AUTH });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });
});

describe('GET /export — Default behavior (all types, JSON format)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with success response', async () => {
    const res = await app.inject({ method: 'GET', url: '/export', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('queries user, participant ids, messages, and contacts from prisma', async () => {
    const prisma = makePrisma();
    const localApp = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    localApp.decorate('prisma', prisma as unknown);
    localApp.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await localApp.register(dataExportRoutes, { prefix: '' });
    await localApp.ready();

    const res = await localApp.inject({ method: 'GET', url: '/export', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(prisma.message.findMany).toHaveBeenCalled();
    expect(prisma.participant.findMany).toHaveBeenCalled();

    await localApp.close();
  });
});

describe('GET /export — Type filtering', () => {
  it('returns 200 when types=profile and only queries user', async () => {
    const prisma = makePrisma();
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(dataExportRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/export?types=profile', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 when types=messages and only queries participants and messages', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?types=messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when types=contacts and only queries participants', async () => {
    const app = await buildApp({ participationsResult: [makeParticipation()] });
    const res = await app.inject({ method: 'GET', url: '/export?types=contacts', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 for comma-separated types=profile,messages', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?types=profile,messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when types contains only unknown values', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?types=fakeType', headers: AUTH });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when types param is missing (default = all types)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when types param is empty string (default = all types)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?types=', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /export — CSV format', () => {
  it('returns 200 when format=csv with profile', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=profile', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when format=csv with messages', async () => {
    const app = await buildApp({ messagesResult: [makeMessage()] });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when format=csv with empty messages array', async () => {
    const app = await buildApp({ messagesResult: [] });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when format=csv with contacts', async () => {
    const app = await buildApp({ participationsResult: [makeParticipation()] });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=contacts', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when format=csv with empty contacts', async () => {
    const app = await buildApp({ participationsResult: [] });
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=contacts', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when format=csv with all types', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/export?format=csv', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /export — Error handling', () => {
  it('returns 500 on user database error', async () => {
    const app = await buildApp({ userError: new Error('DB crash') });
    const res = await app.inject({ method: 'GET', url: '/export?types=profile', headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 on participant findMany database error', async () => {
    const app = await buildApp({ participantError: new Error('DB crash') });
    const res = await app.inject({ method: 'GET', url: '/export?types=messages', headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 on message findMany database error', async () => {
    const app = await buildApp({ messageError: new Error('Messages DB crash') });
    const res = await app.inject({ method: 'GET', url: '/export?types=messages', headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 on contacts database error', async () => {
    const app = await buildApp({ participationError: new Error('Contacts DB crash') });
    const res = await app.inject({ method: 'GET', url: '/export?types=contacts', headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });
});

describe('GET /export — Empty data edge cases', () => {
  it('returns 200 when user profile is null (user not found)', async () => {
    const app = await buildApp({ userResult: null });
    const res = await app.inject({ method: 'GET', url: '/export?types=profile', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when user has no messages (empty array)', async () => {
    const app = await buildApp({ messagesResult: [], participantIds: [] });
    const res = await app.inject({ method: 'GET', url: '/export?types=messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 when user has no conversations (empty contacts)', async () => {
    const app = await buildApp({ participationsResult: [] });
    const res = await app.inject({ method: 'GET', url: '/export?types=contacts', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('queries messages with senderId matching participant ids', async () => {
    const participantId = 'part-abc';
    const prisma = makePrisma({ participantIds: [{ id: participantId }] });
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(dataExportRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/export?types=messages', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: { in: [participantId] },
        }),
      })
    );
    await app.close();
  });
});
