import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { conversationAccentPalette, conversationAccentPaletteFromPrimary } from '../utils/conversation-colors';

type PaletteVector = { readonly expected: { readonly primary?: string; readonly secondary?: string; readonly accent?: string } };

const vectorsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'reading-modes', 'accent.vectors.json');
const paletteVectors = (JSON.parse(readFileSync(vectorsPath, 'utf-8')) as { readonly vectors: readonly PaletteVector[] })
  .vectors.filter((vector) => vector.expected.primary !== undefined);

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

  it('rejoue les vingt vecteurs de palette partagés avec iOS (ConversationColorPalette.derived, #10631)', () => {
    expect(paletteVectors).toHaveLength(20);
    paletteVectors.forEach(({ expected }) => {
      expect(conversationAccentPaletteFromPrimary((expected.primary ?? '').toLowerCase())).toEqual(expected);
    });
  });
});
