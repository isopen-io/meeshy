/**
 * `POST /forgot-password` répond la MÊME chose quel que soit le compte (#6642).
 *
 * #6642 ouvre un chemin de plus derrière cette porte : un compte sans mot de
 * passe dont l'adresse n'est pas vérifiée REÇOIT désormais son lien. Ce qui
 * change derrière ne doit pas se lire devant.
 *
 * `password-reset.test.ts` ne peut pas le voir : il double le service, donc la
 * réponse qu'il observe est celle que le double décide. Ici le VRAI
 * `PasswordResetService` tourne derrière la VRAIE route et le vrai sérialiseur
 * (schémas partagés non doublés) ; seuls la base, le cache, le courriel et la
 * géolocalisation le sont. Le témoin compare les réponses OCTET POUR OCTET, et
 * vérifie à côté que les quatre états empruntent bien des chemins différents —
 * sans quoi l'égalité serait celle d'une porte qui ne fait rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

const mockSendPasswordResetEmail = jest.fn(async (_data: Record<string, unknown>) => ({ success: true }));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async () => null,
    set: async () => undefined,
    setnx: async () => true,
    del: async () => undefined
  })
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendPasswordResetEmail: (data: Record<string, unknown>) => mockSendPasswordResetEmail(data)
  }))
}));

jest.mock('../../../services/SmsService', () => ({
  SmsService: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({ lookup: async () => null }))
}));

jest.mock('../../../utils/rate-limiter.js', () => {
  const laisserPasser = () => ({ middleware: () => async () => undefined });
  return {
    createPasswordResetRateLimiter: laisserPasser,
    createPasswordResetDailyRateLimiter: laisserPasser,
    createAuthGlobalRateLimiter: laisserPasser,
    createPhoneResetLookupRateLimiter: laisserPasser,
    createPhoneResetIdentityRateLimiter: laisserPasser,
    createPhoneResetCodeRateLimiter: laisserPasser,
    createPhoneResetResendRateLimiter: laisserPasser
  };
});

import { passwordResetRoutes } from '../../../routes/password-reset';

type Compte = Record<string, unknown> | null;

const compte = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  id: '64b000000000000000000042',
  email: 'awa@example.com',
  emailVerifiedAt: null,
  password: null,
  lockedUntil: null,
  passwordResetAttempts: 0,
  lastPasswordResetAttempt: null,
  firstName: 'Awa',
  lastName: 'Diallo',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...overrides
});

const ETATS: ReadonlyArray<{ nom: string; compte: Compte; recoitUnLien: boolean }> = [
  { nom: 'aucun compte', compte: null, recoitUnLien: false },
  { nom: 'mot de passe, adresse non vérifiée', compte: compte({ password: '$2b$12$hash' }), recoitUnLien: false },
  { nom: 'sans mot de passe, adresse non vérifiée', compte: compte({}), recoitUnLien: true },
  {
    nom: 'mot de passe, adresse vérifiée',
    compte: compte({ password: '$2b$12$hash', emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z') }),
    recoitUnLien: true
  }
];

const makePrisma = (account: Compte) => ({
  user: {
    findFirst: async () => account,
    findUnique: async () => ({ lockedUntil: null }),
    update: async () => ({})
  },
  passwordResetToken: {
    updateMany: async () => ({ count: 0 }),
    count: async () => 0,
    create: async () => ({ id: 'reset-1' })
  },
  securityEvent: { create: async () => ({}) }
});

const repondre = async (account: Compte) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(account));
  app.decorate('redis', null);
  await passwordResetRoutes(app);
  await app.ready();

  const envoisAvant = mockSendPasswordResetEmail.mock.calls.length;
  const res = await app.inject({
    method: 'POST',
    url: '/forgot-password',
    payload: { email: 'awa@example.com' }
  });
  const lienEnvoye = mockSendPasswordResetEmail.mock.calls.length > envoisAvant;
  await app.close();

  return { statusCode: res.statusCode, body: res.body, lienEnvoye };
};

describe('POST /forgot-password — aucune énumération (#6642)', () => {
  it('répond octet pour octet la même chose dans les quatre états du compte, qui empruntent pourtant des chemins différents', async () => {
    const reponses: Array<Awaited<ReturnType<typeof repondre>>> = [];
    for (const etat of ETATS) {
      reponses.push(await repondre(etat.compte));
    }

    const [reference] = reponses;
    expect(reference.statusCode).toBe(200);
    expect(JSON.parse(reference.body)).toEqual(
      expect.objectContaining({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      })
    );
    expect(reponses.map(({ statusCode, body }) => ({ statusCode, body }))).toEqual(
      ETATS.map(() => ({ statusCode: reference.statusCode, body: reference.body }))
    );
    expect(reponses.map(({ lienEnvoye }) => lienEnvoye)).toEqual(ETATS.map(({ recoitUnLien }) => recoitUnLien));
  });
});
