import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadRowMenuCatalog, rowMenuText, type RowMenuCatalog } from './i18n-row-menu-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE MENU D'UNE LIGNE ET LES PUCES DE LA LISTE (#10593) — traduits dans les
 * sept langues, chargés avec l'écran de la liste, jamais dans l'entrée.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, RowMenuCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadRowMenuCatalog(language)] as const));

/**
 * LES MOTS QU'iOS ÉCRIT PAREIL QU'EN FRANÇAIS (#10598) — `conversation.filter.*`
 * de `Localizable.xcstrings` : « Channels » en anglais, « Globales » en
 * espagnol. Une copie ailleurs reste un oubli de traduction.
 */
const SAME_AS_FRENCH_ON_IOS: ReadonlySet<string> = new Set(['en:listFilter.channels', 'es:listFilter.global']);

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue du menu d’une ligne', () => {
  test('les sept langues portent exactement les clés du français', async () => {
    const french = sorted(Object.keys(await loadRowMenuCatalog('fr')));
    const all = await loadAll();
    expect(all.length).toBe(7);
    for (const [language, catalog] of all) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
  });

  test('chaque valeur est un texte sans paramètre, jamais vide, traduit hors du français', async () => {
    const french = await loadRowMenuCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, params: catalogPlaceholders(value) }).toEqual({ language, key, params: [] });
        if (language !== 'fr' && !SAME_AS_FRENCH_ON_IOS.has(`${language}:${key}`)) expect({ language, key, copied: value === french[key as keyof RowMenuCatalog] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('le vocabulaire est celui d’iOS (context.*, conversation.filter.*)', async () => {
    await loadAll();
    expect(rowMenuText('fr', 'rowMenu.moveTo.mine')).toBe('Mes conversations');
    expect(rowMenuText('en', 'rowMenu.favorite.remove')).toBe('Remove from favourites');
    expect(rowMenuText('fr', 'listFilter.favorites')).toBe('Favoris');
    expect(rowMenuText('fr', 'listFilter.private')).toBe('Privée');
    expect(rowMenuText('pt', 'listFilter.global')).toBe('Globais');
    expect(rowMenuText('de', 'rowMenu.unblock')).toBe('Blockierung aufheben');
  });
});
