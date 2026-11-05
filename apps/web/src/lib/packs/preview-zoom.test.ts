import { describe, expect, test } from 'bun:test';

import { MAX_ZOOM, MIN_ZOOM, isZoomed, toggleZoom, wheelZoom, zoomBy } from './preview-zoom';

/**
 * **LE ZOOM DU PLEIN ÉCRAN** (#16267, précision du porteur) — molette ou pincement,
 * bascule ×2 au double-clic, boutons + et −. Zoomé, on ne passe pas à l'élément suivant.
 */
describe('le zoom du plein écran', () => {
  test('les boutons + et − avancent par pas et restent bornés', () => {
    expect(zoomBy(1, 1)).toBe(1.5);
    expect(zoomBy(1, -1)).toBe(MIN_ZOOM);
    expect(zoomBy(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });

  test('le double-clic bascule entre ×1 et ×2, et revient à ×1 depuis n’importe quel zoom', () => {
    expect(toggleZoom(1)).toBe(2);
    expect(toggleZoom(2)).toBe(1);
    expect(toggleZoom(3.5)).toBe(1);
  });

  test('la molette (et le pincement du pavé, ctrl + molette) zoome vers le haut quand deltaY est négatif', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    expect(wheelZoom(1, 500)).toBe(MIN_ZOOM);
    expect(wheelZoom(MAX_ZOOM, -500)).toBe(MAX_ZOOM);
  });

  test('zoomé, on ne passe pas d’un élément à l’autre', () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(1.01)).toBe(true);
  });
});
