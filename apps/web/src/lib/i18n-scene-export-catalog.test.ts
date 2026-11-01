import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadSceneExportCatalog, translateSceneExport, type SceneExportCatalog } from './i18n-scene-export-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE L'EXPORT DES PUBLICATIONS (#13873) — le français est la
 * source des clés, chaque autre langue en porte EXACTEMENT les mêmes, avec les
 * mêmes paramètres, et aucune valeur n'est vide, recopiée de sa clé ou laissée
 * en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, SceneExportCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadSceneExportCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadSceneExportCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof SceneExportCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadSceneExportCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['sceneExport.menu.save', 'sceneExport.menu.imager', 'sceneExport.length.title', 'sceneExport.notice.saved', 'sceneExport.tray.cancel'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateSceneExport', () => {
  test('la part offerte dit sa durée', async () => {
    await loadSceneExportCatalog('fr');
    expect(translateSceneExport('fr', 'sceneExport.length.option', { part: '2', duration: '2:00' })).toBe('2/4 · 2:00');
  });
});
