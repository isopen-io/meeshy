import { describe, expect, test } from 'bun:test';

import { filmstripOf, STRIP_COLUMN_WIDTH, STRIP_TILE_HEIGHT, STRIP_TILE_WIDTH } from './call-group-stage';
import { GRID_MIN_HEIGHT, isCompactHeight } from './call-view';

/**
 * **LE BANDEAU DES AUTRES ET LE PLANCHER DE LA GRILLE, SANS ÉCRAN** (P14.1, P14.2, P12.7 ; `GroupCallStageGeometry`
 * d'Android, `CallGroupStageSizing` d'iOS).
 */
describe('le bandeau des autres', () => {
  test('vignettes de 84 × 112, colonne de 128 en paysage', () => {
    expect([STRIP_TILE_WIDTH, STRIP_TILE_HEIGHT, STRIP_COLUMN_WIDTH]).toEqual([84, 112, 128]);
  });

  test('rangée sous la une en portrait, colonne à droite en paysage, rien en plein écran', () => {
    expect(filmstripOf({ fullscreen: false, landscape: false })).toBe('bottom');
    expect(filmstripOf({ fullscreen: false, landscape: true })).toBe('trailing');
    expect(filmstripOf({ fullscreen: true, landscape: true })).toBe('none');
  });
});

describe('le plancher de la grille (P12.7)', () => {
  test('140 de haut au moins ; sous 500 de haut, la hauteur est compacte', () => {
    expect(GRID_MIN_HEIGHT).toBe(140);
    expect([0, 390, 499, 500, 844].map(isCompactHeight)).toEqual([false, true, true, false, false]);
  });
});
