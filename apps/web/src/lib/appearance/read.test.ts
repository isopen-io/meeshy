import { describe, expect, test } from 'bun:test';

import { appearanceOf, rawAppearanceOf, withAppearance, withRawAppearance } from './read';

const SOLID = { v: 1, background: { kind: 'solid', color: 'azur' }, accent: 'corail', animate: true } as const;

describe('lire l’apparence personnelle', () => {
  test('sans préférence, c’est Signature et l’accent calculé', () => {
    expect(appearanceOf({})).toEqual({ v: 1, background: { kind: 'signature' }, accent: null, animate: true });
  });

  test('lit l’entrée du lecteur', () => {
    expect(appearanceOf({ userPreferences: [{ isPinned: true, appearance: SOLID }] })).toEqual(SOLID);
  });

  test('un fond d’une passerelle plus récente retombe sur Signature sans perdre l’accent', () => {
    const future = { ...SOLID, background: { kind: 'hologram' } };
    expect(appearanceOf({ userPreferences: [{ appearance: future }] })).toEqual({ ...SOLID, background: { kind: 'signature' } });
  });

  test('l’écrire garde les autres préférences', () => {
    const next = withAppearance({ userPreferences: [{ isPinned: true }] }, SOLID);
    expect(next.userPreferences).toEqual([{ isPinned: true, appearance: SOLID }]);
  });

  test('rétablir l’état brut d’avant rend aussi l’absence de la clé', () => {
    const before = { userPreferences: [{ isPinned: true }] };
    const after = withAppearance(before, SOLID);
    expect(withRawAppearance(after, rawAppearanceOf(before)).userPreferences).toEqual([{ isPinned: true }]);
  });
});
