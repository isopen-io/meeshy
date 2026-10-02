import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadStickerPacksCatalog, translateStickerPacks, type StickerPacksCatalog } from './i18n-sticker-packs-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DES PACKS DE STICKERS (#9141) — même discipline que celui de
 * la feuille d'envoi : le français est la source des clés, chaque autre langue
 * en porte EXACTEMENT les mêmes, avec les mêmes paramètres, traduites.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, StickerPacksCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadStickerPacksCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue des packs de stickers', () => {
  test('chaque langue porte les clés du français, et rien d’autre', async () => {
    const french = sorted(Object.keys(await loadStickerPacksCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
    }
  });

  test('chaque valeur est un texte non vide, avec les paramètres du français, et traduite', async () => {
    const french = await loadStickerPacksCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const k = key as keyof StickerPacksCatalog;
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: sorted(catalogPlaceholders(french[k])) });
      }
      if (language === 'fr') continue;
      for (const key of ['stickerPacks.install', 'stickerPacks.submit.hint', 'stickerPacks.problem.longestOverflows'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('interpole l’auteur et le compte', async () => {
    await loadStickerPacksCatalog('fr');
    expect(translateStickerPacks('fr', 'stickerPacks.by', { author: 'Studio Minou' })).toBe('Par Studio Minou');
    expect(translateStickerPacks('fr', 'stickerPacks.count', { count: '12' })).toBe('12 stickers');
  });
});
