import { describe, expect, test } from 'bun:test';

import { ApiError } from '@/lib/api/client';

import { failureMayRetry, profileFailureOf } from './failure';

const apiError = (status: number): ApiError => new ApiError({ ok: false, status, error: 'refus' });

describe('profileFailureOf', () => {
  test('403 ET 404 rendent LA MÊME nature — rien ne doit laisser déduire l’existence du compte', () => {
    expect(profileFailureOf(apiError(404), true)).toBe('refused');
    expect(profileFailureOf(apiError(403), true)).toBe('refused');
    expect(profileFailureOf(apiError(403), true)).toBe(profileFailureOf(apiError(404), true));
  });

  test('429 est AUTRE CHOSE — un débit n’est pas une absence', () => {
    expect(profileFailureOf(apiError(429), true)).toBe('throttled');
    expect(profileFailureOf(apiError(429), true)).not.toBe(profileFailureOf(apiError(404), true));
  });

  test('hors ligne, une panne est HORS LIGNE — jamais une erreur de serveur', () => {
    expect(profileFailureOf(new TypeError('fetch failed'), false)).toBe('offline');
    expect(profileFailureOf(new TypeError('fetch failed'), true)).toBe('error');
  });

  test('un REFUS reste un refus hors ligne : le serveur s’est prononcé', () => {
    expect(profileFailureOf(apiError(404), false)).toBe('refused');
  });

  test('un 500 est une erreur, pas un refus', () => {
    expect(profileFailureOf(apiError(500), true)).toBe('error');
  });
});

describe('failureMayRetry', () => {
  test('« Réessayer » n’est offert que là où le geste peut aboutir', () => {
    expect(failureMayRetry('throttled')).toBe(true);
    expect(failureMayRetry('error')).toBe(true);
    expect(failureMayRetry('refused')).toBe(false);
    expect(failureMayRetry('offline')).toBe(false);
  });
});
