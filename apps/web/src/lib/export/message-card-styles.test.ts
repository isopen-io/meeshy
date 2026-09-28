import { describe, expect, test } from 'bun:test';

import { STORY_FONT_FAMILIES } from '@/lib/canvas/story-fonts';

import { CARD_STORY_FONTS, MESSAGE_CARD_STYLES, MESSAGE_CARD_STYLE_IDS, canvasFont } from './message-card-styles';

describe('les styles de carte — des polices qui existent vraiment', () => {
  test('chaque famille employée est une police de story embarquée, à la graisse de son fichier', () => {
    for (const [style, font] of Object.entries(CARD_STORY_FONTS)) {
      const embedded = STORY_FONT_FAMILIES[style as keyof typeof STORY_FONT_FAMILIES];
      expect({ family: embedded.css, weight: embedded.weight }).toEqual({ family: font.family, weight: font.weight });
    }
  });

  test('au moins deux styles, chacun décrit en entier', () => {
    expect(MESSAGE_CARD_STYLE_IDS.length >= 2).toBe(true);
    for (const id of MESSAGE_CARD_STYLE_IDS) expect(MESSAGE_CARD_STYLES[id].id).toBe(id);
  });

  test('la chaîne de police nomme la famille puis la pile native, jamais un générique seul', () => {
    expect(canvasFont({ family: 'Prata', weight: 400, style: 'normal' }, 40.4)).toBe(
      '400 40px "Prata", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    );
    expect(canvasFont({ family: null, weight: 600, style: 'italic' }, 30).startsWith('italic 600 30px -apple-system')).toBe(true);
  });
});
