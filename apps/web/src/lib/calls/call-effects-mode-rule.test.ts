import { describe, expect, test } from 'bun:test';

import { addingLook } from './call-effects-mode-rule';

/**
 * P8b, loi 14 (`CallEffectsModeRule.addingLook` d'iOS) — « (+) Ajouter un autre look » ouvre
 * les looks d'un AUTRE genre, à poser par-dessus celui qu'on a : Visage et Couleur se cumulent.
 */
describe('(+) Ajouter un autre look', () => {
  test('d’un genre à l’autre, et retour', () => {
    expect(addingLook('face')).toBe('color');
    expect(addingLook('color')).toBe('face');
  });
});
