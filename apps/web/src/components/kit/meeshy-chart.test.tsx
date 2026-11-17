import { describe, expect, test } from 'bun:test';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyChart, meeshyChartRecipe, MeeshyChartScale, type MeeshyChartPoint } from './meeshy-chart';

const { mount, render, act } = kitMount();
const point = (id: string, value: number, extra: Partial<MeeshyChartPoint> = {}): MeeshyChartPoint => ({ id, value, label: id, spoken: `${id}, ${value} clics`, ...extra });
const days = [point('d1', 4), point('d2', 214), point('d3', 30), point('d4', 0)];

describe('MeeshyChartScale — la loi pure', () => {
  test('normalized : de 0 à 1 contre le maximum, le négatif vaut zéro', () => {
    expect(MeeshyChartScale.normalized([0, 50, 100, -5])).toEqual([0, 0.5, 1, 0]);
    expect(MeeshyChartScale.normalized([0, 0])).toEqual([0, 0]);
  });

  test('niceTicks, peak, segments et arc partagent la loi du tableau de bord', () => {
    expect(MeeshyChartScale.niceTicks(214, 4)).toEqual([0, 100, 200, 300]);
    expect(MeeshyChartScale.peak([{ value: 1 }, { value: 9 }, { value: 9 }])).toEqual({ index: 1, value: 9 });
    expect(MeeshyChartScale.segments([1, 1, 2]).map((segment) => segment.share)).toEqual([0.25, 0.25, 0.5]);
    expect(MeeshyChartScale.arc(0, 0.5, 52, 12)).toContain('A52 52');
  });
});

describe('MeeshyChart — la recette en valeurs', () => {
  test('hauteurs 96 · 128 · 220 ; strip 26, funnel 52 par étage, donut 104', () => {
    expect((['compact', 'regular', 'large'] as const).map((size) => meeshyChartRecipe({ kind: 'bars', size, pointCount: 5 }).height)).toEqual([96, 128, 220]);
    expect(meeshyChartRecipe({ kind: 'strip', size: 'large', pointCount: 5 }).height).toBe(26);
    expect(meeshyChartRecipe({ kind: 'funnel', size: 'large', pointCount: 3 }).height).toBe(156);
    expect(meeshyChartRecipe({ kind: 'donut', size: 'large', pointCount: 3 }).height).toBe(104);
  });

  test('écart des barres : 3 en 128, 6 en 220', () => {
    expect(meeshyChartRecipe({ kind: 'bars', size: 'regular', pointCount: 10 }).barGap).toBe(3);
    expect(meeshyChartRecipe({ kind: 'bars', size: 'large', pointCount: 10 }).barGap).toBe(6);
  });

  test('une série vide est un état sans donnée ; l’anneau garde sa piste', () => {
    expect(meeshyChartRecipe({ kind: 'bars', pointCount: 0 }).isEmpty).toBe(true);
    expect(meeshyChartRecipe({ kind: 'donut', pointCount: 0 })).toMatchObject({ isEmpty: true, keepsTrack: true });
  });

  test('l’anneau plafonne à cinq segments, le reste se replie dans « Autres »', () => {
    expect(meeshyChartRecipe({ kind: 'donut', pointCount: 8 })).toMatchObject({ maxSegments: 5, foldsOthers: true });
    expect(meeshyChartRecipe({ kind: 'donut', pointCount: 3 }).foldsOthers).toBe(false);
  });
});

describe('MeeshyChart — ce qu’on lit', () => {
  test('une image nommée par la phrase de l’hôte, jamais une suite de nombres', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Pic le 3 novembre, 214 clics" />);
    const chart = container.querySelector('[data-kit-chart]') as HTMLElement;
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe('Pic le 3 novembre, 214 clics');
  });

  test('chaque valeur est dite par l’hôte, une liste cachée à la vue', () => {
    const container = mount(<MeeshyChart kind="line" points={days} summary="Courbe" />);
    expect(spokenText(container.querySelector('[data-kit-chart-spoken]') as HTMLElement)).toContain('d2, 214 clics');
  });

  test('sans donnée : la phrase de l’hôte, ni illustration ni bouton', () => {
    const container = mount(<MeeshyChart kind="bars" points={[]} summary="Aucun clic" emptyText="Aucun clic sur la période" axisLabels={['18 oct.', '16 nov.']} />);
    expect(container.textContent).toContain('Aucun clic sur la période');
    expect(container.querySelector('button')).toBeNull();
  });

  test('en chargement : un squelette aux mesures du genre, caché à la voix', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Chargement" isLoading />);
    expect(container.querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(container.querySelector('[data-kit-chart-bar]')).toBeNull();
  });

  test('le pic est éclairé par défaut, aujourd’hui marque le dernier point', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" markers={[{ kind: 'peak' }, { kind: 'today' }]} />);
    expect(container.querySelector('[data-kit-chart-bar][data-peak]')?.getAttribute('data-point')).toBe('d2');
    expect(container.querySelector('[data-kit-chart-bar][data-today]')?.getAttribute('data-point')).toBe('d4');
  });

  test('l’axe répartit ses bornes à écart égal', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" axisLabels={['18 oct.', '28 oct.', '7 nov.']} />);
    expect(Array.from(container.querySelectorAll('[data-kit-chart-axis] span')).map((node) => node.textContent)).toEqual(['18 oct.', '28 oct.', '7 nov.']);
  });
});

describe('MeeshyChart — choisir un point', () => {
  test('en lecture seule : aucune cible, aucun geste', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  test('avec une sélection, chaque point est un bouton nommé par sa phrase, et rend son identifiant', () => {
    const picked: (string | null)[] = [];
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" selection="d2" onSelect={(id) => picked.push(id)} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons[1]?.getAttribute('aria-label')).toBe('d2, 214 clics');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    act(() => buttons[2]?.click());
    expect(picked).toEqual(['d3']);
  });

  test('toucher le point choisi le relâche', () => {
    const picked: (string | null)[] = [];
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" selection="d2" onSelect={(id) => picked.push(id)} />);
    act(() => (container.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(picked).toEqual([null]);
  });

  test('l’étiquette du point choisi vient de l’hôte', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" selection="d2" onSelect={() => {}} callout={(id) => (id === 'd2' ? { title: '3 nov.', value: '214', note: 'le meilleur jour' } : null)} />);
    expect(container.querySelector('[data-kit-chart-callout]')?.textContent).toContain('le meilleur jour');
  });
});

describe('MeeshyChart — les sept genres se dessinent', () => {
  test('courbe : un trait et une aire ; anneau : un arc par part ; entonnoir : un étage par point', () => {
    expect(mount(<MeeshyChart kind="line" points={days} summary="Courbe" />).querySelectorAll('path[data-kit-chart-line]').length).toBe(1);
    expect(mount(<MeeshyChart kind="donut" points={[point('a', 81), point('b', 16), point('c', 3)]} summary="Anneau" />).querySelectorAll('[data-kit-chart-arc]').length).toBe(3);
    expect(mount(<MeeshyChart kind="funnel" points={[point('a', 38), point('b', 17), point('c', 14)]} summary="Entonnoir" />).querySelectorAll('[data-kit-chart-stage]').length).toBe(3);
  });

  test('répartition : une barre de K42 par ligne, avec le libellé et la valeur', () => {
    const container = mount(<MeeshyChart kind="breakdown" points={[point('sn', 38, { label: 'Sénégal' }), point('fr', 24, { label: 'France' })]} summary="Pays" />);
    expect(container.querySelectorAll('[data-kit-chart-row]').length).toBe(2);
    expect(container.querySelector('[data-kit-meter]')).not.toBeNull();
  });

  test('bande : une cellule par jour, la valeur portée par l’opacité de 12 à 100 %', () => {
    const container = mount(<MeeshyChart kind="strip" points={days} summary="Bande" />);
    const cells = Array.from(container.querySelectorAll('[data-kit-chart-cell]')) as HTMLElement[];
    expect(cells.length).toBe(4);
    expect(Number(cells[1]?.getAttribute('data-level'))).toBe(1);
    expect(Number(cells[3]?.getAttribute('data-level'))).toBe(0.12);
  });

  test('bulles : l’aire est proportionnelle, de 34 à 78, les positions viennent de l’hôte', () => {
    const container = mount(<MeeshyChart kind="bubbles" points={[point('a', 488, { position: { x: 0.2, y: 0.4 } }), point('b', 34, { position: { x: 0.7, y: 0.6 } })]} summary="Pays" />);
    const sizes = Array.from(container.querySelectorAll('[data-kit-chart-bubble]')).map((node) => Number(node.getAttribute('data-diameter')));
    expect(sizes[0]).toBe(78);
    expect(sizes[1]).toBeGreaterThanOrEqual(34);
    expect(sizes[1]).toBeLessThan(sizes[0] as number);
  });
});

describe('MeeshyChart — le repère des points', () => {
  test('un point de courbe se pose sur la courbe dans les deux sens de lecture : son abscisse est physique, comme le tracé SVG', () => {
    const container = mount(<MeeshyChart kind="line" points={days} summary="Courbe" onSelect={() => {}} />);
    const dot = container.querySelector('[data-kit-chart-dot]') as HTMLElement;
    expect(dot.style.left).toBe(`${(4 / 300) * 100}%`);
    expect(dot.style.getPropertyValue('inset-inline-start')).toBe('');
  });

  test('une bulle se pose où l’hôte la place, quel que soit le sens de lecture', () => {
    const container = mount(<MeeshyChart kind="bubbles" points={[point('a', 488, { position: { x: 0.2, y: 0.4 } })]} summary="Pays" />);
    const bubble = container.querySelector('[data-kit-chart-bubble]') as HTMLElement;
    expect(bubble.style.left).toBe('20%');
    expect(bubble.style.top).toBe('40%');
  });

  test('l’axe garde ses bornes quand deux libellés se répètent (L M M J V)', () => {
    const container = mount(<MeeshyChart kind="bars" points={days} summary="Barres" axisLabels={['L', 'M', 'M', 'J', 'V']} />);
    const read = () => Array.from(container.querySelectorAll('[data-kit-chart-axis] span')).map((node) => node.textContent);
    expect(read()).toEqual(['L', 'M', 'M', 'J', 'V']);
    render(<MeeshyChart kind="bars" points={days} summary="Barres" axisLabels={['M', 'M', 'J', 'V', 'S']} />);
    expect(read()).toEqual(['M', 'M', 'J', 'V', 'S']);
  });
});
