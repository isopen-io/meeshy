import { describe, expect, test } from 'bun:test';

import { loadProfileDecorCatalog, translateProfileDecor, type ProfileDecorCatalog } from './i18n-profile-decor-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ProfileDecorCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadProfileDecorCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue du décor de profil', () => {
  test('chaque langue porte les clés du français, et rien d’autre', async () => {
    const french = sorted(Object.keys(await loadProfileDecorCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
    }
  });

  test('chaque valeur est un texte non vide et, hors français, traduite', async () => {
    const french = await loadProfileDecorCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        if (language !== 'fr' && key !== 'profileDecor.photo' && key !== 'profileDecor.banner.entry') {
          expect({ language, key, copied: value === french[key as keyof ProfileDecorCatalog] }).toEqual({ language, key, copied: false });
        }
      }
    }
  });

  test('lit une clé dans la langue chargée', async () => {
    await loadProfileDecorCatalog('en');
    expect(translateProfileDecor('en', 'profileDecor.shop')).toBe('More in the shop');
  });
});
