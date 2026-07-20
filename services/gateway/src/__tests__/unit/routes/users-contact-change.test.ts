/**
 * Unit tests for routes/users/contact-change.ts
 *
 * Covers all 4 exported route functions:
 *   - initiateEmailChange    POST /users/me/change-email
 *   - verifyEmailChange      POST /users/me/verify-email-change
 *   - resendEmailChangeVerification POST /users/me/resend-email-change-verification
 *   - initiatePhoneChange    POST /users/me/change-phone
 *   - verifyPhoneChange      POST /users/me/verify-phone-change
 *
 * Uses the mock-fastify pattern (no HTTP layer): registers routes via createMockFastify
 * and calls handlers directly.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';

// ─── Mocks (must be set up before imports) ───────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/normalize', () => ({
  normalizeEmail: jest.fn((e: string) => e.toLowerCase().trim()),
  normalizePhoneNumber: jest.fn((p: string) => p.replace(/\s/g, '')),
}));

const mockSendVerificationCode = jest.fn<any>();
jest.mock('../../../services/SmsService', () => ({
  smsService: { sendVerificationCode: (...a: any[]) => mockSendVerificationCode(...a) },
}));

const mockCacheGet = jest.fn<any>().mockResolvedValue(null);
const mockCacheSet = jest.fn<any>().mockResolvedValue(undefined);
const mockCacheDel = jest.fn<any>().mockResolvedValue(undefined);

const mockGetCacheStore = jest.fn(() => ({
  get: (...a: any[]) => mockCacheGet(...a),
  set: (...a: any[]) => mockCacheSet(...a),
  del: (...a: any[]) => mockCacheDel(...a),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockGetCacheStore(),
}));

jest.mock('@meeshy/shared/types/validation', () => ({
  emailSchema: { parse: (v: any) => v },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// Mock EmailService (dynamically imported in handlers)
const mockSendEmailChangeVerification = jest.fn<any>().mockResolvedValue({ success: true });
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailChangeVerification: (...a: any[]) => mockSendEmailChangeVerification(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange,
} from '../../../routes/users/contact-change';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aabbccddeeff001122334455';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
}

function createMockFastify(prisma?: any) {
  const routes: RouteReg[] = [];
  const pr = prisma ?? createMockPrisma();

  const fastify: any = {
    routes,
    prisma: pr,
    log: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
    authenticate: jest.fn<any>(),
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    put: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PUT', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
  };

  return fastify;
}

function createMockReply() {
  const reply: any = {
    _body: undefined,
    _status: 200,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => {
      reply._body = body;
      return reply;
    }),
  };
  reply.status.mockImplementation((code: number) => {
    reply._status = code;
    return reply;
  });
  return reply;
}

function getRoute(
  fastify: ReturnType<typeof createMockFastify>,
  method: string,
  pathFragment: string
) {
  const r = fastify.routes.find(
    (r: RouteReg) => r.method === method && r.path.includes(pathFragment)
  );
  if (!r) {
    throw new Error(
      `Route ${method} *${pathFragment}* not found in [${fastify.routes
        .map((r: RouteReg) => `${r.method} ${r.path}`)
        .join(', ')}]`
    );
  }
  return r;
}

function makeAuthContext(overrides: Record<string, any> = {}) {
  return {
    isAuthenticated: true,
    registeredUser: true,
    userId: USER_ID,
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    authContext: makeAuthContext(),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: USER_ID,
    email: 'old@example.com',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    systemLanguage: 'fr',
    phoneNumber: '+33600000000',
    pendingEmail: null,
    pendingEmailVerificationToken: null,
    pendingEmailVerificationExpiry: null,
    pendingPhoneNumber: null,
    pendingPhoneVerificationCode: null,
    pendingPhoneVerificationExpiry: null,
    ...overrides,
  };
}

function setup(prisma?: any) {
  const pr = prisma ?? createMockPrisma();
  const fastify = createMockFastify(pr);
  initiateEmailChange(fastify);
  verifyEmailChange(fastify);
  resendEmailChangeVerification(fastify);
  initiatePhoneChange(fastify);
  verifyPhoneChange(fastify);
  return { fastify, pr, reply: createMockReply() };
}

// ─── POST /users/me/change-email ─────────────────────────────────────────────

describe('POST /users/me/change-email (initiateEmailChange)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmailChangeVerification.mockResolvedValue({ success: true });
  });

  it('returns 200 on successful email change initiation', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(null); // no conflict
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('Verification email sent'),
        pendingEmail: 'new@example.com',
      }),
    });
  });

  it('calls prisma.user.update with pending email data', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(pr.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          pendingEmail: 'new@example.com',
          pendingEmailVerificationToken: expect.any(String),
          pendingEmailVerificationExpiry: expect.any(Date),
        }),
      })
    );
  });

  it('calls EmailService.sendEmailChangeVerification with correct args', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(mockSendEmailChangeVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        name: 'John Doe',
        verificationLink: expect.stringContaining('verify-email-change?token='),
        expiryHours: 24,
        language: 'fr',
      })
    );
  });

  it('falls back to firstName+lastName when displayName is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser({ displayName: null }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(mockSendEmailChangeVerification).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'John Doe' })
    );
  });

  it('falls back to "fr" when systemLanguage is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser({ systemLanguage: null }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(mockSendEmailChangeVerification).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fr' })
    );
  });

  it('returns 401 when authContext is missing', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 401 when isAuthenticated is false', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when registeredUser is falsy', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    const req = makeRequest({ authContext: makeAuthContext({ registeredUser: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(404);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 400 when new email is same as current email', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser({ email: 'same@example.com' }));

    const req = makeRequest({ body: { newEmail: 'same@example.com' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('different') });
  });

  it('returns 400 when new email is same as current (case insensitive)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser({ email: 'CURRENT@EXAMPLE.COM' }));

    // normalizeEmail lowercases, so 'current@example.com' matches 'CURRENT@EXAMPLE.COM'
    const req = makeRequest({ body: { newEmail: 'CURRENT@EXAMPLE.COM' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
  });

  it('returns 400 when email is already in use by another user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(makeUser({ id: 'other-user-id' }));

    const req = makeRequest({ body: { newEmail: 'taken@example.com' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('already in use') });
  });

  it('returns 400 on Zod validation error (invalid email format — number passed)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    // z.email() rejects numbers — triggers ZodError caught by the handler
    const req = makeRequest({ body: { newEmail: 123 } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockRejectedValue(new Error('DB connection failed'));

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 500 on email service error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});
    mockSendEmailChangeVerification.mockRejectedValue(new Error('SMTP error'));

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
  });

  it('uses FRONTEND_URL env var for verification link', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-email');

    process.env.FRONTEND_URL = 'https://app.meeshy.me';
    pr.user.findUnique.mockResolvedValue(makeUser());
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newEmail: 'new@example.com' } });
    await route.handler(req, reply);

    expect(mockSendEmailChangeVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationLink: expect.stringContaining('https://app.meeshy.me'),
      })
    );

    delete process.env.FRONTEND_URL;
  });
});

// ─── POST /users/me/verify-email-change ──────────────────────────────────────

describe('POST /users/me/verify-email-change (verifyEmailChange)', () => {
  beforeEach(() => jest.clearAllMocks());

  // Helper: compute correct hashed token
  function makeTokenPair() {
    const crypto = require('crypto');
    const raw = 'a'.repeat(64); // 32 bytes hex = 64 chars
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }

  it('returns 200 on successful email verification', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');
    const { raw, hash } = makeTokenPair();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'new@example.com',
        pendingEmailVerificationToken: hash,
        pendingEmailVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(null); // not taken
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { token: raw } });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('Email changed successfully'),
        newEmail: 'new@example.com',
      }),
    });
  });

  it('calls prisma.user.update to activate email change', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');
    const { raw, hash } = makeTokenPair();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'new@example.com',
        pendingEmailVerificationToken: hash,
        pendingEmailVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { token: raw } });
    await route.handler(req, reply);

    expect(pr.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          email: 'new@example.com',
          emailVerifiedAt: expect.any(Date),
          pendingEmail: null,
          pendingEmailVerificationToken: null,
          pendingEmailVerificationExpiry: null,
        }),
      })
    );
  });

  it('returns 401 when authContext missing', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when registeredUser is falsy', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    const req = makeRequest({ authContext: makeAuthContext({ registeredUser: null }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    pr.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ body: { token: 'some-token' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('returns 400 when no pending email exists', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: null, pendingEmailVerificationToken: null })
    );

    const req = makeRequest({ body: { token: 'some-token' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('No pending email') });
  });

  it('returns 400 when pending email exists but verification token is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'new@example.com', pendingEmailVerificationToken: null })
    );

    const req = makeRequest({ body: { token: 'some-token' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('No pending email') });
  });

  it('returns 400 when token is invalid (hash mismatch)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'new@example.com',
        pendingEmailVerificationToken: 'correct-hash-value',
        pendingEmailVerificationExpiry: new Date(Date.now() + 60 * 60 * 1000),
      })
    );

    const req = makeRequest({ body: { token: 'wrong-token' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('Invalid verification token') });
  });

  it('returns 400 when token has expired', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');
    const { raw, hash } = makeTokenPair();

    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'new@example.com',
        pendingEmailVerificationToken: hash,
        pendingEmailVerificationExpiry: pastDate,
      })
    );

    const req = makeRequest({ body: { token: raw } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('expired') });
  });

  it('returns 400 when pending email was taken by another user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');
    const { raw, hash } = makeTokenPair();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'taken@example.com',
        pendingEmailVerificationToken: hash,
        pendingEmailVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(makeUser({ id: 'another-user' })); // taken

    const req = makeRequest({ body: { token: raw } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('no longer available') });
  });

  it('returns 400 on Zod validation error (missing token)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    const req = makeRequest({ body: { token: '' } }); // empty string fails min(1)
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');

    pr.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ body: { token: 'any-token' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
  });

  it('handles null expiry (no expiry check) when pendingEmailVerificationExpiry is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-email-change');
    const { raw, hash } = makeTokenPair();

    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingEmail: 'new@example.com',
        pendingEmailVerificationToken: hash,
        pendingEmailVerificationExpiry: null, // no expiry
      })
    );
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { token: raw } });
    await route.handler(req, reply);

    // Should succeed since null expiry means no expiry check
    expect(reply._body).toMatchObject({ success: true });
  });
});

// ─── POST /users/me/resend-email-change-verification ─────────────────────────

describe('POST /users/me/resend-email-change-verification (resendEmailChangeVerification)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null); // no rate limit by default
    mockCacheSet.mockResolvedValue(undefined);
    mockSendEmailChangeVerification.mockResolvedValue({ success: true });
  });

  it('returns 200 on successful resend', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com' })
    );
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('resent'),
        pendingEmail: 'pending@example.com',
      }),
    });
  });

  it('updates pending email verification token in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com' })
    );
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(pr.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          pendingEmailVerificationToken: expect.any(String),
          pendingEmailVerificationExpiry: expect.any(Date),
        }),
      })
    );
  });

  it('sets rate limit in cache after sending', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com' })
    );
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(mockCacheSet).toHaveBeenCalledWith(
      `resend-email-change:${USER_ID}`,
      expect.any(String),
      60
    );
  });

  it('returns 429 when rate limit is active (secondsRemaining > 0)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    // Set cache to now - 10s (so 50s remain in the 60s window)
    const sentAt = Date.now() - 10000;
    mockCacheGet.mockResolvedValue(sentAt.toString());

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com' })
    );

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._status).toBe(429);
    expect(reply._body).toMatchObject({ success: false, error: expect.stringContaining('wait') });
  });

  it('does not rate-limit when enough time has passed (secondsRemaining <= 0)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    // Set cache to now - 70s (rate limit expired)
    const sentAt = Date.now() - 70000;
    mockCacheGet.mockResolvedValue(sentAt.toString());

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com' })
    );
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({ success: true });
  });

  it('returns 401 when authContext missing', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when isAuthenticated is false', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when registeredUser is falsy', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    const req = makeRequest({ authContext: makeAuthContext({ registeredUser: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('returns 400 when no pending email exists', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(makeUser({ pendingEmail: null }));

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('No pending email') });
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockRejectedValue(new Error('DB down'));

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
  });

  it('calls EmailService.sendEmailChangeVerification with pending email', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'resend-email-change-verification');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingEmail: 'pending@example.com', displayName: 'Jane' })
    );
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: {} });
    await route.handler(req, reply);

    expect(mockSendEmailChangeVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pending@example.com',
        name: 'Jane',
      })
    );
  });
});

// ─── POST /users/me/change-phone ─────────────────────────────────────────────

describe('POST /users/me/change-phone (initiatePhoneChange)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendVerificationCode.mockResolvedValue({ success: true, provider: 'twilio' });
  });

  it('returns 200 on successful phone change initiation', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('Verification code sent'),
        pendingPhoneNumber: '+33611111111',
      }),
    });
  });

  it('calls prisma.user.update with pending phone data', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(pr.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          pendingPhoneNumber: '+33611111111',
          pendingPhoneVerificationCode: expect.any(String),
          pendingPhoneVerificationExpiry: expect.any(Date),
        }),
      })
    );
  });

  it('calls smsService.sendVerificationCode with new phone number', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(mockSendVerificationCode).toHaveBeenCalledWith('+33611111111', expect.any(String));
    // Code should be 6 digits
    const code = mockSendVerificationCode.mock.calls[0][1] as string;
    expect(code).toMatch(/^\d{6}$/);
  });

  it('returns 401 when authContext missing', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when isAuthenticated is false', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when registeredUser is falsy', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    const req = makeRequest({ authContext: makeAuthContext({ registeredUser: null }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('returns 400 when new phone is same as current', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33611111111' }));

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('different') });
  });

  it('allows phone change when user has no current phone (null)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: null }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    // No "same as current" check fires when phoneNumber is null
    expect(reply._body).toMatchObject({ success: true });
  });

  it('returns 400 when phone is already in use by another user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    pr.user.findFirst.mockResolvedValue(makeUser({ id: 'another-user' }));

    const req = makeRequest({ body: { newPhoneNumber: '+33699999999' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('already in use') });
  });

  it('returns 500 when SMS sending fails', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockResolvedValue(makeUser({ phoneNumber: '+33600000000' }));
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});
    mockSendVerificationCode.mockResolvedValue({ success: false, error: 'SMS gateway error' });

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('Failed to send') });
  });

  it('returns 400 on Zod validation error (phone too short)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    const req = makeRequest({ body: { newPhoneNumber: '123' } }); // min 10 chars
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'change-phone');

    pr.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ body: { newPhoneNumber: '+33611111111' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
  });
});

// ─── POST /users/me/verify-phone-change ──────────────────────────────────────

describe('POST /users/me/verify-phone-change (verifyPhoneChange)', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCodePair() {
    const crypto = require('crypto');
    const code = '123456';
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    return { code, hash };
  }

  it('returns 200 on successful phone verification', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');
    const { code, hash } = makeCodePair();

    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: hash,
        pendingPhoneVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { code } });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        message: expect.stringContaining('Phone number changed successfully'),
        newPhoneNumber: '+33611111111',
      }),
    });
  });

  it('calls prisma.user.update to activate phone change', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');
    const { code, hash } = makeCodePair();

    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: hash,
        pendingPhoneVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { code } });
    await route.handler(req, reply);

    expect(pr.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          phoneNumber: '+33611111111',
          phoneVerifiedAt: expect.any(Date),
          pendingPhoneNumber: null,
          pendingPhoneVerificationCode: null,
          pendingPhoneVerificationExpiry: null,
        }),
      })
    );
  });

  it('returns 401 when authContext missing', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    const req = makeRequest({ authContext: undefined });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when isAuthenticated is false', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when registeredUser is falsy', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    const req = makeRequest({ authContext: makeAuthContext({ registeredUser: false }) });
    await route.handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    pr.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ body: { code: '123456' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('returns 400 when no pending phone change exists', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingPhoneNumber: null, pendingPhoneVerificationCode: null })
    );

    const req = makeRequest({ body: { code: '123456' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('No pending phone') });
  });

  it('returns 400 when pending phone exists but code is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({ pendingPhoneNumber: '+33611111111', pendingPhoneVerificationCode: null })
    );

    const req = makeRequest({ body: { code: '123456' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('No pending phone') });
  });

  it('returns 400 when code is invalid (hash mismatch)', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: 'correct-hash-value',
        pendingPhoneVerificationExpiry: new Date(Date.now() + 10 * 60 * 1000),
      })
    );

    const req = makeRequest({ body: { code: '999999' } }); // wrong code
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('Invalid verification code') });
  });

  it('returns 400 when code has expired', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');
    const { code, hash } = makeCodePair();

    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: hash,
        pendingPhoneVerificationExpiry: pastDate,
      })
    );

    const req = makeRequest({ body: { code } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('expired') });
  });

  it('returns 400 when pending phone was taken by another user', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');
    const { code, hash } = makeCodePair();

    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33699999999',
        pendingPhoneVerificationCode: hash,
        pendingPhoneVerificationExpiry: futureDate,
      })
    );
    pr.user.findFirst.mockResolvedValue(makeUser({ id: 'another-user' })); // taken

    const req = makeRequest({ body: { code } });
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: expect.stringContaining('no longer available') });
  });

  it('returns 400 on Zod validation error (code not 6 digits)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    const req = makeRequest({ body: { code: '12345' } }); // only 5 digits (needs exactly 6)
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ success: false });
  });

  it('returns 400 on Zod validation error (code too long)', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    const req = makeRequest({ body: { code: '1234567' } }); // 7 digits
    await route.handler(req, reply);

    expect(reply._status).toBe(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');

    pr.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ body: { code: '123456' } });
    await route.handler(req, reply);

    expect(reply._status).toBe(500);
  });

  it('handles null expiry (no expiry check) when pendingPhoneVerificationExpiry is null', async () => {
    const { fastify, pr, reply } = setup();
    const route = getRoute(fastify, 'POST', 'verify-phone-change');
    const { code, hash } = makeCodePair();

    pr.user.findUnique.mockResolvedValue(
      makeUser({
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: hash,
        pendingPhoneVerificationExpiry: null, // no expiry
      })
    );
    pr.user.findFirst.mockResolvedValue(null);
    pr.user.update.mockResolvedValue({});

    const req = makeRequest({ body: { code } });
    await route.handler(req, reply);

    expect(reply._body).toMatchObject({ success: true });
  });
});
