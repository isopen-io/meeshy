import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { isPhoneReachabilityCatalogLoaded, loadPhoneReachabilityCatalog, translatePhoneReachability, type PhoneReachabilityCatalog } from './i18n-phone-reachability-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DU TÉLÉPHONE INJOIGNABLE (#18737) — le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, PhoneReachabilityCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadPhoneReachabilityCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadPhoneReachabilityCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof PhoneReachabilityCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadPhoneReachabilityCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['phone.webNote', 'phone.announce.unreachable', 'phone.cause.network', 'phone.global.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translatePhoneReachability', () => {
  test('interpole le nom et l’heure, dans la langue demandée', async () => {
    await loadPhoneReachabilityCatalog('en');
    expect(isPhoneReachabilityCatalogLoaded('en')).toBe(true);
    expect(translatePhoneReachability('en', 'phone.announce.unreachable', { name: 'Ada', time: '14:10' })).toBe('Ada’s phone has been unreachable since 14:10');
  });
});
