import { describe, expect, test } from 'bun:test';

import {
  isDeviceTranslationCatalogLoaded,
  loadDeviceTranslationCatalog,
  translateDeviceTranslation,
  type DeviceTranslationCatalog,
} from './i18n-device-translation-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA TRADUCTION SUR L'APPAREIL (#9898) — même discipline que
 * `i18n-sounds-mine-catalog.test.ts` : le français est la source des clés,
 * chaque autre langue en porte EXACTEMENT les mêmes, et aucune valeur n'est
 * vide, recopiée de sa clé ou laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, DeviceTranslationCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadDeviceTranslationCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés de la traduction sur l’appareil, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadDeviceTranslationCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte traduit, jamais vide, jamais sa clé, jamais le français recopié', async () => {
    const french = await loadDeviceTranslationCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        if (language === 'fr') continue;
        expect({ language, key, copied: value === french[key as keyof DeviceTranslationCatalog] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateDeviceTranslation', () => {
  test('rend le texte de la langue chargée', async () => {
    await loadDeviceTranslationCatalog('en');
    expect(isDeviceTranslationCatalogLoaded('en')).toBe(true);
    expect(translateDeviceTranslation('en', 'settings.device_translation')).toBe('Translate on this device');
  });
});
