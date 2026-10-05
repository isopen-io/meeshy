import { describe, expect, test } from 'bun:test';

import { fontFamilyFrom, paletteFrom } from './env';

/**
 * L'ENVIRONNEMENT DU NAVIGATEUR (#9382) — le peu de colle entre l'écran et le
 * navigateur (caméra, canvas, partage, IndexedDB). La couleur et la police de
 * l'image se LISENT dans la charte (jetons du document), elles ne s'écrivent
 * pas ici.
 */
describe('paletteFrom', () => {
  test('chaque couleur de l’image vient d’un jeton de la charte', () => {
    const tokens: Record<string, string> = {
      '--ios-indigo-950': 'A',
      '--ios-indigo-600': 'B',
      '--ios-on-brand': 'C',
      '--ios-indigo-200': 'D',
    };
    expect(paletteFrom((name) => tokens[name] ?? '')).toEqual({ top: 'A', bottom: 'B', ink: 'C', inkSoft: 'D', scrim: 'A' });
  });

  test('un jeton absent ne casse pas la peinture : la couleur courante du canvas', () => {
    expect(paletteFrom(() => '').top).toBe('currentColor');
  });
});

describe('fontFamilyFrom', () => {
  test('la police native de la charte, avec un repli système', () => {
    expect(fontFamilyFrom((name) => (name === '--font-native' ? 'Inter' : ''))).toBe('Inter, system-ui, sans-serif');
  });

  test('sans jeton : le système', () => {
    expect(fontFamilyFrom(() => '')).toBe('system-ui, sans-serif');
  });
});
