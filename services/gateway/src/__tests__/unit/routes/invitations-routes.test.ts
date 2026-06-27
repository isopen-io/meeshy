/**
 * invitations-routes.test.ts
 *
 * Unit tests for src/routes/invitations.ts
 * Covers:
 *   - POST /invitations/email
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { invitationRoutes } from '../../../routes/invitations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = jest.fn<any>();
const mockUserFindFirst  = jest.fn<any>();

const mockPrisma: any = {
  user: {
    findUnique: (...args: any[]) => mockUserFindUnique(...args),
    findFirst:  (...args: any[]) => mockUserFindFirst(...args),
  },
};

// ---------------------------------------------------------------------------
// Email service mock
// ---------------------------------------------------------------------------

const mockSendInvitationEmail = jest.fn<any>();

const mockEmailService: any = {
  sendInvitationEmail: (...args: any[]) => mockSendInvitationEmail(...args),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(opts: { authUser?: { userId: string } | null; withEmailService?: boolean } = {}): FastifyInstance {
  const { authUser = { userId: USER_ID }, withEmailService = true } = opts;
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (authUser) {
      req.user = authUser;
    } else {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });
  app.decorate('prisma', mockPrisma);
  if (withEmailService) {
    app.decorate('emailService', mockEmailService);
  }
  app.register(invitationRoutes);
  return app;
}

function makeUser(overrides: any = {}) {
  return {
    displayName: 'Test User',
    username:    'testuser',
    avatar:      null,
    systemLanguage: 'fr',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /invitations/email
// ---------------------------------------------------------------------------

describe('POST /invitations/email', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockSendInvitationEmail.mockReset();

    app = buildApp();
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockUserFindFirst.mockResolvedValue(null);
    mockSendInvitationEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 when invitation sent successfully', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'newuser@example.com' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('newuser@example.com');
    expect(body.data.sentAt).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authUser: null });
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'newuser@example.com' },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when email is invalid', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when sending user not found in DB', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'newuser@example.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when target email is already a Meeshy user', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'existing-user-id' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'existing@example.com' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('calls sendInvitationEmail with recipient and senderName', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'friend@example.com' },
    });
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'friend@example.com',
      senderName: 'Test User',
    }));
  });

  it('uses username as senderName when displayName is null', async () => {
    mockUserFindUnique.mockResolvedValue(makeUser({ displayName: null, username: 'myusername' }));
    await app.ready();
    await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'friend@example.com' },
    });
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      senderName: 'myusername',
    }));
  });

  it('returns 201 even when emailService is not available', async () => {
    const appWithout = buildApp({ withEmailService: false });
    await appWithout.ready();
    const res = await appWithout.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'newuser@example.com' },
    });
    await appWithout.close();
    expect(res.statusCode).toBe(201);
    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });

  it('passes language from user profile to email service', async () => {
    mockUserFindUnique.mockResolvedValue(makeUser({ systemLanguage: 'en' }));
    await app.ready();
    await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'friend@example.com' },
    });
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en',
    }));
  });

  it('returns 500 on unexpected DB error', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/invitations/email',
      payload: { email: 'newuser@example.com' },
    });
    expect(res.statusCode).toBe(500);
  });
});
