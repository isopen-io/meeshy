import { describe, expect, test } from 'bun:test';

import { loadCommunityPostsCatalog, type CommunityPostsCatalog } from './i18n-community-posts-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — le français est la source des clés
 * `community.posts.*` ; chaque langue en porte exactement les mêmes, aucune
 * valeur vide, et les textes affichés sont traduits.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CommunityPostsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCommunityPostsCatalog(language)] as const));

describe('le catalogue des publications d’une communauté', () => {
  test('mêmes clés dans les sept langues', async () => {
    const french = Object.keys(await loadCommunityPostsCatalog('fr')).sort();
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: french });
    }
  });

  test('aucune valeur vide, et les textes affichés traduits', async () => {
    const french = await loadCommunityPostsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
      }
      if (language === 'fr') continue;
      for (const key of ['community.posts.tab.posts', 'community.posts.empty.title', 'community.posts.error.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});
