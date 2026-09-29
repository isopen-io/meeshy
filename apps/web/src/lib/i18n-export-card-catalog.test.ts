import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadExportCardCatalog, translateExportCard, type ExportCardCatalog } from './i18n-export-card-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DU COMPOSER D'EXPORT (#8667) — même discipline que
 * `i18n-invite-catalog.test.ts` : le français est la source des clés, chaque
 * autre langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, et
 * aucune valeur n'est vide, recopiée de sa clé ou laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ExportCardCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadExportCardCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadExportCardCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadExportCardCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof ExportCardCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadExportCardCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['export.card.title', 'export.card.hint', 'export.card.gallery.empty', 'export.announce.gallery'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateExportCard', () => {
  test('interpole le nombre de styles trouvés', async () => {
    await loadExportCardCatalog('fr');
    expect(translateExportCard('fr', 'export.card.gallery.count', { count: '49' })).toBe('49 styles');
  });
});
