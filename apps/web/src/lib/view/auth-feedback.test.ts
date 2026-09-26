import { describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '../api/http';
import {
  placeLoginFailure,
  placeMagicLinkValidationFailure,
  placeSignupFailure,
  resolveForgotPasswordOutcome,
  resolveResetPasswordOutcome,
  resolveResetTokenState,
  resolveVerifyEmailOutcome,
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

  /**
   * LA TABLE A CHANGÉ (#6479). `username` se repliait sur le nom affiché parce
   * qu'aucune saisie ne le portait. L'écran montre et ENVOIE désormais le
   * pseudo : un refus qui le vise doit se poser SOUS lui, sinon le message
   * accuse un champ que l'utilisateur n'a pas touché.
   */
  test('field:"username" ⇒ sous le PSEUDO, qui a maintenant sa saisie', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'VALIDATION_ERROR', field: 'username' }));
    expect(result.fieldErrors.username).toBeDefined();
    expect(result.fieldErrors.displayName).toBeUndefined();
    expect(result.fieldErrors.email).toBeUndefined();
  });

  /**
   * La contrepartie d'ENVOYER le pseudo : une collision est un REFUS, plus un
   * renommage silencieux. Les trois valeurs libres que la passerelle sert avec
   * lui sont ce qui empêche ce refus d'être un mur — et elles doivent traverser
   * jusqu'à l'écran.
   */
  test('USERNAME_TAKEN porte les trois pseudos libres jusqu’à l’écran', () => {
    const result = placeSignupFailure(
      failure({
        status: 409,
        code: 'USERNAME_TAKEN',
        field: 'username',
        suggestions: ['ada-l', 'ada-lovelace2', 'ada1815'],
      }),
    );
    expect(result.fieldErrors.username).toBeDefined();
    expect(result.usernameSuggestions).toEqual(['ada-l', 'ada-lovelace2', 'ada1815']);
  });

  test('tout autre refus ne propose AUCUN pseudo', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'VALIDATION_ERROR', field: 'email' }));
    expect(result.usernameSuggestions).toEqual([]);
  });

  test('field:"phoneCountryCode" ⇒ sous téléphone (même saisie que phoneNumber)', () => {
    const result = placeSignupFailure(failure({ status: 400, code: 'VALIDATION_ERROR', field: 'phoneCountryCode' }));
    expect(result.fieldErrors.phoneNumber).toBeDefined();
  });
});

/**
 * #8082 — un refus de SCHÉMA porte le texte d'Ajv (« body/username must NOT
 * have more than 16 characters ») : anglais, technique. Il se pose sous son
 * champ, mais dans la langue du lecteur.
 */
describe('placeSignupFailure — un refus de schéma sur le pseudo parle au lecteur', () => {
  test('VALIDATION_ERROR sur username ⇒ la règle du pseudo, jamais le texte Ajv', () => {
    const result = placeSignupFailure(
      failure({ status: 400, code: 'VALIDATION_ERROR', field: 'username', error: 'body/username must NOT have more than 16 characters' }),
    );
    expect(result.fieldErrors.username).toBeDefined();
    expect(result.fieldErrors.username).not.toContain('must NOT');
    expect(result.fieldErrors.username).toContain('16');
    expect(result.bannerError).toBeNull();
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

describe('placeSignupFailure — 429, le VRAI délai, jamais le jeton machine (#5912)', () => {
  test('retryAfter:300 ⇒ « 5 minutes », jamais « instant » ni RATE_LIMIT_EXCEEDED', () => {
    const result = placeSignupFailure(failure({ status: 429, code: 'RATE_LIMIT_EXCEEDED', error: 'RATE_LIMIT_EXCEEDED', retryAfter: 300 }));
    expect(result.bannerError).toContain('5 minutes');
    expect(result.bannerError).not.toContain('instant');
    expect(result.bannerError).not.toContain('RATE_LIMIT_EXCEEDED');
    expect(Object.keys(result.fieldErrors)).toHaveLength(0);
  });

  test('retryAfter:45 (moins d’une minute, arrondi au-dessus) ⇒ « une minute »', () => {
    const result = placeSignupFailure(failure({ status: 429, code: 'RATE_LIMIT_EXCEEDED', error: 'RATE_LIMIT_EXCEEDED', retryAfter: 45 }));
    expect(result.bannerError).toContain('une minute');
  });

  test('retryAfter ABSENT ⇒ repli sans délai inventé, toujours pas le jeton machine', () => {
    const result = placeSignupFailure(failure({ status: 429, code: 'RATE_LIMIT_EXCEEDED', error: 'RATE_LIMIT_EXCEEDED' }));
    expect(result.bannerError).not.toContain('RATE_LIMIT_EXCEEDED');
    expect(result.bannerError).not.toContain('instant');
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

describe('resolveVerifyEmailOutcome — code faux ET code expiré rendent le MÊME 400', () => {
  test('succès ⇒ verified', () => {
    expect(resolveVerifyEmailOutcome({ ok: true, data: { message: 'Email vérifié' }, status: 200 })).toEqual({ kind: 'verified' });
  });

  test('un compte déjà vérifié EST un succès (magic-link.ts:349-354), jamais un refus', () => {
    const result = resolveVerifyEmailOutcome({
      ok: true,
      data: { message: 'déjà vérifiée', alreadyVerified: true, verifiedAt: '2026-09-01T00:00:00.000Z' },
      status: 200,
    });
    expect(result).toEqual({ kind: 'verified' });
  });

  test('une réponse qui porte une session ⇒ signed-in (#8034) : l’écran quitte la vérification', () => {
    const result = resolveVerifyEmailOutcome({
      ok: true,
      data: { verified: true, token: 'jwt', sessionToken: 'sess', user: { id: 'u', username: 'ada', displayName: 'Ada' } },
      status: 200,
    });
    expect(result).toEqual({ kind: 'signed-in' });
  });

  test('429 ⇒ rate-limited (#8034 : le code a 6 chiffres, la passerelle limite les essais)', () => {
    expect(resolveVerifyEmailOutcome(failure({ status: 429, error: 'Too many' }))).toEqual({ kind: 'rate-limited' });
  });

  test('400 ⇒ invalid-code, quel que soit le texte serveur', () => {
    for (const error of ['Invalid verification code', 'Verification code has expired']) {
      expect(resolveVerifyEmailOutcome(failure({ status: 400, error }))).toEqual({ kind: 'invalid-code' });
    }
  });

  test('status 0 ⇒ offline', () => {
    expect(resolveVerifyEmailOutcome(failure({ status: 0, error: 'Failed to fetch' }))).toEqual({ kind: 'offline' });
  });

  test('autre statut ⇒ failed, générique + code, jamais `error` brut', () => {
    const result = resolveVerifyEmailOutcome(failure({ status: 500, error: 'Server error' }));
    expect(result.kind).toBe('failed');
    expect((result as { message: string }).message).not.toBe('Server error');
    expect((result as { message: string }).message).toContain('500');
  });
});

describe('resolveResetTokenState — `valid:false` en 200 N’EST PAS un succès HTTP à confondre', () => {
  test('valid:true ⇒ valid', () => {
    expect(resolveResetTokenState({ ok: true, data: { valid: true }, status: 200 })).toBe('valid');
  });

  test('valid:false EN 200 (jeton périmé/consommé) ⇒ invalid — la VALEUR tranche, pas l’enveloppe', () => {
    expect(resolveResetTokenState({ ok: true, data: { valid: false }, status: 200 })).toBe('invalid');
  });

  test('400 ⇒ invalid', () => {
    expect(resolveResetTokenState(failure({ status: 400, error: 'Reset token is required' }))).toBe('invalid');
  });

  test('status 0 ⇒ offline', () => {
    expect(resolveResetTokenState(failure({ status: 0, error: 'Failed to fetch' }))).toBe('offline');
  });
});

describe('resolveResetPasswordOutcome — un reset NE CONNECTE personne', () => {
  test('succès ⇒ reset', () => {
    expect(resolveResetPasswordOutcome({ ok: true, data: { message: 'ok' }, status: 200 })).toEqual({ kind: 'reset' });
  });

  test('400 (jeton invalide/expiré en pratique) ⇒ invalid-token', () => {
    expect(resolveResetPasswordOutcome(failure({ status: 400, error: 'Invalid or expired reset token' }))).toEqual({
      kind: 'invalid-token',
    });
  });

  test('status 0 ⇒ offline', () => {
    expect(resolveResetPasswordOutcome(failure({ status: 0, error: 'Failed to fetch' }))).toEqual({ kind: 'offline' });
  });

  test('autre statut ⇒ failed, générique + code', () => {
    const result = resolveResetPasswordOutcome(failure({ status: 500, error: 'Server error' }));
    expect(result.kind).toBe('failed');
    expect((result as { message: string }).message).not.toBe('Server error');
    expect((result as { message: string }).message).toContain('500');
  });
});
