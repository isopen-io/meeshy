import { describe, expect, test } from 'bun:test';

import { carouselStep, nearestToCenter } from './call-mode-carousel';

/**
 * LE CARROUSEL D'UN MODE (#8578) — l'élément arrêté au centre est choisi ;
 * les flèches passent au voisin sans boucler, et l'arabe inverse le sens.
 */

describe('nearestToCenter', () => {
  test('l’élément dont le centre est le plus proche du milieu', () => {
    const items = [
      { id: 'a', center: 100 },
      { id: 'b', center: 180 },
      { id: 'c', center: 260 },
    ];
    expect(nearestToCenter(items, 195)).toBe('b');
    expect(nearestToCenter(items, 240)).toBe('c');
  });

  test('rien à choisir dans un carrousel vide', () => {
    expect(nearestToCenter([], 100)).toBeNull();
  });
});

describe('carouselStep', () => {
  test('→ avance, ← recule, sans boucler aux bouts', () => {
    expect(carouselStep({ key: 'ArrowRight', index: 1, count: 4, rtl: false })).toBe(2);
    expect(carouselStep({ key: 'ArrowLeft', index: 1, count: 4, rtl: false })).toBe(0);
    expect(carouselStep({ key: 'ArrowRight', index: 3, count: 4, rtl: false })).toBeNull();
    expect(carouselStep({ key: 'ArrowLeft', index: 0, count: 4, rtl: false })).toBeNull();
  });

  test('Début et Fin vont aux bouts', () => {
    expect(carouselStep({ key: 'Home', index: 2, count: 4, rtl: false })).toBe(0);
    expect(carouselStep({ key: 'End', index: 0, count: 4, rtl: false })).toBe(3);
  });

  test('en arabe, → recule', () => {
    expect(carouselStep({ key: 'ArrowRight', index: 2, count: 4, rtl: true })).toBe(1);
  });

  test('une autre touche ne bouge rien', () => {
    expect(carouselStep({ key: 'Enter', index: 2, count: 4, rtl: false })).toBeNull();
  });
});
