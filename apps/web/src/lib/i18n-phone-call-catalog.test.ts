import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { isPhoneCallCatalogLoaded, loadPhoneCallCatalog, translatePhoneCall, type PhoneCallCatalog } from './i18n-phone-call-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE D’« EN APPEL » (#18753) — le français est la source des clés, chaque autre langue en porte EXACTEMENT
 * les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, PhoneCallCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadPhoneCallCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('les sept langues de l’application', () => {
    expect(SUPPORTED_INTERFACE_LANGUAGES).toHaveLength(7);
  });

  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadPhoneCallCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof PhoneCallCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadPhoneCallCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['call.announce.started', 'call.announce.ended', 'call.detail.sinceTime', 'call.global.short'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translatePhoneCall', () => {
  test('interpole le nom et l’heure, dans la langue demandée', async () => {
    await loadPhoneCallCatalog('en');
    expect(isPhoneCallCatalogLoaded('en')).toBe(true);
    expect(translatePhoneCall('en', 'call.announce.started', { name: 'Ada' })).toBe('Ada is on a call');
    expect(translatePhoneCall('en', 'call.detail.sinceTime', { time: '14:00' })).toBe('On a call since 14:00');
  });
});
