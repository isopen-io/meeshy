import { describe, expect, test } from 'bun:test';

import { inkOnAccent, withAccent } from './accent';

/**
 * L'ENCRE LISIBLE SUR L'ACCENT (revue #5774) — le défaut mesuré : le bouton
 * « revenir en bas » peignait `#fff` EN DUR sur `color-mix(var(--accent) 85%)`.
 * Sur le premier accent du jeu de fixtures (`#46BDCA`) cela vaut 1,98:1 en
 * schéma clair, sous la barre des objets graphiques (3:1) et très loin d'AA.
 */
const linear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminanceOf = (hex: string): number => {
  const v = hex.replace('#', '');
  const ch = (o: number) => linear(Number.parseInt(v.slice(o, o + 2), 16) / 255);
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('inkOnAccent — l encre la PLUS lisible, jamais une couleur en dur', () => {
  test('un accent CLAIR reçoit l encre noire', () => {
    expect(inkOnAccent('#46BDCA')).toBe('#000000');
    expect(inkOnAccent('#FFFFFF')).toBe('#000000');
  });

  test('un accent SOMBRE reçoit l encre blanche', () => {
    expect(inkOnAccent('#000000')).toBe('#FFFFFF');
    expect(inkOnAccent('#1B1464')).toBe('#FFFFFF');
  });

  /**
   * LA VRAIE ASSERTION : pas « quelle couleur sort », mais « l encre servie
   * contraste-t-elle AU MOINS autant que l autre ». Un seuil faux (celui
   * d iOS, 0,6) fait rougir CE témoin, pas les deux ci-dessus.
   */
  test('sur toute la plage, l encre servie est celle qui contraste le PLUS', () => {
    const worse: string[] = [];
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
          const served = inkOnAccent(hex);
          const other = served === '#000000' ? '#FFFFFF' : '#000000';
          if (contrast(served, hex) < contrast(other, hex)) worse.push(hex);
        }
      }
    }
    expect(worse).toEqual([]);
  });

  test('le PREMIER accent du jeu de fixtures franchit la barre AA', () => {
    expect(contrast(inkOnAccent('#46BDCA'), '#46BDCA')).toBeGreaterThan(4.5);
  });
});

describe('withAccent — l encre voyage AVEC l accent', () => {
  test('pose --accent et --accent-ink sur le même nœud', () => {
    const style = withAccent('#46BDCA') as Record<string, string>;
    expect(style['--accent']).toBe('#46BDCA');
    expect(style['--accent-ink']).toBe('#000000');
  });

  test('le reste des propriétés est préservé', () => {
    const style = withAccent('#0F0C29', { color: 'red' }) as Record<string, string>;
    expect(style.color).toBe('red');
    expect(style['--accent-ink']).toBe('#FFFFFF');
  });
});
