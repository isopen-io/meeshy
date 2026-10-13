import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';

import {
  EMOJI_CATEGORY_IDS,
  EMOJI_GROUP_IDS,
  buildEmojiIndex,
  foldSearch,
  loadEmojiIndex,
  loadEmojiNames,
  loadedEmojiIndex,
  searchEmojis,
} from './emoji-catalogue';
import { EMOJI_SKIN_TONES, skinToneKey, withSkinTone } from './emoji-skin-tone';

/**
 * LA TABLE DES EMOJIS ET SA RECHERCHE (#10531) — la feuille propose tous les
 * emojis d'Unicode, rangés dans les catégories d'`EmojiPickerSheet` (iOS), et
 * les retrouve par leur nom dans la langue de l'interface.
 */
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;

const find = async (language: 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it' | 'ar', query: string, options: { maxLevel?: number; limit?: number } = {}) =>
  searchEmojis({
    index: await loadEmojiIndex(),
    names: await loadEmojiNames(language),
    query,
    maxLevel: options.maxLevel ?? Number.POSITIVE_INFINITY,
    limit: options.limit ?? 2000,
  });

describe('la table des emojis', () => {
  test('les catégories sont celles d’iOS, dans son ordre, « Récents » en tête', () => {
    expect(EMOJI_CATEGORY_IDS).toEqual(['recent', 'smileys', 'people', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols', 'flags']);
    expect(EMOJI_GROUP_IDS).toEqual(EMOJI_CATEGORY_IDS.slice(1));
  });

  test('elle porte plus de mille huit cents emojis, tous distincts, sans variante de teinte', async () => {
    const index = await loadEmojiIndex();
    const emojis = index.all.map((entry) => entry.emoji);
    expect(emojis.length).toBeGreaterThan(1800);
    expect(new Set(emojis).size).toBe(emojis.length);
    expect(emojis.filter((emoji) => SKIN_TONE.test(emoji))).toEqual([]);
    expect(index.all.map((entry) => entry.position)).toEqual(emojis.map((_, position) => position));
    expect(loadedEmojiIndex()).toBe(index);
  });

  test('aucune catégorie n’est vide, et chaque emoji a un palier de version', async () => {
    const index = await loadEmojiIndex();
    for (const id of EMOJI_GROUP_IDS) {
      const entries = index.byGroup.get(id) ?? [];
      expect({ id, empty: entries.length === 0 }).toEqual({ id, empty: false });
      expect({ id, badLevels: entries.filter((entry) => !Number.isInteger(entry.level) || entry.level < 0 || entry.level > 16).length }).toEqual({ id, badLevels: 0 });
    }
    expect(index.byGroup.get('animals')?.[0]?.emoji).toBe('🐵');
    expect(index.byGroup.get('flags')?.some((entry) => entry.emoji === '🇫🇷')).toBe(true);
  });

  test('les vingt emojis proposés d’emblée en font partie', async () => {
    const all = new Set((await loadEmojiIndex()).all.map((entry) => entry.emoji));
    expect(EXTENDED_REACTIONS.filter((emoji) => !all.has(emoji))).toEqual([]);
  });

  test('une table dont les paliers ne suivent pas les emojis est refusée', () => {
    expect(() => buildEmojiIndex([['smileys', '😀 😃', '0']])).toThrow();
  });
});

/**
 * QUI ACCEPTE UNE TEINTE (#10533) — un drapeau par emoji dans la table
 * générée, vérifié par le générateur contre la liste d'Unicode : les cinq
 * variantes calculées existent toutes. Les emojis à plusieurs personnages, qui
 * exigent un modificateur par personne, ne le portent pas.
 */
describe('les emojis qui acceptent une teinte de peau', () => {
  const baseOf = async (emoji: string) => (await loadEmojiIndex()).tonable.get(skinToneKey(emoji));

  test('une main, une personne, un métier l’acceptent ; un visage jaune, un objet, un drapeau non', async () => {
    for (const emoji of ['👍', '👋', '☝️', '🙏', '💪', '🧑', '🕵️‍♂️', '🤦‍♀️', '🧑‍🚀']) expect({ emoji, base: await baseOf(emoji) }).toEqual({ emoji, base: emoji });
    for (const emoji of ['😀', '❤️', '🔥', '🇫🇷', '🐱']) expect({ emoji, base: await baseOf(emoji) }).toEqual({ emoji, base: undefined });
  });

  test('un emoji à plusieurs personnages, qui veut un modificateur par personne, ne l’accepte pas', async () => {
    for (const emoji of ['🧑‍🤝‍🧑', '👩‍❤️‍👨', '👨‍👩‍👧']) expect({ emoji, base: await baseOf(emoji) }).toEqual({ emoji, base: undefined });
  });

  test('ils sont plusieurs centaines, tous dans « Personnes et gestes », et l’entrée le dit', async () => {
    const index = await loadEmojiIndex();
    const toned = index.all.filter((entry) => entry.toned);
    expect(toned.length).toBeGreaterThan(250);
    expect(index.tonable.size).toBe(toned.length);
    expect(toned.filter((entry) => !(index.byGroup.get('people') ?? []).includes(entry))).toEqual([]);
  });

  test('une variante retrouve sa base, et chacune ne porte qu’UN modificateur', async () => {
    const index = await loadEmojiIndex();
    expect(await baseOf('👍🏽')).toBe('👍');
    expect(await baseOf('☝🏿')).toBe('☝️');
    const tones = EMOJI_SKIN_TONES.filter((tone) => tone !== 'default');
    const wrong = [...index.tonable.values()].filter((base) =>
      tones.some((tone) => (withSkinTone(base, tone).match(/[\u{1F3FB}-\u{1F3FF}]/gu) ?? []).length !== 1),
    );
    expect(wrong).toEqual([]);
  });

  test('une table dont les drapeaux ne suivent pas les emojis est refusée', () => {
    expect(() => buildEmojiIndex([['people', '👋 🤚', '00', '1']])).toThrow();
    expect(buildEmojiIndex([['people', '👋 👀', '00', '10']]).all.map((entry) => entry.toned)).toEqual([true, false]);
    expect(buildEmojiIndex([['smileys', '😀 😃', '00']]).tonable.size).toBe(0);
  });
});

describe('les noms de recherche', () => {
  test('les sept langues nomment chaque emoji de la table', async () => {
    const count = (await loadEmojiIndex()).all.length;
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const names = await loadEmojiNames(language);
      expect({ language, lines: names.length }).toEqual({ language, lines: count });
      expect({ language, unnamed: names.filter((line) => line.split('|')[0]?.trim() === '').length }).toEqual({ language, unnamed: 0 });
    }
  });

  test('la recherche ignore la casse, les accents et les ligatures', async () => {
    expect(foldSearch('Cœur ÉTÉ straße')).toBe('coeur ete strasse');
    expect(await find('fr', 'COEUR')).toContain('❤️');
    expect(await find('fr', 'cœur')).toContain('❤️');
    expect(await find('fr', 'emoticone')).toContain('😀');
  });

  test('chaque langue trouve dans ses propres mots', async () => {
    expect(await find('en', 'heart')).toContain('❤️');
    expect(await find('es', 'corazón')).toContain('❤️');
    expect(await find('pt', 'coração')).toContain('❤️');
    expect(await find('de', 'herz')).toContain('❤️');
    expect(await find('it', 'cuore')).toContain('❤️');
    expect(await find('ar', 'قلب')).toContain('❤️');
  });

  test('chaque mot de la requête doit se trouver dans la ligne : « drapeau france » rend le drapeau français', async () => {
    expect(await find('fr', 'drapeau france')).toEqual(['🇫🇷']);
    expect(await find('en', 'flag japan')).toContain('🇯🇵');
    expect(await find('fr', 'xyzzy introuvable')).toEqual([]);
  });

  test('une requête vide ne rend rien, et le plafond borne les résultats', async () => {
    expect(await find('fr', '   ')).toEqual([]);
    expect((await find('fr', 'a', { limit: 30 })).length).toBe(30);
  });

  test('un emoji dont le NOM porte le mot passe avant celui qui ne le porte qu’en mot-clé', async () => {
    const results = await find('fr', 'chat');
    const named = results.indexOf('🐱');
    const keyworded = results.indexOf('🦁');
    expect(named).toBeGreaterThanOrEqual(0);
    expect(keyworded === -1 || named < keyworded).toBe(true);
  });

  test('un emoji plus récent que ce que l’appareil sait peindre n’est pas proposé', async () => {
    expect(await find('en', 'melting face')).toContain('🫠');
    expect(await find('en', 'melting face', { maxLevel: 13 })).not.toContain('🫠');
    expect(await find('en', 'grinning face', { maxLevel: 5 })).toContain('😀');
  });
});
