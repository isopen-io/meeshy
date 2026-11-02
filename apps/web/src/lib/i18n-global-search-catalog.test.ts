import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { globalSearchText, loadGlobalSearchCatalog, type GlobalSearchCatalog } from './i18n-global-search-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LA RECHERCHE GÉNÉRALE (#14619, #14620) — traduite dans les sept langues,
 * chargée avec la liste et avec `/search`, jamais dans l'entrée.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, GlobalSearchCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadGlobalSearchCatalog(language)] as const));

/** Les mots que la langue écrit comme le français (« Messages », « Posts », « Story »…). */
const SAME_AS_FRENCH: ReadonlySet<string> = new Set([
  'en:section.messages',
  'en:tab.messages',
  'en:tab.posts',
  'en:type.post',
  'en:type.story',
  'de:type.story',
  'it:tab.posts',
  'it:type.post',
]);

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue de la recherche générale', () => {
  test('les sept langues portent exactement les clés du français', async () => {
    const french = sorted(Object.keys(await loadGlobalSearchCatalog('fr')));
    const all = await loadAll();
    expect(all.length).toBe(7);
    for (const [language, catalog] of all) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
  });

  test('chaque valeur est un texte sans paramètre, jamais vide, traduit hors du français', async () => {
    const french = await loadGlobalSearchCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, params: catalogPlaceholders(value) }).toEqual({ language, key, params: [] });
        if (language !== 'fr' && !SAME_AS_FRENCH.has(`${language}:${key}`)) expect({ language, key, copied: value === french[key as keyof GlobalSearchCatalog] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('les onglets disent Messages, Posts, Personnes', async () => {
    await loadAll();
    expect(['tab.messages', 'tab.posts', 'tab.people'].map((key) => globalSearchText('fr', key as 'tab.messages'))).toEqual(['Messages', 'Posts', 'Personnes']);
    expect(globalSearchText('en', 'tab.people')).toBe('People');
  });
});
