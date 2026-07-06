/**
 * Route tests — POST /invitations/email
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { invitationRoutes } from '../../../routes/invitations';

// ─── Factories ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH_HEADER = { authorization: 'Bearer valid-token' };

type PrismaOverrides = {
  user?: Record<string, unknown> | null;
  existingUser?: { id: string } | null;
};

function makePrisma(overrides: PrismaOverrides = {}) {
  const {
    user = { displayName: 'Alice', username: 'alice', avatar: null, systemLanguage: 'fr' },
    existingUser = null,
  } = overrides;

  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findFirst: jest.fn().mockResolvedValue(existingUser),
    },
  };
}

type AppOptions = {
  prismaOverrides?: PrismaOverrides;
  withEmailService?: boolean;
  emailServiceRejects?: boolean;
};

async function buildApp({
  prismaOverrides = {},
  withEmailService = true,
  emailServiceRejects = false,
}: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate('prisma', makePrisma(prismaOverrides) as unknown);
  app.decorate('authenticate', async (req: Parameters<typeof app.authenticate>[0]) => {
    (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
  });

  const sendInvitationEmail = emailServiceRejects
    ? jest.fn().mockRejectedValue(new Error('smtp error'))
    : jest.fn().mockResolvedValue(undefined);

  if (withEmailService) {
    (app as unknown as Record<string, unknown>).emailService = { sendInvitationEmail };
  }

  await app.register(invitationRoutes);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /invitations/email', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('returns 201 when invitation is sent successfully (with emailService)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('friend@example.com');
    expect(body.data.sentAt).toBeDefined();
  });

  it('returns 201 and logs warn when emailService is not available', async () => {
    const warnSpy = jest.fn();
    const appNoEmail = Fastify({ logger: false });
    appNoEmail.decorate('prisma', makePrisma() as unknown);
    appNoEmail.decorate('authenticate', async (req: Parameters<typeof app.authenticate>[0]) => {
      (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
    });
    (appNoEmail as unknown as Record<string, { warn: typeof warnSpy }>).log = {
      ...(appNoEmail.log as unknown as Record<string, unknown>),
      warn: warnSpy,
    } as unknown as (typeof appNoEmail)['log'];
    await appNoEmail.register(invitationRoutes);
    await appNoEmail.ready();

    const res = await appNoEmail.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(201);
    await appNoEmail.close();
  });

  it('returns 404 when the authenticated user is not found', async () => {
    const appNoUser = await buildApp({ prismaOverrides: { user: null } });

    const res = await appNoUser.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('USER_NOT_FOUND');
    await appNoUser.close();
  });

  it('returns 409 when the invitee is already a Meeshy user', async () => {
    const appExisting = await buildApp({
      prismaOverrides: { existingUser: { id: 'existing-id' } },
    });

    const res = await appExisting.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'already@meeshy.com' },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('USER_ALREADY_EXISTS');
    await appExisting.close();
  });

  it('returns 400 when the email address is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the body has no email field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('uses username as senderName when displayName is null', async () => {
    const appNoDisplayName = await buildApp({
      prismaOverrides: {
        user: { displayName: null, username: 'alice_username', avatar: null, systemLanguage: 'fr' },
      },
    });

    const sendInvitationEmail = (
      (appNoDisplayName as unknown as Record<string, { sendInvitationEmail: jest.Mock }>).emailService
    )?.sendInvitationEmail;

    const res = await appNoDisplayName.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(201);
    if (sendInvitationEmail) {
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ senderName: 'alice_username' })
      );
    }
    await appNoDisplayName.close();
  });

  it('uses systemLanguage fr fallback when null', async () => {
    const appNoLang = await buildApp({
      prismaOverrides: {
        user: { displayName: 'Alice', username: 'alice', avatar: null, systemLanguage: null },
      },
    });

    const res = await appNoLang.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(201);
    const emailSvc = (appNoLang as unknown as Record<string, { sendInvitationEmail: jest.Mock }>).emailService;
    if (emailSvc?.sendInvitationEmail) {
      expect(emailSvc.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' })
      );
    }
    await appNoLang.close();
  });

  it('returns 500 when prisma throws unexpectedly', async () => {
    const badPrisma = {
      user: {
        findUnique: jest.fn().mockRejectedValue(new Error('db connection lost')),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const appBad = Fastify({ logger: false });
    appBad.decorate('prisma', badPrisma as unknown);
    appBad.decorate('authenticate', async (req: Parameters<typeof app.authenticate>[0]) => {
      (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
    });
    await appBad.register(invitationRoutes);
    await appBad.ready();

    const res = await appBad.inject({
      method: 'POST',
      url: '/invitations/email',
      headers: AUTH_HEADER,
      payload: { email: 'friend@example.com' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await appBad.close();
  });
});
