import { describe, expect, test } from 'bun:test';

import { loadPackPreviewCatalog, translatePackPreview, type PackPreviewCatalog } from './i18n-pack-preview-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/** **LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION** (#16267) — sept langues, mêmes clés, traduites. */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, PackPreviewCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadPackPreviewCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();
const placeholders = (text: string): readonly string[] => sorted(text.match(/\{\w+\}/g) ?? []);

describe('le catalogue de l’aperçu des décorations', () => {
  test('chaque langue porte les clés du français, et rien d’autre', async () => {
    const french = sorted(Object.keys(await loadPackPreviewCatalog('fr')));
    for (const [language, catalog] of await loadAll()) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
  });

  test('chaque valeur est un texte non vide, traduit hors français, avec les mêmes paramètres', async () => {
    const french = await loadPackPreviewCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const source = french[key as keyof PackPreviewCatalog];
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, params: placeholders(value) }).toEqual({ language, key, params: placeholders(source) });
        if (language !== 'fr' && !/^\{\w+\}/.test(source)) expect({ language, key, copied: value === source }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('remplit les paramètres dans la langue chargée', async () => {
    await loadPackPreviewCatalog('en');
    expect(translatePackPreview('en', 'packs.preview.position', { index: '2', count: '5' })).toBe('2 of 5');
  });
});
