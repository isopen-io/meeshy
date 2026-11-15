import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { isBatteryCatalogLoaded, loadBatteryCatalog, translateBattery, type BatteryCatalog } from './i18n-battery-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA BATTERIE DES PROCHES (#14147) — le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, BatteryCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadBatteryCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadBatteryCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof BatteryCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadBatteryCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['battery.webNote', 'battery.announce.probablyOff', 'battery.pull.action'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateBattery', () => {
  test('interpole le nom et le niveau, dans la langue demandée', async () => {
    await loadBatteryCatalog('en');
    expect(isBatteryCatalogLoaded('en')).toBe(true);
    expect(translateBattery('en', 'battery.announce.critical', { name: 'Ada', level: '4' })).toBe('Ada: critical battery (4%)');
  });
});
