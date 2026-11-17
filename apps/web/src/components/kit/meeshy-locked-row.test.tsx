import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { installHapticsDriver } from '@/lib/view/haptics';
import { kitMount } from '@/test-support/kit-mount';

import { MeeshyLockedGroup, MeeshyLockedRow, meeshyLockedRowRecipe } from './meeshy-locked-row';

const { mount, render, act } = kitMount();

const WORDS = { locked: 'verrouillé', unlocked: 'déverrouillé', pending: 'en cours' } as const;

afterEach(() => installHapticsDriver(null));

describe('MeeshyLockedRow — la recette en valeurs', () => {
  test('pointillé 1,5 en 5 / 4,4 ; rayon 20 en rangée, 24 en tuile', () => {
    expect(meeshyLockedRowRecipe({ form: 'row' })).toMatchObject({ strokeWidth: 1.5, dash: [5, 4.4], radius: 20, border: 'dashed', showsLock: true });
    expect(meeshyLockedRowRecipe({ form: 'tile' }).radius).toBe(24);
  });

  test('cadenas de 22, de 16 en mention ; glyphe de la chose de 28 ; capsule de 44 ; puce de 30', () => {
    expect(meeshyLockedRowRecipe({ form: 'row' })).toMatchObject({ lockSize: 22, actionHeight: 44, chipHeight: 30 });
    expect(meeshyLockedRowRecipe({ form: 'tile' }).glyphSize).toBe(28);
    expect(meeshyLockedRowRecipe({ form: 'inline' })).toMatchObject({ lockSize: 16, border: 'none' });
  });

  test('avec un geste, l’exigence passe sous le titre ; sans, elle est une puce', () => {
    expect(meeshyLockedRowRecipe({ form: 'row', hasAction: true }).requirementPlacement).toBe('line');
    expect(meeshyLockedRowRecipe({ form: 'row', hasAction: false }).requirementPlacement).toBe('chip');
    expect(meeshyLockedRowRecipe({ form: 'inline' }).requirementPlacement).toBe('inline');
  });

  test('ouvert : trait plein, plus de cadenas', () => {
    expect(meeshyLockedRowRecipe({ form: 'row', isOpen: true })).toMatchObject({ border: 'solid', showsLock: false });
  });

  test('pressé : échelle 0,975 ; geste désactivé : 40 % sur la capsule seule', () => {
    expect(meeshyLockedRowRecipe({ form: 'row', isPressed: true }).pressedScale).toBe(0.975);
    expect(meeshyLockedRowRecipe({ form: 'row', hasAction: true, isEnabled: false })).toMatchObject({ actionOpacity: 0.4, rowOpacity: 1 });
  });

  test('l’ouverture dure 420 ms, 160 en mouvement réduit', () => {
    expect(meeshyLockedRowRecipe({ form: 'row', isUnlocking: true }).unlockMs).toBe(420);
    expect(meeshyLockedRowRecipe({ form: 'row', isUnlocking: true, reduceMotion: true }).unlockMs).toBe(160);
  });

  test('au repos, aucun mouvement', () => {
    expect(meeshyLockedRowRecipe({ form: 'row' }).isAnimated).toBe(false);
  });
});

describe('MeeshyLockedRow — le composant', () => {
  test('un seul élément, dit « Présence, verrouillé, dès Ami »', () => {
    const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} />);
    const root = container.querySelector('[data-kit-locked-row]');
    expect(root?.getAttribute('aria-label')).toBe('Présence, verrouillé, dès Ami');
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelector('[data-kit-lock]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('titre obligatoire et non vide', () => {
    expect(() => mount(<MeeshyLockedRow title="" requirement="dès Ami" words={WORDS} />)).toThrow();
  });

  test('onPress : la rangée devient un bouton', () => {
    let presses = 0;
    const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} onPress={() => (presses += 1)} />);
    const button = container.querySelector<HTMLButtonElement>('button[data-kit-locked-row]');
    expect(button).not.toBeNull();
    act(() => button?.click());
    expect(presses).toBe(1);
  });

  test('le geste est un second bouton nommé par son titre ; il ne déclenche pas la rangée', () => {
    let performed = 0;
    let presses = 0;
    const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} onPress={() => (presses += 1)} action={{ title: 'Demander', perform: () => (performed += 1) }} />);
    const action = container.querySelector<HTMLButtonElement>('[data-kit-locked-action]');
    expect(action?.textContent).toBe('Demander');
    act(() => action?.click());
    expect(performed).toBe(1);
    expect(presses).toBe(0);
  });

  test('geste en cours : dit « en cours », ne se rejoue pas ; fait : désactivé', () => {
    let performed = 0;
    const perform = () => (performed += 1);
    const pending = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} action={{ title: 'Demander', isPending: true, perform }} />);
    const pendingButton = pending.querySelector<HTMLButtonElement>('[data-kit-locked-action]');
    expect(pendingButton?.getAttribute('aria-label')).toBe('Demander, en cours');
    act(() => pendingButton?.click());
    expect(performed).toBe(0);
    const done = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} action={{ title: 'Demandé', isDone: true, perform }} />);
    expect(done.querySelector<HTMLButtonElement>('[data-kit-locked-action]')?.disabled).toBe(true);
  });

  test('inline ignore le geste et le glyphe', () => {
    const container = mount(<MeeshyLockedRow form="inline" title="Batterie" requirement="dès Proche" words={WORDS} glyph={<i>g</i>} action={{ title: 'Demander', perform: () => {} }} />);
    expect(container.querySelector('[data-kit-locked-action]')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
  });

  test('tuile : le glyphe de la chose est affiché', () => {
    const container = mount(<MeeshyLockedRow form="tile" title="Cadre Or" requirement="niveau 30" words={WORDS} glyph={<i data-g="">g</i>} />);
    expect(container.querySelector('[data-g]')).not.toBeNull();
  });

  test('ouvert : le pendant du fermé, plus de cadenas, dit « déverrouillé »', () => {
    const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isOpen glyph={<i>g</i>} />);
    expect(container.querySelector('[data-kit-lock]')).toBeNull();
    expect(container.querySelector('[data-kit-locked-row]')?.getAttribute('aria-label')).toBe('Présence, déverrouillé');
  });

  test('label de l’hôte remplace le nom dit', () => {
    const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} label="Présence réservée" />);
    expect(container.querySelector('[data-kit-locked-row]')?.getAttribute('aria-label')).toBe('Présence réservée');
  });

  describe('ouverture', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('isUnlocking joue l’ouverture une fois, puis onUnlocked part une fois, après 420 ms', () => {
      let unlocked = 0;
      const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} onUnlocked={() => (unlocked += 1)} />);
      render(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking onUnlocked={() => (unlocked += 1)} />);
      expect(container.querySelector('[data-kit-locked-row]')?.hasAttribute('data-unlocking')).toBe(true);
      act(() => jest.advanceTimersByTime(419));
      expect(unlocked).toBe(0);
      act(() => jest.advanceTimersByTime(1));
      expect(unlocked).toBe(1);
      render(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking onUnlocked={() => (unlocked += 1)} />);
      act(() => jest.advanceTimersByTime(2000));
      expect(unlocked).toBe(1);
    });

    test('un tic de succès part quand l’anse saute, jamais au repos', () => {
      const played: string[] = [];
      installHapticsDriver({ cue: (name) => (played.push(name), true), pattern: () => true });
      mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} />);
      expect(played).toEqual([]);
      render(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking />);
      expect(played).toEqual(['success']);
    });

    test('haptic none laisse l’hôte jouer le sien', () => {
      const played: string[] = [];
      installHapticsDriver({ cue: (name) => (played.push(name), true), pattern: () => true });
      mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking haptic="none" />);
      expect(played).toEqual([]);
    });

    test('rien ne part si la rangée disparaît avant la fin', () => {
      let unlocked = 0;
      mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking onUnlocked={() => (unlocked += 1)} />);
      render(<div />);
      act(() => jest.advanceTimersByTime(2000));
      expect(unlocked).toBe(0);
    });

    test('l’ouverture est dite une fois, poliment : « Présence, déverrouillé »', () => {
      const container = mount(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} />);
      expect(container.querySelector('[role="status"]')?.textContent).toBe('');
      render(<MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS} isUnlocking />);
      expect(container.querySelector('[role="status"]')?.textContent).toBe('Présence, déverrouillé');
    });
  });
});

describe('MeeshyLockedGroup', () => {
  test('replié : une rangée, le compte, aria-expanded faux ; les choses ne sont pas dans l’arbre', () => {
    const container = mount(
      <MeeshyLockedGroup title="3 choses réservées" requirement="dès Proche" count={3} expanded={false} onExpandedChange={() => {}} words={WORDS}>
        <MeeshyLockedRow form="inline" title="Position" requirement="dès Proche" words={WORDS} />
      </MeeshyLockedGroup>,
    );
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('[data-kit-lock]').length).toBeLessThanOrEqual(3);
    expect(container.textContent).not.toContain('Position');
  });

  test('déplié : l’exigence n’est dite qu’une fois, la bascule appelle l’hôte', () => {
    const changes: boolean[] = [];
    const container = mount(
      <MeeshyLockedGroup title="3 choses réservées" requirement="dès Proche" count={3} expanded onExpandedChange={(next) => changes.push(next)} words={WORDS}>
        <MeeshyLockedRow form="inline" title="Position" requirement="dès Proche" words={WORDS} />
      </MeeshyLockedGroup>,
    );
    expect(container.textContent).toContain('Position');
    act(() => container.querySelector('button')?.click());
    expect(changes).toEqual([false]);
  });
});

describe('MeeshyLockedRow — rien de protégé', () => {
  test('aucune valeur, aucune image, aucun compte, aucun flou, aucun masque, aucun type du domaine', () => {
    for (const file of ['./meeshy-locked-row.tsx', './meeshy-locked-row-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/blur|backdrop-filter|filter:|mask|@meeshy\/shared|@\/stores|@\/lib\/api|<img/i);
    }
  });

  test('la signature ne reçoit que des textes, un glyphe, un geste', () => {
    const text = readFileSync(fileURLToPath(new URL('./meeshy-locked-row.tsx', import.meta.url)), 'utf8');
    const props = /export type MeeshyLockedRowProps = \{([\s\S]*?)\n\};/.exec(text)?.[1] ?? '';
    const names = [...props.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(name).not.toMatch(/value|image|src|url|account|user|content|data/i);
  });
});
