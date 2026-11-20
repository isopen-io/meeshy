import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { isFallCatalogLoaded, loadFallCatalog, translateFall, type FallCatalog } from './i18n-fall-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA CHUTE DÉTECTÉE (#18748) — le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, FallCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadFallCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadFallCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof FallCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadFallCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['fall.announce.detected', 'fall.detail.at', 'fall.share.title', 'fall.me.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateFall', () => {
  test('interpole le nom et l’heure, dans la langue demandée', async () => {
    await loadFallCatalog('en');
    expect(isFallCatalogLoaded('en')).toBe(true);
    expect(translateFall('en', 'fall.announce.detected', { name: 'Ada' })).toBe('A fall was detected on Ada’s watch');
    expect(translateFall('en', 'fall.detail.at', { time: '16:42' })).toBe('Fall detected at 16:42');
  });
});
