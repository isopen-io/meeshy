/**
 * Le contrat de `POST /auth/verify-email` et de la branche « vérification
 * requise » de `POST /auth/login` (#8033).
 *
 * Deux couches valident le corps : Ajv (`verifyEmailRequestSchema`, appliqué
 * par Fastify) puis Zod (`AuthSchemas.verifyEmail`, dans le handler). Elles
 * doivent rendre le même verdict sur le seul champ nouveau : `password`, admis
 * UNIQUEMENT avec le code.
 */

import { describe, it, expect } from 'vitest';
import { AuthSchemas } from '../utils/validation.js';
import {
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  loginVerificationRequiredProperties,
  verificationRequiredProperties,
} from '../types/api-schemas.js';

const EMAIL = 'nouvelle@example.com';

describe('AuthSchemas.verifyEmail — password', () => {
  it('accepte un mot de passe accompagné du code', () => {
    const parsed = AuthSchemas.verifyEmail.safeParse({ email: EMAIL, code: '123456', password: 'secret-long' });
    expect(parsed.success).toBe(true);
  });

  it('refuse un mot de passe accompagné du seul lien', () => {
    const parsed = AuthSchemas.verifyEmail.safeParse({ email: EMAIL, token: 'abc', password: 'secret-long' });
    expect(parsed.success).toBe(false);
  });

  it('refuse un mot de passe trop court', () => {
    const parsed = AuthSchemas.verifyEmail.safeParse({ email: EMAIL, code: '123456', password: 'abc' });
    expect(parsed.success).toBe(false);
  });

  it('reste valide sans mot de passe, par code ou par lien', () => {
    expect(AuthSchemas.verifyEmail.safeParse({ email: EMAIL, code: '123456' }).success).toBe(true);
    expect(AuthSchemas.verifyEmail.safeParse({ email: EMAIL, token: 'abc' }).success).toBe(true);
  });
});

describe('verifyEmailRequestSchema (Ajv) — même verdict que Zod', () => {
  const [parLien, parCode] = verifyEmailRequestSchema.oneOf;

  it('déclare password dans la seule branche du code', () => {
    expect(Object.keys(parCode.properties)).toContain('password');
    expect(Object.keys(parLien.properties)).not.toContain('password');
    expect(parLien.additionalProperties).toBe(false);
  });
});

describe('les réponses déclarent ce qu’elles servent', () => {
  it('verify-email déclare la session qu’elle ouvre', () => {
    const data = verifyEmailResponseSchema.properties.data.properties;
    for (const champ of ['verified', 'token', 'sessionToken', 'user', 'session', 'expiresIn', 'requires2FA', 'twoFactorToken']) {
      expect(Object.keys(data)).toContain(champ);
    }
  });

  it('login déclare la branche « vérification requise »', () => {
    expect(Object.keys(loginVerificationRequiredProperties)).toEqual(['status', 'accountCreated', 'email']);
    expect(loginVerificationRequiredProperties.status.enum).toEqual(['verification-required']);
  });

  it('register et login servent la MÊME branche « vérification requise » (#8055)', () => {
    expect(verificationRequiredProperties).toBe(loginVerificationRequiredProperties);
    expect(Object.keys(verificationRequiredProperties)).toEqual(['status', 'accountCreated', 'email']);
  });
});
