import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { appearanceText, loadAppearanceCatalog, type AppearanceCatalog } from './i18n-appearance-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue du sélecteur « Fond et couleur »', () => {
  test('chaque langue porte exactement les clés du français, avec ses paramètres, jamais vides', async () => {
    const french = await loadAppearanceCatalog('fr');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const catalog = await loadAppearanceCatalog(language);
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: sorted(Object.keys(french)) });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: sorted(catalogPlaceholders(french[key as keyof AppearanceCatalog])) });
      }
    }
  });

  test('les phrases sont traduites, pas recopiées du français', async () => {
    const french = await loadAppearanceCatalog('fr');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((l) => l !== 'fr')) {
      const catalog = await loadAppearanceCatalog(language);
      expect({ language, same: catalog['appearance.shop'] === french['appearance.shop'] }).toEqual({ language, same: false });
      expect({ language, same: catalog['appearance.err_generic'] === french['appearance.err_generic'] }).toEqual({ language, same: false });
    }
  });

  test('un paramètre se substitue ; un catalogue non chargé lève', async () => {
    await loadAppearanceCatalog('en');
    expect(appearanceText('en', 'appearance.photo_item', { index: '3' })).toBe('Photo 3');
    expect(() => appearanceText('xx' as never, 'appearance.title')).toThrow();
  });
});
