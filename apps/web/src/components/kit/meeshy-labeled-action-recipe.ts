import type { CSSProperties } from 'react';

import type { MeeshyGlassButtonKind } from './meeshy-glass-button-recipe';

/**
 * K32 · MeeshyLabeledAction — LA RECETTE EN VALEURS (#18876, chantier #18857).
 *
 * Il nomme un geste et le range, il ne sait pas ce que le geste fait. Un libellé visible
 * sous le disque de K02 (le disque, son verre, son ombre, sa réponse à l'appui restent à
 * K02/K01 : ici aucun fond n'est dessiné), et des deux UNE cible, un nom, une réponse au
 * toucher. `MeeshyActionGrid` range les actions en colonnes égales, alignées en haut, sans
 * jamais laisser une action seule sur sa ligne. L'hôte choisit les actions, leur ordre,
 * leur droit d'exister et met les comptes en forme.
 */
export type MeeshyLabeledActionSize = 56 | 60 | 64;
export type MeeshyLabeledActionValueKind = 'accent' | 'quiet';
export type MeeshyActionColumns = 'adaptive' | { readonly adaptive: number } | { readonly fixed: number };

export const MEESHY_LABELED_ACTION_MEASURE = {
  glyph: { 56: 26, 60: 28, 64: 30 },
  featuredDisc: 96,
  title: { size: 12, weight: 600, gap: 9, lines: 2 },
  value: { height: 20, size: 10, weight: 800, gap: 6 },
  target: { width: 76, height: 88 },
  largeTextColumn: 104,
  largeTextFrom: 1.5,
  disabledOpacity: 0.4,
  pendingGlyphOpacity: 0.45,
  danger: { size: 56 },
  grid: { gap: 8, rowGap: 18, phoneColumns: 4, phoneBelow: 560, snug: 360 },
} as const;

export type MeeshyLabeledActionRecipeInput = {
  readonly kind?: MeeshyGlassButtonKind | undefined;
  readonly size?: MeeshyLabeledActionSize | undefined;
  readonly isPending?: boolean | undefined;
  readonly isFeatured?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly hasValue?: boolean | undefined;
  readonly valueKind?: MeeshyLabeledActionValueKind | undefined;
  readonly textScale?: number | undefined;
};

export type MeeshyLabeledActionRecipe = {
  readonly kind: MeeshyGlassButtonKind;
  readonly size: MeeshyLabeledActionSize;
  readonly disc: number;
  readonly glyphSize: number;
  readonly titleSize: number;
  readonly titleWeight: number;
  readonly titleGap: number;
  readonly titleLines: number;
  readonly valueHeight: number;
  readonly valueSize: number;
  readonly valueWeight: number;
  readonly valueGap: number;
  readonly valueTone: MeeshyLabeledActionValueKind;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly minColumn: number;
  readonly opacity: number;
  readonly glyphOpacity: number;
  readonly isActionable: boolean;
};

/** La recette d'une action : taille, genre et état deviennent des nombres. */
export const meeshyLabeledActionRecipe = (input: MeeshyLabeledActionRecipeInput): MeeshyLabeledActionRecipe => {
  const m = MEESHY_LABELED_ACTION_MEASURE;
  const size = input.size ?? 60;
  const isEnabled = input.isEnabled !== false;
  const isPending = input.isPending === true;
  const disc = input.isFeatured === true ? m.featuredDisc : size;
  return {
    kind: input.kind ?? 'normal',
    size,
    disc,
    glyphSize: m.glyph[size],
    titleSize: m.title.size,
    titleWeight: m.title.weight,
    titleGap: m.title.gap,
    titleLines: m.title.lines,
    valueHeight: m.value.height,
    valueSize: m.value.size,
    valueWeight: m.value.weight,
    valueGap: m.value.gap,
    valueTone: input.valueKind ?? 'accent',
    targetWidth: m.target.width,
    targetHeight: m.target.height,
    minColumn: (input.textScale ?? 1) >= m.largeTextFrom ? m.largeTextColumn : m.target.width,
    opacity: isEnabled ? 1 : m.disabledOpacity,
    glyphOpacity: isPending ? m.pendingGlyphOpacity : 1,
    isActionable: isEnabled && !isPending,
  };
};

export type MeeshyActionGridRecipeInput = {
  readonly width: number;
  readonly count: number;
  readonly columns?: MeeshyActionColumns | undefined;
  readonly size?: MeeshyLabeledActionSize | undefined;
  readonly textScale?: number | undefined;
};

export type MeeshyActionGridRecipe = {
  readonly columns: number;
  readonly rows: readonly number[];
  readonly size: MeeshyLabeledActionSize;
  readonly gap: number;
  readonly rowGap: number;
  readonly minColumn: number;
};

const sizeFor = (width: number): MeeshyLabeledActionSize => (width < MEESHY_LABELED_ACTION_MEASURE.grid.snug ? 56 : width >= MEESHY_LABELED_ACTION_MEASURE.grid.phoneBelow ? 64 : 60);

const splitRows = (count: number, columns: number): readonly number[] => {
  if (count <= 0) return [];
  const full = Math.floor(count / columns);
  const rest = count % columns;
  const rows = [...Array.from({ length: full }, () => columns), ...(rest === 0 ? [] : [rest])];
  const last = rows.length - 1;
  return columns >= 3 && rest === 1 && full >= 1 ? rows.map((size, index) => (index === last - 1 ? size - 1 : index === last ? 2 : size)) : rows;
};

const capOf = (columns: MeeshyActionColumns | undefined, width: number): number | null => {
  const { phoneColumns, phoneBelow } = MEESHY_LABELED_ACTION_MEASURE.grid;
  if (columns !== undefined && typeof columns === 'object' && 'fixed' in columns) return null;
  const adaptive = typeof columns === 'object' && 'adaptive' in columns ? columns.adaptive : phoneColumns;
  return width >= phoneBelow ? Number.POSITIVE_INFINITY : adaptive;
};

/**
 * La règle de colonnes : autant de colonnes d'au moins 76 que la largeur en loge (104 aux
 * tailles d'accessibilité), quatre au plus sur téléphone, jamais une action seule sur la
 * dernière rangée — la grille rééquilibre plutôt que de laisser un orphelin.
 */
export const meeshyActionGridRecipe = (input: MeeshyActionGridRecipeInput): MeeshyActionGridRecipe => {
  const { grid } = MEESHY_LABELED_ACTION_MEASURE;
  const minColumn = (input.textScale ?? 1) >= MEESHY_LABELED_ACTION_MEASURE.largeTextFrom ? MEESHY_LABELED_ACTION_MEASURE.largeTextColumn : MEESHY_LABELED_ACTION_MEASURE.target.width;
  const fits = Math.max(1, Math.floor((input.width + grid.gap) / (minColumn + grid.gap)));
  const fixed = input.columns !== undefined && typeof input.columns === 'object' && 'fixed' in input.columns ? input.columns.fixed : null;
  const cap = capOf(input.columns, input.width);
  const columns = Math.max(1, Math.min(input.count, fixed ?? Math.min(fits, cap ?? fits)));
  const rows = splitRows(input.count, columns);
  return { columns: Math.max(1, ...rows), rows, size: input.size ?? sizeFor(input.width), gap: grid.gap, rowGap: grid.rowGap, minColumn };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyLabeledActionStyle = (recipe: MeeshyLabeledActionRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-action-disc': rem(recipe.disc),
    '--kit-action-title': rem(recipe.titleSize),
    '--kit-action-title-weight': recipe.titleWeight,
    '--kit-action-title-gap': rem(recipe.titleGap),
    '--kit-action-title-lines': recipe.titleLines,
    '--kit-action-value-h': rem(recipe.valueHeight),
    '--kit-action-value': rem(recipe.valueSize),
    '--kit-action-value-weight': recipe.valueWeight,
    '--kit-action-value-gap': rem(recipe.valueGap),
    '--kit-action-w': rem(recipe.targetWidth),
    '--kit-action-h': rem(recipe.targetHeight),
    '--kit-action-opacity': recipe.opacity,
    '--kit-action-glyph-opacity': recipe.glyphOpacity,
    '--kit-action-tint': tint ?? 'var(--accent, var(--color-ios-brand))',
  }) as CSSProperties;

export const meeshyActionGridStyle = (recipe: MeeshyActionGridRecipe): CSSProperties =>
  ({ '--kit-action-grid-gap': rem(recipe.gap), '--kit-action-grid-row-gap': rem(recipe.rowGap), '--kit-action-grid-columns': recipe.columns, '--kit-action-min-column': rem(recipe.minColumn) }) as CSSProperties;
