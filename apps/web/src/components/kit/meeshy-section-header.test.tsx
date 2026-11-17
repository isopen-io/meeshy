import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshySectionHeader, meeshySectionHeaderRecipe } from './meeshy-section-header';

const { mount, act } = kitMount();

describe('MeeshySectionHeader — la recette en valeurs', () => {
  test('titre de 19 · 22 · 26, compteur de 16 sur 8 d’écart, ligne de 44 au moins', () => {
    expect((['compact', 'regular', 'large'] as const).map((size) => meeshySectionHeaderRecipe({ form: 'title', size }).titleSize)).toEqual([19, 22, 26]);
    expect(meeshySectionHeaderRecipe({ form: 'title' })).toMatchObject({ countSize: 16, countGap: 8, minHeight: 44 });
  });

  test('tête de 32 (44 en colonne), numéro d’ordre de 26, point en direct de 8 à 10 du titre, sur-titre de 11', () => {
    expect(meeshySectionHeaderRecipe({ form: 'title' }).leadSize).toBe(32);
    expect(meeshySectionHeaderRecipe({ form: 'column' }).leadSize).toBe(44);
    expect(meeshySectionHeaderRecipe({ form: 'step' }).leadSize).toBe(26);
    expect(meeshySectionHeaderRecipe({ form: 'title' })).toMatchObject({ liveDot: 8, liveGap: 10, leadGap: 10 });
    expect(meeshySectionHeaderRecipe({ form: 'overline' }).titleSize).toBe(11);
    expect(meeshySectionHeaderRecipe({ form: 'divider' })).toMatchObject({ titleSize: 11, ruleGap: 12 });
  });

  test('seules les formes titre, étape et colonne portent compteur et tête', () => {
    expect(meeshySectionHeaderRecipe({ form: 'divider' })).toMatchObject({ showsCount: false, showsLead: false });
    expect(meeshySectionHeaderRecipe({ form: 'overline' })).toMatchObject({ showsCount: false, showsLead: false });
    expect(meeshySectionHeaderRecipe({ form: 'column' })).toMatchObject({ showsCount: true, showsLead: true });
  });

  test('la capsule de verre n’existe que pour un bandeau de colonne qui colle', () => {
    expect(meeshySectionHeaderRecipe({ form: 'column', isSticky: true }).hasGlass).toBe(true);
    expect(meeshySectionHeaderRecipe({ form: 'column' }).hasGlass).toBe(false);
    expect(meeshySectionHeaderRecipe({ form: 'title', isSticky: true }).hasGlass).toBe(false);
  });
});

describe('MeeshySectionHeader — ce qu’on lit', () => {
  test('un titre de niveau demandé, lu avec son compteur puis son témoin « en direct »', () => {
    const container = mount(<MeeshySectionHeader title="Conversations" count={6} level={3} isLive liveLabel="en direct" />);
    const heading = container.querySelector('[role="heading"]');
    expect(heading?.getAttribute('aria-level')).toBe('3');
    expect(spokenText(heading as HTMLElement)).toBe('Conversations, 6, en direct');
  });

  test('le niveau est 2 par défaut', () => {
    const container = mount(<MeeshySectionHeader title="Conversations" />);
    expect(container.querySelector('[role="heading"]')?.getAttribute('aria-level')).toBe('2');
  });

  test('un compteur nul, zéro ou absent ne rend ni nombre ni écart', () => {
    for (const count of [undefined, 0]) {
      const container = mount(<MeeshySectionHeader title="Liens" count={count} />);
      expect(container.querySelector('[data-kit-section-count]')).toBeNull();
    }
  });

  test('un titre vide est refusé', () => {
    expect(() => mount(<MeeshySectionHeader title="" />)).toThrow();
  });

  test('un compteur en attente laisse un squelette tant que le cache est vide, jamais sur un nombre connu', () => {
    const waiting = mount(<MeeshySectionHeader title="Liens" isPending />);
    expect(waiting.querySelector('[data-kit-skeleton]')).not.toBeNull();
    const known = mount(<MeeshySectionHeader title="Liens" isPending count={4} />);
    expect(known.querySelector('[data-kit-skeleton]')).toBeNull();
    expect(known.querySelector('[data-kit-section-count]')?.textContent).toBe('4');
  });
});

describe('MeeshySectionHeader — un seul geste de fin', () => {
  test('statique : la ligne ne répond pas au toucher, seul l’accessoire se touche', () => {
    let toggles = 0;
    let presses = 0;
    const container = mount(<MeeshySectionHeader title="Conversations" trailing={<button type="button" onClick={() => (presses += 1)}>Tout voir</button>} onToggle={() => (toggles += 1)} />);
    act(() => (container.querySelector('[role="heading"]') as HTMLElement).click());
    expect(toggles).toBe(0);
    act(() => (container.querySelector('button') as HTMLElement).click());
    expect(presses).toBe(1);
  });

  test('repliable : un seul bouton dit développé ou réduit et demande l’état contraire, une fois', () => {
    const asked: boolean[] = [];
    const container = mount(<MeeshySectionHeader title="En commun" disclosure={{ expanded: true, controls: 'body' }} onToggle={(next) => asked.push(next)} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-controls')).toBe('body');
    act(() => (buttons[0] as HTMLElement).click());
    expect(asked).toEqual([false]);
  });

  test('repliable : le chevron et le point sont muets, aucun état d’ouverture n’est gardé', () => {
    const container = mount(<MeeshySectionHeader title="En commun" isLive disclosure={{ expanded: false }} onToggle={() => {}} />);
    expect(container.querySelector('[data-kit-section-chevron]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  test('une étape dit son état en mots : le numéro ou la coche sont muets', () => {
    const container = mount(<MeeshySectionHeader title="Choisir" form="step" index={2} step="current" stepLabel="étape 2, en cours" />);
    expect(spokenText(container.querySelector('[role="heading"]') as HTMLElement)).toContain('étape 2, en cours');
    expect(container.querySelector('[data-kit-section-lead]')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('MeeshySectionHeader — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucune police ni couleur écrite en dur', () => {
    for (const file of ['./meeshy-section-header.tsx', './meeshy-section-header-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|#[0-9a-fA-F]{3,6}\b/);
    }
  });
});
