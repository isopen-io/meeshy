import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyChoiceTiles, meeshyChoiceTilesRecipe, type MeeshyChoiceItem } from './meeshy-choice-tiles';

const { mount, act } = kitMount();

const items: readonly MeeshyChoiceItem[] = [
  { id: 'h1', title: '1 heure' },
  { id: 'h8', title: '8 heures' },
  { id: 'inf', title: 'Jusqu’à ce que j’arrête', detail: 'Sans fin' },
  { id: 'sang', title: 'Sang seulement', state: { locked: 'dès Sang' } },
];
const tile = (container: HTMLElement, id: string): HTMLElement => container.querySelector(`[data-kit-choice-id="${id}"]`) as HTMLElement;

describe('MeeshyChoiceTiles — la recette en valeurs', () => {
  test('les colonnes sont ramenées dans 2 à 4', () => {
    expect([1, 2, 3, 4, 9].map((columns) => meeshyChoiceTilesRecipe({ columns }).columns)).toEqual([2, 2, 3, 4, 4]);
  });

  test('rayon 24 (22 compact), marge 16, titre 16,5 (14,5 compact), coche de 24', () => {
    expect(meeshyChoiceTilesRecipe({ format: 'square' })).toMatchObject({ radius: 24, padding: 16, titleSize: 16.5, checkSize: 24 });
    expect(meeshyChoiceTilesRecipe({ format: 'compact' })).toMatchObject({ radius: 22, titleSize: 14.5, minHeight: 68 });
    expect(meeshyChoiceTilesRecipe({ format: 'wide' }).minHeight).toBe(80);
  });

  test('la valeur : tête de 40 (30 en quatre colonnes), hauteur de 132 ; l’icône : disque de 54', () => {
    expect(meeshyChoiceTilesRecipe({ content: 'value', columns: 3 })).toMatchObject({ valueSize: 40, minHeight: 132 });
    expect(meeshyChoiceTilesRecipe({ content: 'value', columns: 4 }).valueSize).toBe(30);
    expect(meeshyChoiceTilesRecipe({ content: 'icon' }).headSize).toBe(54);
  });

  test('gouttière de 10, de 8 sur verre', () => {
    expect(meeshyChoiceTilesRecipe({ surface: 'tonal' }).gutter).toBe(10);
    expect(meeshyChoiceTilesRecipe({ surface: 'glass' }).gutter).toBe(8);
  });

  test('le choix se marque par trois signes : bord de 2, fond teinté, coche ; sauf l’icône qui inverse son disque', () => {
    expect(meeshyChoiceTilesRecipe({ isSelected: true })).toMatchObject({ borderWidth: 2, tintedFill: true, showsCheck: true });
    expect(meeshyChoiceTilesRecipe({ isSelected: false })).toMatchObject({ borderWidth: 1, tintedFill: false, showsCheck: false });
    expect(meeshyChoiceTilesRecipe({ isSelected: true, content: 'icon' }).showsCheck).toBe(false);
  });

  test('pressée : échelle 0,96 ; désactivée : 40 % ; mouvement réduit : pas d’échelle', () => {
    expect(meeshyChoiceTilesRecipe({ isPressed: true }).pressScale).toBe(0.96);
    expect(meeshyChoiceTilesRecipe({ isPressed: true, reduceMotion: true }).pressScale).toBe(1);
    expect(meeshyChoiceTilesRecipe({ state: 'disabled' }).opacity).toBe(0.4);
  });
});

describe('MeeshyChoiceTiles — un seul choix', () => {
  test('un groupe radio nommé, une seule tuile cochée, la lecture dit « n sur total »', () => {
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h8' }} onSelect={() => {}} />);
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Durée');
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]').length).toBe(1);
    expect(tile(container, 'h8').getAttribute('aria-label')).toContain('2 / 4');
  });

  test('toucher une tuile rend son identifiant ; la tuile déjà choisie ne se relâche pas', () => {
    const touched: string[] = [];
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h1' }} onSelect={(id) => touched.push(id)} />);
    act(() => tile(container, 'h1').click());
    expect(touched).toEqual([]);
    act(() => tile(container, 'h8').click());
    expect(touched).toEqual(['h8']);
  });

  test('allowsEmpty relâche la tuile choisie', () => {
    const touched: string[] = [];
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h1' }} allowsEmpty onSelect={(id) => touched.push(id)} />);
    act(() => tile(container, 'h1').click());
    expect(touched).toEqual(['h1']);
  });

  test('les flèches déplacent le choix ET le focus, Début et Fin vont aux extrémités', () => {
    const touched: string[] = [];
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h1' }} onSelect={(id) => touched.push(id)} />);
    act(() => tile(container, 'h1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(touched).toEqual(['h8']);
    expect(document.activeElement).toBe(tile(container, 'h8'));
  });
});

describe('MeeshyChoiceTiles — plusieurs choix', () => {
  test('des cases à cocher, le compte dit à la voix par l’hôte', () => {
    const container = mount(<MeeshyChoiceTiles label="Ce que je donne" items={items} selection={{ multiple: new Set(['h1', 'h8']) }} countLabel={(n, total) => `${n} sur ${total} choisis`} onSelect={() => {}} />);
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Ce que je donne');
    expect(container.querySelectorAll('[role="checkbox"][aria-checked="true"]').length).toBe(2);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 sur 4 choisis');
  });

  test('au plafond, les tuiles libres passent en désactivées', () => {
    const container = mount(<MeeshyChoiceTiles label="Ce que je donne" items={items} selection={{ multiple: new Set(['h1']) }} maxSelected={1} onSelect={() => {}} />);
    expect((tile(container, 'h8') as HTMLButtonElement).disabled).toBe(true);
    expect((tile(container, 'h1') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('MeeshyChoiceTiles — états fermés', () => {
  test('une tuile verrouillée dit ce qui l’ouvre et ne répond pas sans onLockedTap', () => {
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h1' }} onSelect={() => { throw new Error('ne devrait pas partir'); }} />);
    const locked = tile(container, 'sang');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.textContent).toContain('dès Sang');
    act(() => locked.click());
  });

  test('avec onLockedTap, l’hôte ouvre ce qui l’ouvre', () => {
    const asked: string[] = [];
    const container = mount(<MeeshyChoiceTiles label="Durée" items={items} selection={{ single: 'h1' }} onSelect={() => {}} onLockedTap={(id) => asked.push(id)} />);
    act(() => tile(container, 'sang').click());
    expect(asked).toEqual(['sang']);
  });

  test('une tuile désactivée est dite indisponible et ne répond pas', () => {
    const touched: string[] = [];
    const container = mount(<MeeshyChoiceTiles label="Durée" items={[{ id: 'a', title: 'A', state: 'disabled' }, ...items]} selection={{ single: 'h1' }} onSelect={(id) => touched.push(id)} />);
    act(() => tile(container, 'a').click());
    expect(touched).toEqual([]);
    expect((tile(container, 'a') as HTMLButtonElement).disabled).toBe(true);
  });

  test('spansRow rend la tuile large dans une grille carrée', () => {
    const container = mount(<MeeshyChoiceTiles label="Durée" items={[{ id: 'a', title: 'A', spansRow: true }, ...items]} selection={{ single: null }} onSelect={() => {}} />);
    expect(tile(container, 'a').getAttribute('data-format')).toBe('wide');
    expect(tile(container, 'h1').getAttribute('data-format')).toBe('square');
  });
});
