/**
 * WF-110 — `focal-metrics.ts`.
 *
 * §4.4 du contrat Focal, mot pour mot : « alpha = min(alphaCeiling,
 * alphaPerspective) ». Vecteurs directement dérivés de l'exemple du contrat
 * (« confirmée à 1.0 », matrice F13).
 */
import {
  FOCAL_OPTIMISTIC_ALPHA_CEILING,
  FOCAL_CONFIRMED_ALPHA,
  applyOptimisticAlphaCeiling,
} from '../focal-metrics';

describe('applyOptimisticAlphaCeiling', () => {
  it('le plafond optimiste vaut 0.7 (contrat §3.11/§4.4)', () => {
    expect(FOCAL_OPTIMISTIC_ALPHA_CEILING).toBe(0.7);
  });

  it('rangée optimiste : plafonne à 0.7 même si la perspective autoriserait plus', () => {
    expect(applyOptimisticAlphaCeiling(1, true)).toBe(0.7);
    expect(applyOptimisticAlphaCeiling(0.9, true)).toBe(0.7);
  });

  it('rangée optimiste : sous 0.7, la perspective l\'emporte (min)', () => {
    expect(applyOptimisticAlphaCeiling(0.3, true)).toBeCloseTo(0.3);
  });

  it('rangée confirmée (F13 : "confirmée à 1.0") : le plafond ne s\'applique jamais', () => {
    expect(applyOptimisticAlphaCeiling(1, false)).toBe(FOCAL_CONFIRMED_ALPHA);
    expect(applyOptimisticAlphaCeiling(0.5, false)).toBeCloseTo(0.5);
  });
});
