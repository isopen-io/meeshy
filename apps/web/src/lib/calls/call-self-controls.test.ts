import { describe, expect, test } from 'bun:test';

import { selfZoomPlace, zoomControlIn } from './call-self-controls';

/**
 * **OÙ VIT LE ZOOM DE MA CAMÉRA** (#8626, #17327) — dans ma vignette, en haut
 * quand mon image remplit l'écran, nulle part sans vignette. Ma vignette ne
 * porte AUCUNE commande (#17327) : Caméra, Retourner, Effets et Écran vivent
 * dans le rail « mon image » du duo ou dans la rangée « Mon image » du groupe,
 * jamais autour d'elle. Seul le cran du zoom y reste.
 */

const place = (overrides: Partial<Parameters<typeof selfZoomPlace>[0]> = {}) => selfZoomPlace({ layout: 'video-duo', selfFull: false, selfTileShown: true, ...overrides });

describe('selfZoomPlace', () => {
  test('ma vignette en coin porte le cran du zoom', () => {
    expect(place()).toBe('tile');
  });

  test('mon image en plein écran : le zoom monte en haut', () => {
    expect(place({ selfFull: true })).toBe('top');
    expect(place({ selfFull: true, selfTileShown: false })).toBe('top');
  });

  test('sans vignette (caméra coupée), pas de zoom : rien à regarder zoomer', () => {
    expect(place({ selfTileShown: false })).toBe('menu');
  });

  test('hors du duo vidéo (vocal, groupe, écran partagé par le pair), pas de vignette où le poser', () => {
    expect(place({ layout: 'portrait' })).toBe('menu');
    expect(place({ layout: 'grid', selfFull: true })).toBe('menu');
    expect(place({ layout: 'screen' })).toBe('menu');
  });
});

describe('zoomControlIn', () => {
  test('un cran dans la vignette, la capsule en plein écran, rien ailleurs', () => {
    expect(zoomControlIn('tile')).toBe('step');
    expect(zoomControlIn('top')).toBe('capsule');
    expect(zoomControlIn('menu')).toBeNull();
  });
});
