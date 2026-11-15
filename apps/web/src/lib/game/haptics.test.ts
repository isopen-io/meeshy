import { describe, expect, test } from 'bun:test';

import { HAPTIC_PATTERNS, prefersReducedMotion, vibrate } from './haptics';

/**
 * L’HAPTIQUE ET LA RÉDUCTION DES ANIMATIONS (#9381). `navigator.vibrate`
 * n’existe pas partout (Safari, bureau) : son absence n’est jamais une erreur.
 */
describe('HAPTIC_PATTERNS — des motifs courts, nommés par ce qu’ils accompagnent', () => {
  test('chaque motif est une suite de durées positives, sous 120 ms au total', () => {
    for (const [name, pattern] of Object.entries(HAPTIC_PATTERNS)) {
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.every((ms) => ms > 0)).toBe(true);
      expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(120);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('le choc de la frappe est plus net que la tape légère', () => {
    expect(HAPTIC_PATTERNS.shock[0]).toBeGreaterThan(HAPTIC_PATTERNS.tapLight[0] ?? 0);
  });
});

describe('vibrate', () => {
  test('appelle navigator.vibrate avec le motif', () => {
    const calls: (readonly number[])[] = [];
    const ok = vibrate('tap', { vibrate: (pattern) => (calls.push(pattern as readonly number[]), true) });
    expect(ok).toBe(true);
    expect(calls).toEqual([HAPTIC_PATTERNS.tap]);
  });

  test('sans navigator.vibrate : faux, sans erreur', () => {
    expect(vibrate('tap', {})).toBe(false);
  });

  test('un moteur qui lève (permission, page en arrière-plan) ne casse jamais le geste', () => {
    expect(
      vibrate('tap', {
        vibrate: () => {
          throw new Error('NotAllowedError');
        },
      }),
    ).toBe(false);
  });
});

describe('prefersReducedMotion', () => {
  test('lit la requête média', () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  test('sans matchMedia : on n’invente pas de réduction', () => {
    expect(prefersReducedMotion({})).toBe(false);
  });

  test('la requête interrogée est celle de la réduction', () => {
    const asked: string[] = [];
    prefersReducedMotion({ matchMedia: (query) => (asked.push(query), { matches: false }) });
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
  });
});
