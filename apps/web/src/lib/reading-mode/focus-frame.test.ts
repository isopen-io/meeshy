import { describe, expect, test } from 'bun:test';

import { FOCAL_METRICS } from '@meeshy/shared/utils/focal-metrics';

import { focusFrame, inkRuns, type FocusFrameMeasure } from './focus-frame';
import { FOCUS_CARD_INNER_MARGIN, FOCUS_NEIGHBOUR_CLEARANCE } from './metrics';

/**
 * LE CADRE DE L'ÉLU (#8506) — directive porteur 2026-09-28 : « place les
 * contrôleurs et détails à l'intérieur du cadre, en laissant de l'espace sur
 * les bords ; agrandis tout le contenu intérieur par ×1,2 encore ».
 */
const measure = (overrides: Partial<FocusFrameMeasure> = {}): FocusFrameMeasure => ({
  rowTop: 100,
  rowBottom: 160,
  cardTop: 103,
  cardBottom: 157,
  cardWidth: 370,
  contentExtent: 150,
  ...overrides,
});

const FULL = 1 + FOCAL_METRICS.loupeGain;

describe('focusFrame — la loupe', () => {
  test('un message court grossit du gain plein, ×1,26', () => {
    expect(FULL).toBeCloseTo(1.05 * 1.2, 2);
    expect(focusFrame({ ...measure(), reducedMotion: false }).scale).toBeCloseTo(FULL, 10);
  });

  test('un message HAUT grossit aussi du gain plein : le cadre grandit avec lui', () => {
    const tall = measure({ rowTop: 0, rowBottom: 900, cardTop: 3, cardBottom: 897 });
    expect(focusFrame({ ...tall, reducedMotion: false }).scale).toBeCloseTo(FULL, 10);
  });

  test('le contenu grossi tient dans le cadre, marge comprise ; au-delà, la loupe se réduit', () => {
    const frame = focusFrame({ ...measure({ contentExtent: 300 }), reducedMotion: false });
    expect(frame.scale).toBeGreaterThan(1);
    expect(frame.scale).toBeLessThan(FULL);
    expect(frame.scale * (300 + FOCUS_CARD_INNER_MARGIN)).toBeCloseTo(370, 6);
  });

  test('un contenu qui remplit déjà toute la largeur ne grossit pas, et ne rétrécit jamais', () => {
    expect(focusFrame({ ...measure({ contentExtent: 365 }), reducedMotion: false }).scale).toBe(1);
  });

  test('Réduire le mouvement ⇒ aucun agrandissement', () => {
    expect(focusFrame({ ...measure(), reducedMotion: true }).scale).toBe(1);
  });
});

describe('focusFrame — les marges et le tampon', () => {
  test("le tampon, ancré au bord de FIN, s'y tient à la même marge grossie que les autres bords", () => {
    const { scale, endShift } = focusFrame({ ...measure(), reducedMotion: false });
    const stampEnd = scale * (370 - FOCUS_CARD_INNER_MARGIN + endShift);
    expect(stampEnd).toBeCloseTo(370 - scale * FOCUS_CARD_INNER_MARGIN, 6);
  });

  test('sans loupe, le tampon ne bouge pas', () => {
    expect(focusFrame({ ...measure(), reducedMotion: true }).endShift).toBe(0);
  });

  test("l'origine verticale est le centre du cadre, relevé depuis le haut de la rangée", () => {
    expect(focusFrame({ ...measure(), reducedMotion: false }).originY).toBe(30);
  });
});

describe('focusFrame — les voisines s’écartent', () => {
  test('un cadre qui tient dans sa rangée, sans loupe, ne pousse personne', () => {
    const frame = focusFrame({ ...measure(), reducedMotion: true });
    expect(frame.pushUp).toBe(0);
    expect(frame.pushDown).toBe(0);
  });

  test('elles s’écartent de la croissance RÉELLE du cadre, plus un jour', () => {
    const frame = focusFrame({ ...measure({ cardTop: 90, cardBottom: 170 }), reducedMotion: false });
    const grown = FULL * 40 - 30;
    expect(frame.pushUp).toBeCloseTo(grown + FOCUS_NEIGHBOUR_CLEARANCE, 6);
    expect(frame.pushDown).toBeCloseTo(grown + FOCUS_NEIGHBOUR_CLEARANCE, 6);
  });

  test("sous Réduire le mouvement, un cadre qui déborde au repos écarte quand même ses voisines (identité d'une suite)", () => {
    const frame = focusFrame({ ...measure({ cardTop: 50 }), reducedMotion: true });
    expect(frame.pushUp).toBe(50 + FOCUS_NEIGHBOUR_CLEARANCE);
    expect(frame.pushDown).toBe(0);
  });
});

describe('inkRuns — l’encre d’un nœud texte', () => {
  test('les espaces qui pendent en fin de ligne (pre-wrap) ne sont pas de l’encre', () => {
    expect(inkRuns('Un aparté : le composeur grandit bien avec le texte long.')).toEqual([
      [0, 2],
      [3, 9],
      [10, 11],
      [12, 14],
      [15, 24],
      [25, 32],
      [33, 37],
      [38, 42],
      [43, 45],
      [46, 51],
      [52, 57],
    ]);
  });

  test('un texte blanc n’a aucune encre, les blancs de bord sont écartés', () => {
    expect(inkRuns('   \n\t ')).toEqual([]);
    expect(inkRuns('  mot  ')).toEqual([[2, 5]]);
  });
});
