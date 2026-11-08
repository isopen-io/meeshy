import { describe, expect, test } from 'bun:test';

import { TILE_SIZE, bboxQuery, fitView, metersToPixels, tilesCovering, viewBbox, worldPixel } from './slippy';

/**
 * **LA CARTE À TUILES, SES MATHS (#16984)** — miroir de `SlippyMap.kt` (Android,
 * `core/model/.../location/`) : aucun SDK de carte, aucune clé. Pur et testable :
 * la vue (`components/shared-locations-map.tsx`) ne fait que poser ce qu'il calcule.
 */

describe('worldPixel', () => {
  test('le point (0, 0) est au centre du monde à tout niveau de zoom', () => {
    expect(worldPixel({ latitude: 0, longitude: 0 }, 0)).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2 });
    expect(worldPixel({ latitude: 0, longitude: 0 }, 3)).toEqual({ x: (TILE_SIZE * 8) / 2, y: (TILE_SIZE * 8) / 2 });
  });

  test('l’est est à droite, le nord en haut', () => {
    const origin = worldPixel({ latitude: 0, longitude: 0 }, 5);
    const northEast = worldPixel({ latitude: 40, longitude: 20 }, 5);
    expect(northEast.x).toBeGreaterThan(origin.x);
    expect(northEast.y).toBeLessThan(origin.y);
  });
});

describe('metersToPixels', () => {
  test('à l’équateur, au zoom 0, le tour de la Terre fait une tuile', () => {
    expect(metersToPixels(40_075_016.686, 0, 0)).toBeCloseTo(TILE_SIZE, 3);
  });

  test('un cran de zoom double la taille, et la latitude la réduit', () => {
    expect(metersToPixels(1000, 0, 11)).toBeCloseTo(metersToPixels(1000, 0, 10) * 2, 6);
    expect(metersToPixels(1000, 60, 10)).toBeGreaterThan(metersToPixels(1000, 0, 10));
  });
});

describe('viewBbox', () => {
  test('l’emprise visible encadre le centre et se resserre avec le zoom', () => {
    const wide = viewBbox({ center: { latitude: 48.85, longitude: 2.35 }, zoom: 8, width: 400, height: 600 });
    const tight = viewBbox({ center: { latitude: 48.85, longitude: 2.35 }, zoom: 12, width: 400, height: 600 });
    expect(wide.minLongitude).toBeLessThan(2.35);
    expect(wide.maxLongitude).toBeGreaterThan(2.35);
    expect(wide.minLatitude).toBeLessThan(48.85);
    expect(wide.maxLatitude).toBeGreaterThan(48.85);
    expect(tight.maxLongitude - tight.minLongitude).toBeLessThan(wide.maxLongitude - wide.minLongitude);
  });

  test('ne sort jamais des bornes que le serveur accepte', () => {
    const world = viewBbox({ center: { latitude: 0, longitude: 0 }, zoom: 0, width: 1200, height: 1200 });
    expect(world.minLongitude).toBeGreaterThanOrEqual(-180);
    expect(world.maxLongitude).toBeLessThanOrEqual(180);
    expect(world.minLatitude).toBeGreaterThanOrEqual(-90);
    expect(world.maxLatitude).toBeLessThanOrEqual(90);
  });
});

describe('bboxQuery', () => {
  test('écrit minLon,minLat,maxLon,maxLat, arrondi à 3 décimales pour que la clé de cache tienne', () => {
    expect(bboxQuery({ minLongitude: 2.123456, minLatitude: 48.1, maxLongitude: 2.9, maxLatitude: 49.987654 })).toBe('2.123,48.1,2.9,49.988');
  });
});

describe('fitView', () => {
  test('aucun point : le monde entier, sans inventer de lieu', () => {
    expect(fitView([], { width: 400, height: 600 })).toEqual({ center: { latitude: 20, longitude: 0 }, zoom: 2 });
  });

  test('un seul point : centré dessus, à un zoom de ville', () => {
    const view = fitView([{ latitude: 48.85, longitude: 2.35 }], { width: 400, height: 600 });
    expect(view.center).toEqual({ latitude: 48.85, longitude: 2.35 });
    expect(view.zoom).toBe(12);
  });

  test('deux points : tous deux tiennent dans l’emprise', () => {
    const points = [
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 43.3, longitude: 5.37 },
    ];
    const view = fitView(points, { width: 400, height: 600 });
    const box = viewBbox({ ...view, width: 400, height: 600 });
    points.forEach((point) => {
      expect(point.longitude).toBeGreaterThanOrEqual(box.minLongitude);
      expect(point.longitude).toBeLessThanOrEqual(box.maxLongitude);
      expect(point.latitude).toBeGreaterThanOrEqual(box.minLatitude);
      expect(point.latitude).toBeLessThanOrEqual(box.maxLatitude);
    });
  });
});

describe('tilesCovering', () => {
  test('couvre la vue, chaque tuile posée au pixel près, et reboucle autour de l’antiméridien', () => {
    const tiles = tilesCovering({ center: { latitude: 0, longitude: 179.9 }, zoom: 3, width: 512, height: 256 });
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    tiles.forEach((tile) => {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(8);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(8);
    });
    expect(new Set(tiles.map((tile) => `${tile.left},${tile.top}`)).size).toBe(tiles.length);
    expect(tiles.some((tile) => tile.x === 7)).toBe(true);
    expect(tiles.some((tile) => tile.x === 0)).toBe(true);
  });
});
