/**
 * password-reset-routes.test.ts
 *
 * Unit tests for src/routes/password-reset.ts
 * Covers:
 *   POST /forgot-password
 *   POST /reset-password
 *   GET  /reset-password/verify-token
 *   POST /forgot-password/phone/lookup
 *   POST /forgot-password/phone/verify-identity
 *   POST /forgot-password/phone/verify-code
 *   POST /forgot-password/phone/resend
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — MUST come before any import of the route under test
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Shared types — mock schema objects so Fastify doesn't choke on them
jest.mock('@meeshy/shared/types', () => ({
  errorResponseSchema:           { type: 'object', additionalProperties: true },
  validationErrorResponseSchema: { type: 'object', additionalProperties: true },
}));

// PasswordResetService
const mockRequestPasswordReset  = jest.fn<any>();
const mockCompletePasswordReset = jest.fn<any>();

jest.mock('../../../services/PasswordResetService', () => ({
  PasswordResetService: jest.fn().mockImplementation(() => ({
    requestPasswordReset:  mockRequestPasswordReset,
    completePasswordReset: mockCompletePasswordReset,
  })),
}));

// PhonePasswordResetService
const mockLookupByPhone  = jest.fn<any>();
const mockVerifyIdentity = jest.fn<any>();
const mockVerifyCode     = jest.fn<any>();
const mockResendCode     = jest.fn<any>();

jest.mock('../../../services/PhonePasswordResetService', () => ({
  PhonePasswordResetService: jest.fn().mockImplementation(() => ({
    lookupByPhone:   mockLookupByPhone,
    verifyIdentity:  mockVerifyIdentity,
    verifyCode:      mockVerifyCode,
    resendCode:      mockResendCode,
  })),
}));

// CacheStore singleton
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({})),
}));

// EmailService
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));

// SmsService
jest.mock('../../../services/SmsService', () => ({
  SmsService: jest.fn().mockImplementation(() => ({})),
}));

// GeoIPService — no getRequestContext used in password-reset routes (uses request.ip directly)
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
}));

// Rate limiters — all become no-op middleware so we don't need Redis
const noopMiddleware = async () => {};

jest.mock('../../../utils/rate-limiter.js', () => ({
  createPasswordResetRateLimiter:      jest.fn(() => ({ middleware: () => noopMiddleware })),
  createPasswordResetDailyRateLimiter: jest.fn(() => ({ middleware: () => noopMiddleware })),
  createAuthGlobalRateLimiter:         jest.fn(() => ({ middleware: () => noopMiddleware })),
  createPhoneResetLookupRateLimiter:   jest.fn(() => ({ middleware: () => noopMiddleware })),
  createPhoneResetIdentityRateLimiter: jest.fn(() => ({ middleware: () => noopMiddleware })),
  createPhoneResetCodeRateLimiter:     jest.fn(() => ({ middleware: () => noopMiddleware })),
  createPhoneResetResendRateLimiter:   jest.fn(() => ({ middleware: () => noopMiddleware })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after all mocks)
// ---------------------------------------------------------------------------

import { passwordResetRoutes } from '../../../routes/password-reset';

// ---------------------------------------------------------------------------
// Helpers & fixtures
// ---------------------------------------------------------------------------

const USER_ID     = '507f1f77bcf86cd799439011';
const TOKEN_HASH  = 'abc123def456'; // arbitrary hash in DB

/** A minimal PasswordResetToken row returned by prisma mock */
function makeResetToken(overrides: any = {}) {
  return {
    id:        'token-record-id',
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min in the future
    usedAt:    null,
    isRevoked: false,
    user: {
      id:              USER_ID,
      twoFactorSecret: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: 'log' as const,
        keywords: ['example'],
      },
    },
  });
  // Decorate prisma with the DB models the route accesses directly
  app.decorate('prisma', {
    passwordResetToken: mockPasswordResetToken,
  } as any);
  app.decorate('redis', {} as any);
  app.register(passwordResetRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Prisma mock (only passwordResetToken is used directly by the route)
// ---------------------------------------------------------------------------

const mockPasswordResetToken = {
  findUnique: jest.fn<any>(),
};

// ---------------------------------------------------------------------------
// POST /forgot-password
// ---------------------------------------------------------------------------

describe('POST /forgot-password', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on success and calls service with correct email', async () => {
    await app.ready();
    mockRequestPasswordReset.mockResolvedValue({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password',
      payload: { email: 'alice@example.com' },
    });

    // Route calls reply.status(200).send(result) directly — always returns 200
    expect(res.statusCode).toBe(200);
    expect(mockRequestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alice@example.com',
    }));
  });

  it('passes optional captchaToken and deviceFingerprint to service', async () => {
    await app.ready();
    mockRequestPasswordReset.mockResolvedValue({ success: true, message: 'ok' });

    await app.inject({
      method:  'POST',
      url:     '/forgot-password',
      payload: {
        email:             'alice@example.com',
        captchaToken:      'captcha-xyz',
        deviceFingerprint: 'fp-abc',
      },
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      captchaToken:      'captcha-xyz',
      deviceFingerprint: 'fp-abc',
    }));
  });

  it('returns 400 when email is missing (zod validation)', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password',
      payload: {},
    });

    // Zod schema.parse throws ZodError which the route catches and returns 400
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password',
      payload: { email: 'not-valid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns generic 200 even when service throws (security: no enumeration)', async () => {
    await app.ready();
    mockRequestPasswordReset.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password',
      payload: { email: 'alice@example.com' },
    });

    // Route catches service errors and returns generic success to prevent enumeration
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /reset-password
// ---------------------------------------------------------------------------

describe('POST /reset-password', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  const validPayload = {
    token:           'reset-token-abc',
    newPassword:     'NewP@ss1234',
    confirmPassword: 'NewP@ss1234',
  };

  it('returns 200 on successful password reset', async () => {
    await app.ready();
    mockCompletePasswordReset.mockResolvedValue({
      success: true,
      message: 'Password has been reset successfully.',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/reset successfully/i);
  });

  it('returns 400 when service indicates invalid/expired token', async () => {
    await app.ready();
    mockCompletePasswordReset.mockResolvedValue({
      success: false,
      error:   'Invalid or expired reset token',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when passwords do not match (zod refine)', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: {
        token:           'reset-token-abc',
        newPassword:     'NewP@ss1234',
        confirmPassword: 'DifferentP@ss',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when token is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: { newPassword: 'NewP@ss1234', confirmPassword: 'NewP@ss1234' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: {
        token:           'tok',
        newPassword:     'short',
        confirmPassword: 'short',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('passes optional twoFactorCode to service', async () => {
    await app.ready();
    mockCompletePasswordReset.mockResolvedValue({ success: true, message: 'ok' });

    await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: { ...validPayload, twoFactorCode: '123456' },
    });

    expect(mockCompletePasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      twoFactorCode: '123456',
    }));
  });

  it('returns 400 when twoFactorCode is malformed (not 6 digits)', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: { ...validPayload, twoFactorCode: 'abc' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockCompletePasswordReset.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/reset-password',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /reset-password/verify-token
// ---------------------------------------------------------------------------

describe('GET /reset-password/verify-token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns valid=true for a valid, unexpired token without 2FA', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(makeResetToken());

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=valid-plain-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.requires2FA).toBe(false);
    expect(body.expiresAt).toBeDefined();
  });

  it('returns valid=true and requires2FA=true when user has 2FA enabled', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(makeResetToken({
      user: { id: USER_ID, twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
    }));

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=valid-2fa-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.requires2FA).toBe(true);
  });

  it('returns valid=false when token not found in DB', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=unknown-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.requires2FA).toBe(false);
  });

  it('returns valid=false when token is expired', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(makeResetToken({
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
    }));

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=expired-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
  });

  it('returns valid=false when token was already used', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(makeResetToken({
      usedAt: new Date(),
    }));

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=used-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
  });

  it('returns valid=false when token is revoked', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockResolvedValue(makeResetToken({
      isRevoked: true,
    }));

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=revoked-token',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
  });

  it('returns 400 when token query param is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token',
    });

    // Fastify validates the querystring schema (required: ['token']) before reaching
    // the handler, so it returns a Fastify-default 400 error format.
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockPasswordResetToken.findUnique.mockRejectedValue(new Error('DB connection failed'));

    const res = await app.inject({
      method: 'GET',
      url:    '/reset-password/verify-token?token=any-token',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.error).toBe('Error verifying token');
  });
});

// ---------------------------------------------------------------------------
// POST /forgot-password/phone/lookup
// ---------------------------------------------------------------------------

describe('POST /forgot-password/phone/lookup', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with tokenId and masked user info on success', async () => {
    await app.ready();
    mockLookupByPhone.mockResolvedValue({
      success: true,
      tokenId: 'tok-id-abc',
      maskedUserInfo: {
        displayName: 'Alice Smith',
        username:    'a******e',
        email:       'al....e@e*****.com',
        hasAvatar:   false,
      },
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.tokenId).toBe('tok-id-abc');
    expect(body.maskedUserInfo.displayName).toBe('Alice Smith');
  });

  it('forwards service result when phone not found', async () => {
    await app.ready();
    mockLookupByPhone.mockResolvedValue({
      success: false,
      error:   'No account found',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33699999999' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when phoneNumber is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: {},
    });

    // Fastify validates required body fields before the handler runs
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when phoneNumber is too short', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: { phoneNumber: '12' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts optional countryCode', async () => {
    await app.ready();
    mockLookupByPhone.mockResolvedValue({ success: true, tokenId: 'tok-id' });

    await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678', countryCode: 'FR' },
    });

    expect(mockLookupByPhone).toHaveBeenCalledWith(expect.objectContaining({
      countryCode: 'FR',
    }));
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockLookupByPhone.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /forgot-password/phone/verify-identity
// ---------------------------------------------------------------------------

describe('POST /forgot-password/phone/verify-identity', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  const validPayload = {
    tokenId:      'tok-id-abc',
    fullUsername:  'alice',
    fullEmail:     'alice@example.com',
  };

  it('returns 200 and codeSent=true on successful identity verification', async () => {
    await app.ready();
    mockVerifyIdentity.mockResolvedValue({
      success:           true,
      codeSent:          true,
      attemptsRemaining: 2,
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-identity',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.codeSent).toBe(true);
  });

  it('forwards service error when identity does not match', async () => {
    await app.ready();
    mockVerifyIdentity.mockResolvedValue({
      success:           false,
      codeSent:          false,
      attemptsRemaining: 2,
      error:             'Identity verification failed',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-identity',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.attemptsRemaining).toBe(2);
  });

  it('returns 400 when tokenId is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-identity',
      payload: { fullUsername: 'alice', fullEmail: 'alice@example.com' },
    });

    // Fastify validates required body fields before the handler runs
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when fullEmail is not a valid email', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-identity',
      payload: { tokenId: 'tok', fullUsername: 'alice', fullEmail: 'not-email' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockVerifyIdentity.mockRejectedValue(new Error('Redis error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-identity',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /forgot-password/phone/verify-code
// ---------------------------------------------------------------------------

describe('POST /forgot-password/phone/verify-code', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  const validPayload = { tokenId: 'tok-id-abc', code: '123456' };

  it('returns 200 with resetToken on valid code', async () => {
    await app.ready();
    mockVerifyCode.mockResolvedValue({
      success:    true,
      resetToken: 'pwd-reset-token-xyz',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.resetToken).toBe('pwd-reset-token-xyz');
  });

  it('forwards service error when code is wrong', async () => {
    await app.ready();
    mockVerifyCode.mockResolvedValue({
      success: false,
      error:   'Invalid or expired code',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when code is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: { tokenId: 'tok-id-abc' },
    });

    // Fastify validates required body fields before the handler runs
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is not 6 digits', async () => {
    await app.ready();

    // The Fastify body schema has pattern: '^[0-9]{6}$', so AJV rejects 'abc12'
    // before the handler and Zod are reached.
    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: { tokenId: 'tok-id-abc', code: 'abc12' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when tokenId is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: { code: '123456' },
    });

    // Fastify validates required body fields before the handler runs
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockVerifyCode.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/verify-code',
      payload: validPayload,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /forgot-password/phone/resend
// ---------------------------------------------------------------------------

describe('POST /forgot-password/phone/resend', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful resend', async () => {
    await app.ready();
    mockResendCode.mockResolvedValue({ success: true });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/resend',
      payload: { tokenId: 'tok-id-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockResendCode).toHaveBeenCalledWith('tok-id-abc', expect.any(String));
  });

  it('forwards service error when resend fails', async () => {
    await app.ready();
    mockResendCode.mockResolvedValue({
      success: false,
      error:   'Code already expired',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/resend',
      payload: { tokenId: 'tok-id-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when tokenId is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/resend',
      payload: {},
    });

    // Fastify validates required body fields before the handler runs
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockResendCode.mockRejectedValue(new Error('SMS gateway error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/forgot-password/phone/resend',
      payload: { tokenId: 'tok-id-abc' },
    });

    expect(res.statusCode).toBe(500);
  });
});
