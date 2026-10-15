import { describe, expect, test } from 'bun:test';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';

import { accentOf, accentPaletteOf } from './accent';

const base = { id: 'c1', title: 'Équipe', type: 'group' } as const;
const computed = conversationAccentPalette({ name: 'Équipe', type: 'group' });
const chosen = (accent: string | null) => ({ ...base, userPreferences: [{ appearance: { v: 1, background: { kind: 'signature' }, accent, animate: true } }] });

describe('l’accent personnel descend par accentPaletteOf (#10631, D2)', () => {
  test('sans apparence, la palette calculée est rendue inchangée', () => {
    expect(accentPaletteOf(base)).toEqual(computed);
  });

  test('« Automatique » (accent null) rend l’accent calculé', () => {
    expect(accentPaletteOf(chosen(null))).toEqual(computed);
  });

  test('un accent de la gamme remplace la primaire', () => {
    expect(accentOf(chosen('corail') as never).toLowerCase()).toBe(APPEARANCE_GAMUT.corail.dark.accent.toLowerCase());
  });

  test('une clé hors gamme est ignorée', () => {
    expect(accentPaletteOf(chosen('chartreuse'))).toEqual(computed);
  });
});
