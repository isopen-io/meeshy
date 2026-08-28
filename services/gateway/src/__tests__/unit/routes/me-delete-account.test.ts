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
        // Les liens visent la PAGE, plus les `GET` du gateway : c'est le CLIC
        // humain qui déclenche le `POST`, donc plus aucun pré-chargeur de lien
        // ne peut confirmer une suppression (#4183).
        confirmLink: expect.stringContaining('/account/deletion?token='),
        cancelLink: expect.stringContaining('action=cancel'),
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

// ─── Les trois GET ont cessé de muter (#4183) ────────────────────────────────
//
// Voir `me/delete-account.test.ts` pour le raisonnement. L'inertie des trois
// portes vit dans `account-deletion-get-is-inert.test.ts`, leurs effets et le
// TTL du jeton dans `account-deletion-resolve.test.ts`.
