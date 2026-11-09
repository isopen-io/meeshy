import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadOnboardingProfileCatalog, translateOnboardingProfile, type OnboardingProfileCatalog } from './i18n-onboarding-profile-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE « MONTRE-TOI » (#17237) — même discipline que le
 * catalogue des invitations : le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, OnboardingProfileCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadOnboardingProfileCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('les sept langues du produit', () => {
    expect(sorted(SUPPORTED_INTERFACE_LANGUAGES)).toEqual(sorted(['fr', 'en', 'es', 'pt', 'de', 'it', 'ar']));
  });

  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadOnboardingProfileCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof OnboardingProfileCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadOnboardingProfileCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['onboarding.profile.title', 'onboarding.profile.body'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateOnboardingProfile', () => {
  test('lit le texte dans la langue demandée une fois chargé', async () => {
    await loadOnboardingProfileCatalog('en');
    expect(translateOnboardingProfile('en', 'onboarding.profile.pickAvatar')).toBe('Choose a profile photo');
  });
});
