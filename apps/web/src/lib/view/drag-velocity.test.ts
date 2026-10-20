import { describe, expect, test } from 'bun:test';

import { predictedEndOf } from './drag-velocity';

/** LA FIN PROJETÉE D'UN GLISSÉ WEB (#11198) — l'élan du doigt au relâcher. */
describe('predictedEndOf — la fin projetée d’un glissé web', () => {
  test('un doigt immobile au relâcher projette sa propre position', () => {
    expect(predictedEndOf([{ t: 0, x: -200 }], -200)).toBe(-200);
    expect(predictedEndOf([], -120)).toBe(-120);
  });

  test('la vitesse des 100 dernières ms, projetée sur 200 ms', () => {
    const samples = [
      { t: 0, x: 0 },
      { t: 400, x: -40 },
      { t: 450, x: -80 },
      { t: 500, x: -120 },
    ];
    expect(predictedEndOf(samples, -120)).toBeCloseTo(-120 + (-80 / 100) * 200, 6);
  });

  test('un doigt qui revient vers l’origine projette EN DEÇÀ de sa position', () => {
    const samples = [
      { t: 0, x: -300 },
      { t: 60, x: -290 },
      { t: 100, x: -280 },
    ];
    expect(predictedEndOf(samples, -280)).toBeGreaterThan(-280);
  });
});
