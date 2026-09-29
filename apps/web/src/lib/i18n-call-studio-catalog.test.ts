import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadCallStudioCatalog, translateCallStudio, type CallStudioCatalog } from './i18n-call-studio-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DU STUDIO D'APPEL (#8551, #8552) — même discipline que
 * `i18n-invite-catalog.test.ts` : le français est la source des clés, chaque
 * autre langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, et
 * aucune valeur n'est vide, recopiée de sa clé ou laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CallStudioCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCallStudioCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadCallStudioCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadCallStudioCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof CallStudioCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadCallStudioCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['callStudio.face.smoothing', 'callStudio.face.toad', 'callStudio.montage.strip', 'callStudio.capture.saved', 'callStudio.capture.facesSaved', 'callStudio.companions.label', 'callStudio.companions.more', 'callStudio.companions.move', 'callStudio.frames.moods', 'callStudio.frames.mood.classics', 'callStudio.frames.mood.distingue', 'callStudio.frames.mood.hors-norme', 'callStudio.frames.mood.feerique', 'callStudio.mode.pickFrame', 'callStudio.capture.framePreview'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateCallStudio', () => {
  test('interpole le nombre de visages enregistrés', async () => {
    await loadCallStudioCatalog('fr');
    expect(translateCallStudio('fr', 'callStudio.capture.facesSaved', { count: '3' })).toBe('3 visages enregistrés');
  });

  test('une langue pas encore chargée sert une langue déjà chargée, sans lever', async () => {
    await loadCallStudioCatalog('fr');
    expect(translateCallStudio('it', 'callStudio.face.angel')).toMatch(/Ange|Angelo/);
  });
});
