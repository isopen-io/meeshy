/**
 * UN CHANGEMENT D'E-MAIL NE POSE PAS UNE ADRESSE QUI NE DÉSIGNE PERSONNE (#16491).
 *
 * Les deux portes d'initiation (`POST /users/me/contact-changes` et l'ancienne
 * `POST /users/me/change-email`) refusent une adresse réservée ou jetable avant
 * toute écriture et tout envoi ; les deux portes de vérification refusent
 * d'activer une adresse en attente qui l'est (posée avant la garde).
 *
 * L'échappatoire d'environnement est coupée ici (double du module qui la lit).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import crypto from 'crypto';

jest.mock('../../../../services/auth/email-domain-escape', () => ({ RESERVED_EMAIL_DOMAINS_ALLOWED: false }));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: jest.fn(async () => true),
}));

const mockSendEmailChangeVerification = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({ sendEmailChangeVerification: mockSendEmailChangeVerification })),
}));
jest.mock('../../../../services/SmsService', () => ({ smsService: { sendVerificationCode: jest.fn() } }));

const memoire = new Map<string, string>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: async (k: string) => memoire.get(k) ?? null,
    set: async (k: string, v: string) => { memoire.set(k, v); },
    del: async (k: string) => { memoire.delete(k); },
  })),
}));

import { initiateContactChange, verifyContactChange } from '../../../../routes/users/contact-changes';
import { initiateEmailChange, verifyEmailChange } from '../../../../routes/users/contact-change';

const USER_ID = '507f1f77bcf86cd799439011';
const JETON = 'jeton-de-verification';
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const utilisateur = (extra: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'actuelle@gmail.com',
  phoneNumber: null,
  password: 'hash',
  firstName: 'Jane',
  lastName: 'Doe',
  displayName: 'Jane Doe',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  pendingEmail: null,
  pendingEmailVerificationToken: null,
  pendingEmailVerificationExpiry: null,
  ...extra,
});

const construire = async (ligne = utilisateur()) => {
  const prisma: any = {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(ligne),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue(ligne),
    },
    passwordResetToken: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn<any>((cb: any) => cb(prisma)),
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await initiateContactChange(app);
  await verifyContactChange(app);
  await initiateEmailChange(app);
  await verifyEmailChange(app);
  await app.ready();
  return { app, prisma };
};

beforeEach(() => {
  memoire.clear();
  mockSendEmailChangeVerification.mockClear();
});

const initiations = [
  { nom: 'POST /users/me/contact-changes', url: '/users/me/contact-changes', corps: (v: string) => ({ channel: 'email', value: v, currentPassword: 'x' }) },
  { nom: 'POST /users/me/change-email (ancienne)', url: '/users/me/change-email', corps: (v: string) => ({ newEmail: v }) },
];

describe.each(initiations)('$nom', ({ url, corps }) => {
  it.each(['nouvelle@example.com', 'nouvelle@mailinator.com', 'a@x.yopmail.com'])(
    '%s : 400 EMAIL_DOMAIN_NOT_ALLOWED, rien écrit, rien envoyé',
    async (adresse) => {
      const { app, prisma } = await construire();
      const res = await app.inject({ method: 'POST', url, payload: corps(adresse) });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mockSendEmailChangeVerification).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it('une adresse réelle part en vérification', async () => {
    const { app, prisma } = await construire();
    const res = await app.inject({ method: 'POST', url, payload: corps('nouvelle@exampleshop.com') });

    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pendingEmail: 'nouvelle@exampleshop.com' }) }),
    );
    expect(mockSendEmailChangeVerification).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

const verifications = [
  { nom: 'POST /users/me/contact-changes/email/verify', url: '/users/me/contact-changes/email/verify', corps: { code: JETON } },
  { nom: 'POST /users/me/verify-email-change (ancienne)', url: '/users/me/verify-email-change', corps: { token: JETON } },
];

describe.each(verifications)('$nom', ({ url, corps }) => {
  it("refuse d'activer une adresse en attente réservée, sans rien écrire", async () => {
    const { app, prisma } = await construire(
      utilisateur({
        pendingEmail: 'nouvelle@example.org',
        pendingEmailVerificationToken: sha256(JETON),
        pendingEmailVerificationExpiry: new Date(Date.now() + 3_600_000),
      }),
    );
    const res = await app.inject({ method: 'POST', url, payload: corps });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await app.close();
  });
});
