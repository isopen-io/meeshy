import { describe, expect, test } from 'bun:test';

import { arcPath, foldIntoOthers, linearScale, niceTicks, peakOf, sparkPath, stackSegments } from './chart-scale';

describe('linearScale', () => {
  test('projette le domaine sur l’image, bornes comprises', () => {
    const scale = linearScale([0, 10], [100, 0]);
    expect(scale(0)).toBe(100);
    expect(scale(10)).toBe(0);
    expect(scale(5)).toBe(50);
  });

  test('un domaine réduit à un point rend le milieu — jamais NaN', () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50);
  });
});

describe('niceTicks — des graduations rondes qui couvrent le maximum', () => {
  test('1 240 sur quatre intervalles : pas de 500', () => {
    expect(niceTicks(1240, 4)).toEqual([0, 500, 1000, 1500]);
  });

  test('de petits maximums restent lisibles', () => {
    expect(niceTicks(7, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(1, 4)).toEqual([0, 0.5, 1]);
  });

  test('la dernière graduation couvre toujours le maximum', () => {
    for (const max of [3, 99, 100, 101, 12_408, 0.3]) {
      const ticks = niceTicks(max, 4);
      expect(ticks[ticks.length - 1] ?? 0).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
    }
  });

  test('un maximum nul, négatif ou illisible rend l’axe [0, 1]', () => {
    expect(niceTicks(0, 4)).toEqual([0, 1]);
    expect(niceTicks(-5, 4)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN, 4)).toEqual([0, 1]);
  });
});

describe('sparkPath', () => {
  test('trace de gauche à droite, l’axe y vers le haut, avec sa marge', () => {
    expect(sparkPath([0, 10], 100, 20)).toBe('M2 18 L98 2');
  });

  test('une valeur constante fait une ligne au milieu', () => {
    expect(sparkPath([5, 5, 5], 100, 20)).toBe('M2 10 L50 10 L98 10');
  });

  test('un seul point ne plante pas, aucun point rend une chaîne vide', () => {
    expect(sparkPath([4], 100, 20)).toBe('M2 10');
    expect(sparkPath([], 100, 20)).toBe('');
  });
});

describe('stackSegments', () => {
  test('les parts se suivent bout à bout et somment un tour', () => {
    const segments = stackSegments([1, 1, 2]);
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [0, 0.25],
      [0.25, 0.5],
      [0.5, 1],
    ]);
    expect(segments.map((s) => s.share)).toEqual([0.25, 0.25, 0.5]);
  });

  test('un total nul ne divise pas par zéro ; un négatif compte pour zéro', () => {
    expect(stackSegments([0, 0]).map((s) => s.share)).toEqual([0, 0]);
    expect(stackSegments([-3, 3]).map((s) => s.share)).toEqual([0, 1]);
  });
});

describe('arcPath', () => {
  test('un quart de tour : un arc extérieur, un arc intérieur, fermé', () => {
    const path = arcPath(0, 0.25, 50, 10);
    expect(path.startsWith('M50 0')).toBe(true);
    expect(path).toContain('A50 50 0 0 1 100 50');
    expect(path).toContain('A40 40 0 0 0 50 10');
    expect(path.endsWith('Z')).toBe(true);
  });

  test('plus d’un demi-tour : le drapeau d’arc large est levé', () => {
    expect(arcPath(0, 0.75, 50, 10)).toContain('A50 50 0 1 1');
  });

  test('un tour complet se trace en deux demi-arcs, sinon il disparaîtrait', () => {
    const path = arcPath(0, 1, 50, 10);
    expect(path.match(/A50 50/g)).toHaveLength(2);
    expect(path.match(/A40 40/g)).toHaveLength(2);
  });
});

describe('peakOf', () => {
  test('le point le plus haut, le premier en cas d’égalité', () => {
    expect(peakOf([{ value: 3 }, { value: 9 }, { value: 9 }])).toEqual({ index: 1, value: 9 });
  });

  test('aucun point, aucun pic', () => {
    expect(peakOf([])).toBeNull();
  });
});

describe('foldIntoOthers', () => {
  const item = (key: string, value: number) => ({ key, label: key.toUpperCase(), value });

  test('jusqu’à la limite, rien ne change', () => {
    const items = [item('a', 5), item('b', 3)];
    expect(foldIntoOthers(items, 4, 'Autres')).toBe(items);
  });

  test('au-delà, les suivantes se replient dans « Autres », sommées, à la fin', () => {
    const folded = foldIntoOthers([item('a', 5), item('b', 4), item('c', 3), item('d', 2), item('e', 1), item('f', 1)], 4, 'Autres');
    expect(folded.map((x) => x.key)).toEqual(['a', 'b', 'c', 'd', 'others']);
    expect(folded[4]).toEqual({ key: 'others', label: 'Autres', value: 2 });
  });

  test('l’ordre reçu est conservé : la couleur suit l’entité, pas son rang', () => {
    const folded = foldIntoOthers([item('z', 1), item('a', 9), item('m', 5), item('b', 2), item('c', 1)], 4, 'Autres');
    expect(folded.slice(0, 4).map((x) => x.key)).toEqual(['z', 'a', 'm', 'b']);
  });
});
