/**
 * invitation-routes.test.ts
 *
 * Unit tests for src/routes/invitations.ts
 * Covers: POST /invitations/email
 */

// ---------------------------------------------------------------------------
// Module mocks (BEFORE imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { invitationRoutes } from '../../../routes/invitations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserFindUnique = jest.fn<any>();
const mockUserFindFirst = jest.fn<any>();

const mockPrisma: any = {
  user: {
    findUnique: mockUserFindUnique,
    findFirst: mockUserFindFirst,
  },
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(opts: { withEmailService?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });

  if (opts.withEmailService) {
    app.decorate('emailService', {
      sendInvitationEmail: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  app.register(invitationRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /invitations/email
// ---------------------------------------------------------------------------

describe('POST /invitations/email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path — emailService present', () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = buildApp({ withEmailService: true });
    });

    afterEach(async () => { await app.close(); });

    it('returns 201 and invitation data when emailService is available', async () => {
      await app.ready();
      mockUserFindUnique.mockResolvedValue({
        displayName: 'Alice',
        username: 'alice',
        avatar: null,
        systemLanguage: 'fr',
      });
      mockUserFindFirst.mockResolvedValue(null); // no existing user

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'friend@example.com' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('friend@example.com');
      expect(body.data.sentAt).toBeDefined();
    });
  });

  describe('happy path — no emailService', () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = buildApp({ withEmailService: false });
    });

    afterEach(async () => { await app.close(); });

    it('returns 201 even without emailService (logs warn)', async () => {
      await app.ready();
      mockUserFindUnique.mockResolvedValue({
        displayName: null,
        username: 'bob',
        avatar: null,
        systemLanguage: null,
      });
      mockUserFindFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'friend@example.com' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('friend@example.com');
    });

    it('returns 404 when authenticated user does not exist in DB', async () => {
      await app.ready();
      mockUserFindUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'friend@example.com' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('USER_NOT_FOUND');
    });

    it('returns 409 when invited email already belongs to a Meeshy account', async () => {
      await app.ready();
      mockUserFindUnique.mockResolvedValue({
        displayName: 'Charlie',
        username: 'charlie',
        avatar: null,
        systemLanguage: 'en',
      });
      mockUserFindFirst.mockResolvedValue({ id: '507f1f77bcf86cd799439099' });

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'existing@example.com' },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('USER_ALREADY_EXISTS');
    });

    it('returns 400 when email is invalid (zod validation)', async () => {
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'not-an-email' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when email is missing', async () => {
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
    });

    it('returns 500 on DB error during user lookup', async () => {
      await app.ready();
      mockUserFindUnique.mockRejectedValue(new Error('MongoDB connection lost'));

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'friend@example.com' },
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('returns 500 on DB error during email existence check', async () => {
      await app.ready();
      mockUserFindUnique.mockResolvedValue({
        displayName: 'Dave',
        username: 'dave',
        avatar: null,
        systemLanguage: 'fr',
      });
      mockUserFindFirst.mockRejectedValue(new Error('MongoDB timeout'));

      const res = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        payload: { email: 'friend@example.com' },
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });
});
