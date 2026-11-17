import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyMapTrace, meeshyMapTracePath, meeshyMapTraceRecipe } from './meeshy-map-trace';

const { mount, act } = kitMount();
const route = [{ x: 20, y: 160 }, { x: 90, y: 90 }, { x: 170, y: 120 }, { x: 260, y: 40 }];

describe('meeshyMapTracePath — la loi du chemin', () => {
  test('rien sous deux points, ni sous 24 de longueur à l’écran', () => {
    expect(meeshyMapTracePath({ points: [{ x: 0, y: 0 }], kind: 'route' }).isDrawable).toBe(false);
    expect(meeshyMapTracePath({ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], kind: 'route' }).isDrawable).toBe(false);
    expect(meeshyMapTracePath({ points: route, kind: 'route' }).isDrawable).toBe(true);
  });

  test('link ne lit que le premier et le dernier point : une droite', () => {
    const path = meeshyMapTracePath({ points: route, kind: 'link' });
    expect(path.d).toBe('M20 160L260 40');
    expect(path.length).toBeCloseTo(Math.hypot(240, 120), 5);
  });

  test('lissé, le chemin passe par chaque point ; non lissé, ce sont des segments droits', () => {
    const smooth = meeshyMapTracePath({ points: route, kind: 'route', smoothing: true });
    expect(smooth.d.startsWith('M20 160C')).toBe(true);
    expect(smooth.d).toContain('260 40');
    const straight = meeshyMapTracePath({ points: route, kind: 'route', smoothing: false });
    expect(straight.d).toBe('M20 160L90 90L170 120L260 40');
  });

  test('chaque arrêt a sa fraction du chemin, de 0 à 1, croissante', () => {
    const path = meeshyMapTracePath({ points: route, kind: 'history', smoothing: false });
    expect(path.fractions[0]).toBe(0);
    expect(path.fractions[3]).toBeCloseTo(1, 5);
    expect(path.fractions[1]).toBeGreaterThan(0);
    expect(path.fractions[1]).toBeLessThan(path.fractions[2] as number);
  });

  test('le milieu du chemin tombe au point de mi-longueur', () => {
    const path = meeshyMapTracePath({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], kind: 'link' });
    expect(path.midpoint).toEqual({ x: 50, y: 0 });
  });
});

describe('MeeshyMapTrace — la recette en valeurs', () => {
  test('route : points de 4 tous les 10, trait de 7 sur liseré ; grand : 4,5 sur 8', () => {
    expect(meeshyMapTraceRecipe({ kind: 'route', weight: 'regular' })).toMatchObject({ dot: 4, dotEvery: 10, casing: 7 });
    expect(meeshyMapTraceRecipe({ kind: 'route', weight: 'large' })).toMatchObject({ dot: 4.5, dotEvery: 11, casing: 8 });
  });

  test('link : 2,5 ; history : 7 sur halo de 16 ; ni l’un ni l’autre ne dépend du poids', () => {
    expect(meeshyMapTraceRecipe({ kind: 'link', weight: 'large' }).stroke).toBe(2.5);
    expect(meeshyMapTraceRecipe({ kind: 'history', weight: 'large' })).toMatchObject({ stroke: 7, halo: 16 });
  });

  test('le liseré passe de 55 % à 70 % sur une carte claire', () => {
    expect(meeshyMapTraceRecipe({ kind: 'route' }).casingOpacity).toBe(0.55);
    expect(meeshyMapTraceRecipe({ kind: 'route', onLightMap: true }).casingOpacity).toBe(0.7);
  });

  test('périmé : désaturé à 60 % et immobile ; history ne défile jamais ; mouvement réduit : trait fixe', () => {
    expect(meeshyMapTraceRecipe({ kind: 'route', isStale: true })).toMatchObject({ opacity: 0.6, flows: false });
    expect(meeshyMapTraceRecipe({ kind: 'history' }).flows).toBe(false);
    expect(meeshyMapTraceRecipe({ kind: 'route' }).flows).toBe(true);
    expect(meeshyMapTraceRecipe({ kind: 'route', reduceMotion: true }).flows).toBe(false);
    expect(meeshyMapTraceRecipe({ kind: 'route', isAnimated: false }).flows).toBe(false);
  });

  test('la progression est bornée de 0 à 1 ; nulle : chemin entier, pas de tête', () => {
    expect(meeshyMapTraceRecipe({ kind: 'history', progress: 1.7 }).progress).toBe(1);
    expect(meeshyMapTraceRecipe({ kind: 'history', progress: -2 }).progress).toBe(0);
    expect(meeshyMapTraceRecipe({ kind: 'history' })).toMatchObject({ progress: null, hasHead: false });
    expect(meeshyMapTraceRecipe({ kind: 'history', progress: 0.45 }).hasHead).toBe(true);
  });

  test('l’étiquette de milieu est cachée sous 96 de longueur', () => {
    expect(meeshyMapTraceRecipe({ kind: 'route', length: 80 }).showsMidLabel).toBe(false);
    expect(meeshyMapTraceRecipe({ kind: 'route', length: 96 }).showsMidLabel).toBe(true);
  });
});

describe('MeeshyMapTrace — ce qu’on lit', () => {
  test('une image nommée, cachée à la voix pour ses détails, qui ne reçoit pas le toucher', () => {
    const container = mount(<MeeshyMapTrace label="Trajet vers Léo, 2,4 km, 30 minutes à pied" points={route} kind="route" />);
    const trace = container.querySelector('[data-kit-map-trace]') as HTMLElement;
    expect(trace.getAttribute('role')).toBe('img');
    expect(trace.getAttribute('aria-label')).toBe('Trajet vers Léo, 2,4 km, 30 minutes à pied');
    expect(trace.style.pointerEvents).toBe('none');
  });

  test('trop court : rien n’est dessiné, aucune place réservée', () => {
    const container = mount(<MeeshyMapTrace label="Court" points={[{ x: 0, y: 0 }, { x: 10, y: 0 }]} kind="route" midCaption="2 m" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[data-kit-trace-mid]')).toBeNull();
  });

  test('l’étiquette de milieu est le texte de l’hôte, posée au milieu du chemin', () => {
    const container = mount(<MeeshyMapTrace label="Trajet" points={route} kind="route" midCaption="2,4 km · 30 min à pied" />);
    expect(container.querySelector('[data-kit-trace-mid]')?.textContent).toBe('2,4 km · 30 min à pied');
  });

  test('sans étiquette : le trait seul', () => {
    expect(mount(<MeeshyMapTrace label="Trajet" points={route} kind="route" />).querySelector('[data-kit-trace-mid]')).toBeNull();
  });

  test('les arrêts : texte opaque, ou boutons nommés « valeur, titre » quand l’hôte écoute', () => {
    const stops = [{ id: 's1', pointIndex: 1, value: '12:30', title: 'Marché' }, { id: 's2', pointIndex: 3, value: '17:42', title: 'Ici' }];
    const text = mount(<MeeshyMapTrace label="Journée" points={route} kind="history" stops={stops} />);
    expect(text.querySelectorAll('button').length).toBe(0);
    expect(text.querySelectorAll('[data-kit-trace-stop]').length).toBe(2);
    const pressed: string[] = [];
    const live = mount(<MeeshyMapTrace label="Journée" points={route} kind="history" stops={stops} onStopPress={(id) => pressed.push(id)} />);
    const button = live.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('12:30, Marché');
    act(() => button.click());
    expect(pressed).toEqual(['s1']);
  });

  test('un arrêt qui désigne un point inconnu est ignoré', () => {
    const container = mount(<MeeshyMapTrace label="Journée" points={route} kind="history" stops={[{ id: 'x', pointIndex: 9, value: '1', title: 'x' }]} />);
    expect(container.querySelectorAll('[data-kit-trace-stop]').length).toBe(0);
  });

  test('la tête de lecture suit la progression', () => {
    const container = mount(<MeeshyMapTrace label="Journée" points={route} kind="history" progress={0.5} />);
    expect(container.querySelector('[data-kit-trace-head]')).not.toBeNull();
    expect(mount(<MeeshyMapTrace label="Journée" points={route} kind="history" />).querySelector('[data-kit-trace-head]')).toBeNull();
  });
});

describe('MeeshyMapTrace — le repère des étiquettes', () => {
  test('un arrêt et l’étiquette du milieu se posent sous leur point dans les deux sens de lecture : coordonnées physiques, comme le tracé', () => {
    const container = mount(<MeeshyMapTrace label="Journée" points={route} kind="route" midCaption="2,4 km" stops={[{ id: 's1', pointIndex: 1, value: '12:30', title: 'Marché' }]} />);
    const stop = container.querySelector('[data-kit-trace-stop]') as HTMLElement;
    expect(stop.style.left).toBe('90px');
    expect(stop.style.top).toBe('102px');
    expect(stop.style.getPropertyValue('inset-inline-start')).toBe('');
    const mid = container.querySelector('[data-kit-trace-mid]') as HTMLElement;
    expect(mid.style.left).not.toBe('');
    expect(mid.style.getPropertyValue('inset-inline-start')).toBe('');
  });
});
