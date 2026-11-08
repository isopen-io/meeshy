import { describe, expect, test } from 'bun:test';

import { loadCommunitySettingsCatalog, type CommunitySettingsCatalog } from './i18n-community-settings-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — le français est la source des clés
 * `community.settings.*` ; chaque langue en porte exactement les mêmes, aucune
 * valeur vide, les textes affichés sont traduits, et `{name}` survit partout.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CommunitySettingsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCommunitySettingsCatalog(language)] as const));

describe('le catalogue des réglages d’une communauté', () => {
  test('mêmes clés dans les sept langues', async () => {
    const french = Object.keys(await loadCommunitySettingsCatalog('fr')).sort();
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: french });
    }
  });

  test('aucune valeur vide, les textes affichés traduits, et le nom de la communauté gardé dans la confirmation', async () => {
    const french = await loadCommunitySettingsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
      }
      expect({ language, placeholder: catalog['community.settings.delete.confirm.title'].includes('{name}') }).toEqual({ language, placeholder: true });
      if (language === 'fr') continue;
      for (const key of ['community.settings.title', 'community.settings.delete.confirm.body', 'community.settings.error.refused'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});
