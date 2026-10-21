import { describe, expect, test } from 'bun:test';

import { placeMessageMenuCluster, placePopover, placePopoverVertical, type MessageMenuClusterInput } from './popover';
import {
  MENU_CHROME,
  MENU_GAP,
  MENU_ROW_HEIGHT,
  MENU_WIDTH,
  menuListHeight,
  PREVIEW_MIN_VISIBLE,
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
  previewMinHeight: PREVIEW_MIN_VISIBLE,
  ...overrides,
});

describe('placeMessageMenuCluster — rail au-dessus, liste au-dessous, jamais hors écran', () => {
  test('360×640, un menu groupé de 13 lignes et 3 traits : la liste est BORNÉE à l’écran, « Supprimer » reste atteignable (#11210, revue)', () => {
    const rows = 13;
    const menuHeight = rows * MENU_ROW_HEIGHT + MENU_CHROME + 3 * 9;
    const placement = placeMessageMenuCluster(
      clusterInput({ viewport: { width: 360, height: 640 }, anchor: { top: 300, bottom: 400, left: 16, right: 344, width: 328, height: 100 }, menuHeight }),
    );
    expect(placement.menuHiddenHeight).toBeGreaterThan(0);
    expect(placement.menuTop + placement.menuMaxHeight).toBeLessThanOrEqual(640 - 12);
    expect(placement.menuMaxHeight).toBeLessThan(menuHeight);
    expect(placement.menuMaxHeight).toBeGreaterThanOrEqual(2 * MENU_ROW_HEIGHT);
  });

  test('une liste qui tient n’est pas bornée en deçà de sa hauteur', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.menuMaxHeight).toBeGreaterThanOrEqual(5 * 44 + 8);
  });

  test('rail AU-DESSUS de l’aperçu, liste AU-DESSOUS — gaps 12/6 tenus', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewTop - (placement.railTop + RAIL_HEIGHT)).toBe(RAIL_GAP);
    expect(placement.menuTop).toBeGreaterThan(placement.previewTop);
  });

  test('un cluster qui tient ⇒ previewScale === 1 (jamais agrandi ni réduit)', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewScale).toBe(1);
  });

  test('un aperçu trop haut pour la place disponible ⇒ scale réduit, jamais sous le plancher', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({
        anchor: { top: 400, bottom: 1400, left: 20, right: 370, width: 350, height: 1000 },
        viewport: { width: 390, height: 800 },
      }),
    );
    expect(placement.previewScale).toBeLessThan(1);
    expect(placement.previewScale).toBeGreaterThanOrEqual(PREVIEW_SCALE_FLOOR);
  });

  test('un aperçu ÉNORME est bloqué au plancher, jamais en dessous', () => {
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

  test('#9043 — un cluster qui tient ne cache rien de la liste (menuHiddenHeight ≤ 0)', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.menuHiddenHeight).toBeLessThanOrEqual(0);
  });

  test('#9043 — sur un écran trop court même tronqué, le cluster dit EXACTEMENT ce que la liste perd sous le bas utile', () => {
    const input = clusterInput({
      anchor: { top: 100, bottom: 5100, left: 20, right: 370, width: 350, height: 5000 },
      viewport: { width: 640, height: 390 },
    });
    const placement = placeMessageMenuCluster(input);
    expect(placement.menuHiddenHeight).toBeCloseTo(placement.menuTop + input.menuHeight - (390 - 12), 6);
    expect(placement.menuHiddenHeight).toBeGreaterThan(0);
  });
});

/**
 * NETTETÉ ET MARGES PAR REFLOW (#11206) — l'aperçu ne touche jamais les bords :
 * une ancre plus large que l'écran moins deux marges se REFLUE à cette largeur,
 * elle n'est jamais réduite par `scale`. L'échelle ne sert plus qu'au
 * dépassement de HAUTEUR, plancher 0,75 ; au-delà, l'aperçu est tronqué.
 */
describe('placeMessageMenuCluster — marges par reflow, positions au pixel entier (#11206)', () => {
  const fullWidth = { top: 400, bottom: 488, left: 0, right: 390, width: 390, height: 88 };

  test('une ancre pleine largeur en 390 px donne un aperçu de 358 px à left 16, sans réduction', () => {
    const placement = placeMessageMenuCluster(clusterInput({ anchor: fullWidth }));
    expect(placement.previewWidth).toBe(358);
    expect(placement.previewLeft).toBe(SIDE_PADDING);
    expect(placement.previewScale).toBe(1);
  });

  test('une bulle envoyée pleine largeur reste elle aussi à 16 px du bord droit', () => {
    const placement = placeMessageMenuCluster(clusterInput({ anchor: fullWidth, isMine: true }));
    expect(placement.previewLeft + placement.previewWidth).toBe(390 - SIDE_PADDING);
  });

  test('une ancre étroite garde sa largeur et son bord', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewWidth).toBe(350);
    expect(placement.previewLeft).toBe(20);
  });

  test('une ancre débordant à gauche est ramenée dans [16, largeur − 16]', () => {
    const placement = placeMessageMenuCluster(clusterInput({ anchor: { top: 400, bottom: 488, left: -40, right: 160, width: 200, height: 88 } }));
    expect(placement.previewLeft).toBe(SIDE_PADDING);
  });

  test('une ancre trop haute est réduite au plus à 0,75 — jamais un texte rapetissé au-delà', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({ anchor: { top: 400, bottom: 1400, left: 20, right: 370, width: 350, height: 1000 } }),
    );
    expect(PREVIEW_SCALE_FLOOR).toBe(0.75);
    expect(placement.previewScale).toBeGreaterThanOrEqual(0.75);
    expect(placement.previewScale).toBeLessThan(1);
  });

  test('sous le plancher, l’aperçu est TRONQUÉ pour que TOUT le cluster tienne — rail, aperçu ET liste', () => {
    const input = clusterInput({ anchor: { top: 400, bottom: 5400, left: 20, right: 370, width: 350, height: 5000 } });
    const placement = placeMessageMenuCluster(input);
    expect(placement.previewHeight).toBe(800 - 24 - RAIL_HEIGHT - RAIL_GAP - MENU_GAP - input.menuHeight);
    expect(placement.previewClipHeight).toBeCloseTo(placement.previewHeight / placement.previewScale, 6);
    expect(placement.menuHiddenHeight).toBeLessThanOrEqual(0);
  });

  test('iPhone 390×844, deux photos portrait dépliées (954 px) : toute la liste est visible au repos', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({
        anchor: { top: 300, bottom: 1254, left: 20, right: 370, width: 350, height: 954 },
        viewport: { width: 390, height: 844 },
        safe: { top: 47, bottom: 34 },
        menuHeight: menuListHeight(7),
      }),
    );
    expect(placement.previewClipHeight).not.toBe(null);
    expect(placement.menuHiddenHeight).toBeLessThanOrEqual(0);
  });

  test('un écran trop court garde un aperçu d’au moins PREVIEW_MIN_VISIBLE — le glisser dégage le reste', () => {
    const input = clusterInput({
      anchor: { top: 100, bottom: 1100, left: 20, right: 370, width: 350, height: 1000 },
      viewport: { width: 640, height: 390 },
      menuHeight: menuListHeight(7),
    });
    const placement = placeMessageMenuCluster(input);
    expect(placement.previewHeight).toBe(PREVIEW_MIN_VISIBLE);
    expect(placement.menuHiddenHeight).toBeGreaterThan(0);
  });

  test('un aperçu qui tient n’est pas tronqué', () => {
    const placement = placeMessageMenuCluster(clusterInput());
    expect(placement.previewClipHeight).toBe(null);
    expect(placement.previewHeight).toBe(88);
  });

  test('sans rail (réagir refusé), l’aperçu reste à la place de la rangée', () => {
    const placement = placeMessageMenuCluster(clusterInput({ railHeight: 0, railGap: 0 }));
    expect(placement.previewTop).toBe(400);
    expect(placement.railTop).toBe(placement.previewTop);
  });

  test('toutes les positions sont des pixels entiers, même sur une ancre fractionnaire', () => {
    const placement = placeMessageMenuCluster(
      clusterInput({
        anchor: { top: 400.37, bottom: 1133.7, left: 21.4, right: 333.9, width: 312.5, height: 733.33 },
        viewport: { width: 390.5, height: 800.3 },
        safe: { top: 47.2, bottom: 33.6 },
      }),
    );
    const positions = [
      placement.railTop,
      placement.previewTop,
      placement.menuTop,
      placement.anchorX,
      placement.menuLeft,
      placement.railLeft,
      placement.previewLeft,
      placement.previewWidth,
    ];
    expect(positions.every(Number.isInteger)).toBe(true);
  });
});
