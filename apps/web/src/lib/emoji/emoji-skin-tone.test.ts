import { describe, expect, test } from 'bun:test';

import { MessagePreferenceSchema } from '@meeshy/shared/types/preferences/message';

import type { SafeStorage } from '@/lib/storage';

import {
  EMOJI_SKIN_TONES,
  EMOJI_SKIN_TONE_KEY,
  readEmojiSkinTone,
  recordEmojiSkinTone,
  skinToneKey,
  skinToneVariants,
  withSkinTone,
} from './emoji-skin-tone';

/**
 * LES TEINTES DE PEAU (#10533) — une variante se CALCULE (emoji de base +
 * modificateur Fitzpatrick), elle ne se stocke pas ; la teinte choisie est UNE
 * préférence, pour tous les emojis, dans le vocabulaire de la préférence
 * partagée `message.emojiSkinTone`.
 */
const memory = (initial: Readonly<Record<string, string>> = {}): SafeStorage => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

const broken: SafeStorage = {
  getItem: () => {
    throw new Error('stockage refusé');
  },
  setItem: () => {
    throw new Error('stockage refusé');
  },
  removeItem: () => {
    throw new Error('stockage refusé');
  },
};

describe('le vocabulaire des teintes', () => {
  test('six teintes, « par défaut » en tête, celles de la préférence partagée', () => {
    expect(EMOJI_SKIN_TONES).toEqual(['default', 'light', 'medium-light', 'medium', 'medium-dark', 'dark']);
    for (const tone of EMOJI_SKIN_TONES) expect(MessagePreferenceSchema.shape.emojiSkinTone.parse(tone)).toBe(tone);
  });
});

describe('la variante calculée', () => {
  test('le modificateur suit le premier caractère de l’emoji', () => {
    expect(withSkinTone('👍', 'light')).toBe('👍🏻');
    expect(withSkinTone('👍', 'medium-light')).toBe('👍🏼');
    expect(withSkinTone('👍', 'medium')).toBe('👍🏽');
    expect(withSkinTone('👍', 'medium-dark')).toBe('👍🏾');
    expect(withSkinTone('👍', 'dark')).toBe('👍🏿');
  });

  test('« par défaut » rend l’emoji de base, intact', () => {
    expect(withSkinTone('👍', 'default')).toBe('👍');
    expect(withSkinTone('☝️', 'default')).toBe('☝️');
  });

  test('le modificateur REMPLACE le sélecteur de présentation', () => {
    expect(withSkinTone('☝️', 'medium')).toBe('☝🏽');
    expect(withSkinTone('🕵️‍♂️', 'dark')).toBe('🕵🏿‍♂️');
  });

  test('dans une séquence, il se pose sur la personne et le reste suit', () => {
    expect(withSkinTone('🤦‍♀️', 'medium')).toBe('🤦🏽‍♀️');
    expect(withSkinTone('🧑‍🚀', 'light')).toBe('🧑🏻‍🚀');
  });

  test('les six variantes d’un emoji, dans l’ordre des teintes', () => {
    expect(skinToneVariants('👋')).toEqual([
      { tone: 'default', emoji: '👋' },
      { tone: 'light', emoji: '👋🏻' },
      { tone: 'medium-light', emoji: '👋🏼' },
      { tone: 'medium', emoji: '👋🏽' },
      { tone: 'medium-dark', emoji: '👋🏾' },
      { tone: 'dark', emoji: '👋🏿' },
    ]);
  });

  test('une variante et sa base ont la même clé', () => {
    expect(skinToneKey('👍🏽')).toBe(skinToneKey('👍'));
    expect(skinToneKey('☝🏽')).toBe(skinToneKey('☝️'));
    expect(skinToneKey('🕵🏿‍♂️')).toBe(skinToneKey('🕵️‍♂️'));
    expect(skinToneKey('👍')).not.toBe(skinToneKey('👎'));
  });
});

describe('la teinte retenue sur l’appareil', () => {
  test('sans rien de retenu : par défaut', () => {
    expect(readEmojiSkinTone(memory())).toBe('default');
  });

  test('la teinte choisie se relit', () => {
    const storage = memory();
    recordEmojiSkinTone('medium-dark', storage);
    expect(storage.getItem(EMOJI_SKIN_TONE_KEY)).toBe('medium-dark');
    expect(readEmojiSkinTone(storage)).toBe('medium-dark');
  });

  test('une valeur inconnue se lit comme « par défaut »', () => {
    expect(readEmojiSkinTone(memory({ [EMOJI_SKIN_TONE_KEY]: 'violet' }))).toBe('default');
  });

  test('un stockage qui refuse n’empêche ni de lire ni de choisir', () => {
    expect(readEmojiSkinTone(broken)).toBe('default');
    expect(() => recordEmojiSkinTone('dark', broken)).not.toThrow();
  });
});
