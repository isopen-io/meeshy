import { describe, expect, test } from 'bun:test';

import coin from '@meeshy/shared/design/meesh-coin.json';

import { beadPoints, cabochonShapes, coinEdition, inscriptionLayout, laurelLeafPath, rosetteCircles, sparklePath, starPath, sunburstRays } from './coin-geometry';

/**
 * LA GÉOMÉTRIE PARTAGÉE DE LA MEESH (épopée § 6, #11176). Une seule source,
 * `packages/shared/design/meesh-coin.json`, que le web lit et qu'iOS rejoue :
 * ces témoins disent ce que la source PROMET (une couronne universelle, des
 * décors qui tiennent dans la pièce), pour que les deux dessins la croient.
 */
const CENTER = coin.center;
const inside = (x: number, y: number, radius: number): boolean => Math.hypot(x - CENTER, y - CENTER) <= radius + 1e-9;
const points = (d: string): readonly (readonly [number, number])[] => {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return numbers.flatMap((_, i) => (i % 2 === 0 ? [[numbers[i] ?? 0, numbers[i + 1] ?? 0] as const] : []));
};

describe('la couronne universelle', () => {
  test('« MEESHY · 1 MEESH », répétée deux fois — jamais traduite', () => {
    expect(coin.inscription.text).toBe('MEESHY · 1 MEESH · ');
    expect(coin.inscription.repeat).toBe(2);
  });

  test('chaque glyphe se pose sur son cercle, à son angle, la tête vers l’extérieur', () => {
    const layout = inscriptionLayout();
    const step = 360 / (coin.inscription.text.length * coin.inscription.repeat);
    for (const glyph of layout) {
      expect(Math.hypot(glyph.x - CENTER, glyph.y - CENTER)).toBeCloseTo(coin.inscription.radius, 6);
      expect(glyph.rotate).toBeCloseTo(coin.inscription.startDeg + glyph.index * step + 90, 6);
    }
  });

  test('les espaces ne se dessinent pas ; les séparateurs sont nommés', () => {
    const layout = inscriptionLayout();
    expect(layout.map((g) => g.glyph).join('')).toBe('MEESHY·1MEESH·MEESHY·1MEESH·');
    expect(layout.filter((g) => g.separator)).toHaveLength(4);
  });
});

describe('les éditions', () => {
  test('argent, or et prisme nomment leur métal et leur champ', () => {
    expect(coinEdition('silver')).toMatchObject({ metal: 'coin-silver', field: 'coin-silver-in' });
    expect(coinEdition('gold')).toMatchObject({ metal: 'coin-gold', field: 'coin-gold-in' });
    expect(coinEdition('prism')).toMatchObject({ metal: 'prism', field: 'coin-diamond-in' });
  });

  test('l’or seul remplace les points de la couronne par des étoiles', () => {
    expect([coinEdition('silver').separator, coinEdition('gold').separator, coinEdition('prism').separator]).toEqual(['dot', 'star', 'dot']);
  });
});

describe('les décors tiennent dans la pièce', () => {
  const RIM = coin.body.radius;

  test('les perles du grènetis', () => {
    for (const ring of [...coin.decor.beads.gold, ...coin.decor.beads.prism]) {
      const beads = beadPoints(ring);
      expect(beads).toHaveLength(ring.count);
      for (const bead of beads) expect(inside(bead.x, bead.y, RIM - ring.dot)).toBe(true);
    }
  });

  test('le double grènetis du prisme encadre la tranche cannelée sans la toucher', () => {
    const [inner, outer] = coin.decor.beads.prism;
    const flute = coin.body.flute;
    expect((inner?.radius ?? 0) + (inner?.dot ?? 0)).toBeLessThan(flute.radius - flute.width / 2);
    expect((outer?.radius ?? 0) - (outer?.dot ?? 0)).toBeGreaterThan(flute.radius + flute.width / 2);
  });

  test('huit cabochons sertis sur la tranche, chacun avec sa table', () => {
    const shapes = cabochonShapes();
    expect(shapes).toHaveLength(8);
    for (const shape of shapes) {
      expect(points(shape.outer)).toHaveLength(8);
      for (const [x, y] of points(shape.outer)) expect(inside(x, y, RIM)).toBe(true);
    }
  });

  test('la rosace et le soleil restent dans le champ de la face', () => {
    for (const side of ['obverse', 'reverse'] as const) {
      const field = coin.field[side].radius;
      for (const circle of rosetteCircles()) expect(Math.hypot(circle.cx - CENTER, circle.cy - CENTER) + circle.r).toBeLessThanOrEqual(field);
      const rays = sunburstRays(field);
      expect(rays).toHaveLength(coin.decor.sunburst.count);
      for (const ray of rays) expect(inside(ray.x2, ray.y2, field)).toBe(true);
    }
  });

  test('un rayon sur deux du soleil est raccourci', () => {
    const [long, short] = sunburstRays(40).map((ray) => Math.hypot(ray.x2 - ray.x1, ray.y2 - ray.y1));
    expect(short).toBeLessThan(long ?? 0);
  });

  test('les lauriers, la couronne royale et les éclats sont dans le champ du revers', () => {
    const field = coin.field.reverse.radius;
    for (const leaf of coin.decor.laurels.leaves) {
      for (const [x, y] of points(laurelLeafPath(leaf))) expect(inside(x, y, field)).toBe(true);
    }
    for (const [x, y] of points(coin.decor.crown.body)) expect(inside(x, y, field)).toBe(true);
    for (const sparkle of coin.decor.sparkles.points) {
      for (const [x, y] of points(sparklePath(sparkle))) expect(inside(x, y, field)).toBe(true);
    }
  });

  test('une étoile de la couronne a dix sommets, une feuille se referme sur sa base', () => {
    expect(points(starPath({ x: 10, y: 10, rotate: 0 }))).toHaveLength(10);
    const leaf = points(laurelLeafPath({ x: 40, y: 100, angle: 180, length: 4, width: 1.5 }));
    expect(leaf[0]?.[0]).toBeCloseTo(40, 6);
    expect(leaf.at(-1)?.[0]).toBeCloseTo(40, 6);
  });
});
