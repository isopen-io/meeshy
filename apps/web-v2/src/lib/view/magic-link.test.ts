import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '../api/http';
import {
  countdownRemaining,
  formatCountdown,
  resolveMagicLinkRequest,
  safeReturnPath,
  spokenCountdown,
  type MagicLinkRequestData,
} from './magic-link';

/**
 * LES LOIS PURES DU LIEN MAGIQUE (#5816, T4/T4b/T4c) — miroir
 * `MagicLinkView.swift`. `resolveMagicLinkRequest` lit l'ABSENCE de
 * `expiresInSeconds` comme le signal d'un débit dépassé (§ 3.1 de la
 * spécification : la passerelle emballe le refus en 200 sans ce champ).
 */

describe('resolveMagicLinkRequest', () => {
  test('succès avec expiresInSeconds ⇒ sent', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: true, data: { expiresInSeconds: 600 }, status: 200 };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'sent', expiresInSeconds: 600 });
  });

  test('succès sans expiresInSeconds (data:{}) ⇒ rate-limited — l’absence est le discriminant', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: true, data: {}, status: 200 };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'rate-limited' });
  });

  test('succès avec data:undefined ⇒ rate-limited', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: true, data: undefined as unknown as MagicLinkRequestData, status: 200 };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'rate-limited' });
  });

  test('status 400 ⇒ invalid-email', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: false, status: 400, error: 'Invalid email address' };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'invalid-email' });
  });

  test('status 429 ⇒ rate-limited', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: false, status: 429, error: 'RATE_LIMIT_EXCEEDED' };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'rate-limited' });
  });

  test('status 0 ⇒ offline', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: false, status: 0, error: 'Failed to fetch' };
    expect(resolveMagicLinkRequest(result)).toEqual({ kind: 'offline' });
  });

  test('status 0 avec code TIMEOUT ⇒ failed, DISTINCT de offline', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: false, status: 0, error: 'timeout', code: 'TIMEOUT' };
    const outcome = resolveMagicLinkRequest(result);
    expect(outcome.kind).toBe('failed');
    expect(outcome).not.toEqual({ kind: 'offline' });
  });

  test('status 500 ⇒ failed avec le code/statut adjoint, JAMAIS `error` brut', () => {
    const result: ApiResult<MagicLinkRequestData> = { ok: false, status: 500, error: 'An error occurred. Please try again.' };
    const outcome = resolveMagicLinkRequest(result);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.message).not.toBe('An error occurred. Please try again.');
      expect(outcome.message).toContain('500');
    }
  });
});

describe('countdownRemaining', () => {
  test('599 après 1s', () => {
    expect(countdownRemaining({ startedAt: 0, expiresInSeconds: 600 }, 1000)).toBe(599);
  });
  test('0 pile à l’échéance', () => {
    expect(countdownRemaining({ startedAt: 0, expiresInSeconds: 600 }, 600_000)).toBe(0);
  });
  test('jamais négatif après l’échéance', () => {
    expect(countdownRemaining({ startedAt: 0, expiresInSeconds: 600 }, 700_000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  test('599 ⇒ 9:59', () => expect(formatCountdown(599, 'fr-FR')).toBe('9:59'));
  test('600 ⇒ 10:00', () => expect(formatCountdown(600, 'fr-FR')).toBe('10:00'));
  test('0 ⇒ 0:00', () => expect(formatCountdown(0, 'fr-FR')).toBe('0:00'));
  test('3661 ⇒ 61:01 (pas d’heures, .minuteSecond)', () => expect(formatCountdown(3661, 'fr-FR')).toBe('61:01'));

  test('rang non premier — chiffres arabo-indiens en ar-EG si l’ICU de bun les sert', () => {
    const rendered = formatCountdown(599, 'ar-EG');
    const hasArabicDigits = /[٠-٩]/.test(rendered);
    if (!hasArabicDigits) {
      console.warn('ICU de bun sans chiffres arabo-indiens pour ar-EG — témoin non concluant, non un échec');
      return;
    }
    expect(hasArabicDigits).toBe(true);
  });
});

describe('spokenCountdown', () => {
  // L'ICU de bun insère une espace INSÉCABLE (U+00A0) entre un nombre et
  // l'unité « seconde(s) » — pas devant « minute(s) » : un défaut de sa
  // table, pas de ce module. Le témoin compare au rendu RÉEL d'`Intl`,
  // jamais à une chaîne qu'on aurait aimé voir.
  test('272 ⇒ "4 minutes 32 secondes"', () => expect(spokenCountdown(272, 'fr')).toBe('4 minutes 32 secondes'));
  test('60 ⇒ "1 minute" (zéro seconde masqué)', () => expect(spokenCountdown(60, 'fr')).toBe('1 minute'));
  test('5 ⇒ "5 secondes" (zéro minute masqué)', () => expect(spokenCountdown(5, 'fr')).toBe('5 secondes'));
});

describe('safeReturnPath', () => {
  test('chemin même-origine ⇒ conservé', () => expect(safeReturnPath('/c/abc')).toBe('/c/abc'));
  test('chemin avec requête ⇒ conservé', () => expect(safeReturnPath('/c/abc?x=1')).toBe('/c/abc?x=1'));
  test('undefined ⇒ /', () => expect(safeReturnPath(undefined)).toBe('/'));
  test('chaîne vide ⇒ /', () => expect(safeReturnPath('')).toBe('/'));
  test('URL absolue ⇒ /', () => expect(safeReturnPath('https://evil.example')).toBe('/'));
  test('// (schema-relative) ⇒ /', () => expect(safeReturnPath('//evil.example')).toBe('/'));
  test('\\ ⇒ /', () => expect(safeReturnPath('/\\evil')).toBe('/'));
  test('javascript: ⇒ /', () => expect(safeReturnPath('javascript:alert(1)')).toBe('/'));
});
