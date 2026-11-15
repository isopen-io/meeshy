import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEESHY_CHIP_ROW_MEASURE,
  meeshyChipAccessibility,
  meeshyChipName,
  meeshyChipRecipe,
  meeshyChipRevealTarget,
  meeshyChipRowNext,
  meeshyChipRowProblems,
  meeshyChipRowResponse,
  meeshyChipRowStep,
  meeshyChipRowTrigger,
  meeshyChipRowWheel,
  meeshyChipSize,
  meeshyScrollEdges,
  meeshyScrollSides,
  type MeeshyChipKind,
  type MeeshyChipRowMode,
  type MeeshyChipRowSurface,
  type MeeshyChipRowSize,
} from './meeshy-chip-row-rule';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

type Vectors = {
  readonly disabledOpacity: number;
  readonly toneFadeMs: number;
  readonly edgeFadeMs: number;
  readonly revealMs: number;
  readonly edgeTolerance: number;
  readonly edgeFade: number;
  readonly tapTarget: { readonly web: number };
  readonly sizes: readonly { readonly size: MeeshyChipRowSize; readonly height: number; readonly padding: number; readonly font: number }[];
  readonly glyph: { readonly leading: number; readonly alone: number; readonly trailing: number };
  readonly spacing: { readonly chips: number; readonly glyphAndText: number; readonly rows: number };
  readonly voiles: { readonly rest: number; readonly pressed: number; readonly selectedPressed: number; readonly selected: number };
  readonly next: readonly {
    readonly mode: MeeshyChipRowMode;
    readonly kind: MeeshyChipKind;
    readonly selection: readonly string[];
    readonly tapped: string;
    readonly response: 'ignored' | 'changed' | 'action';
    readonly next: readonly string[];
  }[];
  readonly edges: readonly { readonly name: string; readonly content: number; readonly viewport: number; readonly offset: number; readonly start: boolean; readonly end: boolean }[];
  readonly recipe: readonly {
    readonly surface: MeeshyChipRowSurface;
    readonly tinted: boolean;
    readonly selected: boolean;
    readonly pressed: boolean;
    readonly hovered: boolean;
    readonly enabled: boolean;
    readonly fill: string;
    readonly fillOpacity: number;
    readonly ink: string;
    readonly opacity: number;
  }[];
};

const vectors = JSON.parse(readFileSync(join(ROOT, 'docs', 'product', 'kit', 'K04-MeeshyChipRow.vectors.json'), 'utf8')) as Vectors;

describe('la loi du toucher, lue sur les vecteurs de parité', () => {
  for (const row of vectors.next) {
    const name = `${row.mode} / ${row.kind} : ${JSON.stringify(row.selection)} touche ${row.tapped}`;
    test(`${name} ⇒ ${row.response}`, () => {
      const response = meeshyChipRowResponse({ selection: row.selection, tapped: row.tapped, mode: row.mode, kind: row.kind });
      expect(response.type).toBe(row.response);
      expect([...meeshyChipRowNext({ selection: row.selection, tapped: row.tapped, mode: row.mode, kind: row.kind })].sort()).toEqual([...row.next].sort());
    });
  }

  test('la courante d’un choix simple ne répond pas, celle d’un choix simple ou aucun se retire', () => {
    expect(meeshyChipRowResponse({ selection: ['a'], tapped: 'a', mode: 'single' }).type).toBe('ignored');
    expect(meeshyChipRowResponse({ selection: ['a'], tapped: 'a', mode: 'singleOrNone' })).toEqual({ type: 'changed', selection: [] });
  });
});

describe('la puce à montrer', () => {
  const order = ['a', 'b', 'c', 'd'];
  test('la première qui vient d’entrer, dans l’ordre de la rangée', () => {
    expect(meeshyChipRevealTarget({ order, previous: ['a'], current: ['a', 'd', 'c'] })).toBe('c');
  });
  test('sinon la première courante', () => {
    expect(meeshyChipRevealTarget({ order, previous: ['b', 'c'], current: ['b', 'c'] })).toBe('b');
    expect(meeshyChipRevealTarget({ order, previous: ['b', 'c'], current: ['c'] })).toBe('c');
  });
  test('rien de courant, rien à montrer', () => {
    expect(meeshyChipRevealTarget({ order, previous: ['a'], current: [] })).toBeNull();
  });
});

describe('les bords, lus sur les vecteurs de parité', () => {
  expect(vectors.edgeTolerance).toBe(MEESHY_CHIP_ROW_MEASURE.edgeTolerance);
  for (const row of vectors.edges) {
    test(row.name, () => {
      expect(meeshyScrollEdges({ content: row.content, viewport: row.viewport, offset: row.offset })).toEqual({ start: row.start, end: row.end });
    });
  }

  test('en RTL, le début est à droite : les côtés physiques se miroitent', () => {
    expect(meeshyScrollSides({ start: false, end: true }, false)).toEqual({ low: false, high: true });
    expect(meeshyScrollSides({ start: false, end: true }, true)).toEqual({ low: true, high: false });
  });
});

describe('la recette, lue sur les vecteurs de parité', () => {
  for (const row of vectors.recipe) {
    const name = `${row.surface}${row.tinted ? ' teintée' : ''}${row.selected ? ' courante' : ' au repos'}${row.pressed ? ' pressée' : ''}${row.hovered ? ' survolée' : ''}${row.enabled ? '' : ' désactivée'}`;
    test(name, () => {
      const recipe = meeshyChipRecipe({ surface: row.surface, isSelected: row.selected, isPressed: row.pressed, isHovered: row.hovered, isEnabled: row.enabled, isTinted: row.tinted });
      expect(recipe.fill).toBe(row.fill);
      expect(recipe.fillOpacity).toBeCloseTo(row.fillOpacity, 6);
      expect(recipe.ink).toBe(row.ink);
      expect(recipe.opacity).toBeCloseTo(row.opacity, 6);
      expect(recipe.isActionEnabled).toBe(row.enabled);
    });
  }

  test('les mesures sont celles des vecteurs, nulle part ailleurs', () => {
    const measure = MEESHY_CHIP_ROW_MEASURE;
    expect(measure.disabledOpacity).toBe(vectors.disabledOpacity);
    expect(measure.toneFadeMs).toBe(vectors.toneFadeMs);
    expect(measure.edgeFadeMs).toBe(vectors.edgeFadeMs);
    expect(measure.revealMs).toBe(vectors.revealMs);
    expect(measure.edgeFade).toBe(vectors.edgeFade);
    expect(measure.tapTarget).toBe(vectors.tapTarget.web);
    expect(measure.rest).toBe(vectors.voiles.rest);
    expect(measure.pressed).toBe(vectors.voiles.pressed);
    expect(measure.selectedPressed).toBe(vectors.voiles.selectedPressed);
    expect(measure.selected).toBe(vectors.voiles.selected);
    expect(measure.glyph).toEqual(vectors.glyph);
    expect(measure.spacing).toEqual(vectors.spacing);
    for (const row of vectors.sizes) expect(meeshyChipSize(row.size)).toEqual({ height: row.height, padding: row.padding, font: row.font, slack: Math.max(0, (vectors.tapTarget.web - row.height) / 2) });
  });

  test('l’appui et le survol d’une puce désactivée ne changent rien', () => {
    const rest = meeshyChipRecipe({ surface: 'onMedia', isSelected: false, isEnabled: false });
    expect(meeshyChipRecipe({ surface: 'onMedia', isSelected: false, isPressed: true, isHovered: true, isEnabled: false })).toEqual(rest);
  });
});

describe('ce que le lecteur d’écran entend', () => {
  test('choix simple : un radio, sélectionné ou non', () => {
    expect(meeshyChipAccessibility({ mode: 'single', semantics: 'choice', kind: 'choice', isSelected: true })).toEqual({ role: 'radio', isSelected: true });
    expect(meeshyChipAccessibility({ mode: 'singleOrNone', semantics: 'choice', kind: 'choice', isSelected: false })).toEqual({ role: 'radio', isSelected: false });
  });
  test('choix multiple : une bascule', () => {
    expect(meeshyChipAccessibility({ mode: 'multiple', semantics: 'choice', kind: 'choice', isSelected: true })).toEqual({ role: 'toggle', isSelected: true });
  });
  test('onglets : un onglet', () => {
    expect(meeshyChipAccessibility({ mode: 'single', semantics: 'tabs', kind: 'choice', isSelected: true })).toEqual({ role: 'tab', isSelected: true });
  });
  test('action et menu ne sont jamais sélectionnés', () => {
    expect(meeshyChipAccessibility({ mode: 'actions', semantics: 'choice', kind: 'choice', isSelected: true })).toEqual({ role: 'button', isSelected: false });
    expect(meeshyChipAccessibility({ mode: 'single', semantics: 'choice', kind: 'action', isSelected: true })).toEqual({ role: 'button', isSelected: false });
    expect(meeshyChipAccessibility({ mode: 'single', semantics: 'choice', kind: 'menu', isSelected: true })).toEqual({ role: 'menu', isSelected: false });
  });
  test('le nom est l’accessibilityLabel, sinon le titre', () => {
    expect(meeshyChipName({ title: 'Amis', accessibilityLabel: 'Amis (3)' })).toBe('Amis (3)');
    expect(meeshyChipName({ title: 'Amis' })).toBe('Amis');
    expect(meeshyChipName({ title: 'Amis', accessibilityLabel: '' })).toBe('Amis');
    expect(meeshyChipName({ title: '' })).toBe('');
  });
  test('un groupe sans nom ou une puce sans nom est refusé', () => {
    expect(meeshyChipRowProblems({ label: 'Effets', chips: [{ title: 'A' }, { title: '', accessibilityLabel: 'Recherche' }] })).toEqual([]);
    expect(meeshyChipRowProblems({ label: '', chips: [{ title: 'A' }] })).toHaveLength(1);
    expect(meeshyChipRowProblems({ label: 'Effets', chips: [{ title: '' }] })).toHaveLength(1);
  });
});

describe('l’activation', () => {
  const play: string[] = [];
  const calls: string[] = [];
  const run = (input: { readonly response: ReturnType<typeof meeshyChipRowResponse>; readonly isEnabled?: boolean; readonly haptic?: 'light' | 'none' }): boolean => {
    play.length = 0;
    calls.length = 0;
    return meeshyChipRowTrigger({
      response: input.response,
      tapped: 'b',
      isEnabled: input.isEnabled ?? true,
      haptic: input.haptic ?? 'light',
      play: (cue) => play.push(cue),
      onChange: (next, tapped) => calls.push(`change:${next.join(',')}:${tapped}`),
      onAction: (tapped) => calls.push(`action:${tapped}`),
    });
  };

  test('un changement part une fois, avec un seul light', () => {
    expect(run({ response: { type: 'changed', selection: ['b'] } })).toBe(true);
    expect(calls).toEqual(['change:b:b']);
    expect(play).toEqual(['light']);
  });
  test('une action part une fois, avec un seul light, hors de la sélection', () => {
    expect(run({ response: { type: 'action' } })).toBe(true);
    expect(calls).toEqual(['action:b']);
    expect(play).toEqual(['light']);
  });
  test('un toucher ignoré ne dit rien et ne joue rien', () => {
    expect(run({ response: { type: 'ignored' } })).toBe(false);
    expect(calls).toEqual([]);
    expect(play).toEqual([]);
  });
  test('une puce désactivée ne dit rien et ne joue rien', () => {
    expect(run({ response: { type: 'changed', selection: ['b'] }, isEnabled: false })).toBe(false);
    expect(calls).toEqual([]);
    expect(play).toEqual([]);
  });
  test('haptic none laisse l’hôte jouer le sien', () => {
    expect(run({ response: { type: 'changed', selection: ['b'] }, haptic: 'none' })).toBe(true);
    expect(calls).toEqual(['change:b:b']);
    expect(play).toEqual([]);
  });
});

describe('les flèches', () => {
  const step = (key: string, index: number, rtl = false): number | null => meeshyChipRowStep({ key, index, count: 4, rtl });
  test('→ avance en boucle, ← recule en boucle', () => {
    expect(step('ArrowRight', 1)).toBe(2);
    expect(step('ArrowRight', 3)).toBe(0);
    expect(step('ArrowLeft', 0)).toBe(3);
  });
  test('Début et Fin vont aux bouts', () => {
    expect(step('Home', 2)).toBe(0);
    expect(step('End', 1)).toBe(3);
  });
  test('en arabe le sens s’inverse', () => {
    expect(step('ArrowLeft', 1, true)).toBe(2);
    expect(step('ArrowRight', 1, true)).toBe(0);
  });
  test('sans puce courante, → va à la première et ← à la dernière', () => {
    expect(step('ArrowRight', -1)).toBe(0);
    expect(step('ArrowLeft', -1)).toBe(3);
  });
  test('une autre touche, ou aucune puce, ne bouge rien', () => {
    expect(step('a', 1)).toBeNull();
    expect(meeshyChipRowStep({ key: 'ArrowRight', index: -1, count: 0, rtl: false })).toBeNull();
  });
});

describe('la molette', () => {
  const wheel = (over: Partial<Parameters<typeof meeshyChipRowWheel>[0]> = {}): number | null =>
    meeshyChipRowWheel({ deltaX: 0, deltaY: 40, scrollLeft: 0, maxScroll: 300, rtl: false, ...over });
  test('une molette verticale fait défiler la rangée qui déborde', () => {
    expect(wheel()).toBe(40);
  });
  test('rien à défiler : la page garde la molette', () => {
    expect(wheel({ maxScroll: 0 })).toBeNull();
  });
  test('un geste déjà horizontal reste au navigateur', () => {
    expect(wheel({ deltaX: 60, deltaY: 10 })).toBeNull();
  });
  test('au bout de la course, la molette est rendue à la page', () => {
    expect(wheel({ scrollLeft: 300 })).toBeNull();
    expect(wheel({ deltaY: -40, scrollLeft: 0 })).toBeNull();
  });
  test('en arabe, le défilement va vers le négatif', () => {
    expect(wheel({ rtl: true, scrollLeft: 0 })).toBe(-40);
    expect(wheel({ rtl: true, scrollLeft: -300 })).toBeNull();
  });
});
