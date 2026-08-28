/**
 * Réinitialiser son mot de passe par SMS aboutit (#4139).
 *
 * Les quatre schémas de réponse du parcours déclaraient leurs champs à la
 * RACINE (`{ success, tokenId, maskedUserInfo }`) alors que les handlers
 * répondent par `sendSuccess(reply, data)`, qui produit
 * `{ success, data: { … } }`. `fast-json-stringify` applique
 * `additionalProperties: false` : `data` n'étant pas déclaré, il était
 * SUPPRIMÉ, et les champs déclarés à la racine n'y ont jamais existé.
 *
 * Le parcours était donc coupé de bout en bout :
 *   `phone/lookup`      → perdait `tokenId`     (impossible de continuer)
 *   `phone/verify-code` → perdait `resetToken`  (un code SMS consommé pour rien)
 *   `reset-password/verify-token` → servait littéralement `{}`
 *
 * POURQUOI CES TÉMOINS TRAVERSENT `app.inject()` : le défaut vit ENTIÈREMENT
 * dans la couche de sérialisation. Un témoin qui compare l'objet passé à
 * `sendSuccess` — ou qui mocke les schémas partagés — passe au vert sur la
 * version cassée comme sur la version corrigée. Seule la charge réellement
 * émise par Fastify distingue les deux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), getNativeClient: () => null }),
}));
jest.mock('../../../services/EmailService', () => ({ EmailService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/SmsService', () => ({ SmsService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({ lookup: jest.fn() })),
}));

const TOKEN_ID = 'tok_7f3a91c2';
const RESET_TOKEN = 'rst_c41d8e6b0a';

const mockLookupByPhone = jest.fn<any>().mockResolvedValue({
  success: true,
  tokenId: TOKEN_ID,
  maskedUserInfo: {
    displayName: 'J**n D*e',
    username: 't******5',
    email: 'je....n@f*****om',
    hasAvatar: false,
  },
});
const mockVerifyIdentity = jest.fn<any>().mockResolvedValue({
  success: true,
  codeSent: true,
  attemptsRemaining: 2,
});
const mockVerifyCode = jest.fn<any>().mockResolvedValue({
  success: true,
  resetToken: RESET_TOKEN,
});

jest.mock('../../../services/PhonePasswordResetService', () => ({
  PhonePasswordResetService: jest.fn().mockImplementation(() => ({
    lookupByPhone: (...a: any[]) => mockLookupByPhone(...a),
    verifyIdentity: (...a: any[]) => mockVerifyIdentity(...a),
    verifyCode: (...a: any[]) => mockVerifyCode(...a),
    resendCode: jest.fn<any>().mockResolvedValue({ success: true }),
  })),
}));

jest.mock('../../../services/PasswordResetService', () => ({
  PasswordResetService: jest.fn().mockImplementation(() => ({
    hashToken: () => 'hashed',
    requestPasswordReset: jest.fn<any>().mockResolvedValue({ success: true, message: 'ok' }),
  })),
}));

const passeTout = jest.fn<any>().mockReturnValue(async () => {});
jest.mock('../../../utils/rate-limiter.js', () => ({
  createPasswordResetRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createPasswordResetDailyRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createPhoneResetLookupRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createPhoneResetIdentityRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createPhoneResetCodeRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
  createPhoneResetResendRateLimiter: jest.fn(() => ({ middleware: () => passeTout() })),
}));

// Les schémas partagés ne sont PAS doublés : les doubler désarmerait
// fast-json-stringify, c'est-à-dire exactement la couche que ces témoins
// exercent (cf. `services/gateway/CLAUDE.md`, cycle 91 bis).

import { passwordResetRoutes } from '../../../routes/password-reset';

async function buildApp(prisma: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    passwordResetToken: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    ...prisma,
  } as any);
  app.decorate('redis', null as any);
  await passwordResetRoutes(app);
  await app.ready();
  return app;
}

describe('Parcours de réinitialisation par SMS — ce que le client REÇOIT', () => {
  it('rend le `tokenId` sans lequel l’étape suivante est inatteignable', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/lookup',
      payload: { phoneNumber: '+33612345678', countryCode: 'FR' },
    });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(corps.data?.tokenId ?? corps.tokenId).toBe(TOKEN_ID);
    expect(corps.data?.maskedUserInfo ?? corps.maskedUserInfo).toMatchObject({
      displayName: 'J**n D*e',
    });

    await app.close();
  });

  it('rend le `resetToken` — sans lui, le code SMS est consommé pour rien', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-code',
      payload: { tokenId: TOKEN_ID, code: '123456' },
    });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(corps.data?.resetToken ?? corps.resetToken).toBe(RESET_TOKEN);

    await app.close();
  });

  it('rend l’état de la vérification d’identité, compteur de tentatives compris', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password/phone/verify-identity',
      payload: { tokenId: TOKEN_ID, fullUsername: 'toto2025', fullEmail: 'jean@free.fr' },
    });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(corps.data?.codeSent ?? corps.codeSent).toBe(true);
    expect(corps.data?.attemptsRemaining ?? corps.attemptsRemaining).toBe(2);

    await app.close();
  });

  it('sert la phrase générique de « mot de passe oublié », par le chemin NOMINAL', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/forgot-password',
      payload: { email: 'jean@free.fr' },
    });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    // Le chemin nominal passe par `options.message`, qui atterrit à la RACINE
    // de l'enveloppe ; le chemin d'erreur passe par `data.message`. Les deux
    // doivent survivre à la sérialisation — c'est la seule phrase que
    // l'utilisateur voit après avoir demandé un lien.
    expect(corps.message ?? corps.data?.message).toBeTruthy();

    await app.close();
  });

  it('dit si un jeton de réinitialisation est valide — la réponse n’est pas vide', async () => {
    const app = await buildApp({
      passwordResetToken: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/reset-password/verify-token?token=inexistant',
    });
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    // Un jeton inconnu est INVALIDE — et le client doit pouvoir le lire.
    // La route servait `{}`, où `valid` est indiscernable de `undefined`.
    expect(corps.data?.valid ?? corps.valid).toBe(false);

    await app.close();
  });
});
