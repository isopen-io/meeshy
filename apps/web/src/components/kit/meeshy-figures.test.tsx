import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyFigure, MeeshyFigureBand, MeeshyShareBar, MeeshySpark, meeshyFiguresRecipe, meeshySparkPath } from './meeshy-figures';

const { mount, render, act } = kitMount();

describe('MeeshyFigures — la recette en valeurs', () => {
  test('valeur de 48 · 34 · 24, unité de 12,5, tendance de 20, filet de 1 sur 16', () => {
    expect((['hero', 'large', 'compact'] as const).map((size) => meeshyFiguresRecipe({ size }).valueSize)).toEqual([48, 34, 24]);
    expect(meeshyFiguresRecipe({})).toMatchObject({ unitSize: 12.5, unitGap: 2, trendHeight: 20, ruleWidth: 1, ruleGap: 16, minShrink: 0.6 });
  });

  test('une bande de quatre passe en compact sous 360 de large, pas au-dessus', () => {
    expect(meeshyFiguresRecipe({ count: 4, width: 359 }).size).toBe('compact');
    expect(meeshyFiguresRecipe({ count: 4, width: 360 }).size).toBe('large');
    expect(meeshyFiguresRecipe({ count: 3, width: 300 }).size).toBe('large');
  });

  test('aux tailles d’accessibilité la bande s’empile', () => {
    expect(meeshyFiguresRecipe({ count: 3, isStacked: true })).toMatchObject({ isStacked: true });
    expect(meeshyFiguresRecipe({ count: 3 }).isStacked).toBe(false);
  });

  test('la courbe fait 72 × 28, trait de 2, aire à 14 %, point final de 6 ; la jauge de part ne descend pas sous 4', () => {
    expect(meeshyFiguresRecipe({}).spark).toEqual({ width: 72, height: 28, stroke: 2, areaOpacity: 0.14, endDot: 6 });
    expect(meeshyFiguresRecipe({}).shareMinBar).toBe(4);
  });
});

describe('meeshySparkPath — l’échelle des points ne casse jamais', () => {
  const finite = (path: string): boolean => !/NaN|Infinity/.test(path);

  test('moins de deux points : rien n’est dessiné', () => {
    expect(meeshySparkPath([])).toBeNull();
    expect(meeshySparkPath([3])).toBeNull();
  });

  test('0, 1, 2, 7 et 31 points, valeurs égales, nulles ou négatives : aucune division par zéro, courbe dans son cadre', () => {
    const series = [[1, 2], [5, 5, 5, 5, 5, 5, 5], [0, 0, 0], [-3, -1, -2, -9, 4, 4, 0], Array.from({ length: 31 }, (_, index) => Math.sin(index) * 100)];
    for (const points of series) {
      const drawn = meeshySparkPath(points);
      expect(drawn).not.toBeNull();
      if (drawn === null) continue;
      expect(finite(drawn.line)).toBe(true);
      expect(finite(drawn.area)).toBe(true);
      for (const [x, y] of drawn.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(72);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(28);
      }
    }
  });

  test('le plus haut des points est en haut du cadre, le plus bas en bas, le dernier est celui du point final', () => {
    const drawn = meeshySparkPath([1, 5, 3]);
    expect(drawn?.points[1]?.[1]).toBeLessThan(drawn?.points[0]?.[1] ?? 0);
    expect(drawn?.end).toEqual(drawn?.points[2]);
  });
});

describe('MeeshyFigure — un nombre, son unité, ses trois états', () => {
  test('la valeur et l’unité se lisent d’un bloc, l’unité après la valeur', () => {
    const container = mount(<MeeshyFigure value="1 284" unit="clics" />);
    expect(spokenText(container.firstElementChild as HTMLElement).replace(/\s+/g, ' ').trim()).toBe('1 284 clics');
  });

  test('une unité vide est refusée', () => {
    expect(() => mount(<MeeshyFigure value="12" unit="" />)).toThrow();
  });

  test('sans valeur : « — » se dit « aucune donnée », jamais zéro ; un vrai zéro s’écrit 0', () => {
    const empty = mount(<MeeshyFigure unit="clics" emptyLabel="aucune donnée" />);
    expect(empty.querySelector('[data-kit-figure-value]')?.textContent).toBe('—');
    expect(spokenText(empty.firstElementChild as HTMLElement)).toContain('aucune donnée');
    const zero = mount(<MeeshyFigure value="0" unit="clics" />);
    expect(zero.querySelector('[data-kit-figure-value]')?.textContent).toBe('0');
  });

  test('chargement : un squelette, ignoré dès qu’une valeur existe', () => {
    expect(mount(<MeeshyFigure unit="clics" isLoading />).querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(mount(<MeeshyFigure value="12" unit="clics" isLoading />).querySelector('[data-kit-skeleton]')).toBeNull();
  });

  test('les trois états occupent le même encombrement', () => {
    const measure = (element: JSX.Element): string => (mount(element).firstElementChild as HTMLElement).style.cssText;
    const loading = measure(<MeeshyFigure unit="clics" isLoading />);
    expect(loading).toBe(measure(<MeeshyFigure unit="clics" />));
    expect(loading).toBe(measure(<MeeshyFigure value="12" unit="clics" />));
  });

  test('une tendance dit son sens par une flèche et un mot, pas par la seule couleur', () => {
    const container = mount(<MeeshyFigure value="412" unit="clics" trend={{ direction: 'up', text: '12 %' }} />);
    const trend = container.querySelector('[data-kit-figure-trend]') as HTMLElement;
    expect(trend.getAttribute('data-direction')).toBe('up');
    expect(trend.querySelector('svg')).not.toBeNull();
    expect(spokenText(trend)).toContain('12 %');
  });

  test('le chiffre roule : seuls les chiffres qui diffèrent, jamais à la première apparition', () => {
    const container = mount(<MeeshyFigure value="1 284" unit="clics" />);
    expect(container.querySelectorAll('[data-rolling]').length).toBe(0);
    render(<MeeshyFigure value="1 285" unit="clics" />);
    const rolling = Array.from(container.querySelectorAll('[data-rolling]'));
    expect(rolling.map((node) => node.textContent)).toEqual(['5']);
  });

  test('rolls faux : rien ne roule', () => {
    const container = mount(<MeeshyFigure value="1 284" unit="clics" rolls={false} />);
    render(<MeeshyFigure value="1 285" unit="clics" rolls={false} />);
    expect(container.querySelectorAll('[data-rolling]').length).toBe(0);
  });

  test('la teinte colore l’accessoire, jamais le chiffre', () => {
    const container = mount(<MeeshyFigure value="12" unit="clics" tint="#4ECDC4" />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-figure-tint')).toBe('#4ECDC4');
    expect((container.querySelector('[data-kit-figure-value]') as HTMLElement).style.color).toBe('');
  });
});

describe('MeeshyFigureBand — un seul élément', () => {
  test('une bande se lit d’un bloc : « 1 284 clics, 912 visiteurs uniques, 31 pays »', () => {
    const container = mount(
      <MeeshyFigureBand>
        <MeeshyFigure value="1 284" unit="clics" />
        <MeeshyFigure value="912" unit="visiteurs uniques" />
        <MeeshyFigure value="31" unit="pays" />
      </MeeshyFigureBand>,
    );
    const band = container.firstElementChild as HTMLElement;
    expect(band.getAttribute('role')).toBe('group');
    expect(spokenText(band).replace(/\s+/g, ' ').trim()).toBe('1 284 clics 912 visiteurs uniques 31 pays');
  });

  test('filets entre deux chiffres seulement, jamais au bord', () => {
    const container = mount(
      <MeeshyFigureBand>
        <MeeshyFigure value="1" unit="a" />
        <MeeshyFigure value="2" unit="b" />
        <MeeshyFigure value="3" unit="c" />
      </MeeshyFigureBand>,
    );
    expect(container.querySelectorAll('[data-kit-figure-rule]').length).toBe(2);
  });

  test('tous les chiffres d’une bande prennent la même taille', () => {
    const container = mount(
      <MeeshyFigureBand size="compact">
        <MeeshyFigure value="1" unit="a" size="hero" />
        <MeeshyFigure value="2" unit="b" />
      </MeeshyFigureBand>,
    );
    const sizes = Array.from(container.querySelectorAll('[data-kit-figure]')).map((node) => node.getAttribute('data-size'));
    expect(sizes).toEqual(['compact', 'compact']);
  });

  test('moins de deux chiffres : un chiffre seul, sans filet ; plus de quatre : refusé', () => {
    const single = mount(<MeeshyFigureBand><MeeshyFigure value="1" unit="a" /></MeeshyFigureBand>);
    expect(single.querySelectorAll('[data-kit-figure-rule]').length).toBe(0);
    expect(() =>
      mount(
        <MeeshyFigureBand>
          {[1, 2, 3, 4, 5].map((n) => (
            <MeeshyFigure key={n} value={String(n)} unit="u" />
          ))}
        </MeeshyFigureBand>,
      ),
    ).toThrow();
  });

  test('avec onPress : toute la bande est un seul bouton', () => {
    let presses = 0;
    const container = mount(
      <MeeshyFigureBand onPress={() => (presses += 1)} label="Statistiques du lien">
        <MeeshyFigure value="1" unit="a" />
        <MeeshyFigure value="2" unit="b" />
      </MeeshyFigureBand>,
    );
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('Statistiques du lien');
    act(() => button.click());
    expect(presses).toBe(1);
  });
});

describe('MeeshySpark et MeeshyShareBar', () => {
  test('la courbe est une image nommée par une phrase, d’un seul tracé', () => {
    const container = mount(<MeeshySpark points={[1, 3, 2, 5, 4, 6, 7]} summary="Visites en hausse sur sept jours" />);
    const image = container.querySelector('[role="img"]') as HTMLElement;
    expect(image.getAttribute('aria-label')).toBe('Visites en hausse sur sept jours');
    expect(image.querySelectorAll('path').length).toBe(2);
  });

  test('moins de deux points : aucune image', () => {
    expect(mount(<MeeshySpark points={[1]} summary="x" />).querySelector('[role="img"]')).toBeNull();
  });

  test('une rangée de part dit son titre, sa valeur et sa part ; la jauge est bornée de 0 à 1', () => {
    const container = mount(<MeeshyShareBar title="Sénégal" value="38 %" share={1.7} />);
    expect(spokenText(container.firstElementChild as HTMLElement)).toContain('Sénégal');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(mount(<MeeshyShareBar title="Mali" value="2 %" share={-4} />).querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('MeeshyFigures — pureté', () => {
  test('aucune mise en forme de nombre, aucun type du domaine, aucun singleton', () => {
    for (const file of ['./meeshy-figures.tsx', './meeshy-figures-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|toLocaleString|Intl\.NumberFormat|toFixed/);
    }
  });
});
