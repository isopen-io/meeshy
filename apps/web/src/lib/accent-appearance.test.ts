import { describe, expect, test } from 'bun:test';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';

import { accentOf, accentPaletteOf, personalBubbleVars } from './accent';

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

describe('la bulle envoyée suit l’accent personnel (#10734)', () => {
  test('sans choix, aucune variable : le brandPrimary commun reste', () => {
    expect(personalBubbleVars(base)).toEqual({});
    expect(personalBubbleVars(chosen(null))).toEqual({});
  });

  test('avec un accent choisi, la bulle prend l’accent et son encre lisible', () => {
    const vars = personalBubbleVars(chosen('corail') as never) as Record<string, string>;
    expect(vars['--bubble-mine-personal']!.toLowerCase()).toBe(APPEARANCE_GAMUT.corail.dark.accent.toLowerCase());
    expect(vars['--bubble-mine-personal-ink']).toMatch(/^#(000000|FFFFFF)$/);
  });

  test('la méta de la bulle envoyée suit l’encre choisie, jamais le blanc de marque', () => {
    const vars = personalBubbleVars(chosen('moutarde') as never) as Record<string, string>;
    const ink = vars['--bubble-mine-personal-ink']!;
    expect(vars['--bubble-mine-personal-meta']).toBe(`color-mix(in srgb, ${ink} 70%, transparent)`);
  });
});
