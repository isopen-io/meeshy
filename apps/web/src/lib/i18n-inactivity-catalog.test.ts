import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { isInactivityCatalogLoaded, loadInactivityCatalog, translateInactivity, type InactivityCatalog } from './i18n-inactivity-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA VÉRIFICATION D’INACTIVITÉ (#18738) — le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, InactivityCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadInactivityCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadInactivityCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof InactivityCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadInactivityCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['inactivity.announce.alert', 'inactivity.detail.since', 'inactivity.share.title', 'inactivity.global.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateInactivity', () => {
  test('interpole le nom et l’heure, dans la langue demandée', async () => {
    await loadInactivityCatalog('en');
    expect(isInactivityCatalogLoaded('en')).toBe(true);
    expect(translateInactivity('en', 'inactivity.announce.alert', { name: 'Ada' })).toBe('Ada didn’t answer “Are you OK?”');
    expect(translateInactivity('en', 'inactivity.detail.since', { time: '08:00' })).toBe('No activity since 08:00');
  });
});
