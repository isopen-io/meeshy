/**
 * Extended unit tests for contact-change routes.
 * Covers branches missing from contact-change.test.ts:
 * - verify-email-change: invalid token, expired, email taken, success
 * - verify-phone-change: no pending, invalid code, expired, phone taken, success
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

jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailChangeVerification: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/SmsService', () => ({
  smsService: { sendVerificationCode: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { verifyEmailChange, verifyPhoneChange } from '../../../../routes/users/contact-change';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
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

  await verifyEmailChange(app);
  await verifyPhoneChange(app);
  await app.ready();
  return { app, prisma };
}

// ─── verify-email-change — invalid token ──────────────────────────────────────

describe('POST /users/me/verify-email-change — invalid token', () => {
  it('returns 400 when token does not match', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingEmail: 'new@test.com',
      pendingEmailVerificationToken: 'hashed-correct-token',
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600000),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'wrong-token' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-email-change — expired token ─────────────────────────────────────

describe('POST /users/me/verify-email-change — expired token', () => {
  it('returns 400 when token has expired', async () => {
    const prisma = makePrisma();
    const hashedToken = require('crypto').createHash('sha256').update('mytoken').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingEmail: 'new@test.com',
      pendingEmailVerificationToken: hashedToken,
      pendingEmailVerificationExpiry: new Date('2020-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'mytoken' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-email-change — email taken since ──────────────────────────────────

describe('POST /users/me/verify-email-change — email now taken', () => {
  it('returns 400 when pending email is now taken by another user', async () => {
    const prisma = makePrisma();
    const hashedToken = require('crypto').createHash('sha256').update('mytoken').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingEmail: 'taken@test.com',
      pendingEmailVerificationToken: hashedToken,
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600000),
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: 'other-user' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'mytoken' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-email-change — success ───────────────────────────────────────────

describe('POST /users/me/verify-email-change — success', () => {
  it('returns 200 and activates email change', async () => {
    const prisma = makePrisma();
    const hashedToken = require('crypto').createHash('sha256').update('mytoken').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, email: 'old@test.com', pendingEmail: 'new@test.com',
      pendingEmailVerificationToken: hashedToken,
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600000),
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'mytoken' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.newEmail).toBe('new@test.com');
    await app.close();
  });
});

// ─── verify-phone-change — no pending phone ───────────────────────────────────

describe('POST /users/me/verify-phone-change — no pending phone', () => {
  it('returns 400 when no pending phone change exists', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingPhoneNumber: null, pendingPhoneVerificationCode: null,
      pendingPhoneVerificationExpiry: null,
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-phone-change — invalid code ──────────────────────────────────────

describe('POST /users/me/verify-phone-change — invalid code', () => {
  it('returns 400 when code does not match', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingPhoneNumber: '+33612345678',
      pendingPhoneVerificationCode: 'hashed-correct',
      pendingPhoneVerificationExpiry: new Date(Date.now() + 3600000),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '999999' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-phone-change — expired code ──────────────────────────────────────

describe('POST /users/me/verify-phone-change — expired code', () => {
  it('returns 400 when code has expired', async () => {
    const prisma = makePrisma();
    const hashedCode = require('crypto').createHash('sha256').update('123456').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingPhoneNumber: '+33612345678',
      pendingPhoneVerificationCode: hashedCode,
      pendingPhoneVerificationExpiry: new Date('2020-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-phone-change — phone now taken ────────────────────────────────────

describe('POST /users/me/verify-phone-change — phone now taken', () => {
  it('returns 400 when phone is now taken by another user', async () => {
    const prisma = makePrisma();
    const hashedCode = require('crypto').createHash('sha256').update('123456').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, pendingPhoneNumber: '+33612345678',
      pendingPhoneVerificationCode: hashedCode,
      pendingPhoneVerificationExpiry: new Date(Date.now() + 3600000),
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: 'other-user' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── verify-phone-change — success ───────────────────────────────────────────

describe('POST /users/me/verify-phone-change — success', () => {
  it('returns 200 and activates phone change', async () => {
    const prisma = makePrisma();
    const hashedCode = require('crypto').createHash('sha256').update('123456').digest('hex');
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, phoneNumber: '+33600000000', pendingPhoneNumber: '+33612345678',
      pendingPhoneVerificationCode: hashedCode,
      pendingPhoneVerificationExpiry: new Date(Date.now() + 3600000),
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.newPhoneNumber).toBe('+33612345678');
    await app.close();
  });
});

// ─── #4184 witness (b) — un jeton valide pour A n'autorise PAS un changement vers B ──
//
// `pendingEmail`/`pendingEmailVerificationToken` (et leurs jumeaux téléphone)
// sont posés ENSEMBLE, dans le MÊME `update` Prisma, à chaque
// (ré)initiation (`initiateEmailChange`, `resendEmailChangeVerification`) —
// il n'existe donc, à tout instant, qu'UNE SEULE cible pending par compte. Un
// jeton émis pour l'adresse A cesse d'être valide dès que le compte
// réinitie vers B : la ligne courante ne porte plus le hash de A, et la
// comparaison à temps constant du handler échoue. Ces témoins le prouvent en
// simulant exactement ce scénario — jeton A en poche, ligne DB déjà passée à
// B — et vérifient que ni `email`/`phoneNumber` n'est écrit avec la valeur A,
// ni `update` n'est appelé DU TOUT : un attaquant qui a intercepté le premier
// e-mail/SMS ne peut pas s'en servir après que la cible légitime a changé
// d'avis.
describe('POST /users/me/verify-email-change — a token minted for address A does not authorize the change once pending moved to B (#4184)', () => {
  it('rejects tokenA when the current pending row already points at B with a different token', async () => {
    const crypto = require('crypto');
    const tokenA = 'token-for-address-a';
    const tokenB = 'token-for-address-b';
    const hashB = crypto.createHash('sha256').update(tokenB).digest('hex');

    const prisma = makePrisma();
    const update = prisma.user.update as jest.Mock<any>;
    // La ligne COURANTE ne connaît plus A : `initiateEmailChange` a déjà
    // réécrit `pendingEmail`/`pendingEmailVerificationToken` en une seule
    // opération atomique lors de la réinitiation vers B.
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, email: 'old@test.com', pendingEmail: 'b@legit.com',
      pendingEmailVerificationToken: hashB,
      pendingEmailVerificationExpiry: new Date(Date.now() + 3600000),
    });

    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-email-change', payload: { token: tokenA } });

    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /users/me/verify-phone-change — a code minted for number A does not authorize the change once pending moved to B (#4184)', () => {
  it('rejects codeA when the current pending row already points at B with a different code', async () => {
    const crypto = require('crypto');
    const codeA = '111111';
    const codeB = '222222';
    const hashB = crypto.createHash('sha256').update(codeB).digest('hex');

    const prisma = makePrisma();
    const update = prisma.user.update as jest.Mock<any>;
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: USER_ID, phoneNumber: '+33600000000', pendingPhoneNumber: '+33699999999',
      pendingPhoneVerificationCode: hashB,
      pendingPhoneVerificationExpiry: new Date(Date.now() + 3600000),
    });

    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: codeA } });

    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
});
