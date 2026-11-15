/**
 * #8959 — confirmer un changement de coordonnée par le code reçu crédite
 * `profile.email_verified` ou `profile.phone_verified`, sur la surface unifiée
 * comme sur les anciennes adresses ; un code faux ne crédite rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../services/SmsService', () => ({ smsService: { sendVerificationCode: jest.fn() } }));
jest.mock('../../../../services/notifications/contact-joined', () => ({ scheduleContactJoinedAnnouncement: jest.fn() }));

const memoire = new Map<string, string>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: async (k: string) => memoire.get(k) ?? null,
    set: async (k: string, v: string) => { memoire.set(k, v); },
    del: async (k: string) => { memoire.delete(k); },
  })),
}));

const creditContactProof = jest.fn();
jest.mock('../../../../services/auth/contact-proof-engagement', () => ({
  creditContactProof: (...args: unknown[]) => creditContactProof(...args),
}));

import { verifyContactChange } from '../../../../routes/users/contact-changes';
import { verifyEmailChange, verifyPhoneChange } from '../../../../routes/users/contact-change';

const USER_ID = '507f1f77bcf86cd799439011';
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const EN_ATTENTE = {
  id: USER_ID,
  email: 'old@test.com',
  phoneNumber: '+33600000000',
  role: 'USER',
  systemLanguage: 'fr',
  pendingEmail: 'new@test.com',
  pendingEmailVerificationToken: sha256('bon-jeton'),
  pendingEmailVerificationExpiry: new Date(Date.now() + 60_000),
  pendingPhoneNumber: '+33611223344',
  pendingPhoneVerificationCode: sha256('123456'),
  pendingPhoneVerificationExpiry: new Date(Date.now() + 60_000),
};

async function confirmer(url: string, payload: Record<string, string>) {
  creditContactProof.mockClear();
  memoire.clear();
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(EN_ATTENTE),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue(EN_ATTENTE),
    },
    passwordResetToken: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
  prisma.$transaction = jest.fn<any>((cb: (tx: unknown) => unknown) => cb(prisma));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await verifyContactChange(app);
  await verifyEmailChange(app);
  await verifyPhoneChange(app);
  await app.ready();
  const res = await app.inject({ method: 'POST', url, payload });
  await app.close();
  return res.statusCode;
}

const credits = () => creditContactProof.mock.calls.map((call) => [(call as unknown[])[1], (call as unknown[])[2]]);

describe('#8959 — une coordonnée confirmée par son code crédite le compte', () => {
  it('surface unifiée — e-mail', async () => {
    expect(await confirmer('/users/me/contact-changes/email/verify', { code: 'bon-jeton' })).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'profile.email_verified']]);
  });

  it('surface unifiée — téléphone', async () => {
    expect(await confirmer('/users/me/contact-changes/phone/verify', { code: '123456' })).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'profile.phone_verified']]);
  });

  it('ancienne adresse — e-mail', async () => {
    expect(await confirmer('/users/me/verify-email-change', { token: 'bon-jeton' })).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'profile.email_verified']]);
  });

  it('ancienne adresse — téléphone', async () => {
    expect(await confirmer('/users/me/verify-phone-change', { code: '123456' })).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'profile.phone_verified']]);
  });

  it('un code faux ne crédite rien', async () => {
    expect(await confirmer('/users/me/contact-changes/phone/verify', { code: '000000' })).toBe(400);
    expect(creditContactProof).not.toHaveBeenCalled();
    expect(await confirmer('/users/me/contact-changes/email/verify', { code: 'mauvais' })).toBe(400);
    expect(creditContactProof).not.toHaveBeenCalled();
  });
});
