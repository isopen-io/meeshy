import { describe, expect, test } from 'bun:test';

import { DEFAULT_SELF_TILE, scaleAfterPinch, scaleAfterWheel, selfTileScaleFor, selfTileSize, selfTileStore, setSelfTileScale } from './call-self-tile';

/**
 * MA VIGNETTE EN COIN (#8577) — trois tailles, x1 · x2 · x3, la moyenne par
 * défaut (celle d'avant) ; un pincement la fait passer d'un cran (ou deux,
 * franchement pincé), jamais entre deux ; elle ne mange jamais l'écran ; la
 * taille choisie tient pour l'appel, pas pour le suivant.
 */

const phone = { width: 390, height: 844 };

describe('selfTileSize', () => {
  test('x2 est la vignette d’aujourd’hui, x1 plus petite, x3 plus grande — même proportion', () => {
    expect(DEFAULT_SELF_TILE).toBe(2);
    expect(selfTileSize(2, phone)).toEqual({ width: 112, height: 160 });
    expect(selfTileSize(1, phone)).toEqual({ width: 80, height: 114 });
    expect(selfTileSize(3, phone)).toEqual({ width: 168, height: 240 });
  });

  test('sur un petit écran, x3 se borne à 45 % de la largeur et 40 % de la hauteur, sans se déformer', () => {
    const small = selfTileSize(3, { width: 320, height: 568 });
    expect(small.width).toBeLessThanOrEqual(144);
    expect(small.height).toBeLessThanOrEqual(227);
    expect(small).toEqual({ width: 144, height: 206 });
    expect(selfTileSize(3, { width: 900, height: 400 })).toEqual({ width: 112, height: 160 });
  });
});

describe('scaleAfterPinch', () => {
  test('écarter d’un tiers passe au cran supérieur ; franchement, deux crans', () => {
    expect(scaleAfterPinch(2, 1.3)).toBe(3);
    expect(scaleAfterPinch(1, 1.3)).toBe(2);
    expect(scaleAfterPinch(1, 2)).toBe(3);
  });

  test('pincer passe au cran inférieur ; franchement, deux crans', () => {
    expect(scaleAfterPinch(2, 0.8)).toBe(1);
    expect(scaleAfterPinch(3, 0.8)).toBe(2);
    expect(scaleAfterPinch(3, 0.5)).toBe(1);
  });

  test('un geste timide ne change rien, et rien ne dépasse x1 ni x3', () => {
    expect(scaleAfterPinch(2, 1.1)).toBe(2);
    expect(scaleAfterPinch(2, 0.9)).toBe(2);
    expect(scaleAfterPinch(3, 3)).toBe(3);
    expect(scaleAfterPinch(1, 0.2)).toBe(1);
  });
});

describe('scaleAfterWheel', () => {
  test('Ctrl + molette vers le haut agrandit d’un cran, vers le bas réduit', () => {
    expect(scaleAfterWheel(2, -40)).toBe(3);
    expect(scaleAfterWheel(2, 40)).toBe(1);
    expect(scaleAfterWheel(3, -40)).toBe(3);
    expect(scaleAfterWheel(2, 0)).toBe(2);
  });
});

describe('la taille retenue pour l’appel', () => {
  test('la taille choisie tient pour CET appel ; un autre appel repart de x2', () => {
    selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE });
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(2);
    setSelfTileScale('call-1', 3);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(3);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-2')).toBe(2);
    setSelfTileScale('call-2', 1);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(2);
  });
});
