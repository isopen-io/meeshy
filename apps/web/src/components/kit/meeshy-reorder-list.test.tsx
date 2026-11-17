import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyReorderList, meeshyReorderListRecipe, meeshyReorderMove, meeshyReorderTargetIndex } from './meeshy-reorder-list';

const { mount, act } = kitMount();

type Lang = { readonly id: string; readonly name: string };
const langs: readonly Lang[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'Anglais' },
  { id: 'wo', name: 'Wolof' },
];
const labels = {
  handle: (title: string) => `Déplacer ${title}`,
  moveUp: 'Monter',
  moveDown: 'Descendre',
  announce: (title: string, rank: number, count: number) => `${title}, rang ${rank} sur ${count}`,
};

const list = (extra: Partial<Parameters<typeof MeeshyReorderList<Lang>>[0]> = {}, onMove: (from: number, to: number) => void = () => {}) => (
  <MeeshyReorderList label="Langues, par priorité" items={langs} getId={(lang) => lang.id} title={(lang) => lang.name} labels={labels} onMove={onMove} row={(lang, context) => <span data-row={lang.id} data-phase={context.phase} data-rank={context.rank}>{lang.name}</span>} {...extra} />
);

describe('meeshyReorderMove — le calcul pur', () => {
  test('déplace un identifiant sans toucher à la liste reçue', () => {
    const ids = ['a', 'b', 'c'];
    expect(meeshyReorderMove(ids, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(meeshyReorderMove(ids, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  test('les bornes sont tenues, rien ne change sur place', () => {
    expect(meeshyReorderMove(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(meeshyReorderMove(['a', 'b'], 1, -4)).toEqual(['b', 'a']);
    expect(meeshyReorderMove(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('meeshyReorderTargetIndex — où la rangée tombe', () => {
  const heights = [68, 68, 68];
  test('pas de déplacement, pas de changement ; la moitié d’une rangée franchit le voisin', () => {
    expect(meeshyReorderTargetIndex({ from: 0, offset: 10, heights, spacing: 8 })).toBe(0);
    expect(meeshyReorderTargetIndex({ from: 0, offset: 50, heights, spacing: 8 })).toBe(1);
    expect(meeshyReorderTargetIndex({ from: 0, offset: 200, heights, spacing: 8 })).toBe(2);
    expect(meeshyReorderTargetIndex({ from: 2, offset: -50, heights, spacing: 8 })).toBe(1);
    expect(meeshyReorderTargetIndex({ from: 1, offset: -900, heights, spacing: 8 })).toBe(0);
  });
});

describe('MeeshyReorderList — la recette en valeurs', () => {
  test('poignée de 44 × 44, étroite de 32 × 44 ; pastille de 30', () => {
    expect(meeshyReorderListRecipe({}).handle).toEqual({ width: 44, height: 44 });
    expect(meeshyReorderListRecipe({ handleEdge: 'leading' }).handle).toEqual({ width: 32, height: 44 });
    expect(meeshyReorderListRecipe({}).rankBadge).toBe(30);
  });

  test('saisie : échelle 1,02 ; en vol : penchée de 2° ; désactivée : poignées à 32 %', () => {
    expect(meeshyReorderListRecipe({ phase: 'grabbed' }).scale).toBe(1.02);
    expect(meeshyReorderListRecipe({ phase: 'flying' })).toMatchObject({ tilt: 2, lifted: true });
    expect(meeshyReorderListRecipe({ isEnabled: false }).handleOpacity).toBe(0.32);
    expect(meeshyReorderListRecipe({ phase: 'flying', reduceMotion: true }).tilt).toBe(0);
  });

  test('la première rangée n’est en avant que si elle gagne', () => {
    expect(meeshyReorderListRecipe({ isFirst: true, emphasizesFirst: true }).emphasized).toBe(true);
    expect(meeshyReorderListRecipe({ isFirst: false, emphasizesFirst: true }).emphasized).toBe(false);
    expect(meeshyReorderListRecipe({ isFirst: true }).emphasized).toBe(false);
  });
});

describe('MeeshyReorderList — ce qu’on lit', () => {
  test('une liste nommée, une poignée nommée par rangée, le rang écrit seulement s’il a un sens', () => {
    const container = mount(list({ rank: 'ordinal' }));
    expect(container.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Langues, par priorité');
    expect(Array.from(container.querySelectorAll('[data-kit-reorder-handle]')).map((handle) => handle.getAttribute('aria-label'))).toEqual(['Déplacer Français', 'Déplacer Anglais', 'Déplacer Wolof']);
    expect(Array.from(container.querySelectorAll('[data-kit-reorder-rank]')).map((badge) => badge.textContent)).toEqual(['1', '2', '3']);
    expect(mount(list()).querySelector('[data-kit-reorder-rank]')).toBeNull();
  });

  test('l’hôte reçoit le contexte : rang, phase, attente', () => {
    const container = mount(list({ pendingIDs: new Set(['en']) }));
    expect(container.querySelector('[data-row="fr"]')?.getAttribute('data-phase')).toBe('rest');
    expect(container.querySelector('[data-kit-reorder-row="en"]')?.hasAttribute('data-pending')).toBe(true);
  });
});

describe('MeeshyReorderList — sans le doigt', () => {
  test('« Monter » et « Descendre » appellent onMove ; celui qui sort des bornes n’est pas offert', () => {
    const moves: [number, number][] = [];
    const container = mount(list({}, (from, to) => moves.push([from, to])));
    const first = container.querySelector('[data-kit-reorder-row="fr"]') as HTMLElement;
    expect(first.querySelector('[data-kit-reorder-up]')).toBeNull();
    act(() => (first.querySelector('[data-kit-reorder-down]') as HTMLButtonElement).click());
    const last = container.querySelector('[data-kit-reorder-row="wo"]') as HTMLElement;
    expect(last.querySelector('[data-kit-reorder-down]')).toBeNull();
    act(() => (last.querySelector('[data-kit-reorder-up]') as HTMLButtonElement).click());
    expect(moves).toEqual([[0, 1], [2, 1]]);
  });

  test('clavier : Espace saisit, les flèches déplacent d’un rang, Espace pose — un seul onMove, au dépôt', () => {
    const moves: [number, number][] = [];
    const container = mount(list({}, (from, to) => moves.push([from, to])));
    const handle = container.querySelector('[data-kit-reorder-row="fr"] [data-kit-reorder-handle]') as HTMLButtonElement;
    const press = (key: string) => act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    press(' ');
    press('ArrowDown');
    press('ArrowDown');
    expect(moves).toEqual([]);
    press(' ');
    expect(moves).toEqual([[0, 2]]);
  });

  test('Échap rend l’ordre de départ : aucun onMove', () => {
    const moves: [number, number][] = [];
    const container = mount(list({}, (from, to) => moves.push([from, to])));
    const handle = container.querySelector('[data-kit-reorder-handle]') as HTMLButtonElement;
    const press = (key: string) => act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    press(' ');
    press('ArrowDown');
    press('Escape');
    press(' ');
    expect(moves).toEqual([]);
  });

  test('clavier : le focus quitte la poignée en plein déplacement — l’ordre de départ revient, rien n’est posé', () => {
    const moves: [number, number][] = [];
    const container = mount(list({}, (from, to) => moves.push([from, to])));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      const handle = container.querySelector('[data-kit-reorder-row="fr"] [data-kit-reorder-handle]') as HTMLButtonElement;
      act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
      act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
      act(() => handle.dispatchEvent(new FocusEvent('blur', { relatedTarget: outside })));
      const order = Array.from(container.querySelectorAll('[data-kit-reorder-row]')).map((node) => node.getAttribute('data-kit-reorder-row'));
      expect(order).toEqual(['fr', 'en', 'wo']);
      expect(container.querySelector('[data-kit-reorder-row="fr"]')?.getAttribute('data-phase')).toBe('rest');
      expect(moves).toEqual([]);
    } finally {
      outside.remove();
    }
  });

  test('le nouveau rang est annoncé une fois posé', () => {
    const container = mount(list());
    act(() => (container.querySelector('[data-kit-reorder-row="fr"] [data-kit-reorder-down]') as HTMLButtonElement).click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Français, rang 2 sur 3');
  });

  test('désactivée ou moins de deux rangées : poignées éteintes, aucune action', () => {
    expect(mount(list({ isEnabled: false })).querySelector('[data-kit-reorder-down]')).toBeNull();
    expect(mount(list({ items: [langs[0] as Lang] })).querySelector('[data-kit-reorder-down]')).toBeNull();
    expect((mount(list({ isEnabled: false })).querySelector('[data-kit-reorder-handle]') as HTMLButtonElement).disabled).toBe(true);
  });
});
