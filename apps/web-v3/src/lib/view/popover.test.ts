import { describe, expect, test } from 'bun:test';

import { placePopover } from './popover';

/**
 * LA GÉOMÉTRIE MESURÉE DU DÉFAUT (#5566) : chip du fil sur un écran de 390 px,
 * son bord droit à 240, menu souhaité à 256 px, marge 8. Aligné à droite de
 * l'ancre, le menu commençait à `x = −16` — un quart hors de l'écran.
 */
const VIEWPORT = 390;
const MARGIN = 8;
const WIDTH = 256;

const leftEdgeOf = (anchorRight: number, box: { right: number; width: number }): number =>
  anchorRight - box.right - box.width;

describe('placePopover — jamais hors de l’écran', () => {
  test('une ancre trop à gauche pousse le panneau vers la droite, marge tenue', () => {
    const box = placePopover({ anchorRight: 240, viewportWidth: VIEWPORT, preferredWidth: WIDTH, margin: MARGIN });
    expect(leftEdgeOf(240, box)).toBe(MARGIN);
    expect(box.width).toBe(WIDTH);
    expect(box.right).toBe(-24);
  });

  test('le bord DROIT reste lui aussi dans l’écran', () => {
    const box = placePopover({ anchorRight: 240, viewportWidth: VIEWPORT, preferredWidth: WIDTH, margin: MARGIN });
    expect(240 - box.right <= VIEWPORT - MARGIN).toBe(true);
  });

  test('une ancre qui laisse la place garde l’alignement à droite (right = 0)', () => {
    const box = placePopover({ anchorRight: 382, viewportWidth: VIEWPORT, preferredWidth: WIDTH, margin: MARGIN });
    expect(box.right).toBe(0);
    expect(leftEdgeOf(382, box)).toBe(126);
  });

  test('un écran plus étroit que le panneau le RÉTRÉCIT au lieu de le laisser déborder', () => {
    const narrow = 200;
    const box = placePopover({ anchorRight: 190, viewportWidth: narrow, preferredWidth: WIDTH, margin: MARGIN });
    expect(box.width).toBe(narrow - 2 * MARGIN);
    expect(leftEdgeOf(190, box)).toBe(MARGIN);
    expect(190 - box.right <= narrow - MARGIN).toBe(true);
  });

  test('le panneau ne se décale JAMAIS vers la gauche de son ancre', () => {
    for (const anchorRight of [16, 120, 240, 300, 382]) {
      const box = placePopover({ anchorRight, viewportWidth: VIEWPORT, preferredWidth: WIDTH, margin: MARGIN });
      expect(box.right <= 0).toBe(true);
    }
  });
});
