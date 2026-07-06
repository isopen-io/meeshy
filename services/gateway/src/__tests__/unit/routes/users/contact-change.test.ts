/**
 * Unit tests for user contact-change routes (contact-change.ts)
 * Tests POST /users/me/change-email, verify-email-change, resend-email-change-verification,
 * change-phone, verify-phone-change.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: jest.fn((email: string) => email.toLowerCase()),
  normalizePhoneNumber: jest.fn((phone: string) => `+33${phone.replace(/\D/g, '').slice(-9)}`),
}));

const mockSendEmailChangeVerification = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailChangeVerification: mockSendEmailChangeVerification,
  })),
}));

const mockSendVerificationCode = jest.fn<any>().mockResolvedValue({ success: true, provider: 'test' });
jest.mock('../../../../services/SmsService', () => ({
  smsService: {
    sendVerificationCode: (...args: any[]) => mockSendVerificationCode(...args),
  },
}));

const mockCacheGet = jest.fn<any>().mockResolvedValue(null);
const mockCacheSet = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: (...args: any[]) => mockCacheGet(...args),
    set: (...args: any[]) => mockCacheSet(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange,
} from '../../../../routes/users/contact-change';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst:  jest.fn<any>().mockResolvedValue(null),
      update:     jest.fn<any>().mockResolvedValue({}),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await initiateEmailChange(app);
  await verifyEmailChange(app);
  await resendEmailChangeVerification(app);
  await initiatePhoneChange(app);
  await verifyPhoneChange(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /users/me/change-email ───────────────────────────────────────────────

describe('POST /users/me/change-email — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'new@test.com' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/change-email — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'new@test.com' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /users/me/change-email — same email', () => {
  it('returns 400 when new email matches current email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, email: 'current@test.com', firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'current@test.com' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/change-email — email conflict', () => {
  it('returns 400 when new email is taken by another user', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, email: 'old@test.com', firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: 'other-user' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'taken@test.com' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/change-email — success', () => {
  it('returns 200 and sends verification email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, email: 'old@test.com', firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'new@test.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── POST /users/me/verify-email-change ───────────────────────────────────────

describe('POST /users/me/verify-email-change — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'some-token' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/verify-email-change — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'some-token' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /users/me/verify-email-change — no pending email', () => {
  it('returns 400 when no pending email change exists', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, pendingEmail: null, pendingEmailVerificationToken: null, pendingEmailVerificationExpiry: null });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'some-token' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /users/me/resend-email-change-verification ──────────────────────────

describe('POST /users/me/resend-email-change-verification — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/resend-email-change-verification — no pending email', () => {
  it('returns 400 when no pending email exists', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, pendingEmail: null, pendingEmailVerificationExpiry: null, firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/resend-email-change-verification — rate limited', () => {
  it('returns 429 when resend was called less than 60s ago', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, pendingEmail: 'pending@test.com', pendingEmailVerificationExpiry: new Date(Date.now() + 3600000), firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    mockCacheGet.mockResolvedValueOnce(Date.now().toString()); // sent just now
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(429);
    await app.close();
  });
});

describe('POST /users/me/resend-email-change-verification — success', () => {
  it('returns 200 and resends verification email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, pendingEmail: 'pending@test.com', pendingEmailVerificationExpiry: new Date(Date.now() + 3600000), firstName: 'Alice', lastName: 'Smith', displayName: null, systemLanguage: 'en' });
    mockCacheGet.mockResolvedValueOnce(null); // no rate limit
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /users/me/change-phone ──────────────────────────────────────────────

describe('POST /users/me/change-phone — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-phone', payload: { newPhoneNumber: '0612345678' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/change-phone — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/change-phone', payload: { newPhoneNumber: '0612345678' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /users/me/change-phone — success', () => {
  it('returns 200 and sends SMS code', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, phoneNumber: '+33600000000' });
    mockSendVerificationCode.mockResolvedValueOnce({ success: true, provider: 'test' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-phone', payload: { newPhoneNumber: '0612345678' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /users/me/change-phone — SMS failure', () => {
  it('returns 500 when SMS sending fails', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: USER_ID, phoneNumber: null });
    mockSendVerificationCode.mockResolvedValueOnce({ success: false, error: 'SMS failed' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/change-phone', payload: { newPhoneNumber: '0612345678' } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /users/me/verify-phone-change ───────────────────────────────────────

describe('POST /users/me/verify-phone-change — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/verify-phone-change — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
