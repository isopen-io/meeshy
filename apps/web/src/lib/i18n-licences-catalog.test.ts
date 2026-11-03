import { describe, expect, test } from 'bun:test';

import { loadLicencesCatalog, type LicencesCatalog } from './i18n-licences-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * L'ÉCRAN LICENCES (#14628) — le français est la source des clés `licences.*` ;
 * chaque langue en porte exactement les mêmes, aucune valeur vide, la phrase
 * AGPL traduite, et la révision garde son emplacement `{commit}`.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, LicencesCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadLicencesCatalog(language)] as const));

describe('le catalogue « Licences »', () => {
  test('mêmes clés dans les sept langues', async () => {
    const french = Object.keys(await loadLicencesCatalog('fr')).sort();
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: french });
    }
  });

  test('aucune valeur vide ; la mention AGPL est traduite et nomme la licence', async () => {
    const french = await loadLicencesCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' }).toEqual({ language, key, empty: false });
      }
      expect({ language, agpl: catalog['licences.meeshy.body'].includes('AGPL-3.0') }).toEqual({ language, agpl: true });
      expect({ language, commit: catalog['licences.source.commit'].includes('{commit}') }).toEqual({ language, commit: true });
      if (language === 'fr') continue;
      expect({ language, copied: catalog['licences.meeshy.body'] === french['licences.meeshy.body'] }).toEqual({ language, copied: false });
    }
  });
});
