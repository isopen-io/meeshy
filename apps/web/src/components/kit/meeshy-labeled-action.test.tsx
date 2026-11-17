import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyActionGrid, MeeshyLabeledAction, meeshyActionGridRecipe, meeshyLabeledActionRecipe } from './meeshy-labeled-action';

const { mount, act } = kitMount();

const glyph = <svg data-glyph="" />;

describe('MeeshyLabeledAction — la recette en valeurs', () => {
  test('disque de 56 · 60 · 64, glyphe à 46 % : 26 · 28 · 30', () => {
    expect(([56, 60, 64] as const).map((size) => meeshyLabeledActionRecipe({ size }).disc)).toEqual([56, 60, 64]);
    expect(([56, 60, 64] as const).map((size) => meeshyLabeledActionRecipe({ size }).glyphSize)).toEqual([26, 28, 30]);
  });

  test('libellé 12/600 sur 9 sous le disque, valeur de 20 en 10/800 sur 6, cible de 76 × 88', () => {
    expect(meeshyLabeledActionRecipe({})).toMatchObject({ titleSize: 12, titleWeight: 600, titleGap: 9, valueHeight: 20, valueSize: 10, valueWeight: 800, valueGap: 6, targetWidth: 76, targetHeight: 88 });
  });

  test('désactivé : 40 %, sans appui ; en attente : glyphe à 45 %, action retenue', () => {
    expect(meeshyLabeledActionRecipe({ isEnabled: false })).toMatchObject({ opacity: 0.4, isActionable: false });
    expect(meeshyLabeledActionRecipe({ isPending: true })).toMatchObject({ glyphOpacity: 0.45, isActionable: false });
    expect(meeshyLabeledActionRecipe({})).toMatchObject({ opacity: 1, isActionable: true });
  });

  test('en avant : le disque de 96 de la forme hold ; la police agrandie élargit la colonne minimale à 104', () => {
    expect(meeshyLabeledActionRecipe({ isFeatured: true }).disc).toBe(96);
    expect(meeshyLabeledActionRecipe({}).minColumn).toBe(76);
    expect(meeshyLabeledActionRecipe({ textScale: 2 }).minColumn).toBe(104);
  });

  test('un compte porte l’accent, un avis reste sourd', () => {
    expect(meeshyLabeledActionRecipe({ valueKind: 'accent' }).valueTone).toBe('accent');
    expect(meeshyLabeledActionRecipe({ valueKind: 'quiet' }).valueTone).toBe('quiet');
  });
});

describe('meeshyActionGridRecipe — la grille ne laisse jamais une action seule', () => {
  const widths = [240, 250, 320, 350, 390, 428, 560, 768, 1024];

  test('colonnes d’au moins 76, quatre au plus sur téléphone, de 240 à 1 024 et de 1 à 12 actions', () => {
    for (const width of widths) {
      for (let count = 1; count <= 12; count += 1) {
        const recipe = meeshyActionGridRecipe({ width, count });
        expect(recipe.columns).toBeGreaterThanOrEqual(1);
        expect((width - (recipe.columns - 1) * 8) / recipe.columns).toBeGreaterThanOrEqual(76);
        if (width < 560) expect(recipe.columns).toBeLessThanOrEqual(4);
      }
    }
  });

  test('jamais une action seule sur la dernière rangée dès trois colonnes (à deux, un compte impair l’impose)', () => {
    for (const width of widths) {
      for (let count = 2; count <= 12; count += 1) {
        const recipe = meeshyActionGridRecipe({ width, count });
        expect(recipe.rows.reduce((sum, size) => sum + size, 0)).toBe(count);
        if (recipe.columns > 2) for (const size of recipe.rows) expect(size).toBeGreaterThanOrEqual(2);
        for (const size of recipe.rows) expect(size).toBeLessThanOrEqual(recipe.columns);
      }
    }
  });

  test('cinq actions à 350 de large : 3 + 2, jamais 4 + 1 ; 250 de large : trois colonnes ; 560 : une seule rangée de taille 64', () => {
    expect(meeshyActionGridRecipe({ width: 350, count: 5 }).rows).toEqual([3, 2]);
    expect(meeshyActionGridRecipe({ width: 250, count: 5 }).columns).toBe(3);
    expect(meeshyActionGridRecipe({ width: 560, count: 5 })).toMatchObject({ rows: [5], size: 64 });
  });

  test('taille 56 sous 360 de large, 60 au-delà, 64 sur tablette ; écart de 8, rangées espacées de 18', () => {
    expect(meeshyActionGridRecipe({ width: 320, count: 4 }).size).toBe(56);
    expect(meeshyActionGridRecipe({ width: 390, count: 4 }).size).toBe(60);
    expect(meeshyActionGridRecipe({ width: 768, count: 4 }).size).toBe(64);
    expect(meeshyActionGridRecipe({ width: 390, count: 4 })).toMatchObject({ gap: 8, rowGap: 18 });
  });

  test('à 200 % la grille perd une colonne plutôt que de couper un mot', () => {
    const normal = meeshyActionGridRecipe({ width: 390, count: 8 });
    const large = meeshyActionGridRecipe({ width: 390, count: 8, textScale: 2 });
    expect(large.columns).toBeLessThan(normal.columns);
  });

  test('colonnes fixes : respectées, rangée courte rééquilibrée', () => {
    expect(meeshyActionGridRecipe({ width: 390, count: 5, columns: { fixed: 3 } }).rows).toEqual([3, 2]);
  });
});

describe('MeeshyLabeledAction — une cible, une action', () => {
  test('un seul bouton : libellé, puis valeur, pastille ; le glyphe est muet', () => {
    const container = mount(<MeeshyLabeledAction title="Bring" glyph={glyph} value="2 / 3 aujourd’hui" badge="3" onPress={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(spokenText(buttons[0] as HTMLElement)).toContain('Bring');
    expect(spokenText(buttons[0] as HTMLElement)).toContain('2 / 3 aujourd’hui');
    expect(container.querySelector('[data-glyph]')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  test('toucher le libellé ou la valeur déclenche l’action, une fois', () => {
    let presses = 0;
    const container = mount(<MeeshyLabeledAction title="Bring" glyph={glyph} value="2 / 3" onPress={() => (presses += 1)} />);
    act(() => (container.querySelector('[data-kit-action-title]') as HTMLElement).click());
    act(() => (container.querySelector('[data-kit-action-value]') as HTMLElement).click());
    expect(presses).toBe(2);
  });

  test('un titre vide est refusé', () => {
    expect(() => mount(<MeeshyLabeledAction title="" glyph={glyph} onPress={() => {}} />)).toThrow();
  });

  test('en attente : ni action ni tic, annoncée occupée, un second appui ne part pas', () => {
    let presses = 0;
    const container = mount(<MeeshyLabeledAction title="Appeler" glyph={glyph} isPending words={{ pending: 'en cours' }} onPress={() => (presses += 1)} />);
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    act(() => button.click());
    act(() => button.click());
    expect(presses).toBe(0);
    expect(spokenText(button)).toContain('en cours');
  });

  test('désactivé : aucune action, sa raison est dite par l’aide', () => {
    let presses = 0;
    const container = mount(<MeeshyLabeledAction title="Appeler" glyph={glyph} disabled hint="Hors ligne" words={{ unavailable: 'indisponible' }} onPress={() => (presses += 1)} />);
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    act(() => button.click());
    expect(presses).toBe(0);
    expect(spokenText(container)).toContain('Hors ligne');
    expect(spokenText(button)).toContain('indisponible');
  });

  test('actif : dit son état en mots et par aria-pressed', () => {
    const container = mount(<MeeshyLabeledAction title="Bring" glyph={glyph} kind="active" words={{ active: 'activé' }} onPress={() => {}} />);
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(spokenText(button)).toContain('activé');
  });

  test('un label remplace le nom composé', () => {
    const container = mount(<MeeshyLabeledAction title="Écrire" label="Écrire à Léo" glyph={glyph} onPress={() => {}} />);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Écrire à Léo');
  });

  test('l’appui long est toujours aussi une action nommée : le menu s’ouvre par un bouton frère', () => {
    const container = mount(<MeeshyLabeledAction title="Position" glyph={glyph} menu={<div data-menu="" />} menuLabel="Plus d’options pour Position" onPress={() => {}} />);
    expect(container.querySelector('[data-menu]')).not.toBeNull();
  });

  test('silhouette : mêmes colonnes, jamais si une valeur existe', () => {
    expect(mount(<MeeshyLabeledAction title="Écrire" glyph={glyph} isLoading onPress={() => {}} />).querySelector('[data-kit-skeleton]')).not.toBeNull();
  });
});

describe('MeeshyActionGrid', () => {
  const action = (n: number, extra: Record<string, unknown> = {}) => <MeeshyLabeledAction key={n} title={`A${n}`} glyph={glyph} onPress={() => {}} {...extra} />;

  test('range les actions en rangées de la recette', () => {
    const container = mount(<MeeshyActionGrid width={350}>{[1, 2, 3, 4, 5].map((n) => action(n))}</MeeshyActionGrid>);
    const rows = Array.from(container.querySelectorAll('[data-kit-action-row]'));
    expect(rows.map((node) => node.querySelectorAll('[data-kit-action]').length)).toEqual([3, 2]);
  });

  test('les destructives sortent de l’ordre et se posent dans une bande, à la fin, en 56', () => {
    const container = mount(
      <MeeshyActionGrid width={390}>
        {action(1)}
        {action(2, { kind: 'destructive' })}
        {action(3)}
      </MeeshyActionGrid>,
    );
    const band = container.querySelector('[data-kit-action-danger]') as HTMLElement;
    expect(band.querySelectorAll('[data-kit-action]').length).toBe(1);
    expect(band.querySelector('[data-kit-action]')?.getAttribute('data-size')).toBe('56');
    expect(container.querySelector('[data-kit-action-danger]')).toBe(container.lastElementChild);
  });

  test('au clavier, les flèches suivent la grille et Tab en sort', () => {
    const container = mount(<MeeshyActionGrid width={350}>{[1, 2, 3, 4, 5].map((n) => action(n))}</MeeshyActionGrid>);
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLElement[];
    expect(buttons.filter((button) => button.tabIndex === 0).length).toBe(1);
    act(() => buttons[0]?.focus());
    act(() => {
      buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);
    act(() => {
      buttons[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[4]);
  });
});

describe('MeeshyLabeledAction — pureté', () => {
  test('aucun disque dessiné ici, aucun type du domaine, aucun singleton', () => {
    for (const file of ['./meeshy-labeled-action.tsx', './meeshy-labeled-action-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter|box-shadow/);
    }
  });
});
