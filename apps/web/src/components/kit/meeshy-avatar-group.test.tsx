import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyAvatarGroup, MeeshyAvatarGroupSkeleton, meeshyAvatarGroupRecipe } from './meeshy-avatar-group';

const { mount, act } = kitMount();
const cell = (index: number, size: number) => <i data-cell={index} data-size={size} />;
const names = ['Mina', 'Tomás', 'Yuki', 'Kwame', 'Sofia', 'Léo'];

describe('MeeshyAvatarGroup — la recette en valeurs', () => {
  test('chevauchement et liseré par taille : 10/2 · 9/3 · 10/3 · 13/3,5 · 17/4', () => {
    const measure = ([26, 40, 44, 56, 72] as const).map((size) => {
      const recipe = meeshyAvatarGroupRecipe({ layout: 'stack', size, count: 3 });
      return [recipe.overlap, recipe.ring];
    });
    expect(measure).toEqual([[10, 2], [9, 3], [10, 3], [13, 3.5], [17, 4]]);
  });

  test('le débordement compte ce qui dépasse max, jamais « +0 », « 99+ » au-delà de 99', () => {
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 12, max: 4 })).toMatchObject({ visible: 4, overflowLabel: '+8' });
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 4, max: 4 })).toMatchObject({ visible: 4, overflowLabel: null });
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 300, max: 4 }).overflowLabel).toBe('99+');
  });

  test('en pile, max reste dans 2 à 5 ; le duo exige deux visages ; zéro ne rend rien', () => {
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 12, max: 9 }).visible).toBe(5);
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 12, max: 0 }).visible).toBe(2);
    expect(meeshyAvatarGroupRecipe({ layout: 'duo', size: 72, count: 3 }).isRenderable).toBe(false);
    expect(meeshyAvatarGroupRecipe({ layout: 'duo', size: 72, count: 2 }).isRenderable).toBe(true);
    expect(meeshyAvatarGroupRecipe({ layout: 'stack', size: 40, count: 0 }).isRenderable).toBe(false);
  });

  test('la grille : deux rangées au plus, la dernière case porte le « +N »', () => {
    expect(meeshyAvatarGroupRecipe({ layout: { grid: 4 }, size: 44, count: 12, max: 7 })).toMatchObject({ visible: 7, overflowLabel: '+5' });
    expect(meeshyAvatarGroupRecipe({ layout: { grid: 2 }, size: 44, count: 12, max: 7 }).visible).toBe(3);
  });

  test('le duo respire, sauf sous mouvement réduit ; le halo reste à 34 %', () => {
    expect(meeshyAvatarGroupRecipe({ layout: 'duo', size: 72, count: 2 })).toMatchObject({ breathes: true });
    expect(meeshyAvatarGroupRecipe({ layout: 'duo', size: 72, count: 2, reduceMotion: true })).toMatchObject({ breathes: false, haloOpacity: 0.34 });
  });
});

describe('MeeshyAvatarGroup — pile et duo', () => {
  test('la pile est une seule image nommée par son résumé ; les cellules se taisent', () => {
    const container = mount(<MeeshyAvatarGroup count={12} layout="stack" size={40} max={4} summary="Mina, Kwame et 10 autres" cell={cell} />);
    const group = container.querySelector('[data-kit-avatar-group]') as HTMLElement;
    expect(group.getAttribute('role')).toBe('img');
    expect(group.getAttribute('aria-label')).toBe('Mina, Kwame et 10 autres');
    expect(container.querySelectorAll('[data-cell]').length).toBe(4);
    expect(container.querySelector('[data-kit-group-overflow]')?.textContent).toBe('+8');
  });

  test('le plafond ne demande à l’hôte que les rangs visibles', () => {
    const asked: number[] = [];
    mount(<MeeshyAvatarGroup count={12} layout="stack" size={40} max={3} label="Douze" cell={(index, size) => { asked.push(index); return cell(index, size); }} />);
    expect(asked).toEqual([0, 1, 2]);
  });

  test('avec une action, la pile est une seule cible nommée', () => {
    let presses = 0;
    const container = mount(<MeeshyAvatarGroup count={5} layout="stack" size={40} summary="Cinq amis" showsChevron onPress={() => (presses += 1)} cell={cell} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Cinq amis');
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(presses).toBe(1);
  });

  test('le duo porte un seul nom accessible', () => {
    const container = mount(<MeeshyAvatarGroup count={2} layout="duo" size={72} label="Aïssa et Léo" cell={cell} />);
    expect(container.querySelector('[data-kit-avatar-group]')?.getAttribute('aria-label')).toBe('Aïssa et Léo');
  });
});

describe('MeeshyAvatarGroup — rangée, grille, sélection', () => {
  test('la rangée nomme chaque cellule et place l’action de fin en dernier', () => {
    const container = mount(<MeeshyAvatarGroup count={4} layout="rail" size={56} caption={(index) => names[index] ?? null} cell={cell} trailing={<button type="button">Chercher</button>} />);
    const items = Array.from(container.querySelectorAll('[data-kit-group-cell]'));
    expect(items.map((item) => item.textContent)).toEqual(['Mina', 'Tomás', 'Yuki', 'Kwame']);
    expect(container.querySelector('[data-kit-group-trailing]')?.textContent).toBe('Chercher');
  });

  test('sélection unique : un groupe radio, l’anneau passe de l’un à l’autre', () => {
    const changes: (number | null)[] = [];
    const container = mount(<MeeshyAvatarGroup count={4} layout="rail" size={56} label="Suggestions" caption={(index) => names[index] ?? null} selection={{ single: 0 }} onSelectionChange={(next) => changes.push((next as { single: number | null }).single)} cell={cell} />);
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Suggestions');
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]').length).toBe(1);
    act(() => (container.querySelectorAll('[role="radio"]')[2] as HTMLElement).click());
    expect(changes).toEqual([2]);
  });

  test('les flèches sautent une cellule éteinte : le choix et le focus atteignent la suivante', () => {
    const changes: (number | null)[] = [];
    const container = mount(<MeeshyAvatarGroup count={3} layout="rail" size={56} label="Suggestions" caption={(index) => names[index] ?? null} selection={{ single: 0 }} isEnabled={(index) => index !== 1} onSelectionChange={(next) => changes.push((next as { single: number | null }).single)} cell={cell} />);
    const radios = () => Array.from(container.querySelectorAll('[role="radio"]')) as HTMLElement[];
    act(() => radios()[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(changes).toEqual([2]);
    expect(document.activeElement).toBe(radios()[2]);
  });

  test('sélection multiple : le nouvel ensemble est rendu à l’hôte', () => {
    const changes: ReadonlySet<number>[] = [];
    const container = mount(<MeeshyAvatarGroup count={4} layout="rail" size={56} label="Inviter" caption={(index) => names[index] ?? null} selection={{ multiple: new Set([0]) }} onSelectionChange={(next) => changes.push((next as { multiple: ReadonlySet<number> }).multiple)} cell={cell} />);
    act(() => (container.querySelectorAll('[role="checkbox"]')[3] as HTMLElement).click());
    expect([...(changes[0] ?? [])].sort()).toEqual([0, 3]);
  });

  test('une cellule éteinte est dite indisponible et ne se choisit pas', () => {
    const changes: unknown[] = [];
    const container = mount(<MeeshyAvatarGroup count={3} layout="rail" size={56} label="Inviter" caption={(index) => names[index] ?? null} selection={{ multiple: new Set() }} isEnabled={(index) => index !== 1} onSelectionChange={(next) => changes.push(next)} cell={cell} />);
    const off = container.querySelectorAll('[role="checkbox"]')[1] as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    act(() => off.click());
    expect(changes).toEqual([]);
  });

  test('le squelette reprend les diamètres et ne porte aucun reflet propre', () => {
    const container = mount(<MeeshyAvatarGroupSkeleton layout="stack" size={40} count={3} />);
    expect(container.querySelectorAll('[data-kit-skeleton]').length).toBe(3);
  });
});
