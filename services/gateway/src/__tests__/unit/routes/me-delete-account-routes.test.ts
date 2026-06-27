/**
 * me-delete-account-routes.test.ts
 *
 * Unit tests for src/routes/me/delete-account.ts
 * Covers: DELETE /delete-account, GET /delete-account/confirm,
 *         GET /delete-account/cancel, GET /delete-account/delete-now
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
  createUnifiedAuthMiddleware: jest.fn(),
}));

// validateBody/validateQuery as no-op preHandler factories
jest.mock('../../../validation/helpers.js', () => ({
  validateBody:  jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/delete-account-schemas.js', () => ({
  DeleteAccountBodySchema: {},
  TokenQuerySchema:        {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { deleteAccountRoutes } from '../../../routes/me/delete-account';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const TOKEN   = 'some-valid-token-abc123';
const TOKEN_HASH = require('crypto').createHash('sha256').update(TOKEN).digest('hex');

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockAccountDeletionRequest = {
  findFirst:   jest.fn<any>(),
  count:       jest.fn<any>().mockResolvedValue(0),
  create:      jest.fn<any>().mockResolvedValue({ id: 'req-1' }),
  update:      jest.fn<any>().mockResolvedValue({}),
  updateMany:  jest.fn<any>().mockResolvedValue({}),
};

const mockUser = {
  findUnique: jest.fn<any>(),
  update:     jest.fn<any>().mockResolvedValue({}),
};

const mockTransaction = jest.fn<any>().mockImplementation(async (ops: any[]) => {
  return Promise.all(ops);
});

const mockPrisma: any = {
  accountDeletionRequest: mockAccountDeletionRequest,
  user:                   mockUser,
  $transaction:           mockTransaction,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);

  // For authenticated routes using fastify.authenticate
  app.decorate('authenticate', async (req: any) => {
    const ctx = authContext ?? {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, email: 'alice@example.com', displayName: 'Alice', firstName: 'Alice', systemLanguage: 'fr' },
    };
    req.authContext = ctx;
    req.user = { userId: ctx.userId };
  });

  app.register(deleteAccountRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// DELETE /delete-account
// ---------------------------------------------------------------------------

describe('DELETE /delete-account', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when deletion initiated with correct phrase', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue(null);
    mockUser.findUnique.mockResolvedValue({
      email: 'alice@example.com',
      displayName: 'Alice',
      firstName: 'Alice',
      systemLanguage: 'fr',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockAccountDeletionRequest.create).toHaveBeenCalled();
  });

  it('returns 400 when confirmation phrase is wrong', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'delete my account' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when deletion request already pending', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue({
      id: 'req-existing',
      userId: USER_ID,
      status: 'PENDING_EMAIL_CONFIRMATION',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 200 and cancels expired requests before creating new one', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue(null);
    mockAccountDeletionRequest.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue({
      email: 'alice@example.com',
      displayName: 'Alice',
      firstName: 'Alice',
      systemLanguage: 'fr',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({
      isAuthenticated: false,
      userId: null,
      registeredUser: null,
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /delete-account/confirm
// ---------------------------------------------------------------------------

describe('GET /delete-account/confirm', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 HTML on valid confirm token', async () => {
    await app.ready();
    const gracePeriodEndsAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    mockAccountDeletionRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      userId: USER_ID,
      status: 'PENDING_EMAIL_CONFIRMATION',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/confirm?token=${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('Suppression confirmee');
    expect(mockAccountDeletionRequest.update).toHaveBeenCalled();
  });

  it('returns HTML page when token invalid', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/delete-account/confirm?token=bad-token',
    });

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
  });
});

// ---------------------------------------------------------------------------
// GET /delete-account/cancel
// ---------------------------------------------------------------------------

describe('GET /delete-account/cancel', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 HTML when deletion successfully cancelled', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      userId: USER_ID,
      status: 'PENDING_EMAIL_CONFIRMATION',
    });
    mockUser.findUnique.mockResolvedValue({ isActive: true });

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('annulee');
    expect(mockAccountDeletionRequest.update).toHaveBeenCalled();
  });

  it('returns HTML page when cancel token invalid', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/delete-account/cancel?token=bad-token',
    });

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
  });

  it('reactivates user if account was deactivated', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      userId: USER_ID,
      status: 'GRACE_PERIOD_EXPIRED',
    });
    mockUser.findUnique.mockResolvedValue({ isActive: false });

    await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=${TOKEN}`,
    });

    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true, deletedAt: null } })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /delete-account/delete-now
// ---------------------------------------------------------------------------

describe('GET /delete-account/delete-now', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 HTML when account deleted immediately', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      userId: USER_ID,
      status: 'GRACE_PERIOD_EXPIRED',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/delete-now?token=${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('supprime');
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
    );
    expect(mockAccountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } })
    );
  });

  it('returns HTML error when token is invalid', async () => {
    await app.ready();
    mockAccountDeletionRequest.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/delete-account/delete-now?token=invalid',
    });

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
  });
});
