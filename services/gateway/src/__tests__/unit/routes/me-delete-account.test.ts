/**
 * Unit tests — /me/delete-account routes
 *
 * Covers:
 *   DELETE /delete-account   — Initiate deletion (authenticated)
 *   GET    /delete-account/confirm?token=...  — Confirm via email link (public)
 *   GET    /delete-account/cancel?token=...   — Cancel via email link (public)
 *   GET    /delete-account/delete-now?token=... — Immediate deletion (public)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (must come BEFORE importing the route file) ───────────────────────

const mockSendAccountDeletionConfirmEmail = jest.fn<(data: unknown) => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: (data: unknown) =>
      mockSendAccountDeletionConfirmEmail(data),
  })),
}));

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

jest.mock('../../../validation/helpers.js', () => ({
  validateBody: () => async (_req: unknown, _rep: unknown) => { /* no-op */ },
  validateQuery: () => async (_req: unknown, _rep: unknown) => { /* no-op */ },
}));

jest.mock('../../../validation/delete-account-schemas.js', () => ({
  DeleteAccountBodySchema: {},
  TokenQuerySchema: {},
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { deleteAccountRoutes } from '../../../routes/me/delete-account';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer token' };
const CONFIRM_TOKEN = 'abc123confirmtoken';
const CANCEL_TOKEN = 'xyz789canceltoken';

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  activeRequest?: Record<string, unknown> | null;
  expiredCount?: number;
  transactionResult?: unknown[];
  createResult?: Record<string, unknown>;
  userForEmail?: Record<string, unknown> | null;
  confirmRequest?: Record<string, unknown> | null;
  cancelRequest?: Record<string, unknown> | null;
  deleteNowRequest?: Record<string, unknown> | null;
  cancelUserActive?: Record<string, unknown> | null;
  findUniqueError?: Error | null;
  findFirstError?: Error | null;
  createError?: Error | null;
  transactionError?: Error | null;
  updateError?: Error | null;
};

function makePrisma(opts: PrismaOpts = {}) {
  const defaultDeletionRequest = {
    id: 'req-001',
    userId: USER_ID,
    status: 'PENDING_EMAIL_CONFIRMATION',
    confirmTokenHash: 'hashed-confirm',
    cancelTokenHash: 'hashed-cancel',
    createdAt: new Date(),
  };

  return {
    accountDeletionRequest: {
      findFirst: opts.findFirstError
        ? jest.fn().mockRejectedValue(opts.findFirstError)
        : jest.fn()
            .mockResolvedValueOnce(opts.activeRequest !== undefined ? opts.activeRequest : null)
            .mockResolvedValueOnce(opts.confirmRequest !== undefined ? opts.confirmRequest : null)
            .mockResolvedValueOnce(opts.cancelRequest !== undefined ? opts.cancelRequest : null)
            .mockResolvedValueOnce(opts.deleteNowRequest !== undefined ? opts.deleteNowRequest : null),
      count: jest.fn().mockResolvedValue(opts.expiredCount !== undefined ? opts.expiredCount : 0),
      create: opts.createError
        ? jest.fn().mockRejectedValue(opts.createError)
        : jest.fn().mockResolvedValue({ ...defaultDeletionRequest, ...(opts.createResult || {}) }),
      update: opts.updateError
        ? jest.fn().mockRejectedValue(opts.updateError)
        : jest.fn().mockResolvedValue(defaultDeletionRequest),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: opts.findUniqueError
        ? jest.fn().mockRejectedValue(opts.findUniqueError)
        : jest.fn().mockResolvedValue(
            opts.userForEmail !== undefined
              ? opts.userForEmail
              : opts.cancelUserActive !== undefined
              ? opts.cancelUserActive
              : { id: USER_ID, email: 'user@example.com', displayName: 'Test User', firstName: 'Test', systemLanguage: 'fr' }
          ),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: opts.transactionError
      ? jest.fn().mockRejectedValue(opts.transactionError)
      : jest.fn().mockResolvedValue(opts.transactionResult || [{ count: 1 }, {}]),
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

  await app.register(deleteAccountRoutes, { prefix: '' });
  await app.ready();
  return app;
}

async function buildUnauthApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as unknown);

  app.decorate('authenticate', async (req: any, reply: any) => {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  });

  await app.register(deleteAccountRoutes, { prefix: '' });
  await app.ready();
  return app;
}

async function buildNoAuthContextApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as unknown);

  // Decorate authenticate but set authContext without isAuthenticated or registeredUser
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: false,
      registeredUser: undefined,
      userId: undefined,
      type: 'anonymous',
      hasFullAccess: false,
    };
  });

  await app.register(deleteAccountRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /delete-account — Initiate account deletion', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when authentication fails', async () => {
    const unauthApp = await buildUnauthApp();
    const res = await unauthApp.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('returns 401 when authContext is not authenticated', async () => {
    const noAuthApp = await buildNoAuthContextApp();
    const res = await noAuthApp.inject({
      method: 'DELETE',
      url: '/delete-account',
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    await noAuthApp.close();
  });

  it('returns 400 when confirmationPhrase is wrong', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'WRONG PHRASE' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 409 when a deletion request is already pending', async () => {
    const appWithPending = await buildApp({
      activeRequest: { id: 'req-existing', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION' },
    });
    const res = await appWithPending.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    await appWithPending.close();
  });

  it('returns 409 when a CONFIRMED deletion is already in progress', async () => {
    const appWithConfirmed = await buildApp({
      activeRequest: { id: 'req-confirmed', userId: USER_ID, status: 'CONFIRMED' },
    });
    const res = await appWithConfirmed.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(409);
    await appWithConfirmed.close();
  });

  it('returns 200 and creates a deletion request on success', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
  });

  it('sends confirmation email when user has an email', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        name: 'Test User',
        confirmLink: expect.stringContaining('/delete-account/confirm?token='),
        cancelLink: expect.stringContaining('/delete-account/cancel?token='),
        language: 'fr',
      })
    );
  });

  it('returns 200 and skips email when user has no email', async () => {
    const appNoEmail = await buildApp({
      userForEmail: { id: USER_ID, email: null, displayName: 'NoEmail', firstName: 'No', systemLanguage: 'en' },
    });
    const res = await appNoEmail.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).not.toHaveBeenCalled();
    await appNoEmail.close();
  });

  it('returns 200 and cancels expired requests before creating a new one', async () => {
    const prisma = makePrisma({ activeRequest: null, expiredCount: 2 });
    const app2 = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app2.decorate('prisma', prisma as unknown);
    app2.decorate('authenticate', async (req: any) => {
      req.authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID },
        userId: USER_ID,
        type: 'registered',
        hasFullAccess: true,
      };
    });
    await app2.register(deleteAccountRoutes, { prefix: '' });
    await app2.ready();

    const res = await app2.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
    await app2.close();
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ findFirstError: new Error('DB crash') });
    const res = await appErr.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await appErr.close();
  });

  it('uses firstName as fallback when displayName is null', async () => {
    const appFirstName = await buildApp({
      userForEmail: { id: USER_ID, email: 'test@x.com', displayName: null, firstName: 'Alice', systemLanguage: 'en' },
    });
    const res = await appFirstName.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice' })
    );
    await appFirstName.close();
  });

  it('uses "Utilisateur" as fallback when both displayName and firstName are null', async () => {
    const appDefaultName = await buildApp({
      userForEmail: { id: USER_ID, email: 'test@x.com', displayName: null, firstName: null, systemLanguage: 'en' },
    });
    const res = await appDefaultName.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Utilisateur' })
    );
    await appDefaultName.close();
  });

  it('uses English as fallback language when systemLanguage is null', async () => {
    const appNoLang = await buildApp({
      userForEmail: { id: USER_ID, email: 'test@x.com', displayName: 'User', firstName: 'User', systemLanguage: null },
    });
    const res = await appNoLang.inject({
      method: 'DELETE',
      url: '/delete-account',
      headers: AUTH,
      payload: { confirmationPhrase: 'SUPPRIMER MON COMPTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    );
    await appNoLang.close();
  });
});

// ─── GET /delete-account/confirm ─────────────────────────────────────────────

describe('GET /delete-account/confirm — Email confirmation link', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns HTML with success page when token is valid', async () => {
    const prisma = makePrisma({});
    // Override findFirst to return a valid request for confirm route
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 'req-001', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION', confirmTokenHash: 'used' });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/confirm?token=${CONFIRM_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Suppression confirmee');
  });

  it('returns HTML with error page when token is invalid', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockResolvedValue(null);

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/confirm?token=invalidtoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Lien invalide');
  });

  it('returns HTML with error page on database error', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockRejectedValue(new Error('DB error'));

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/confirm?token=sometoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Erreur');
  });

  it('updates deletion request to CONFIRMED status with gracePeriodEndsAt on success', async () => {
    const prisma = makePrisma({});
    const updateSpy = jest.fn().mockResolvedValue({});
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: 'req-001', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION' });
    prisma.accountDeletionRequest.update = updateSpy;

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    await app.inject({
      method: 'GET',
      url: `/delete-account/confirm?token=${CONFIRM_TOKEN}`,
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-001' },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
          gracePeriodEndsAt: expect.any(Date),
          confirmTokenHash: 'used',
        }),
      })
    );
  });
});

// ─── GET /delete-account/cancel ──────────────────────────────────────────────

describe('GET /delete-account/cancel — Email cancel link', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns HTML success page when cancel token is valid', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: 'req-001', userId: USER_ID, status: 'CONFIRMED', cancelTokenHash: 'used' });
    prisma.user.findUnique = jest.fn().mockResolvedValue({ isActive: true });

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=${CANCEL_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Suppression annulee');
  });

  it('returns HTML error page when cancel token is invalid', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockResolvedValue(null);

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=badtoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Lien invalide');
  });

  it('reactivates user account when user.isActive is false', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: 'req-001', userId: USER_ID, status: 'CONFIRMED' });
    prisma.user.findUnique = jest.fn().mockResolvedValue({ isActive: false });
    const userUpdateSpy = jest.fn().mockResolvedValue({});
    prisma.user.update = userUpdateSpy;

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=${CANCEL_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(userUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ isActive: true, deletedAt: null }),
      })
    );
  });

  it('does not update user when user.isActive is already true', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: 'req-001', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION' });
    prisma.user.findUnique = jest.fn().mockResolvedValue({ isActive: true });
    const userUpdateSpy = jest.fn().mockResolvedValue({});
    prisma.user.update = userUpdateSpy;

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=${CANCEL_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(userUpdateSpy).not.toHaveBeenCalled();
  });

  it('returns HTML error page on database error', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockRejectedValue(new Error('DB crash'));

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/cancel?token=sometoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Erreur');
  });
});

// ─── GET /delete-account/delete-now ──────────────────────────────────────────

describe('GET /delete-account/delete-now — Immediate deletion link', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns HTML success page when token is valid and request is GRACE_PERIOD_EXPIRED', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: 'req-001', userId: USER_ID, status: 'GRACE_PERIOD_EXPIRED' });
    prisma.user.update = jest.fn().mockResolvedValue({});
    prisma.accountDeletionRequest.update = jest.fn().mockResolvedValue({});

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/delete-now?token=validdeletetoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Compte supprime');
  });

  it('returns HTML error page when delete-now token is invalid', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockResolvedValue(null);

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/delete-now?token=badtoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Lien invalide');
  });

  it('deactivates the user and marks request COMPLETED on success', async () => {
    const prisma = makePrisma({});
    const reqId = 'req-delete-now';
    prisma.accountDeletionRequest.findFirst = jest.fn()
      .mockResolvedValue({ id: reqId, userId: USER_ID, status: 'GRACE_PERIOD_EXPIRED' });
    const userUpdateSpy = jest.fn().mockResolvedValue({});
    const reqUpdateSpy = jest.fn().mockResolvedValue({});
    prisma.user.update = userUpdateSpy;
    prisma.accountDeletionRequest.update = reqUpdateSpy;

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    await app.inject({
      method: 'GET',
      url: `/delete-account/delete-now?token=validdeletetoken`,
    });

    expect(userUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
      })
    );
    expect(reqUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reqId },
        data: { status: 'COMPLETED' },
      })
    );
  });

  it('returns HTML error page on database error', async () => {
    const prisma = makePrisma({});
    prisma.accountDeletionRequest.findFirst = jest.fn().mockRejectedValue(new Error('DB crash'));

    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
    });
    await app.register(deleteAccountRoutes, { prefix: '' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/delete-account/delete-now?token=sometoken`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Erreur');
  });
});
