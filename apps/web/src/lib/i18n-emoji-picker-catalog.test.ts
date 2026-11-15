import { describe, expect, test } from 'bun:test';

import { EMOJI_CATEGORY_IDS } from './emoji/emoji-catalogue';
import { EMOJI_SKIN_TONES } from './emoji/emoji-skin-tone';
import { catalogPlaceholders } from './i18n-catalog';
import { emojiPickerText, loadEmojiPickerCatalog, type EmojiPickerCatalog } from './i18n-emoji-picker-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LES TEXTES DE LA FEUILLE D'EMOJIS (#10531) — catégories, recherche et états,
 * dans les sept langues, chargés avec la feuille et jamais dans le catalogue
 * commun, qui est à son plafond de poids.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, EmojiPickerCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadEmojiPickerCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue de la feuille d’emojis', () => {
  test('les sept langues portent exactement les clés du français', async () => {
    const french = sorted(Object.keys(await loadEmojiPickerCatalog('fr')));
    const all = await loadAll();
    expect(all.length).toBe(7);
    for (const [language, catalog] of all) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
  });

  test('chaque catégorie a son nom, que le lecteur d’écran annonce', async () => {
    const french = await loadEmojiPickerCatalog('fr');
    expect(sorted(Object.keys(french).filter((key) => key.startsWith('emojiPicker.category.')))).toEqual(
      sorted(EMOJI_CATEGORY_IDS.map((id) => `emojiPicker.category.${id}`)),
    );
    expect(emojiPickerText('fr', 'emojiPicker.category.recent')).toBe('Récents');
    expect(emojiPickerText('fr', 'emojiPicker.category.animals')).toBe('Animaux et nature');
    expect(emojiPickerText('en', 'emojiPicker.category.flags')).toBe('Flags');
  });

  test('chaque teinte de peau a son nom, et leur menu aussi (#10533)', async () => {
    const french = await loadEmojiPickerCatalog('fr');
    expect(sorted(Object.keys(french).filter((key) => key.startsWith('emojiPicker.tone.')))).toEqual(
      sorted(EMOJI_SKIN_TONES.map((tone) => `emojiPicker.tone.${tone}`)),
    );
    await loadAll();
    expect(emojiPickerText('fr', 'emojiPicker.tones')).toBe('Teintes de peau');
    expect(emojiPickerText('fr', 'emojiPicker.tone.default')).toBe('Par défaut');
    expect(emojiPickerText('fr', 'emojiPicker.tone.medium')).toBe('Moyenne');
    expect(emojiPickerText('en', 'emojiPicker.tone.medium-dark')).toBe('Medium-dark');
    expect(emojiPickerText('ar', 'emojiPicker.tones')).not.toBe(emojiPickerText('fr', 'emojiPicker.tones'));
  });

  test('chaque valeur est un texte sans paramètre, jamais vide', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, params: catalogPlaceholders(value) }).toEqual({ language, key, params: [] });
      }
    }
  });

  test('la recherche et ses états se disent dans la langue du lecteur', async () => {
    await loadAll();
    expect(emojiPickerText('fr', 'emojiPicker.search')).toBe('Rechercher un emoji');
    expect(emojiPickerText('en', 'emojiPicker.search')).toBe('Search emoji');
    expect(emojiPickerText('fr', 'emojiPicker.search.empty')).toBe('Aucun emoji trouvé');
    expect(emojiPickerText('ar', 'emojiPicker.search')).not.toBe(emojiPickerText('fr', 'emojiPicker.search'));
  });
});
