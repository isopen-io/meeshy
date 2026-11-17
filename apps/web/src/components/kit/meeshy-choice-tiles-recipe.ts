import type { CSSProperties } from 'react';

/**
 * K47 · MeeshyChoiceTiles — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Une tuile choisit, elle ne déclenche rien : toucher change une valeur et rien d'autre, la
 * suite appartient au bouton de l'écran. Le choix se marque par TROIS signes à la fois — un
 * bord de 2, un fond teinté, une coche de coin — jamais par la couleur seule. L'hôte passe
 * des identifiants, des textes, des glyphes et une teinte ; la sélection lui revient entière.
 */
export type MeeshyChoiceContent = 'option' | 'value' | 'icon';
export type MeeshyChoiceFormat = 'square' | 'wide' | 'compact';
export type MeeshyChoiceSurface = 'tonal' | 'glass';
export type MeeshyChoiceItemState = 'enabled' | 'disabled' | { readonly locked: string };
export type MeeshyChoiceSelection = { readonly single: string | null } | { readonly multiple: ReadonlySet<string> };

export const MEESHY_CHOICE_MEASURE = {
  radius: { square: 24, wide: 24, compact: 22 },
  padding: { square: 16, wide: 16, compact: 11 },
  gutter: { tonal: 10, glass: 8 },
  titleSize: { square: 16.5, wide: 16.5, compact: 14.5 },
  minHeight: { square: 0, wide: 80, compact: 68 },
  valueHeight: 132,
  valueSize: 40,
  valueSizeDense: 30,
  headMedallion: 46,
  headIcon: 28,
  iconDisc: 54,
  check: 24,
  detailSize: 12.5,
  selectedBorder: 2,
  border: 1,
  pressScale: 0.96,
  pressVeil: 0.13,
  disabledOpacity: 0.4,
  columnMin: 148,
} as const;

export const MEESHY_CHOICE_COLUMNS = { min: 2, max: 4 } as const;

export const meeshyChoiceColumns = (columns: number | undefined): number =>
  Math.min(Math.max(Math.trunc(Number.isFinite(columns) ? (columns as number) : MEESHY_CHOICE_COLUMNS.min), MEESHY_CHOICE_COLUMNS.min), MEESHY_CHOICE_COLUMNS.max);

export type MeeshyChoiceTilesRecipeInput = {
  readonly content?: MeeshyChoiceContent | undefined;
  readonly format?: MeeshyChoiceFormat | undefined;
  readonly surface?: MeeshyChoiceSurface | undefined;
  readonly columns?: number | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly state?: MeeshyChoiceItemState | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyChoiceTilesRecipe = {
  readonly columns: number;
  readonly format: MeeshyChoiceFormat;
  readonly radius: number;
  readonly padding: number;
  readonly gutter: number;
  readonly titleSize: number;
  readonly minHeight: number;
  readonly headSize: number;
  readonly valueSize: number;
  readonly checkSize: number;
  readonly borderWidth: number;
  readonly tintedFill: boolean;
  readonly showsCheck: boolean;
  readonly invertsDisc: boolean;
  readonly pressScale: number;
  readonly pressVeil: number;
  readonly opacity: number;
  readonly isLocked: boolean;
  readonly isDisabled: boolean;
  readonly checkFades: boolean;
};

export const meeshyChoiceIsLocked = (state: MeeshyChoiceItemState | undefined): state is { readonly locked: string } => typeof state === 'object';

export const meeshyChoiceTilesRecipe = (input: MeeshyChoiceTilesRecipeInput): MeeshyChoiceTilesRecipe => {
  const content = input.content ?? 'option';
  const format = input.format ?? 'square';
  const columns = meeshyChoiceColumns(input.columns);
  const isLocked = meeshyChoiceIsLocked(input.state);
  const isDisabled = input.state === 'disabled';
  const isSelected = input.isSelected === true && !isLocked && !isDisabled;
  const reduce = input.reduceMotion === true;
  const m = MEESHY_CHOICE_MEASURE;
  return {
    columns,
    format,
    radius: m.radius[format],
    padding: m.padding[format],
    gutter: m.gutter[input.surface ?? 'tonal'],
    titleSize: m.titleSize[format],
    minHeight: content === 'value' ? m.valueHeight : m.minHeight[format],
    headSize: content === 'icon' ? m.iconDisc : m.headMedallion,
    valueSize: columns >= 4 ? m.valueSizeDense : m.valueSize,
    checkSize: m.check,
    borderWidth: isLocked ? 1.5 : isSelected ? m.selectedBorder : m.border,
    tintedFill: isSelected,
    showsCheck: isSelected && content !== 'icon',
    invertsDisc: isSelected && content === 'icon',
    pressScale: input.isPressed === true && !reduce && !isLocked && !isDisabled ? m.pressScale : 1,
    pressVeil: input.isPressed === true && !isLocked && !isDisabled ? m.pressVeil : 0,
    opacity: isDisabled ? m.disabledOpacity : 1,
    isLocked,
    isDisabled,
    checkFades: reduce,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyChoiceTilesStyle = (recipe: MeeshyChoiceTilesRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-choice-radius': rem(recipe.radius),
    '--kit-choice-padding': rem(recipe.padding),
    '--kit-choice-title': rem(recipe.titleSize),
    '--kit-choice-min': rem(recipe.minHeight),
    '--kit-choice-head': rem(recipe.headSize),
    '--kit-choice-value': rem(recipe.valueSize),
    '--kit-choice-check': rem(recipe.checkSize),
    '--kit-choice-border': `${recipe.borderWidth}px`,
    '--kit-choice-press': recipe.pressScale,
    '--kit-choice-veil': recipe.pressVeil,
    '--kit-choice-opacity': recipe.opacity,
    ...(tint === undefined ? {} : { '--kit-choice-tint': tint }),
  }) as CSSProperties;
