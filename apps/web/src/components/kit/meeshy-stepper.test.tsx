import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyStepper, meeshyStepperHoldInterval, meeshyStepperNext, meeshyStepperRecipe, type MeeshyStepperStop } from './meeshy-stepper';

const { mount, render, act } = kitMount();

const STOPS: readonly MeeshyStepperStop[] = [{ id: 'city', title: 'Ville' }, { id: 'quarter', title: 'Quartier' }, { id: 'exact', title: 'Exact' }];
const MILESTONES: readonly MeeshyStepperStop[] = [
  { id: 'a', title: 'Premier message', caption: '6 mars' },
  { id: 'b', title: 'Amis', caption: '11 mars' },
  { id: 'c', title: 'Proches' },
];

describe('MeeshyStepper — la loi du pas', () => {
  test('ne rend jamais une valeur hors de la plage, quel que soit le pas', () => {
    for (const [value, delta, step] of [[48, 1, 10], [3, -1, 10], [50, 1, 1], [1, -1, 1], [5, 1, 1000]] as const) {
      const next = meeshyStepperNext({ value, delta, range: { min: 1, max: 50 }, step });
      expect(next.value).toBeGreaterThanOrEqual(1);
      expect(next.value).toBeLessThanOrEqual(50);
    }
  });

  test('à la borne : hitBound, la valeur ne bouge pas', () => {
    expect(meeshyStepperNext({ value: 50, delta: 1, range: { min: 1, max: 50 } })).toEqual({ value: 50, hitBound: true });
    expect(meeshyStepperNext({ value: 1, delta: -1, range: { min: 1, max: 50 } })).toEqual({ value: 1, hitBound: true });
    expect(meeshyStepperNext({ value: 20, delta: 1, range: { min: 1, max: 50 } })).toEqual({ value: 21, hitBound: false });
  });

  test('atteindre la borne par un pas qui la dépasse ramène à la borne sans la déclarer butée', () => {
    expect(meeshyStepperNext({ value: 48, delta: 1, range: { min: 1, max: 50 }, step: 10 })).toEqual({ value: 50, hitBound: false });
  });

  test('l’échelle des pas grandit avec la valeur', () => {
    const ladder = [{ from: 0, step: 1 }, { from: 100, step: 10 }, { from: 1000, step: 100 }];
    expect(meeshyStepperNext({ value: 50, delta: 1, range: { min: 0, max: 5000 }, ladder }).value).toBe(51);
    expect(meeshyStepperNext({ value: 150, delta: 1, range: { min: 0, max: 5000 }, ladder }).value).toBe(160);
    expect(meeshyStepperNext({ value: 1500, delta: -1, range: { min: 0, max: 5000 }, ladder }).value).toBe(1400);
  });

  test('l’appui long répète d’abord toutes les 120 ms, puis toutes les 60', () => {
    expect(meeshyStepperHoldInterval(0)).toBe(120);
    expect(meeshyStepperHoldInterval(20)).toBe(60);
  });
});

describe('MeeshyStepper — la recette', () => {
  test('moins de 2 ou plus de 5 arrêts : rien n’est rendu', () => {
    expect(meeshyStepperRecipe({ kind: 'track', value: 0, stopCount: 1 }).isRenderable).toBe(false);
    expect(meeshyStepperRecipe({ kind: 'track', value: 0, stopCount: 6 }).isRenderable).toBe(false);
    expect(meeshyStepperRecipe({ kind: 'milestones', value: 0, stopCount: 5 }).isRenderable).toBe(true);
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 3, range: { min: 1, max: 8 } }).isRenderable).toBe(true);
  });

  test('boutons : disques de 44 ou de 36, cible toujours 44, capsule de 50', () => {
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 3, range: { min: 1, max: 8 } })).toMatchObject({ disc: 44, tapTarget: 44, capsuleHeight: 50 });
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 3, range: { min: 1, max: 8 }, size: 'compact' })).toMatchObject({ disc: 36, tapTarget: 44 });
  });

  test('aux bornes, le bouton concerné s’atténue à 36 %', () => {
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 8, range: { min: 1, max: 8 } })).toMatchObject({ canIncrement: false, canDecrement: true, boundOpacity: 0.36 });
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 1, range: { min: 1, max: 8 } })).toMatchObject({ canIncrement: true, canDecrement: false });
  });

  test('désactivé : toute la capsule à 42 %', () => {
    expect(meeshyStepperRecipe({ kind: 'buttons', value: 3, range: { min: 1, max: 8 }, isEnabled: false }).opacity).toBe(0.42);
  });

  test('piste : le remplissage va du premier arrêt au cran choisi', () => {
    expect(meeshyStepperRecipe({ kind: 'track', value: 1, stopCount: 3 }).fill).toBe(0.5);
    expect(meeshyStepperRecipe({ kind: 'track', value: 2, stopCount: 3 }).fill).toBe(1);
    expect(meeshyStepperRecipe({ kind: 'track', value: 9, stopCount: 3 }).fill).toBe(1);
  });

  test('piste : la ligne fait 3, le repère de 10 à 56 dans une case de 60', () => {
    expect(meeshyStepperRecipe({ kind: 'track', value: 0, stopCount: 3 })).toMatchObject({ trackLine: 3, markMin: 10, markMax: 56, markCell: 60 });
  });

  test('jalons : la trace s’arrête au courant, rien ne se dessine en mouvement réduit', () => {
    expect(meeshyStepperRecipe({ kind: 'milestones', value: 2, stopCount: 4 })).toMatchObject({ fill: 2 / 3, drawsTrace: true });
    expect(meeshyStepperRecipe({ kind: 'milestones', value: 2, stopCount: 4, reduceMotion: true }).drawsTrace).toBe(false);
  });

  test('RTL : l’origine passe à la fin', () => {
    expect(meeshyStepperRecipe({ kind: 'track', value: 1, stopCount: 3, isRtl: true }).origin).toBe('end');
  });
});

describe('MeeshyStepper — boutons', () => {
  const buttons = (container: HTMLElement) => ({
    minus: container.querySelector<HTMLButtonElement>('[data-kit-stepper-minus]') as HTMLButtonElement,
    plus: container.querySelector<HTMLButtonElement>('[data-kit-stepper-plus]') as HTMLButtonElement,
  });
  const press = (node: HTMLElement) => act(() => {
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });
  const release = (node: HTMLElement) => act(() => {
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    });

  const props = { label: 'Nombre d’entrées', range: { min: 1, max: 50 }, decrementLabel: 'Moins d’entrées', incrementLabel: 'Plus d’entrées' } as const;

  test('un groupe nommé, deux boutons nommés, la valeur dite après chaque pas', () => {
    const container = mount(<MeeshyStepper {...props} value={50} spokenValue="50 entrées" onChange={() => {}} />);
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Nombre d’entrées');
    const { minus, plus } = buttons(container);
    expect(minus.getAttribute('aria-label')).toBe('Moins d’entrées');
    expect(plus.getAttribute('aria-label')).toBe('Plus d’entrées');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('50 entrées');
  });

  test('sans valeur dite : le nombre', () => {
    const container = mount(<MeeshyStepper {...props} value={7} onChange={() => {}} />);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('7');
  });

  test('la valeur change à l’appui, pas au relâcher', () => {
    const changes: number[] = [];
    const container = mount(<MeeshyStepper {...props} value={7} onChange={(value) => changes.push(value)} />);
    press(buttons(container).plus);
    expect(changes).toEqual([8]);
    release(buttons(container).plus);
    expect(changes).toEqual([8]);
  });

  test('au clavier, un bouton fait un pas, une fois', () => {
    const changes: number[] = [];
    const container = mount(<MeeshyStepper {...props} value={7} onChange={(value) => changes.push(value)} />);
    act(() => buttons(container).minus.click());
    expect(changes).toEqual([6]);
  });

  test('à la butée : onChange ne part pas, onBound part, le bouton reste focusable et dit « maximum atteint »', () => {
    const changes: number[] = [];
    let bounds = 0;
    const container = mount(<MeeshyStepper {...props} value={50} maximumLabel="maximum atteint" minimumLabel="minimum atteint" onChange={(value) => changes.push(value)} onBound={() => (bounds += 1)} />);
    const { plus } = buttons(container);
    expect(plus.disabled).toBe(false);
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    press(plus);
    expect(changes).toEqual([]);
    expect(bounds).toBe(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('maximum atteint');
  });

  test('désactivé : rien ne part', () => {
    const changes: number[] = [];
    const container = mount(<MeeshyStepper {...props} value={7} isEnabled={false} onChange={(value) => changes.push(value)} />);
    press(buttons(container).plus);
    expect(changes).toEqual([]);
    expect(buttons(container).plus.disabled).toBe(true);
  });

  test('valueContent remplace le nombre sans changer la voix', () => {
    const container = mount(<MeeshyStepper {...props} value={7} valueContent={<b>sept</b>} onChange={() => {}} />);
    expect(container.querySelector('b')?.textContent).toBe('sept');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('7');
  });

  describe('appui long', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('répète après 400 ms et s’arrête au relâcher : aucune minuterie ne survit', () => {
      let value = 10;
      const container = mount(<MeeshyStepper {...props} value={value} onChange={(next) => (value = next)} />);
      press(buttons(container).plus);
      expect(value).toBe(11);
      act(() => jest.advanceTimersByTime(399));
      expect(value).toBe(11);
      act(() => jest.advanceTimersByTime(1));
      expect(value).toBe(12);
      act(() => jest.advanceTimersByTime(120));
      expect(value).toBe(13);
      release(buttons(container).plus);
      act(() => jest.advanceTimersByTime(5000));
      expect(value).toBe(13);
    });

    test('la répétition s’arrête à la borne', () => {
      const changes: number[] = [];
      const container = mount(<MeeshyStepper {...props} range={{ min: 1, max: 12 }} value={10} onChange={(next) => changes.push(next)} />);
      act(() => {
        buttons(container).plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      });
      act(() => jest.advanceTimersByTime(400));
      expect(changes.length).toBeGreaterThan(0);
    });

    test('repeatsOnHold faux : un appui, un pas', () => {
      let value = 10;
      const container = mount(<MeeshyStepper {...props} value={value} repeatsOnHold={false} onChange={(next) => (value = next)} />);
      press(buttons(container).plus);
      act(() => jest.advanceTimersByTime(3000));
      expect(value).toBe(11);
    });

    test('quitter l’écran coupe la répétition', () => {
      let calls = 0;
      const container = mount(<MeeshyStepper {...props} value={10} onChange={() => (calls += 1)} />);
      press(buttons(container).plus);
      act(() => render(<div />));
      act(() => jest.advanceTimersByTime(5000));
      expect(calls).toBe(1);
    });
  });
});

describe('MeeshyStepper — piste', () => {
  test('un groupe de boutons radio : « Quartier, 2 / 3 », le choisi coché', () => {
    const container = mount(<MeeshyStepper kind="track" label="Précision" value={1} stops={STOPS} onChange={() => {}} />);
    const radios = [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Précision');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Ville, 1 / 3', 'Quartier, 2 / 3', 'Exact, 3 / 3']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  test('toucher un arrêt appelle onChange avec son indice', () => {
    const changes: number[] = [];
    const container = mount(<MeeshyStepper kind="track" label="Précision" value={1} stops={STOPS} onChange={(index) => changes.push(index)} />);
    act(() => container.querySelectorAll<HTMLElement>('[role="radio"]')[2]?.click());
    expect(changes).toEqual([2]);
  });

  test('chaque colonne se touche sur 44 au moins', () => {
    const container = mount(<MeeshyStepper kind="track" label="Précision" value={1} stops={STOPS} onChange={() => {}} />);
    expect(container.querySelector<HTMLElement>('[data-kit-stepper]')?.style.getPropertyValue('--kit-stepper-target')).toBe('2.75rem');
  });

  test('la taille d’un repère est libre, bornée de 10 à 56', () => {
    const stops: readonly MeeshyStepperStop[] = [{ id: 'a', title: 'A', markSize: 4 }, { id: 'b', title: 'B', markSize: 90 }];
    const container = mount(<MeeshyStepper kind="track" label="Taille" value={0} stops={stops} onChange={() => {}} />);
    const sizes = [...container.querySelectorAll<HTMLElement>('[data-kit-stepper-mark]')].map((mark) => mark.style.getPropertyValue('--kit-stepper-mark'));
    expect(sizes).toEqual(['0.625rem', '3.5rem']);
  });

  test('flèches : suivant et précédent, bornés', () => {
    const changes: number[] = [];
    const container = mount(<MeeshyStepper kind="track" label="Précision" value={2} stops={STOPS} onChange={(index) => changes.push(index)} />);
    const current = container.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    act(() => {
      current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(changes).toEqual([]);
    act(() => {
      current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(changes).toEqual([1]);
  });

  test('un seul arrêt : rien n’est rendu', () => {
    expect(mount(<MeeshyStepper kind="track" label="Précision" value={0} stops={STOPS.slice(0, 1)} onChange={() => {}} />).children.length).toBe(0);
  });
});

describe('MeeshyStepper — jalons', () => {
  test('une liste en lecture seule : aucun bouton, l’étape courante dite', () => {
    const container = mount(<MeeshyStepper kind="milestones" label="Notre histoire" value={1} stops={MILESTONES} />);
    expect(container.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Notre histoire');
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(3);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Amis');
  });

  test('fait, courant, à faire : trois états, jamais la couleur seule', () => {
    const container = mount(<MeeshyStepper kind="milestones" label="Histoire" value={1} stops={MILESTONES} stateLabels={{ done: 'fait', current: 'en cours', todo: 'à faire' }} />);
    const items = [...container.querySelectorAll<HTMLElement>('[role="listitem"]')];
    expect(items.map((item) => item.getAttribute('data-state'))).toEqual(['done', 'current', 'todo']);
    expect(items[0]?.textContent).toContain('fait');
    expect(items[1]?.textContent).toContain('en cours');
    expect(items[2]?.textContent).toContain('à faire');
  });

  test('la légende est facultative, le titre obligatoire', () => {
    const container = mount(<MeeshyStepper kind="milestones" label="Histoire" value={0} stops={MILESTONES} />);
    expect(container.textContent).toContain('6 mars');
    expect(container.textContent).toContain('Proches');
  });
});

describe('MeeshyStepper — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun verre dessiné, aucune valeur hors recette', () => {
    const component = readFileSync(fileURLToPath(new URL('./meeshy-stepper.tsx', import.meta.url)), 'utf8');
    const recipe = readFileSync(fileURLToPath(new URL('./meeshy-stepper-recipe.ts', import.meta.url)), 'utf8');
    for (const text of [component, recipe]) expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter|box-shadow/);
    expect(component).not.toMatch(/\b(?:400|120)\b/);
  });
});
