import { describe, expect, test } from 'bun:test';

import { placeMessageMenuCluster, placePopover, placePopoverVertical, type MessageMenuClusterInput } from './popover';
import {
  MENU_GAP,
  MENU_WIDTH,
  PREVIEW_SCALE_FLOOR,
  RAIL_GAP,
  RAIL_HEIGHT,
  RAIL_WIDTH,
  SIDE_PADDING,
} from './message-menu-metrics';

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

/**
 * `placeMessageMenuCluster` — port de `MessageOverlayMenu.swift:230-289`
 * (#5814, T4). `clusterInput` pose une ancre RAISONNABLE (une rangée de
 * 88 px de haut, écran de 800 px) — chaque test surcharge le SEUL paramètre
 * qu'il fait varier.
 */
const clusterInput = (overrides: Partial<MessageMenuClusterInput> = {}): MessageMenuClusterInput => ({
  anchor: { top: 400, bottom: 488, left: 20, right: 370, width: 350, height: 88 },
  viewport: { width: 390, height: 800 },
  safe: { top: 0, bottom: 0 },
  menuHeight: 5 * 44 + 8,
  isMine: false,
  railHeight: RAIL_HEIGHT,
  railGap: RAIL_GAP,
  menuGap: MENU_GAP,
  sidePadding: SIDE_PADDING,
  menuWidth: MENU_WIDTH,
  railWidth: RAIL_WIDTH,
  previewScaleFloor: PREVIEW_SCALE_FLOOR,
  ...overrides,
});

describe('placeMessageMenuCluster — rail au-dessus, liste au-dessous, jamais hors écran', () => {
  test('rail AU-DESSUS de l’aperçu, liste AU-DESSOUS — gaps 12/6 tenus', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewTop - (placement.railTop + RAIL_HEIGHT)).toBe(RAIL_GAP);
    expect(placement.menuTop).toBeGreaterThan(placement.previewTop);
  });

  test('un cluster qui tient ⇒ previewScale === 1 (jamais agrandi ni réduit)', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewScale).toBe(1);
  });

  test('un aperçu trop haut pour la place disponible ⇒ scale réduit, plancher 0.4', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({
        anchor: { top: 400, bottom: 1400, left: 20, right: 370, width: 350, height: 1000 },
        viewport: { width: 390, height: 800 },
      }),
    );
    expect(placement.previewScale).toBeLessThan(1);
    expect(placement.previewScale).toBeGreaterThanOrEqual(PREVIEW_SCALE_FLOOR);
  });

  test('un aperçu ÉNORME est bloqué au plancher 0.4, jamais en dessous', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({
        anchor: { top: 400, bottom: 5400, left: 20, right: 370, width: 350, height: 5000 },
        viewport: { width: 390, height: 800 },
      }),
    );
    expect(placement.previewScale).toBe(PREVIEW_SCALE_FLOOR);
  });

  test('cluster clampé dans [safeTop+12, H-safeBottom-12]', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({ anchor: { top: 10, bottom: 98, left: 20, right: 370, width: 350, height: 88 }, safe: { top: 20, bottom: 20 } }),
    );
    expect(placement.railTop).toBeGreaterThanOrEqual(32);
  });

  test('ancre GAUCHE pour une rangée plate / une bulle reçue (isMine: false)', () => {
    const placement = placeMessageMenuCluster(clusterInput({ isMine: false }));
    expect(placement.anchorX).toBe(20 + 350 / 2);
  });

  test('ancre DROITE (maxX - w/2) pour une bulle envoyée (isMine: true)', () => {
    const placement = placeMessageMenuCluster(clusterInput({ isMine: true }));
    expect(placement.anchorX).toBe(370 - 350 / 2);
  });
});
