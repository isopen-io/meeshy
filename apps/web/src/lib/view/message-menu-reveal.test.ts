import { describe, expect, test } from 'bun:test';

import { MENU_CHROME, MENU_ROW_HEIGHT, RAIL_LENGTH_FACTOR, RAIL_WIDTH, menuListHeight, railBandWidth } from './message-menu-metrics';
import {
  REVEAL_MINIMUM_FACTOR,
  revealFloor,
  revealRestingFactor,
  revealRise,
  revealSplit,
} from './message-menu-reveal';

/**
 * #9043 — miroir de `MessageOverlayRevealLawTests.swift` : la BANDE d'emojis
 * s'allonge de ×1,4 (tuiles et entrées du menu gardent leur taille), et
 * glisser vers le haut réduit l'aperçu pour dégager le menu coupé.
 */
describe('la bande d’emojis (×1,4), le menu préservé', () => {
  test('le facteur de la directive est 1,4', () => {
    expect(RAIL_LENGTH_FACTOR).toBe(1.4);
  });

  test('avec la place, la bande mesure sa largeur de référence × 1,4', () => {
    expect(railBandWidth(1000)).toBeCloseTo(RAIL_WIDTH * 1.4, 6);
  });

  test('sur un écran étroit, la bande s’arrête à la largeur disponible', () => {
    expect(railBandWidth(343)).toBe(343);
  });

  test('une entrée du menu garde la hauteur du menu système', () => {
    expect(MENU_ROW_HEIGHT).toBe(44);
  });

  test('la zone de cinq entrées garde sa hauteur', () => {
    expect(menuListHeight(5)).toBe(5 * 44 + MENU_CHROME);
  });
});

describe('revealFloor — jusqu’où l’aperçu se réduit', () => {
  test('menu entièrement visible ⇒ aucune réduction (1)', () => {
    expect(revealFloor({ hiddenHeight: 0, shrinkableHeight: 500 })).toBe(1);
    expect(revealFloor({ hiddenHeight: -30, shrinkableHeight: 500 })).toBe(1);
  });

  test('menu coupé ⇒ juste ce qu’il faut pour le dégager', () => {
    expect(revealFloor({ hiddenHeight: 100, shrinkableHeight: 500 })).toBeCloseTo(0.8, 6);
  });

  test('menu coupé au-delà de la borne ⇒ jamais sous 0,4', () => {
    expect(REVEAL_MINIMUM_FACTOR).toBe(0.4);
    expect(revealFloor({ hiddenHeight: 900, shrinkableHeight: 500 })).toBe(0.4);
  });

  test('aucun aperçu réductible ⇒ 1', () => {
    expect(revealFloor({ hiddenHeight: 100, shrinkableHeight: 0 })).toBe(1);
  });
});

describe('revealSplit — le doigt réduit d’abord l’aperçu, le reste ne réduit rien', () => {
  test('vers le haut : le menu suit le doigt un pour un', () => {
    const split = revealSplit({ translation: -50, committed: 1, floor: 0.8, shrinkableHeight: 500 });
    expect(split.factor).toBeCloseTo(0.9, 6);
    expect(split.residual).toBeCloseTo(0, 6);
    expect(revealRise({ factor: split.factor, shrinkableHeight: 500 })).toBeCloseTo(50, 6);
  });

  test('au-delà du plancher : la réduction s’arrête, le reste est rendu', () => {
    const split = revealSplit({ translation: -180, committed: 1, floor: 0.8, shrinkableHeight: 500 });
    expect(split.factor).toBeCloseTo(0.8, 6);
    expect(split.residual).toBeCloseTo(-80, 6);
  });

  test('menu non coupé : rien ne se réduit', () => {
    const split = revealSplit({ translation: -90, committed: 1, floor: 1, shrinkableHeight: 500 });
    expect(split.factor).toBe(1);
    expect(split.residual).toBeCloseTo(-90, 6);
  });

  test('vers le bas depuis un état réduit : la taille revient d’abord', () => {
    const split = revealSplit({ translation: 30, committed: 0.8, floor: 0.8, shrinkableHeight: 500 });
    expect(split.factor).toBeCloseTo(0.86, 6);
    expect(split.residual).toBeCloseTo(0, 6);
  });

  test('vers le bas au-delà de la pleine taille : le reste est rendu', () => {
    const split = revealSplit({ translation: 200, committed: 0.8, floor: 0.8, shrinkableHeight: 500 });
    expect(split.factor).toBeCloseTo(1, 6);
    expect(split.residual).toBeCloseTo(100, 6);
  });

  test('le relâchement GARDE l’état atteint : le geste suivant en repart', () => {
    const first = revealSplit({ translation: -40, committed: 1, floor: 0.6, shrinkableHeight: 400 });
    const second = revealSplit({ translation: 0, committed: first.factor, floor: 0.6, shrinkableHeight: 400 });
    expect(second.factor).toBeCloseTo(0.9, 6);
  });

  test('aucun aperçu réductible : jamais de division par zéro', () => {
    const split = revealSplit({ translation: -60, committed: 1, floor: 1, shrinkableHeight: 0 });
    expect(split.factor).toBe(1);
    expect(split.residual).toBeCloseTo(-60, 6);
  });
});

describe('revealRestingFactor — le menu reste atteignable sans le geste', () => {
  test('sans aide technique : pleine taille', () => {
    expect(revealRestingFactor({ floor: 0.7, assistiveReveal: false })).toBe(1);
  });

  test('aide technique (lecteur d’écran, clavier) : ouvert déjà réduit', () => {
    expect(revealRestingFactor({ floor: 0.7, assistiveReveal: true })).toBe(0.7);
  });
});
