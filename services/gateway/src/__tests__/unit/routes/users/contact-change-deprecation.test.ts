/**
 * Les CINQ anciennes adresses de changement de contact annoncent leur sursis
 * (#4341, critère 12 du corps de l'issue).
 *
 * `alias-deprecation-guard.test.ts` et `security/deprecated-alias-headers-guard.test.ts`
 * gardent la SOURCE (le mécanisme est bien appelé) sur d'autres territoires ;
 * ce fichier garde le COMPORTEMENT sur LE MIEN — une requête HTTP réelle,
 * via `app.inject()`, prouve que les en-têtes sortent RÉELLEMENT sur le fil.
 *
 * Sans `Sunset`, à dessein : la règle de retrait suit le compteur d'adoption
 * de #4275 (déjà branché sur ces cinq adresses, `route-usage.service.ts`),
 * jamais une date posée à la main.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: (e: string) => e.toLowerCase(),
  normalizePhoneNumber: (p: string) => `+33${p.replace(/\D/g, '').slice(-9)}`,
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({ sendEmailChangeVerification: jest.fn<any>().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../services/SmsService', () => ({
  smsService: { sendVerificationCode: jest.fn<any>().mockResolvedValue({ success: true, provider: 'test' }) },
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
  }),
}));

import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange,
} from '../../../../routes/users/contact-change';

const USER_ID = '507f1f77bcf86cd799439011';

function prismaSansRien() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null), // 404 sur chaque route — seuls les EN-TÊTES nous intéressent
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaSansRien());
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await initiateEmailChange(app);
  await verifyEmailChange(app);
  await resendEmailChangeVerification(app);
  await initiatePhoneChange(app);
  await verifyPhoneChange(app);
  await app.ready();
  return app;
}

type Cas = { readonly label: string; readonly method: 'POST'; readonly url: string; readonly payload?: object; readonly successeur: string };

const CAS: readonly Cas[] = [
  { label: 'POST /users/me/change-email', method: 'POST', url: '/users/me/change-email', payload: { newEmail: 'x@test.com' }, successeur: '</api/v1/users/me/contact-changes>; rel="successor-version"' },
  { label: 'POST /users/me/change-phone', method: 'POST', url: '/users/me/change-phone', payload: { newPhoneNumber: '0611223344' }, successeur: '</api/v1/users/me/contact-changes>; rel="successor-version"' },
  { label: 'POST /users/me/verify-email-change', method: 'POST', url: '/users/me/verify-email-change', payload: { token: 'abc' }, successeur: '</api/v1/users/me/contact-changes/email/verify>; rel="successor-version"' },
  { label: 'POST /users/me/verify-phone-change', method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '123456' }, successeur: '</api/v1/users/me/contact-changes/phone/verify>; rel="successor-version"' },
  { label: 'POST /users/me/resend-email-change-verification', method: 'POST', url: '/users/me/resend-email-change-verification', successeur: '</api/v1/users/me/contact-changes/email/resend>; rel="successor-version"' },
];

describe('#4341 — les cinq anciennes adresses servent Deprecation + Link, SANS Sunset', () => {
  it.each(CAS.map((c) => [c.label, c] as const))('%s porte les en-têtes RFC 8594/9745 attendus', async (_label, cas) => {
    const app = await buildApp();
    const res = await app.inject({ method: cas.method, url: cas.url, payload: cas.payload ?? {} });

    // La route répond (404, faute d'utilisateur) — l'annonce sort quel que
    // soit le verdict, exactement comme sur les 401/403/429 des autres alias
    // du dépôt (`deprecation.ts`, § « pourquoi un hook onRequest »).
    expect(res.statusCode).toBe(404);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(cas.successeur);
    expect(res.headers['sunset']).toBeUndefined();

    await app.close();
  });
});
