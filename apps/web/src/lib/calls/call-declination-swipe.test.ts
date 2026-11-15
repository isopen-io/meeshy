import { describe, expect, test } from 'bun:test';

import { AXIS_LATCH_PX, declinationOffset, declinationTarget, latchAxis } from './call-declination-swipe';

/**
 * LE BALAYAGE DES DÉCLINAISONS D'UN CADRE (#12685, #17821 C1.6) — la loi pure, jumelle de
 * `CallFrameDeclinationSwipe` d'iOS : l'axe se lit au premier mouvement et se garde tout le
 * toucher ; la page suit le doigt sur une page au plus et résiste aux bords ; elle ne change
 * qu'au-delà de 30 % de la hauteur ou sur un élan de 60 %, jamais de plus d'une page, sans boucler.
 */

const HEIGHT = 85;

describe('latchAxis', () => {
  test('rien ne se décide sous le seuil de 8 px', () => {
    expect(latchAxis({ dx: 3, dy: 5 })).toBeNull();
    expect(AXIS_LATCH_PX).toBe(8);
  });

  test('la direction dominante décide ; l’horizontal reste au carrousel', () => {
    expect(latchAxis({ dx: 2, dy: -9 })).toBe('vertical');
    expect(latchAxis({ dx: 12, dy: 5 })).toBe('horizontal');
  });
});

describe('declinationOffset', () => {
  test('la page suit le doigt, sur une page au plus', () => {
    expect(declinationOffset({ translation: -20, height: HEIGHT, index: 0, count: 3 })).toBe(-20);
    expect(declinationOffset({ translation: -300, height: HEIGHT, index: 1, count: 3 })).toBe(-HEIGHT);
    expect(declinationOffset({ translation: 300, height: HEIGHT, index: 1, count: 3 })).toBe(HEIGHT);
  });

  test('aux bords, elle résiste : on ne tire pas dans le vide', () => {
    const resisted = declinationOffset({ translation: 40, height: HEIGHT, index: 0, count: 2 });
    expect(resisted).toBeGreaterThan(0);
    expect(resisted).toBeLessThan(40 / 2);
    expect(declinationOffset({ translation: -40, height: HEIGHT, index: 1, count: 2 })).toBeLessThan(0);
    expect(declinationOffset({ translation: -40, height: HEIGHT, index: 1, count: 2 })).toBeGreaterThan(-20);
  });
});

describe('declinationTarget', () => {
  test('en deçà de 30 % de la hauteur et sans élan, la page revient', () => {
    expect(declinationTarget({ translation: -20, velocity: 0, height: HEIGHT, index: 0, count: 2 })).toBe(0);
  });

  test('au-delà de 30 %, vers le haut, la déclinaison suivante ; vers le bas, la précédente', () => {
    expect(declinationTarget({ translation: -30, velocity: 0, height: HEIGHT, index: 0, count: 3 })).toBe(1);
    expect(declinationTarget({ translation: 30, velocity: 0, height: HEIGHT, index: 2, count: 3 })).toBe(1);
  });

  test('un élan suffit : la fin projetée dépasse 60 % de la hauteur', () => {
    expect(declinationTarget({ translation: -12, velocity: -0.6, height: HEIGHT, index: 0, count: 2 })).toBe(1);
  });

  test('jamais de plus d’une page, et sans boucler', () => {
    expect(declinationTarget({ translation: -400, velocity: -3, height: HEIGHT, index: 0, count: 5 })).toBe(1);
    expect(declinationTarget({ translation: -60, velocity: 0, height: HEIGHT, index: 1, count: 2 })).toBe(1);
    expect(declinationTarget({ translation: 60, velocity: 0, height: HEIGHT, index: 0, count: 2 })).toBe(0);
  });
});
