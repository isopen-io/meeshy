import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadSessionsCatalog, translateSessions, type SessionsCatalog } from './i18n-sessions-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DES SESSIONS (#6720) — même discipline que
 * `i18n-invite-catalog.test.ts` : le français est la source des clés, chaque
 * autre langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, et
 * aucune valeur n'est vide, recopiée de sa clé ou laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, SessionsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadSessionsCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadSessionsCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadSessionsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof SessionsCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadSessionsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['sessions.intro', 'sessions.current', 'sessions.revoke', 'sessions.others', 'sessions.empty.title', 'sessions.offline', 'sessionEnd.admin_revoke', 'sessionEnd.user_revoke'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateSessions', () => {
  test('interpole le nombre de sessions fermées', async () => {
    await loadSessionsCatalog('fr');
    expect(translateSessions('fr', 'sessions.others.done.other', { count: '3' })).toBe('3 sessions fermées');
  });

  test('la fermeture par l’administration dit « l’équipe Meeshy », jamais un administrateur', async () => {
    for (const [, catalog] of await loadAll()) expect(catalog['sessionEnd.admin_revoke']).toContain('Meeshy');
  });
});
