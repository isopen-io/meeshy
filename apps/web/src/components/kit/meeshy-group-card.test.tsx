import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyGroupCard, meeshyGroupCardRecipe } from './meeshy-group-card';

const { mount, act } = kitMount();

const dividers = (container: HTMLElement): readonly Element[] => Array.from(container.querySelectorAll('[data-kit-group-divider]'));

describe('MeeshyGroupCard — la recette en valeurs', () => {
  test('rayon 24 · 26 · 30 selon la taille, bord de 1', () => {
    expect((['compact', 'regular', 'large'] as const).map((size) => meeshyGroupCardRecipe({ size }).radius)).toEqual([24, 26, 30]);
    expect(meeshyGroupCardRecipe({}).borderWidth).toBe(1);
  });

  test('danger teinte fond, bord et filets ; solid rend une encre sombre ; dashed n’a pas de fond', () => {
    expect(meeshyGroupCardRecipe({ surface: 'danger' })).toMatchObject({ fill: 'danger', border: 'danger', rule: 'danger' });
    expect(meeshyGroupCardRecipe({ surface: 'solid' }).ink).toBe('dark');
    expect(meeshyGroupCardRecipe({ surface: 'dashed' })).toMatchObject({ fill: 'none', borderStyle: 'dashed' });
    expect(meeshyGroupCardRecipe({ surface: 'raised' })).toMatchObject({ fill: 'raised', borderStyle: 'solid' });
  });

  test('seul le gabarit group trace des filets, en retrait de 18 par défaut', () => {
    expect(meeshyGroupCardRecipe({ layout: 'group' })).toMatchObject({ tracesDividers: true, dividerInset: 18 });
    for (const layout of ['content', 'prompt', 'preview', 'action'] as const) expect(meeshyGroupCardRecipe({ layout }).tracesDividers).toBe(false);
  });

  test('le flou n’existe qu’en verre ; le coin de bulle passe à 8 côté auteur', () => {
    expect(meeshyGroupCardRecipe({ surface: 'glass' }).usesGlass).toBe(true);
    expect(meeshyGroupCardRecipe({ surface: 'accent' }).usesGlass).toBe(false);
    expect(meeshyGroupCardRecipe({ tail: 'trailing' }).tailRadius).toBe(8);
    expect(meeshyGroupCardRecipe({}).tailRadius).toBeNull();
  });

  test('verrouillée : contenu à 42 % ; en évidence : halo de 4', () => {
    expect(meeshyGroupCardRecipe({ isLocked: true }).contentOpacity).toBe(0.42);
    expect(meeshyGroupCardRecipe({ isHighlighted: true }).haloWidth).toBe(4);
    expect(meeshyGroupCardRecipe({}).haloWidth).toBe(0);
  });
});

describe('MeeshyGroupCard — filets et emplacements', () => {
  test('N enfants rendent N − 1 filets ; zéro ou un enfant, aucun', () => {
    expect(dividers(mount(<MeeshyGroupCard><p>a</p><p>b</p><p>c</p></MeeshyGroupCard>)).length).toBe(2);
    expect(dividers(mount(<MeeshyGroupCard><p>a</p></MeeshyGroupCard>)).length).toBe(0);
    expect(dividers(mount(<MeeshyGroupCard>{null}</MeeshyGroupCard>)).length).toBe(0);
  });

  test('un enfant qui ne rend rien ne laisse ni filet ni vide', () => {
    const container = mount(
      <MeeshyGroupCard>
        <p>a</p>
        {false}
        {null}
        <p>b</p>
      </MeeshyGroupCard>,
    );
    expect(dividers(container).length).toBe(1);
  });

  test('un gabarit qui n’est pas group ne trace aucun filet', () => {
    expect(dividers(mount(<MeeshyGroupCard layout="content"><p>a</p><p>b</p></MeeshyGroupCard>)).length).toBe(0);
  });

  test('sans sur-titre ni accessoire : aucun en-tête ; sans pied, média ni emblème : rien de réservé', () => {
    const container = mount(<MeeshyGroupCard><p>a</p></MeeshyGroupCard>);
    expect(container.querySelector('[data-kit-group-header]')).toBeNull();
    expect(container.querySelector('[data-kit-group-footer]')).toBeNull();
    expect(container.querySelector('[data-kit-group-media]')).toBeNull();
    expect(container.querySelector('[data-kit-group-emblem]')).toBeNull();
  });

  test('le sur-titre est un titre lisible, rendu par l’en-tête de section du kit', () => {
    const container = mount(<MeeshyGroupCard overline="Où il est"><p>a</p></MeeshyGroupCard>);
    expect(container.querySelector('[role="heading"]')?.textContent).toContain('Où il est');
    expect(container.querySelector('[data-kit-group-header] [data-kit-section-header]')).not.toBeNull();
  });

  test('un accessoire d’en-tête seul suffit à ouvrir l’en-tête', () => {
    const container = mount(<MeeshyGroupCard headerTrailing={<span>42 min</span>}><p>a</p></MeeshyGroupCard>);
    expect(container.querySelector('[data-kit-group-header]')?.textContent).toContain('42 min');
  });

  test('média, emblème et pied se posent à leur emplacement', () => {
    const container = mount(<MeeshyGroupCard media={<i>map</i>} emblem={<b>E</b>} footer={<u>Voir</u>}><p>a</p></MeeshyGroupCard>);
    expect(container.querySelector('[data-kit-group-media]')?.textContent).toBe('map');
    expect(container.querySelector('[data-kit-group-emblem]')?.textContent).toBe('E');
    expect(container.querySelector('[data-kit-group-footer]')?.textContent).toBe('Voir');
  });
});

describe('MeeshyGroupCard — nom, rôle, valeur', () => {
  test('sans onPress : un groupe nommé par son sur-titre, aucun bouton de carte', () => {
    const container = mount(<MeeshyGroupCard overline="Où il est"><p>a</p></MeeshyGroupCard>);
    const group = container.querySelector('[role="group"]');
    expect(group).not.toBeNull();
    expect(container.querySelector('[data-kit-group-hit]')).toBeNull();
  });

  test('le nom du groupe EST son sur-titre : aria-labelledby mène au texte du sur-titre, l’accessoire n’y entre pas', () => {
    const container = mount(<MeeshyGroupCard overline="Où il est" headerTrailing={<button type="button">Modifier</button>}><p>a</p></MeeshyGroupCard>);
    const group = container.querySelector('[role="group"]') as HTMLElement;
    const ids = (group.getAttribute('aria-labelledby') ?? '').split(' ').filter((id) => id !== '');
    expect(ids.length).toBeGreaterThan(0);
    const name = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    expect(name).toBe('Où il est');
  });

  test('avec onPress : un seul bouton nommé, qui répond une fois', () => {
    let presses = 0;
    const container = mount(<MeeshyGroupCard label="Carte de Léo" onPress={() => (presses += 1)}><p>a</p></MeeshyGroupCard>);
    const hit = container.querySelector('[data-kit-group-hit]') as HTMLElement;
    expect(hit.tagName).toBe('BUTTON');
    expect(hit.getAttribute('aria-label')).toBe('Carte de Léo');
    act(() => hit.click());
    expect(presses).toBe(1);
  });

  test('onPress sans label échoue', () => {
    expect(() => mount(<MeeshyGroupCard onPress={() => {}}><p>a</p></MeeshyGroupCard>)).toThrow();
  });

  test('verrouillée : annoncée inactive, le contenu inerte, le pied reste atteignable et lisible', () => {
    let presses = 0;
    const container = mount(<MeeshyGroupCard isLocked label="Verrouillée" onPress={() => (presses += 1)} footer={<span>Débloquer</span>}><p>a</p></MeeshyGroupCard>);
    expect(container.querySelector('[role="group"],[data-kit-group]')?.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('[data-kit-group-content]')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[data-kit-group-footer]')?.hasAttribute('inert')).toBe(false);
    const hit = container.querySelector('[data-kit-group-hit]') as HTMLElement | null;
    if (hit !== null) act(() => hit.click());
    expect(presses).toBe(0);
  });
});

describe('MeeshyGroupCard — pureté', () => {
  test('aucun type du domaine, aucun singleton, le verre ne vient que du kit', () => {
    for (const file of ['./meeshy-group-card.tsx', './meeshy-group-card-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter/);
    }
  });
});
