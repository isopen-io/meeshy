/**
 * Unit tests for the unified contact-change surface (#4341):
 *   POST   /users/me/contact-changes
 *   POST   /users/me/contact-changes/:channel/verify
 *   POST   /users/me/contact-changes/:channel/resend
 *   GET    /users/me/contact-changes
 *
 * Witnesses assert on the EFFECT (Prisma calls, dispatched email/SMS), never
 * on statusCode alone — a route can answer 200 without writing anything.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

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

const mockBcryptCompare = jest.fn<any>().mockResolvedValue(true);
jest.mock('bcryptjs', () => ({
  default: { compare: (...args: any[]) => mockBcryptCompare(...args) },
  compare: (...args: any[]) => mockBcryptCompare(...args),
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

/**
 * Un cache STATEFUL : sans état, un compteur (essais SMS, plafond par valeur
 * cible) ne peut pas être observé sur plusieurs appels — patron repris tel
 * quel de `contact-change-attempt-throttle.test.ts`.
 */
const memoire = new Map<string, string>();
let cacheIndisponible = false;
const mockCacheGet = jest.fn(async (k: string) => {
  if (cacheIndisponible) throw new Error('cache indisponible');
  return memoire.get(k) ?? null;
});
const mockCacheSet = jest.fn(async (k: string, v: string) => {
  if (cacheIndisponible) throw new Error('cache indisponible');
  memoire.set(k, v);
});
const mockCacheDel = jest.fn(async (k: string) => { memoire.delete(k); });
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: (...args: any[]) => (mockCacheGet as any)(...args),
    set: (...args: any[]) => (mockCacheSet as any)(...args),
    del: (...args: any[]) => (mockCacheDel as any)(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  initiateContactChange,
  verifyContactChange,
  resendContactChangeVerification,
  getContactChangeStatus,
} from '../../../../routes/users/contact-changes';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const BASE_USER = {
  id: USER_ID,
  email: 'current@test.com',
  phoneNumber: '+33600000000',
  password: 'hashed-password',
  firstName: 'Jane',
  lastName: 'Doe',
  displayName: 'Jane Doe',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  role: 'USER',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(BASE_USER),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue(BASE_USER),
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
  app.decorate('authenticate', async (req: any) => {
    req.authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await initiateContactChange(app);
  await verifyContactChange(app);
  await resendContactChangeVerification(app);
  await getContactChangeStatus(app);
  await app.ready();
  return { app, prisma };
}

beforeEach(() => {
  memoire.clear();
  cacheIndisponible = false;
  mockCacheGet.mockClear();
  mockCacheSet.mockClear();
  mockCacheDel.mockClear();
  mockBcryptCompare.mockReset().mockResolvedValue(true);
  mockSendEmailChangeVerification.mockReset().mockResolvedValue(undefined);
  mockSendVerificationCode.mockReset().mockResolvedValue({ success: true, provider: 'test' });
});

// ─── POST /users/me/contact-changes ────────────────────────────────────────────

describe('POST /users/me/contact-changes — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'new@test.com', currentPassword: 'x' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/me/contact-changes — le mot de passe courant est EXIGÉ (#4341, point 1)', () => {
  it('rejects with 400 when the current password is wrong, and writes NOTHING', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'new@test.com', currentPassword: 'wrong' },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects with 400 when currentPassword is missing from the body — the same comparison as PATCH /users/me/password, reused not reinvented', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'new@test.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/contact-changes — channel: email, success', () => {
  it('persists the pending email and dispatches the verification email — asserted on the EFFECT', async () => {
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'NEW@Test.com', currentPassword: 'right' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.channel).toBe('email');
    expect(body.data.pendingValue).toBe('new@test.com');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID },
      data: expect.objectContaining({ pendingEmail: 'new@test.com' }),
    }));
    expect(mockSendEmailChangeVerification).toHaveBeenCalledTimes(1);
    expect(mockSendEmailChangeVerification.mock.calls[0][0]).toMatchObject({ to: 'new@test.com' });
    await app.close();
  });

  it('rejects when the new email is already in use', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(BASE_USER),
        findFirst: jest.fn<any>().mockResolvedValue({ id: 'other-user' }),
        update: jest.fn<any>().mockResolvedValue(BASE_USER),
      },
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'taken@test.com', currentPassword: 'right' },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /users/me/contact-changes — channel: phone, success', () => {
  it('persists the pending phone and dispatches the SMS — asserted on the EFFECT', async () => {
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'phone', value: '0611223344', currentPassword: 'right' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.channel).toBe('phone');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID },
      data: expect.objectContaining({ pendingPhoneNumber: expect.any(String) }),
    }));
    expect(mockSendVerificationCode).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('POST /users/me/contact-changes — plafond par VALEUR CIBLE (#4341, point 2)', () => {
  it('allows exactly 5 requests toward the same target value, then refuses the 6th with 429', async () => {
    const { app, prisma } = await buildApp();

    for (let i = 0; i < 5; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/users/me/contact-changes',
        payload: { channel: 'email', value: 'harcele@test.com', currentPassword: 'right' },
      });
      expect(ok.statusCode).toBe(200);
    }

    const sixth = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'harcele@test.com', currentPassword: 'right' },
    });
    expect(sixth.statusCode).toBe(429);
    // Les 5 premières ont bien écrit ; la 6e n'écrit RIEN de plus.
    expect(prisma.user.update).toHaveBeenCalledTimes(5);
    expect(mockSendEmailChangeVerification).toHaveBeenCalledTimes(5);
    await app.close();
  });

  it('does not count a DIFFERENT target value against the same cap', async () => {
    const { app } = await buildApp();
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/users/me/contact-changes',
        payload: { channel: 'email', value: 'valeur-a@test.com', currentPassword: 'right' },
      });
    }
    const autreValeur = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'valeur-b@test.com', currentPassword: 'right' },
    });
    expect(autreValeur.statusCode).toBe(200);
    await app.close();
  });

  it('fails CLOSED when the cache is unavailable — a broken guardian is not the absence of a guard', async () => {
    cacheIndisponible = true;
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes',
      payload: { channel: 'email', value: 'panne@test.com', currentPassword: 'right' },
    });
    expect(res.statusCode).toBe(429);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── POST /users/me/contact-changes/:channel/verify ────────────────────────────

describe('POST /users/me/contact-changes/email/verify', () => {
  it('activates the email change and returns the UPDATED PROFILE (#4341, point 3)', async () => {
    const pendingUser = {
      ...BASE_USER,
      pendingEmail: 'new@test.com',
      pendingEmailVerificationToken: require('crypto').createHash('sha256').update('good-token').digest('hex'),
      pendingEmailVerificationExpiry: new Date(Date.now() + 60_000),
    };
    const updated = { ...BASE_USER, email: 'new@test.com', pendingEmail: null };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(pendingUser),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(updated),
      },
    });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes/email/verify',
      payload: { code: 'good-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Le profil à jour est SERVI — plus besoin d'un round-trip GET /users/me.
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBe('new@test.com');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new@test.com', pendingEmail: null }),
    }));
    await app.close();
  });

  it('returns 400 when there is no pending email change', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes/email/verify',
      payload: { code: 'whatever' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/me/contact-changes/phone/verify', () => {
  it('activates the phone change and returns the updated profile', async () => {
    const pendingUser = {
      ...BASE_USER,
      pendingPhoneNumber: '+33611223344',
      pendingPhoneVerificationCode: require('crypto').createHash('sha256').update('123456').digest('hex'),
      pendingPhoneVerificationExpiry: new Date(Date.now() + 60_000),
    };
    const updated = { ...BASE_USER, phoneNumber: '+33611223344', pendingPhoneNumber: null };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(pendingUser),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(updated),
      },
    });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contact-changes/phone/verify',
      payload: { code: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.user.phoneNumber).toBe('+33611223344');
    await app.close();
  });

  it('cancels the pending request after 5 failed attempts — shares the essais counter with the legacy route (#4184 c.4)', async () => {
    const pendingUser = {
      ...BASE_USER,
      pendingPhoneNumber: '+33611223344',
      pendingPhoneVerificationCode: require('crypto').createHash('sha256').update('123456').digest('hex'),
      pendingPhoneVerificationExpiry: new Date(Date.now() + 60_000),
    };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(pendingUser),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(pendingUser),
      },
    });
    const { app } = await buildApp({ prisma });

    let lastRes;
    for (let i = 0; i < 5; i += 1) {
      lastRes = await app.inject({
        method: 'POST',
        url: '/users/me/contact-changes/phone/verify',
        payload: { code: 'wrong-code' },
      });
    }

    expect(lastRes!.statusCode).toBe(429);
    // Le verdict s'écrit LÀ OÙ IL DURE : la demande en attente est effacée.
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pendingPhoneNumber: null }),
    }));
    await app.close();
  });
});

// ─── POST /users/me/contact-changes/:channel/resend ────────────────────────────

describe('POST /users/me/contact-changes/email/resend', () => {
  it('mints a new token and dispatches a new email', async () => {
    const pendingUser = { ...BASE_USER, pendingEmail: 'new@test.com' };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(pendingUser),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(pendingUser),
      },
    });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({ method: 'POST', url: '/users/me/contact-changes/email/resend' });

    expect(res.statusCode).toBe(200);
    expect(mockSendEmailChangeVerification).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('fails CLOSED on a cache read error (#4184 c.5)', async () => {
    cacheIndisponible = true;
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/contact-changes/email/resend' });
    expect(res.statusCode).toBe(429);
    await app.close();
  });
});

describe('POST /users/me/contact-changes/phone/resend — le pendant SMS qui manquait (#4341, point 4)', () => {
  it('mints a fresh SMS code without resetting the essais counter — a resend gives a fresh SMS, not a fresh guess budget', async () => {
    const pendingUser = { ...BASE_USER, pendingPhoneNumber: '+33611223344' };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(pendingUser),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(pendingUser),
      },
    });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({ method: 'POST', url: '/users/me/contact-changes/phone/resend' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.channel).toBe('phone');
    expect(mockSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pendingPhoneVerificationCode: expect.any(String),
        pendingPhoneVerificationExpiry: expect.any(Date),
      }),
    }));
    // La fonction du compteur d'essais (`del` sur sa clé) n'est jamais appelée
    // par un renvoi — seule une vérification RÉUSSIE ou l'épuisement l'invoque.
    expect(mockCacheDel).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 when there is no pending phone change', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/me/contact-changes/phone/resend' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── GET /users/me/contact-changes ─────────────────────────────────────────────

describe('GET /users/me/contact-changes — dit un changement en attente SANS relire le profil (#4341, point 5)', () => {
  it('returns pending:true with the pending value when a change is in flight', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          pendingEmail: 'new@test.com',
          pendingEmailVerificationExpiry: expiresAt,
          pendingPhoneNumber: null,
          pendingPhoneVerificationExpiry: null,
        }),
        findFirst: jest.fn<any>(),
        update: jest.fn<any>(),
      },
    });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({ method: 'GET', url: '/users/me/contact-changes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.email).toEqual({ pending: true, value: 'new@test.com', expiresAt: expiresAt.toISOString() });
    expect(body.data.phone).toEqual({ pending: false, value: null, expiresAt: null });
    await app.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/me/contact-changes' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
