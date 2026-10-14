import { describe, expect, it } from 'vitest';
import { conversationAccentPalette, conversationAccentPaletteFromPrimary } from '../utils/conversation-colors';

describe('conversationAccentPaletteFromPrimary (#10632)', () => {
  it('dérive secondaire +30° et accent −30° de la primaire, comme la loi calculée', () => {
    const computed = conversationAccentPalette({ name: 'x', type: 'direct', language: 'fr', theme: 'general' });
    expect(conversationAccentPaletteFromPrimary(computed.primary)).toEqual(computed);
  });

  it('garde la primaire donnée, en majuscules avec #, et tourne la teinte', () => {
    expect(conversationAccentPaletteFromPrimary('#ff0000').primary).toBe('#FF0000');
    expect(conversationAccentPaletteFromPrimary('#FF0000').secondary).toBe('#FF7F00');
    expect(conversationAccentPaletteFromPrimary('#FF0000').accent).toBe('#FF007F');
  });
});
