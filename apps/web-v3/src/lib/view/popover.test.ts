import { describe, expect, test } from 'bun:test';

import { placePopover, placePopoverVertical } from './popover';

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

/**
 * LA GÉOMÉTRIE MESURÉE DU DÉFAUT (#5559 revue-correction, défaut 7) : menu de
 * 4 actions (`RowActions`) ouvert sur la DERNIÈRE rangée d'un écran de
 * 390×640 (un Android d'entrée de gamme, ou tout téléphone en paysage) — le
 * panneau mesurait 549→735 pour une fenêtre de 640, débordant de 95 px, et
 * « Non lu »/« Archiver » (les deux dernières lignes) tombaient hors écran.
 */
describe('placePopoverVertical — jamais hors du bas de l’écran', () => {
  const GAP = 4;
  const MARGIN_V = 8;
  /** 4 lignes de 44 + le rembourrage `py-1` (8) du panneau, comme `RowActions`. */
  const MENU_HEIGHT = 4 * 44 + 8;
  /** Le bouton d'actions fait 34 de haut (`BUTTON_SIZE`, `row-actions.tsx`). */
  const anchorOf = (bottom: number) => ({ anchorTop: bottom - 34, anchorBottom: bottom });

  test('un panneau qui tient EN DESSOUS y reste (390×844, la référence des captures)', () => {
    const box = placePopoverVertical({
      ...anchorOf(545),
      viewportHeight: 844,
      estimatedHeight: MENU_HEIGHT,
      gap: GAP,
      margin: MARGIN_V,
    });
    expect(box.top).toBe(549);
    expect(box.top + MENU_HEIGHT <= 844 - MARGIN_V).toBe(true);
  });

  test('la géométrie EXACTE du défaut rapporté (390×640) : le panneau se RETOURNE au-dessus', () => {
    const box = placePopoverVertical({
      ...anchorOf(545),
      viewportHeight: 640,
      estimatedHeight: MENU_HEIGHT,
      gap: GAP,
      margin: MARGIN_V,
    });
    // En dessous, il aurait fallu 549 + 184 + 8 = 741 > 640 : impossible.
    expect(box.top < 545).toBe(true);
    expect(box.top >= MARGIN_V).toBe(true);
    // Les QUATRE lignes tiennent désormais dans l'écran, marge comprise.
    expect(box.top + MENU_HEIGHT <= 640 - MARGIN_V).toBe(true);
  });

  test('ni en dessous ni au-dessus : le panneau se RABAT sur la marge du bas', () => {
    const box = placePopoverVertical({
      anchorTop: 100,
      anchorBottom: 134,
      viewportHeight: 200,
      estimatedHeight: MENU_HEIGHT,
      gap: GAP,
      margin: MARGIN_V,
    });
    expect(box.top).toBe(MARGIN_V);
  });

  test('un panneau qui tiendrait pile SOUS la marge ne se retourne pas pour rien', () => {
    const box = placePopoverVertical({
      ...anchorOf(100),
      viewportHeight: 300,
      estimatedHeight: MENU_HEIGHT,
      gap: GAP,
      margin: MARGIN_V,
    });
    expect(box.top).toBe(104);
  });
});
