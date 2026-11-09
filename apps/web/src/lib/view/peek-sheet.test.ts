import { describe, expect, test } from 'bun:test';

import {
  PEEK_SETTLE_VELOCITY,
  detentAfterKey,
  detentProgress,
  initialDetent,
  peekSheetFrame,
  peekSheetHeights,
  progressAfterDrag,
  settleDetent,
  type PeekSheetFrameInput,
} from './peek-sheet';

/**
 * #17243 — L'APERÇU TENU EST GRAND, SON MENU COMPACT, ET ON TIRE LE MENU. La
 * loi est observée par ce qu'elle rend : la boîte de la grappe, les deux
 * hauteurs pour une progression donnée, le cran conclu au relâcher et le cran
 * d'ouverture.
 */

const phone = (overrides: Partial<PeekSheetFrameInput> = {}): PeekSheetFrameInput => ({
  viewport: { width: 390, height: 844 },
  safe: { top: 47, bottom: 34, left: 0, right: 0 },
  itemCount: 10,
  ...overrides,
});

describe('la boîte de la grappe', () => {
  test('quasi pleine largeur sur un téléphone, 12 de chaque côté', () => {
    const frame = peekSheetFrame(phone());
    expect(frame.width).toBe(390 - 24);
    expect(frame.left).toBe(12);
  });

  test('la largeur se plafonne sur un grand écran et la grappe se centre', () => {
    const frame = peekSheetFrame(phone({ viewport: { width: 1400, height: 900 }, safe: { top: 0, bottom: 0, left: 0, right: 0 } }));
    expect(frame.width).toBe(560);
    expect(frame.left).toBe((1400 - 560) / 2);
  });

  test('la hauteur évite l’encoche et l’indicateur d’accueil', () => {
    const frame = peekSheetFrame(phone());
    expect(frame.top).toBe(47 + 12);
    expect(frame.top + frame.height).toBe(844 - 34 - 12);
  });

  test('au repos, la carte prend la plus grande part et le menu ne montre que sa tête', () => {
    const frame = peekSheetFrame(phone());
    const rest = peekSheetHeights(frame, 0);
    expect(rest.card).toBeGreaterThan(rest.menu * 2);
    expect(rest.menu).toBe(frame.menuCompact);
    expect(rest.card + frame.gap + rest.menu).toBe(frame.height);
  });

  test('étendu, le menu montre toutes ses actions et la carte se réduit d’autant', () => {
    const frame = peekSheetFrame(phone());
    const rest = peekSheetHeights(frame, 0);
    const open = peekSheetHeights(frame, 1);
    expect(open.menu).toBe(frame.menuExpanded);
    expect(open.menu - rest.menu).toBe(7 * 44);
    expect(rest.card - open.card).toBe(open.menu - rest.menu);
  });

  test('la carte garde son en-tête lisible : le menu étendu s’arrête à la hauteur minimale de la carte', () => {
    const frame = peekSheetFrame(phone({ viewport: { width: 390, height: 560 }, itemCount: 16 }));
    const open = peekSheetHeights(frame, 1);
    expect(open.card).toBe(frame.cardMin);
  });

  test('un menu qui tient dans sa tête n’a pas de course', () => {
    const frame = peekSheetFrame(phone({ itemCount: 2 }));
    expect(frame.menuExpanded).toBe(frame.menuCompact);
  });

  test('une progression hors bornes est ramenée entre 0 et 1', () => {
    const frame = peekSheetFrame(phone());
    expect(peekSheetHeights(frame, -0.4)).toEqual(peekSheetHeights(frame, 0));
    expect(peekSheetHeights(frame, 1.7)).toEqual(peekSheetHeights(frame, 1));
  });
});

describe('le geste', () => {
  test('tirer vers le haut de toute la course étend, à moitié donne la moitié', () => {
    const frame = peekSheetFrame(phone());
    const travel = frame.menuExpanded - frame.menuCompact;
    expect(progressAfterDrag({ frame, from: 0, dy: -travel })).toBe(1);
    expect(progressAfterDrag({ frame, from: 0, dy: -travel / 2 })).toBe(0.5);
    expect(progressAfterDrag({ frame, from: 1, dy: travel / 4 })).toBe(0.75);
  });

  test('revenir en arrière avant de relâcher restaure', () => {
    const frame = peekSheetFrame(phone());
    expect(progressAfterDrag({ frame, from: 0, dy: 0 })).toBe(0);
    expect(progressAfterDrag({ frame, from: 0, dy: 80 })).toBe(0);
  });

  test('sans course, le geste ne bouge rien', () => {
    const frame = peekSheetFrame(phone({ itemCount: 1 }));
    expect(progressAfterDrag({ frame, from: 1, dy: -200 })).toBe(1);
  });

  test('relâché lentement, le cran le plus proche gagne au seuil de moitié', () => {
    expect(settleDetent({ progress: 0.49, velocity: 0 })).toBe('compact');
    expect(settleDetent({ progress: 0.5, velocity: 0 })).toBe('expanded');
  });

  test('relâché vite, la vélocité l’emporte sur la position', () => {
    expect(settleDetent({ progress: 0.2, velocity: -PEEK_SETTLE_VELOCITY })).toBe('expanded');
    expect(settleDetent({ progress: 0.9, velocity: PEEK_SETTLE_VELOCITY })).toBe('compact');
  });

  test('chaque cran a sa progression', () => {
    expect(detentProgress('compact')).toBe(0);
    expect(detentProgress('expanded')).toBe(1);
  });
});

describe('le cran d’ouverture', () => {
  const frame = peekSheetFrame(phone());

  test('ouvert au doigt ou à la souris, le menu est compact', () => {
    expect(initialDetent({ frame, reducedMotion: false, origin: 'press' })).toBe('compact');
    expect(initialDetent({ frame, reducedMotion: false, origin: 'pointer' })).toBe('compact');
  });

  test('ouvert au clavier, toutes les actions sont là sans geste', () => {
    expect(initialDetent({ frame, reducedMotion: false, origin: 'keyboard' })).toBe('expanded');
  });

  test('sous « Réduire les animations », le menu s’ouvre étendu', () => {
    expect(initialDetent({ frame, reducedMotion: true, origin: 'press' })).toBe('expanded');
  });

  test('un menu sans course s’ouvre étendu : il n’y a rien à tirer', () => {
    expect(initialDetent({ frame: peekSheetFrame(phone({ itemCount: 2 })), reducedMotion: false, origin: 'press' })).toBe('expanded');
  });
});

describe('la poignée au clavier', () => {
  test('Entrée et Espace basculent', () => {
    expect(detentAfterKey('compact', 'Enter')).toBe('expanded');
    expect(detentAfterKey('expanded', ' ')).toBe('compact');
  });

  test('flèche haut étend, flèche bas replie', () => {
    expect(detentAfterKey('compact', 'ArrowUp')).toBe('expanded');
    expect(detentAfterKey('expanded', 'ArrowUp')).toBe('expanded');
    expect(detentAfterKey('expanded', 'ArrowDown')).toBe('compact');
  });

  test('une autre touche n’est pas la sienne', () => {
    expect(detentAfterKey('compact', 'Tab')).toBeNull();
  });
});
