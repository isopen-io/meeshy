/**
 * me-export-routes.test.ts
 *
 * Unit tests for src/routes/me/export.ts
 * Covers: GET /export (profile, messages, contacts, csv, auth)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { dataExportRoutes } from '../../../routes/me/export';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUser = {
  findUnique: jest.fn<any>(),
};

const mockParticipant = {
  findMany: jest.fn<any>(),
};

const mockMessage = {
  findMany: jest.fn<any>(),
};

const mockPrisma: any = {
  user: mockUser,
  participant: mockParticipant,
  message: mockMessage,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext ?? {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
      userId: USER_ID,
    };
  });
  app.register(dataExportRoutes);
  return app;
}

function makeUser() {
  return {
    id: USER_ID,
    username: 'alice',
    displayName: 'Alice',
    firstName: 'Alice',
    lastName: 'A',
    email: 'alice@example.com',
    phoneNumber: null,
    bio: null,
    avatar: null,
    banner: null,
    systemLanguage: 'en',
    regionalLanguage: null,
    customDestinationLanguage: null,
    timezone: 'UTC',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-15'),
  };
}

// ---------------------------------------------------------------------------
// GET /export
// ---------------------------------------------------------------------------

describe('GET /export', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ isAuthenticated: false, registeredUser: null, userId: null });
    await unauthApp.ready();

    const res = await unauthApp.inject({ method: 'GET', url: '/export' });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 with profile data when types=profile', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(makeUser());

    const res = await app.inject({ method: 'GET', url: '/export?types=profile' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.profile).toBeDefined();
    expect(body.data.profile.username).toBe('alice');
  });

  it('returns 200 with messages data when types=messages', async () => {
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([{ id: 'part-1' }]);
    mockMessage.findMany.mockResolvedValue([
      { id: 'msg-1', content: 'Hello', conversationId: 'conv-1', originalLanguage: 'en',
        messageType: 'text', messageSource: 'user', createdAt: new Date(), editedAt: null }
    ]);

    const res = await app.inject({ method: 'GET', url: '/export?types=messages' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.messagesCount).toBe(1);
  });

  it('returns 200 with contacts data when types=contacts', async () => {
    await app.ready();
    mockParticipant.findMany.mockResolvedValue([{
      conversationId: 'conv-1',
      role: 'member',
      joinedAt: new Date('2024-01-10'),
      conversation: {
        id: 'conv-1',
        title: 'Test Conv',
        type: 'public',
        createdAt: new Date(),
        participants: [
          { userId: 'other-user', displayName: 'Bob', avatar: null, type: 'user' }
        ]
      }
    }]);

    const res = await app.inject({ method: 'GET', url: '/export?types=contacts' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contactsCount).toBe(1);
    expect(body.data.contacts[0].conversationName).toBe('Test Conv');
  });

  it('returns 200 with all types when no types param', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(makeUser());
    mockParticipant.findMany.mockResolvedValue([]);
    mockMessage.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/export' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.profile).toBeDefined();
    expect(body.data.messages).toBeDefined();
    expect(body.data.contacts).toBeDefined();
  });

  it('returns 200 exercising CSV format branch', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(makeUser());

    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=profile' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.profile).toBeDefined();
  });

  it('returns 200 without csv key when format=json', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(makeUser());

    const res = await app.inject({ method: 'GET', url: '/export?format=json&types=profile' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.csv).toBeUndefined();
  });

  it('returns 500 on DB error during export', async () => {
    await app.ready();
    mockUser.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: '/export?types=profile' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 when types contains invalid values (they are filtered)', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(makeUser());
    mockParticipant.findMany.mockResolvedValue([]);
    mockMessage.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/export?types=profile,invalid,messages' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.profile).toBeDefined();
    expect(body.data.messages).toBeDefined();
  });
});
