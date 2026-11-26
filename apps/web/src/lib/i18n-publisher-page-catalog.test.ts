import { describe, expect, test } from 'bun:test';

import { loadPublisherPageCatalog, type PublisherPageCatalog } from './i18n-publisher-page-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LA PAGE ÉDITEUR (#16440) — le français est la source des clés
 * `publisherPage.*` ; chaque langue en porte exactement les mêmes, traduites,
 * et la légende garde la place du nom de l'éditeur.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, PublisherPageCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadPublisherPageCatalog(language)] as const));

describe('le catalogue « Page éditeur »', () => {
  test('mêmes clés dans les sept langues, traduites, et `{name}` dans chaque légende', async () => {
    const french = await loadPublisherPageCatalog('fr');
    const all = await loadAll();
    expect(all).toHaveLength(7);
    for (const [language, catalog] of all) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: Object.keys(french).sort() });
      expect({ language, name: catalog['publisherPage.caption'].includes('{name}') }).toEqual({ language, name: true });
      if (language === 'fr') continue;
      for (const key of Object.keys(french) as Array<keyof PublisherPageCatalog>) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});
