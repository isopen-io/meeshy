import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadSoundsMineCatalog, translateSoundsMine, type SoundsMineCatalog } from './i18n-sounds-mine-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE « MES SONS » (#9848) — même discipline que
 * `i18n-onboarding-catalog.test.ts` : le français est la source des clés
 * `soundsMine.*`, chaque autre langue en porte EXACTEMENT les mêmes, avec les
 * mêmes paramètres, et aucune valeur n'est vide, recopiée de sa clé ou
 * laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, SoundsMineCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadSoundsMineCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés soundsMine.* du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadSoundsMineCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadSoundsMineCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof SoundsMineCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadSoundsMineCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['soundsMine.title', 'soundsMine.action.remove', 'soundsMine.remove.body.other'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateSoundsMine', () => {
  test('le compte des publications se place où la langue le veut', async () => {
    await Promise.all([loadSoundsMineCatalog('fr'), loadSoundsMineCatalog('en')]);
    expect(translateSoundsMine('fr', 'soundsMine.posts.other', { count: '3' })).toBe('3 publications');
    expect(translateSoundsMine('en', 'soundsMine.posts.one', { count: '1' })).toBe('1 post');
  });
});
