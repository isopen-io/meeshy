import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from '@/lib/storage';

import { EMOJI_RECENTS_KEY, EMOJI_RECENTS_LIMIT, parseEmojiRecents, pushEmojiRecent, readEmojiRecents, recordEmojiRecent } from './emoji-recents';

/**
 * LES EMOJIS RÉCENTS (#10531) — jumelle web de `frequentEmojis`
 * (`EmojiPickerSheet.swift`) : le dernier choisi en tête, vingt-quatre au plus,
 * gardés sur l'appareil.
 */
const memory = (initial: Readonly<Record<string, string>> = {}): SafeStorage => {
  const map = new Map(Object.entries(initial));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
};

const broken: SafeStorage = {
  getItem: () => {
    throw new Error('lecture refusée');
  },
  setItem: () => {
    throw new Error('écriture refusée');
  },
  removeItem: () => {},
};

describe('les emojis récents', () => {
  test('le dernier choisi passe en tête, sans doublon', () => {
    expect(pushEmojiRecent(['😀', '🎉'], '🔥')).toEqual(['🔥', '😀', '🎉']);
    expect(pushEmojiRecent(['😀', '🎉', '🔥'], '🎉')).toEqual(['🎉', '😀', '🔥']);
  });

  test('la liste est bornée à vingt-quatre, le plus ancien sort', () => {
    const full = Array.from({ length: EMOJI_RECENTS_LIMIT }, (_, index) => `e${index}`);
    const next = pushEmojiRecent(full, '🔥');
    expect(EMOJI_RECENTS_LIMIT).toBe(24);
    expect(next.length).toBe(24);
    expect(next[0]).toBe('🔥');
    expect(next).not.toContain('e23');
  });

  test('un choix s’écrit sur l’appareil et se relit', () => {
    const storage = memory();
    recordEmojiRecent('😀', storage);
    recordEmojiRecent('🎉', storage);
    expect(readEmojiRecents(storage)).toEqual(['🎉', '😀']);
    expect(storage.getItem(EMOJI_RECENTS_KEY)).toBe('["🎉","😀"]');
  });

  test('un contenu illisible, étranger ou trop long rend une liste propre', () => {
    expect(parseEmojiRecents(null)).toEqual([]);
    expect(parseEmojiRecents('{oops')).toEqual([]);
    expect(parseEmojiRecents('{"a":1}')).toEqual([]);
    expect(parseEmojiRecents(JSON.stringify(['😀', 3, '', 'x'.repeat(40), '😀', '🎉']))).toEqual(['😀', '🎉']);
    expect(parseEmojiRecents(JSON.stringify(Array.from({ length: 40 }, (_, index) => `e${index}`))).length).toBe(24);
  });

  test('un stockage qui refuse la lecture ou l’écriture ne casse rien', () => {
    expect(readEmojiRecents(broken)).toEqual([]);
    expect(() => recordEmojiRecent('😀', broken)).not.toThrow();
  });

  test('une valeur qui n’est pas un emoji plausible n’est pas retenue', () => {
    expect(pushEmojiRecent(['😀'], '')).toEqual(['😀']);
    expect(pushEmojiRecent(['😀'], 'x'.repeat(40))).toEqual(['😀']);
  });
});
