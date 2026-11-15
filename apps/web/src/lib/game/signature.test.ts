import { describe, expect, test } from 'bun:test';

import { BRAND_DASHES } from '@/lib/brand';

import { SIGNATURE_BOX, SIGNATURE_DASHES, signatureLayers } from './signature';

/**
 * LA SIGNATURE (#9380) — les trois traits de la marque, frappés, gravés ou en
 * aplat. La géométrie vient de `BRAND_DASHES` (jamais recopiée) ; ce que ce
 * module ajoute, ce sont les COUCHES qui font la matière.
 */
describe('SIGNATURE_DASHES — la table de la marque, rien de plus', () => {
  test('les longueurs sont 500 · 400 · 300 dans un carré de 1024', () => {
    expect(SIGNATURE_BOX).toBe(1024);
    expect(SIGNATURE_DASHES.map((d) => d.x2 - d.x1)).toEqual([500, 400, 300]);
  });

  test('les opacités au repos sont 0,7 · 1 · 0,75', () => {
    expect(SIGNATURE_DASHES.map((d) => d.opacity)).toEqual([0.7, 1, 0.75]);
  });

  test('c’est la table de BRAND_DASHES, pas une copie qui peut diverger', () => {
    expect(SIGNATURE_DASHES).toBe(BRAND_DASHES);
  });
});

describe('signatureLayers — les couches de chaque matière', () => {
  const size = 100;

  test('en aplat : UNE couche, à la couleur demandée, aux opacités de la marque', () => {
    const layers = signatureLayers({ mode: 'flat', size, color: 'currentColor' });
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ tone: 'ink', dx: 0, dy: 0, color: 'currentColor', opacity: null });
  });

  test('frappée : ombre en bas à droite, éclat en haut à gauche, puis l’encre — dans cet ordre', () => {
    const layers = signatureLayers({ mode: 'struck', size, color: 'var(--c)' });
    expect(layers.map((l) => l.tone)).toEqual(['shade', 'light', 'ink']);
    const [shade, light, ink] = layers;
    expect(shade?.dx).toBeGreaterThan(0);
    expect(shade?.dy).toBeGreaterThan(0);
    expect(light?.dx).toBeLessThan(0);
    expect(light?.dy).toBeLessThan(0);
    expect(ink).toMatchObject({ dx: 0, dy: 0, color: 'var(--c)', opacity: null });
  });

  test('gravée : un éclat décalé vers le BAS-DROITE (le creux), puis une encre légèrement atténuée', () => {
    const layers = signatureLayers({ mode: 'engraved', size, color: 'var(--c)' });
    expect(layers.map((l) => l.tone)).toEqual(['light', 'ink']);
    expect(layers[0]?.dx).toBeGreaterThan(0);
    expect(layers[0]?.dy).toBeGreaterThan(0);
    expect(layers[1]?.opacity).toBe(0.85);
  });

  test('les décalages sont proportionnels à la taille, jamais en pixels fixes', () => {
    const small = signatureLayers({ mode: 'struck', size: 50, color: 'x' });
    const big = signatureLayers({ mode: 'struck', size: 200, color: 'x' });
    expect(big[0]?.dx).toBeCloseTo((small[0]?.dx ?? 0) * 4, 6);
  });
});
