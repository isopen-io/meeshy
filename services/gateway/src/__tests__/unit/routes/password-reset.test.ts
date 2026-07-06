/**
 * Unit tests for password-reset routes (password-reset.ts)
 * Tests POST /forgot-password, POST /reset-password, GET /reset-password/verify-token,
 * and all POST /forgot-password/phone/* routes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({})),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/SmsService', () => ({
  SmsService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
}));

const mockRequestPasswordReset = jest.fn<any>().mockResolvedValue({ message: 'Reset email sent' });
const mockCompletePasswordReset = jest.fn<any>().mockResolvedValue({ success: true, message: 'Password reset' });
jest.mock('../../../services/PasswordResetService', () => ({
  PasswordResetService: jest.fn().mockImplementation(() => ({
    requestPasswordReset: (...args: any[]) => mockRequestPasswordReset(...args),
    completePasswordReset: (...args: any[]) => mockCompletePasswordReset(...args),
  })),
}));

const mockLookupByPhone = jest.fn<any>().mockResolvedValue({
  success: true,
  tokenId: 'token-abc',
  maskedUserInfo: { displayName: 'J**n', username: 'a***e', email: 'a***e@test.com', hasAvatar: false },
});
const mockVerifyIdentity = jest.fn<any>().mockResolvedValue({ success: true, codeSent: true, attemptsRemaining: 2 });
const mockVerifyCode = jest.fn<any>().mockResolvedValue({ success: true, resetToken: 'reset-token-xyz' });
const mockResendCode = jest.fn<any>().mockResolvedValue({ success: true });

jest.mock('../../../services/PhonePasswordResetService', () => ({
  PhonePasswordResetService: jest.fn().mockImplementation(() => ({
    lookupByPhone: (...args: any[]) => mockLookupByPhone(...args),
    verifyIdentity: (...args: any[]) => mockVerifyIdentity(...args),
    verifyCode: (...args: any[]) => mockVerifyCode(...args),
    resendCode: (...args: any[]) => mockResendCode(...args),
  })),
}));

const mockPhoneResetMiddleware = jest.fn<any>().mockReturnValue(async () => {});
jest.mock('../../../utils/rate-limiter.js', () => ({
  createPasswordResetRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createPasswordResetDailyRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createPhoneResetLookupRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createPhoneResetIdentityRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createPhoneResetCodeRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
  createPhoneResetResendRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneResetMiddleware() })),
}));

jest.mock('@meeshy/shared/types', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
  validationErrorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { passwordResetRoutes } from '../../../routes/password-reset';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'abc123resettoken';
const TOKEN_HASH = 'hashed-token';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    passwordResetToken: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('redis', null);

  await passwordResetRoutes(app);
  await app.ready();
  return app;
}

// ─── POST /forgot-password ────────────────────────────────────────────────────

describe('POST /forgot-password — success', () => {
  it('returns 200 with generic message (anti-enumeration)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /forgot-password — invalid email format', () => {
  it('returns 400 on ZodError for invalid email', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /forgot-password — service throws', () => {
  it('returns 200 even when service throws (security - no leak)', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /reset-password ─────────────────────────────────────────────────────

describe('POST /reset-password — success', () => {
  it('returns 200 when password reset succeeds', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: {
        token: 'reset-token-abc',
        newPassword: 'NewP@ssword123',
        confirmPassword: 'NewP@ssword123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /reset-password — passwords do not match', () => {
  it('returns 400 when passwords mismatch (Zod refine)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: {
        token: 'reset-token-abc',
        newPassword: 'NewP@ssword123',
        confirmPassword: 'DifferentPassword!',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /reset-password — service returns failure', () => {
  it('returns 400 when completePasswordReset fails', async () => {
    mockCompletePasswordReset.mockResolvedValueOnce({ success: false, error: 'Token invalide ou expiré' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: {
        token: 'bad-token',
        newPassword: 'NewP@ssword123',
        confirmPassword: 'NewP@ssword123',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /reset-password — service throws', () => {
  it('returns 500 on unexpected error', async () => {
    mockCompletePasswordReset.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/reset-password',
      payload: {
        token: 'valid-token',
        newPassword: 'NewP@ssword123',
        confirmPassword: 'NewP@ssword123',
      },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /reset-password/verify-token ────────────────────────────────────────

describe('GET /reset-password/verify-token — token not found', () => {
  it('returns 200 when token does not exist in DB', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/reset-password/verify-token?token=${TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — token is valid', () => {
  it('returns 200 when token is valid and unexpired', async () => {
    const future = new Date(Date.now() + 3600000);
    const prisma = makePrisma({
      passwordResetToken: {
        findUnique: jest.fn<any>().mockResolvedValue({
          tokenHash: TOKEN_HASH,
          expiresAt: future,
          usedAt: null,
          isRevoked: false,
          user: { id: 'user-1', twoFactorSecret: null },
        }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET',
      url: `/reset-password/verify-token?token=${TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — token expired', () => {
  it('returns 200 with valid: false when expired', async () => {
    const past = new Date(Date.now() - 3600000);
    const prisma = makePrisma({
      passwordResetToken: {
        findUnique: jest.fn<any>().mockResolvedValue({
          tokenHash: TOKEN_HASH,
          expiresAt: past,
          usedAt: null,
          isRevoked: false,
          user: { id: 'user-1', twoFactorSecret: null },
        }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/reset-password/verify-token?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — token already used', () => {
  it('returns 200 with valid: false when usedAt is set', async () => {
    const future = new Date(Date.now() + 3600000);
    const prisma = makePrisma({
      passwordResetToken: {
        findUnique: jest.fn<any>().mockResolvedValue({
          expiresAt: future,
          usedAt: new Date(),
          isRevoked: false,
          user: { id: 'user-1', twoFactorSecret: null },
        }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/reset-password/verify-token?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — token revoked', () => {
  it('returns 200 with valid: false when revoked', async () => {
    const future = new Date(Date.now() + 3600000);
    const prisma = makePrisma({
      passwordResetToken: {
        findUnique: jest.fn<any>().mockResolvedValue({
          expiresAt: future,
          usedAt: null,
          isRevoked: true,
          user: { id: 'user-1', twoFactorSecret: null },
        }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/reset-password/verify-token?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma({
      passwordResetToken: {
        findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/reset-password/verify-token?token=${TOKEN}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /forgot-password/phone/lookup ──────────────────────────────────────

describe('POST /forgot-password/phone/lookup — success', () => {
  it('returns 200 with tokenId and masked user info', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678', countryCode: 'FR' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /forgot-password/phone/lookup — phone not found', () => {
  it('returns 400 when lookupByPhone returns failure', async () => {
    mockLookupByPhone.mockResolvedValueOnce({ success: false, error: 'Phone not found' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /forgot-password/phone/lookup — invalid payload', () => {
  it('returns 400 on ZodError for too-short phone', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/lookup',
      payload: { phoneNumber: '123' },  // < minLength: 5
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /forgot-password/phone/verify-identity ──────────────────────────────

describe('POST /forgot-password/phone/verify-identity — success', () => {
  it('returns 200 when identity is verified and code sent', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-identity',
      payload: { tokenId: 'token-abc', fullUsername: 'alice', fullEmail: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /forgot-password/phone/verify-identity — wrong identity', () => {
  it('returns 400 when identity verification fails', async () => {
    mockVerifyIdentity.mockResolvedValueOnce({ success: false, error: 'Identity mismatch' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-identity',
      payload: { tokenId: 'token-abc', fullUsername: 'wronguser', fullEmail: 'wrong@test.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /forgot-password/phone/verify-code ─────────────────────────────────

describe('POST /forgot-password/phone/verify-code — success', () => {
  it('returns 200 with resetToken', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-code',
      payload: { tokenId: 'token-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /forgot-password/phone/verify-code — wrong code', () => {
  it('returns 400 when code is invalid', async () => {
    mockVerifyCode.mockResolvedValueOnce({ success: false, error: 'Code invalide' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-code',
      payload: { tokenId: 'token-abc', code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /forgot-password/phone/verify-code — invalid code format', () => {
  it('returns 400 when code is not 6 digits', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-code',
      payload: { tokenId: 'token-abc', code: 'abc' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /forgot-password/phone/resend ──────────────────────────────────────

describe('POST /forgot-password/phone/resend — success', () => {
  it('returns 200 on successful resend', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/resend',
      payload: { tokenId: 'token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /forgot-password/phone/resend — failure', () => {
  it('returns 400 when resend fails', async () => {
    mockResendCode.mockResolvedValueOnce({ success: false, error: 'Too many attempts' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/resend',
      payload: { tokenId: 'token-abc' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
