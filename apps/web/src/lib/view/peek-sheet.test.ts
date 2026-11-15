import { describe, expect, test } from 'bun:test';

import {
  PEEK_SCALE,
  PEEK_SETTLE_VELOCITY,
  detentAfterKey,
  detentProgress,
  initialDetent,
  peekSheetFrame,
  peekSheetHeights,
  peekSheetOffsets,
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
  test('#17274 — sur un téléphone, la grappe prend 80 % de la largeur utile et se centre : la liste reste visible des deux côtés', () => {
    const frame = peekSheetFrame(phone());
    expect(frame.width).toBe(Math.round((390 - 24) * PEEK_SCALE));
    expect(frame.left + frame.width / 2).toBe(390 / 2);
    expect(frame.left).toBeGreaterThan(40);
  });

  test('#17274 — sur un grand écran, la largeur se plafonne à 80 % de 560 et la grappe se centre', () => {
    const frame = peekSheetFrame(phone({ viewport: { width: 1400, height: 900 }, safe: { top: 0, bottom: 0, left: 0, right: 0 } }));
    expect(frame.width).toBe(448);
    expect(frame.left).toBe((1400 - 448) / 2);
  });

  test('#17274 — au cran compact, la carte fait 80 % de la hauteur qu’elle prenait en remplissant l’écran', () => {
    const frame = peekSheetFrame(phone());
    const full = 844 - 47 - 34 - 2 * 12;
    expect(peekSheetHeights(frame, 0).card).toBe(Math.round((full - frame.gap - frame.menuCompact) * PEEK_SCALE));
  });

  test('la hauteur évite l’encoche et l’indicateur d’accueil, et la grappe se centre entre les deux en laissant voir la liste', () => {
    const frame = peekSheetFrame(phone());
    const above = frame.top - (47 + 12);
    const below = 844 - 34 - 12 - (frame.top + frame.height);
    expect(above).toBeGreaterThan(40);
    expect(above).toBe(below);
  });

  test('#17274 — la réduction ne mange jamais la hauteur minimale de la carte', () => {
    const frame = peekSheetFrame(phone({ viewport: { width: 390, height: 420 }, itemCount: 10 }));
    expect(peekSheetHeights(frame, 0).card).toBeGreaterThanOrEqual(frame.cardMin);
    expect(peekSheetHeights(frame, 1).card).toBeGreaterThanOrEqual(frame.cardMin);
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

  test('la carte garde de quoi lire : le menu étendu s’arrête à la hauteur minimale de la carte', () => {
    const frame = peekSheetFrame(phone({ viewport: { width: 390, height: 560 }, itemCount: 16 }));
    const open = peekSheetHeights(frame, 1);
    expect(open.card).toBe(frame.cardMin);
  });

  test('un menu plus haut que la place laissée déborde, et défile une fois étendu', () => {
    expect(peekSheetFrame(phone({ viewport: { width: 390, height: 560 }, itemCount: 16 })).menuOverflows).toBe(true);
    expect(peekSheetFrame(phone()).menuOverflows).toBe(false);
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

describe('par transformations seulement (le geste ne remet rien en page)', () => {
  test('compact : le menu est décalé de toute la course, le contenu en place', () => {
    const frame = peekSheetFrame(phone());
    const travel = frame.menuExpanded - frame.menuCompact;
    expect(peekSheetOffsets(frame, 0)).toEqual({ sheet: travel, content: 0 });
  });

  test('étendu : le menu est en place, le contenu remonte de toute la course pour rester au-dessus de lui', () => {
    const frame = peekSheetFrame(phone());
    const travel = frame.menuExpanded - frame.menuCompact;
    expect(peekSheetOffsets(frame, 1)).toEqual({ sheet: 0, content: travel });
  });

  test('les décalages suivent les hauteurs : la carte visible et le menu visible se partagent toujours la même hauteur', () => {
    const frame = peekSheetFrame(phone());
    const half = peekSheetOffsets(frame, 0.5);
    const heights = peekSheetHeights(frame, 0.5);
    expect(frame.menuExpanded - half.sheet).toBe(heights.menu);
    expect(peekSheetHeights(frame, 0).card - half.content).toBe(heights.card);
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
