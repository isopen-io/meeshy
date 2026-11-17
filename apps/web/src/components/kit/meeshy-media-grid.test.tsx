import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyMediaGrid, meeshyMediaGridPlacement, meeshyMediaGridRecipe, type MeeshyMediaGridItem } from './meeshy-media-grid';

const { mount, act } = kitMount();
const item = (id: string, extra: Partial<MeeshyMediaGridItem> = {}): MeeshyMediaGridItem => ({ id, kind: 'media', label: `Ouvrir ${id}`, ...extra });
const content = (it: MeeshyMediaGridItem) => <i data-image={it.id} />;

describe('MeeshyMediaGrid — la loi de placement', () => {
  test('chaque tuile va dans la colonne la plus courte, de gauche à droite à égalité', () => {
    const placed = meeshyMediaGridPlacement({ aspects: [1, 2, 1, 1], columns: 2, spacing: 8, width: 308 });
    expect(placed.columns).toEqual([[0, 2], [1]]);
  });

  test('les hauteurs suivent la largeur de colonne, l’écart compte entre deux tuiles', () => {
    const placed = meeshyMediaGridPlacement({ aspects: [1, 1], columns: 1, spacing: 8, width: 100 });
    expect(placed.heights[0]).toBeCloseTo(100 + 8 + 100);
  });

  test('un rapport illisible vaut 1', () => {
    const placed = meeshyMediaGridPlacement({ aspects: [0, Number.NaN], columns: 2, spacing: 6, width: 206 });
    expect(placed.columns).toEqual([[0], [1]]);
  });
});

describe('MeeshyMediaGrid — la recette en valeurs', () => {
  test('colonnes 2 ou 3, écart 6 serré ou 8, rayon 18', () => {
    expect([1, 2, 3, 4].map((columns) => meeshyMediaGridRecipe({ columns }).columns)).toEqual([2, 2, 3, 3]);
    expect(meeshyMediaGridRecipe({ spacing: 'tight' }).gap).toBe(6);
    expect(meeshyMediaGridRecipe({}).gap).toBe(8);
    expect(meeshyMediaGridRecipe({}).radius).toBe(18);
  });

  test('pressée : échelle 0,96 et voile de 12 % ; survolée : échelle 1,025 et élévation de 8 ; réduit : aucune échelle', () => {
    expect(meeshyMediaGridRecipe({ isPressed: true })).toMatchObject({ scale: 0.96, veil: 0.12 });
    expect(meeshyMediaGridRecipe({ isHovered: true })).toMatchObject({ scale: 1.025, elevation: 8 });
    expect(meeshyMediaGridRecipe({ isPressed: true, reduceMotion: true }).scale).toBe(1);
  });

  test('un fantôme et un squelette ne répondent à rien', () => {
    expect(meeshyMediaGridRecipe({ kind: 'ghost' }).isInteractive).toBe(false);
    expect(meeshyMediaGridRecipe({ kind: 'skeleton' }).isInteractive).toBe(false);
    expect(meeshyMediaGridRecipe({ kind: 'media' }).isInteractive).toBe(true);
  });
});

describe('MeeshyMediaGrid — ce qu’on lit et ce qu’on touche', () => {
  test('une liste nommée ; chaque tuile est un bouton nommé par l’hôte, qui rend son identifiant une fois', () => {
    const opened: string[] = [];
    const container = mount(<MeeshyMediaGrid label="Publications de Léo" items={[item('a'), item('b'), item('c')]} onOpen={(id) => opened.push(id)} content={content} />);
    expect(container.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Publications de Léo');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Ouvrir a', 'Ouvrir b', 'Ouvrir c']);
    act(() => buttons[1]?.click());
    expect(opened).toEqual(['b']);
  });

  test('la rangée coupe à columns éléments', () => {
    const container = mount(<MeeshyMediaGrid label="Vitrine" layout="row" columns={3} items={[item('a'), item('b'), item('c'), item('d')]} onOpen={() => {}} content={content} />);
    expect(container.querySelectorAll('[data-kit-media-tile]').length).toBe(3);
  });

  test('fantômes et squelettes : aucune cible, cachés à la voix', () => {
    const container = mount(<MeeshyMediaGrid label="Chargement" items={[item('a', { kind: 'skeleton' }), item('b', { kind: 'ghost' })]} onOpen={() => { throw new Error('non'); }} content={content} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(Array.from(container.querySelectorAll('[data-kit-media-tile]')).every((tile) => tile.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  test('la tuile de texte porte surtitre et texte sur un aplat teinté ; la pastille et la légende disent le type', () => {
    const container = mount(
      <MeeshyMediaGrid
        label="Vitrine"
        items={[item('a', { kind: 'text', overline: 'Statut', text: 'Lumière de 18 h sur le Tage.', tint: '#A855F7' }), item('b', { badge: { value: '0:24' }, caption: 'réel · Alfama' })]}
        onOpen={() => {}}
        content={content}
      />,
    );
    expect(container.querySelector('[data-kit-media-text]')?.textContent).toContain('Lumière de 18 h sur le Tage.');
    expect(container.querySelector('[data-kit-media-badge]')?.textContent).toBe('0:24');
    expect(container.querySelector('[data-kit-media-caption]')?.textContent).toBe('réel · Alfama');
  });

  test('le survol et le focus clavier montrent la barre d’actions de l’hôte ; au doigt, rien', () => {
    const container = mount(<MeeshyMediaGrid label="Vitrine" items={[item('a')]} onOpen={() => {}} content={content} hoverActions={(it) => <b data-actions={it.id} />} />);
    const tile = container.querySelector('[data-kit-media-tile]') as HTMLElement;
    expect(container.querySelector('[data-actions]')).toBeNull();
    act(() => tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(container.querySelector('[data-actions="a"]')).not.toBeNull();
  });

  test('le contenu reçoit l’élément et la taille de sa case', () => {
    const seen: string[] = [];
    mount(<MeeshyMediaGrid label="Vitrine" items={[item('a')]} onOpen={() => {}} content={(it, size) => { seen.push(`${it.id}:${typeof size.width}`); return null; }} />);
    expect(seen).toEqual(['a:number']);
  });
});
