import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadRevokeSessionsCatalog, translateRevokeSessions, type RevokeSessionsCatalog } from './i18n-revoke-sessions-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LE LIEN « CE N'ÉTAIT PAS MOI » (/auth/revoke-sessions) — même discipline que le
 * catalogue des invitations : le français est la source des clés, chaque autre
 * langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, RevokeSessionsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadRevokeSessionsCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('les sept langues du produit', () => {
    expect(sorted(SUPPORTED_INTERFACE_LANGUAGES)).toEqual(sorted(['fr', 'en', 'es', 'pt', 'de', 'it', 'ar']));
  });

  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadRevokeSessionsCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof RevokeSessionsCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadRevokeSessionsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['revokeSessions.title', 'revokeSessions.body'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateRevokeSessions', () => {
  test('lit le texte dans la langue demandée une fois chargé', async () => {
    await loadRevokeSessionsCatalog('en');
    expect(translateRevokeSessions('en', 'revokeSessions.action')).toBe('Sign out all devices');
  });

});
