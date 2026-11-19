import { describe, expect, it } from 'vitest';

import { estimateCallMos } from './call-mos';

/**
 * #19876 — le MOS d'un appel, porté de `CallMOS.estimate` (MeeshySDK) : les
 * cas et les valeurs attendues sont ceux de `CallMOSTests.swift`, pour qu'un
 * même lien rende la même note sur iOS et sur le web.
 */
describe('estimateCallMos', () => {
  it('un lien propre est excellent', () => {
    expect(estimateCallMos({ roundTripTimeMs: 0, jitterMs: 0, packetLossPercent: 0 })).toBeGreaterThan(4.3);
  });

  it('un lien mobile ordinaire est bon', () => {
    const mos = estimateCallMos({ roundTripTimeMs: 200, jitterMs: 20, packetLossPercent: 2 });
    expect(Math.abs(mos - 3.76)).toBeLessThanOrEqual(0.05);
  });

  it('un lien cassé est mauvais', () => {
    expect(estimateCallMos({ roundTripTimeMs: 600, jitterMs: 50, packetLossPercent: 10 })).toBeLessThan(1.5);
  });

  it('la note baisse à chaque palier de perte', () => {
    const pertes = [0, 1, 3, 8, 20].map((packetLossPercent) => estimateCallMos({ roundTripTimeMs: 100, jitterMs: 10, packetLossPercent }));
    expect(pertes).toEqual([...pertes].sort((a, b) => b - a));
    expect(new Set(pertes).size).toBe(pertes.length);
  });

  it('la note baisse quand le délai monte', () => {
    const delais = [50, 200, 400, 800].map((roundTripTimeMs) => estimateCallMos({ roundTripTimeMs, jitterMs: 10, packetLossPercent: 1 }));
    expect(delais).toEqual([...delais].sort((a, b) => b - a));
  });

  it('la note reste dans l’intervalle que la passerelle accepte, même sur des mesures aberrantes', () => {
    const extremes = [
      estimateCallMos({ roundTripTimeMs: -50, jitterMs: -1, packetLossPercent: -3 }),
      estimateCallMos({ roundTripTimeMs: 100_000, jitterMs: 10_000, packetLossPercent: 100 }),
      estimateCallMos({ roundTripTimeMs: Number.NaN, jitterMs: 0, packetLossPercent: 0 }),
    ];
    extremes.forEach((mos) => {
      expect(mos).toBeGreaterThanOrEqual(1);
      expect(mos).toBeLessThanOrEqual(4.5);
    });
  });
});
