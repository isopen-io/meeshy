import { describe, expect, test } from 'bun:test';

import { COUNTRIES, countryOf } from './countries';

/**
 * LA TABLE GÉNÉRÉE (#5555, T9) — dérivée de `CountryPicker.swift` (`dialCodes`,
 * `priority`) par `scripts/generate-countries.mjs`. Aucun nom recopié à la
 * main : le NOM est dérivé à l'exécution par le consommateur
 * (`Intl.DisplayNames`), seuls l'ISO, l'indicatif et le drapeau voyagent ici.
 */

describe('COUNTRIES — la table générée depuis CountryPicker.swift', () => {
  test('porte au moins 240 entrées', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
  });

  test('chaque entrée a un ISO2 et un indicatif commençant par "+"', () => {
    for (const country of COUNTRIES) {
      expect(country.id).toMatch(/^[A-Z]{2}$/);
      expect(country.dialCode.startsWith('+')).toBe(true);
      expect(typeof country.flag).toBe('string');
      expect(country.flag.length).toBeGreaterThan(0);
    }
  });

  test('la France est en tête (priorité CountryPicker.countries[0])', () => {
    expect(COUNTRIES[0]!.id).toBe('FR');
    expect(COUNTRIES[0]!.dialCode).toBe('+33');
  });
});

describe('countryOf — lecture par ISO2', () => {
  test('FR → +33', () => {
    expect(countryOf('FR')?.dialCode).toBe('+33');
  });

  test('code inconnu ⇒ undefined', () => {
    expect(countryOf('ZZ')).toBeUndefined();
  });
});
