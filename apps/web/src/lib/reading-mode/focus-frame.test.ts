import { describe, expect, test } from 'bun:test';

import { FOCAL_METRICS } from '@meeshy/shared/utils/focal-metrics';

import { focusFrame, type FocusFrameMeasure } from './focus-frame';
import { FOCUS_CARD_INNER_MARGIN, FOCUS_CONTENT_AIR, FOCUS_NEIGHBOUR_CLEARANCE } from './metrics';

/**
 * LE CADRE DE L'ÉLU — #8506 (« place les contrôleurs à l'intérieur du cadre »)
 * puis #8536 (directive porteur 2026-09-28) : « Seul le contenu grandit : la
 * date, le bouton de changement de langue, l'auteur et son avatar doivent
 * rester à la taille originale. Enfin le bloc de verre doit avoir de la marge
 * haut et bas pour que le contenu soit aéré ! »
 */
const measure = (overrides: Partial<FocusFrameMeasure> = {}): FocusFrameMeasure => ({
  rowTop: 100,
  rowBottom: 200,
  cardTop: 103,
  cardBottom: 197,
  contentRoom: 320,
  contentWidth: 150,
  contentHeight: 40,
  ...overrides,
});

const FULL = 1 + FOCAL_METRICS.loupeGain;

describe('focusFrame — la loupe ne grossit que le contenu', () => {
  test('un message court grossit du gain plein, ×1,26', () => {
    expect(FULL).toBeCloseTo(1.05 * 1.2, 2);
    expect(focusFrame({ ...measure(), reducedMotion: false }).scale).toBeCloseTo(FULL, 10);
  });

  test('un message HAUT grossit aussi du gain plein : le cadre grandit avec lui', () => {
    const frame = focusFrame({ ...measure({ contentHeight: 800 }), reducedMotion: false });
    expect(frame.scale).toBeCloseTo(FULL, 10);
    expect(frame.grow).toBeCloseTo((FULL - 1) * 800, 6);
  });

  test('le contenu grossi tient dans sa place jusqu’au bord de fin du cadre, marge comprise ; au-delà, la loupe se réduit', () => {
    const frame = focusFrame({ ...measure({ contentWidth: 280 }), reducedMotion: false });
    expect(frame.scale).toBeGreaterThan(1);
    expect(frame.scale).toBeLessThan(FULL);
    expect(frame.scale * 280 + FOCUS_CARD_INNER_MARGIN).toBeCloseTo(320, 6);
  });

  test('un contenu qui remplit déjà sa place ne grossit pas, et ne rétrécit jamais', () => {
    expect(focusFrame({ ...measure({ contentWidth: 315 }), reducedMotion: false }).scale).toBe(1);
  });

  test('la croissance est celle de la HAUTEUR du contenu, rien d’autre', () => {
    const frame = focusFrame({ ...measure(), reducedMotion: false });
    expect(frame.grow).toBeCloseTo((frame.scale - 1) * 40, 10);
  });

  test('Réduire le mouvement ⇒ aucun agrandissement, aucune croissance', () => {
    const frame = focusFrame({ ...measure(), reducedMotion: true });
    expect(frame.scale).toBe(1);
    expect(frame.grow).toBe(0);
  });
});

describe('focusFrame — le verre respire autour du contenu', () => {
  test('une marge haute ET basse entoure le contenu grossi', () => {
    expect(FOCUS_CONTENT_AIR).toBeGreaterThan(0);
    expect(focusFrame({ ...measure(), reducedMotion: false }).air).toBe(FOCUS_CONTENT_AIR);
  });

  test('l’air ne dépend pas du mouvement : c’est de la mise en page, pas une animation', () => {
    expect(focusFrame({ ...measure(), reducedMotion: true }).air).toBe(FOCUS_CONTENT_AIR);
  });
});

describe('focusFrame — les voisines s’écartent', () => {
  test('le cadre s’allonge vers le bas de la croissance et des deux marges d’air ; la voisine du dessous s’écarte d’autant', () => {
    const frame = focusFrame({ ...measure(), reducedMotion: false });
    const overflow = 197 + frame.grow + 2 * FOCUS_CONTENT_AIR - 200;
    expect(frame.pushDown).toBeCloseTo(overflow + FOCUS_NEIGHBOUR_CLEARANCE, 6);
  });

  test('le contenu grossit vers le bas : la voisine du dessus ne bouge pas quand le cadre tient en haut de sa rangée', () => {
    expect(focusFrame({ ...measure(), reducedMotion: false }).pushUp).toBe(0);
  });

  test("un cadre qui déborde au repos vers le haut (identité d'une suite) écarte la voisine du dessus, même sous Réduire le mouvement", () => {
    const frame = focusFrame({ ...measure({ cardTop: 50 }), reducedMotion: true });
    expect(frame.pushUp).toBe(50 + FOCUS_NEIGHBOUR_CLEARANCE);
  });

  test('un cadre qui tient encore dans sa rangée une fois allongé ne pousse personne', () => {
    const frame = focusFrame({ ...measure({ rowBottom: 400 }), reducedMotion: false });
    expect(frame.pushDown).toBe(0);
  });
});
