import { describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '../api/http';
import {
  placeLoginFailure,
  placeMagicLinkValidationFailure,
  placeSignupFailure,
  resolveForgotPasswordOutcome,
  type ForgotPasswordData,
  type PhoneConflict,
} from './auth-feedback';

/**
 * LE PLACEMENT D'UN REFUS (#5555, T5/T6) — miroir de la table
 * `SignupViewModel.field(forServerName:)` / `field(forCode:)`
 * (`apps/ios/Meeshy/Features/Auth/Signup/SignupViewModel.swift:222-240`) et
 * de ses copies de refus (réseau, conflit de numéro).
 */

function failure(overrides: Partial<ApiFailure> = {}): ApiFailure {
  return { ok: false, status: 400, error: 'Données invalides', ...overrides };
}

describe('placeSignupFailure — le champ vise directement une saisie', () => {
  test('field:"email" ⇒ sous e-mail', () => {
    const result = placeSignupFailure(failure({ status: 409, code: 'EMAIL_TAKEN', field: 'email' }));
    expect(result.fieldErrors.email).toBeDefined();
    expect(result.bannerError).toBeNull();
  });

  test('field:"username" (nom SERVEUR) ⇒ sous NOM AFFICHÉ (table iOS)', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'VALIDATION_ERROR', field: 'username' }));
    expect(result.fieldErrors.displayName).toBeDefined();
    expect(result.fieldErrors.email).toBeUndefined();
  });

  test('field:"phoneCountryCode" ⇒ sous téléphone (même saisie que phoneNumber)', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'VALIDATION_ERROR', field: 'phoneCountryCode' }));
    expect(result.fieldErrors.phoneNumber).toBeDefined();
  });
});

describe('placeSignupFailure — le CODE vise un champ quand la charge n’en nomme aucun', () => {
  test('EMAIL_TAKEN sans field ⇒ e-mail + showSignIn', () => {
    const result = placeSignupFailure(failure({ status: 409, code: 'EMAIL_TAKEN' }));
    expect(result.fieldErrors.email).toBeDefined();
    expect(result.showSignIn).toBe(true);
  });

  test('USERNAME_TAKEN sans field ⇒ nom affiché', () => {
    const result = placeSignupFailure(failure({ status: 409, code: 'USERNAME_TAKEN' }));
    expect(result.fieldErrors.displayName).toBeDefined();
  });

  test('PHONE_INVALID sans field ⇒ téléphone', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'PHONE_INVALID' }));
    expect(result.fieldErrors.phoneNumber).toBeDefined();
  });
});

describe('placeSignupFailure — code inconnu ⇒ bandeau générique + code adjoint, JAMAIS le texte serveur brut (#5325)', () => {
  test('code inconnu, sans field', () => {
    const result = placeSignupFailure(failure({ status: 500, code: 'SOMETHING_WEIRD', error: 'body must have required property x' }));
    expect(Object.keys(result.fieldErrors)).toHaveLength(0);
    expect(result.bannerError).not.toBeNull();
    expect(result.bannerError).not.toContain('body must have required property');
    expect(result.bannerError).toContain('SOMETHING_WEIRD');
  });

  test('sans code du tout ⇒ le STATUT HTTP sert de repère', () => {
    const result = placeSignupFailure(failure({ status: 500, error: 'Internal Server Error' }));
    expect(result.bannerError).toContain('500');
    expect(result.bannerError).not.toContain('Internal Server Error');
  });
});

describe('placeSignupFailure — hors ligne', () => {
  test('status:0 ⇒ bandeau hors-ligne, jamais un champ', () => {
    const result = placeSignupFailure(failure({ status: 0, error: 'Failed to fetch' }));
    expect(Object.keys(result.fieldErrors)).toHaveLength(0);
    expect(result.bannerError).not.toBeNull();
    expect(result.bannerError).not.toContain('Failed to fetch');
  });
});

describe('placeSignupFailure — conflit de numéro (register.ts:301-331)', () => {
  test('⇒ message SOUS téléphone, jamais le bandeau', () => {
    const conflict: PhoneConflict = { kind: 'phone-conflict' };
    const result = placeSignupFailure(conflict);
    expect(result.fieldErrors.phoneNumber).toBeDefined();
    expect(result.bannerError).toBeNull();
  });
});

describe('placeLoginFailure — quatre textes DISTINCTS, jamais vides', () => {
  const invalid = placeLoginFailure(failure({ status: 401, code: 'INVALID_CREDENTIALS', error: 'Identifiants invalides' }));
  const locked = placeLoginFailure(failure({ status: 423, code: 'USER_LOCKED', error: 'User Locked Error' }));
  const throttled = placeLoginFailure(failure({ status: 429, error: 'RATE_LIMIT_EXCEEDED' }));
  const offline = placeLoginFailure(failure({ status: 0, error: 'Failed to fetch' }));

  test('aucun message n’est vide', () => {
    for (const m of [invalid.message, locked.message, throttled.message, offline.message]) {
      expect(m.length).toBeGreaterThan(0);
    }
  });

  test('les quatre messages sont DISTINCTS', () => {
    const set = new Set([invalid.message, locked.message, throttled.message, offline.message]);
    expect(set.size).toBe(4);
  });

  test('aucun ne reproduit le texte technique brut du serveur', () => {
    expect(locked.message).not.toContain('User Locked Error');
    expect(throttled.message).not.toContain('RATE_LIMIT_EXCEEDED');
  });
});

/**
 * MOT DE PASSE OUBLIÉ (#5816, T5) — `POST /auth/forgot-password` rend 200
 * TOUJOURS (anti-énumération, § 3.3 de la spécification). Aucun 404 n'existe
 * sur cette route ; ce témoin garde que si un jour un tel refus arrivait
 * (proxy, version), le client servirait quand même l'écran « e-mail envoyé »
 * — jamais un texte qui révèle l'absence du compte.
 */
describe('resolveForgotPasswordOutcome — 200 ET 404 rendent la MÊME issue', () => {
  test('200 avec data:undefined (forme nominale du serveur) ⇒ sent', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: true, data: undefined, status: 200 };
    expect(resolveForgotPasswordOutcome(result)).toEqual({ kind: 'sent' });
  });

  test('404 ⇒ sent — le client ne révèle jamais l’absence du compte', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: false, status: 404, error: 'Not Found' };
    expect(resolveForgotPasswordOutcome(result)).toEqual({ kind: 'sent' });
  });

  test('400 ⇒ invalid-email', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: false, status: 400, error: 'Invalid request data' };
    expect(resolveForgotPasswordOutcome(result)).toEqual({ kind: 'invalid-email' });
  });

  test('429 ⇒ bandeau « Trop de demandes… »', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: false, status: 429, error: 'RATE_LIMIT_EXCEEDED' };
    const outcome = resolveForgotPasswordOutcome(result);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') expect(outcome.message).toContain('Trop de demandes');
  });

  test('status 0 ⇒ hors-ligne', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: false, status: 0, error: 'Failed to fetch' };
    expect(resolveForgotPasswordOutcome(result)).toEqual({ kind: 'offline' });
  });

  test('500 ⇒ bandeau générique + code, jamais `error` brut', () => {
    const result: ApiResult<ForgotPasswordData> = { ok: false, status: 500, error: 'Server error' };
    const outcome = resolveForgotPasswordOutcome(result);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.message).not.toBe('Server error');
      expect(outcome.message).toContain('500');
    }
  });
});

describe('placeMagicLinkValidationFailure — un seul texte pour les cinq phrases serveur', () => {
  test('400 (lien invalide, déjà utilisé, expiré ou révoqué) ⇒ « Lien invalide ou expiré »', () => {
    for (const error of [
      'This link is invalid.',
      'This link has already been used.',
      'This link has expired. Please request a new one.',
      'This link has been revoked.',
    ]) {
      const result = placeMagicLinkValidationFailure(failure({ status: 400, error }));
      expect(result.message).toBe('Lien invalide ou expiré');
    }
  });

  test('status 0 ⇒ hors-ligne', () => {
    const result = placeMagicLinkValidationFailure(failure({ status: 0, error: 'Failed to fetch' }));
    expect(result.message).toContain('connexion');
  });

  test('autre statut ⇒ générique + code, jamais `error` brut', () => {
    const result = placeMagicLinkValidationFailure(failure({ status: 500, error: 'Server error' }));
    expect(result.message).not.toBe('Server error');
    expect(result.message).toContain('500');
  });
});
