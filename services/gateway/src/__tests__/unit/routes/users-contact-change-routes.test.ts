/**
 * users-contact-change-routes.test.ts
 *
 * Unit tests for src/routes/users/contact-change.ts
 * Covers:
 *   - initiateEmailChange           → POST /users/me/change-email
 *   - verifyEmailChange             → POST /users/me/verify-email-change
 *   - resendEmailChangeVerification → POST /users/me/resend-email-change-verification
 *   - initiatePhoneChange           → POST /users/me/change-phone
 *   - verifyPhoneChange             → POST /users/me/verify-phone-change
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

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('@meeshy/shared/types/validation', () => ({
  emailSchema: { type: 'string', format: 'email' },
}));

jest.mock('../../../utils/normalize', () => ({
  normalizeEmail:       jest.fn((e: string) => e.trim().toLowerCase()),
  normalizePhoneNumber: jest.fn((p: string) => p.trim()),
}));

const mockSendEmailChangeVerification = jest.fn<any>();
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailChangeVerification: (...args: any[]) => mockSendEmailChangeVerification(...args),
  })),
}));

const mockSendVerificationCode = jest.fn<any>();
jest.mock('../../../services/SmsService', () => ({
  smsService: {
    sendVerificationCode: (...args: any[]) => mockSendVerificationCode(...args),
  },
}));

const mockCacheGet = jest.fn<any>();
const mockCacheSet = jest.fn<any>();
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: (...args: any[]) => mockCacheGet(...args),
    set: (...args: any[]) => mockCacheSet(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange,
} from '../../../routes/users/contact-change';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID       = '507f1f77bcf86cd799439011';
const CURRENT_EMAIL = 'old@example.com';
const NEW_EMAIL     = 'new@example.com';
const CURRENT_PHONE = '+33100000000';
const NEW_PHONE     = '+33199999999';
const TOKEN         = 'abc123tokenvalue';
const PHONE_CODE    = '123456';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique = jest.fn<any>();
const mockUserFindFirst  = jest.fn<any>();
const mockUserUpdate     = jest.fn<any>();

const mockPrisma: any = {
  user: {
    findUnique: mockUserFindUnique,
    findFirst:  mockUserFindFirst,
    update:     mockUserUpdate,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuthCtx() {
  return { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
}

function unauthCtx() {
  return { isAuthenticated: false, registeredUser: null, userId: '' };
}

function makeUserWithEmail(overrides: any = {}) {
  return {
    id: USER_ID,
    email: CURRENT_EMAIL,
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    systemLanguage: 'en',
    pendingEmail: null,
    pendingEmailVerificationToken: null,
    pendingEmailVerificationExpiry: null,
    ...overrides,
  };
}

function makeUserWithPhone(overrides: any = {}) {
  return {
    id: USER_ID,
    phoneNumber: CURRENT_PHONE,
    pendingPhoneNumber: null,
    pendingPhoneVerificationCode: null,
    pendingPhoneVerificationExpiry: null,
    ...overrides,
  };
}

// sha256(TOKEN) precomputed in tests — the handler computes hash internally,
// so we supply the matching hash in the mock user row:
import crypto from 'crypto';
function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function buildApp(authContext?: any, ...routes: Function[]): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  const ctx = authContext ?? defaultAuthCtx();
  app.decorate('authenticate', async (req: any) => { req.authContext = ctx; });
  app.decorate('prisma', mockPrisma);
  for (const route of routes) {
    app.register(route as any);
  }
  return app;
}

// ---------------------------------------------------------------------------
// POST /users/me/change-email
// ---------------------------------------------------------------------------

describe('POST /users/me/change-email', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockSendEmailChangeVerification.mockReset();

    app = buildApp(undefined, initiateEmailChange);
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail());
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
    mockSendEmailChangeVerification.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and sends verification email', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: NEW_EMAIL },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.pendingEmail).toBe(NEW_EMAIL);
    expect(mockSendEmailChangeVerification).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), initiateEmailChange);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: NEW_EMAIL },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: NEW_EMAIL },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when new email equals current email', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: CURRENT_EMAIL },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email is already in use by another user', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'other-user' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: NEW_EMAIL },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-email',
      payload: { newEmail: NEW_EMAIL },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /users/me/verify-email-change
// ---------------------------------------------------------------------------

describe('POST /users/me/verify-email-change', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockUserUpdate.mockReset();

    app = buildApp(undefined, verifyEmailChange);
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail({
      pendingEmail: NEW_EMAIL,
      pendingEmailVerificationToken: sha256(TOKEN),
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600 * 1000), // 1h from now
    }));
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and activates email change', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.newEmail).toBe(NEW_EMAIL);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), verifyEmailChange);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no pending email change', async () => {
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when token is wrong', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: 'wrongtoken' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when token has expired', async () => {
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail({
      pendingEmail: NEW_EMAIL,
      pendingEmailVerificationToken: sha256(TOKEN),
      pendingEmailVerificationExpiry: new Date(Date.now() - 1000), // 1s in the past
    }));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when pending email is taken by another user', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'other-user' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-email-change',
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /users/me/resend-email-change-verification
// ---------------------------------------------------------------------------

describe('POST /users/me/resend-email-change-verification', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockSendEmailChangeVerification.mockReset();

    app = buildApp(undefined, resendEmailChangeVerification);
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail({
      pendingEmail: NEW_EMAIL,
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600 * 1000),
    }));
    mockUserUpdate.mockResolvedValue({});
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockSendEmailChangeVerification.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and resends verification email', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.pendingEmail).toBe(NEW_EMAIL);
    expect(mockSendEmailChangeVerification).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), resendEmailChangeVerification);
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no pending email change', async () => {
    mockUserFindUnique.mockResolvedValue(makeUserWithEmail());
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 429 when rate limited (sent within 60s)', async () => {
    // lastSent 10 seconds ago → 50s remaining
    mockCacheGet.mockResolvedValue((Date.now() - 10000).toString());
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(429);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /users/me/change-phone
// ---------------------------------------------------------------------------

describe('POST /users/me/change-phone', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockUserUpdate.mockReset();
    mockSendVerificationCode.mockReset();

    app = buildApp(undefined, initiatePhoneChange);
    mockUserFindUnique.mockResolvedValue(makeUserWithPhone());
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
    mockSendVerificationCode.mockResolvedValue({ success: true, provider: 'twilio' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and sends SMS code', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.pendingPhoneNumber).toBe(NEW_PHONE);
    expect(mockSendVerificationCode).toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), initiatePhoneChange);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when new phone equals current phone', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: CURRENT_PHONE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when phone already in use', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'other-user' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when SMS sending fails', async () => {
    mockSendVerificationCode.mockResolvedValue({ success: false, error: 'SMS error' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/change-phone',
      payload: { newPhoneNumber: NEW_PHONE },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /users/me/verify-phone-change
// ---------------------------------------------------------------------------

describe('POST /users/me/verify-phone-change', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockUserUpdate.mockReset();

    app = buildApp(undefined, verifyPhoneChange);
    mockUserFindUnique.mockResolvedValue(makeUserWithPhone({
      pendingPhoneNumber: NEW_PHONE,
      pendingPhoneVerificationCode: sha256(PHONE_CODE),
      pendingPhoneVerificationExpiry: new Date(Date.now() + 600 * 1000), // 10 min
    }));
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and activates phone change', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.newPhoneNumber).toBe(NEW_PHONE);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), verifyPhoneChange);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no pending phone change', async () => {
    mockUserFindUnique.mockResolvedValue(makeUserWithPhone());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is wrong', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: '999999' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code has expired', async () => {
    mockUserFindUnique.mockResolvedValue(makeUserWithPhone({
      pendingPhoneNumber: NEW_PHONE,
      pendingPhoneVerificationCode: sha256(PHONE_CODE),
      pendingPhoneVerificationExpiry: new Date(Date.now() - 1000),
    }));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when pending phone is taken by another user', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'other-user' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/verify-phone-change',
      payload: { code: PHONE_CODE },
    });
    expect(res.statusCode).toBe(500);
  });
});
