import type { CSSProperties } from 'react';

/**
 * K37 · MeeshyLockedRow — LA RECETTE EN VALEURS (#18875, #18857).
 *
 * Ce qui est fermé à mon niveau se voit, verrouillé, avec ce qui l'ouvre : un fantôme
 * au bord pointillé, à l'encre atténuée, avec un cadenas. Il dit le NOM de la chose, ce
 * qui l'ouvre, et propose le geste pour l'obtenir. IL NE CONTIENT JAMAIS LA CHOSE : la
 * signature ne reçoit que des textes, un glyphe, un geste — aucune valeur, aucune image,
 * aucun compte, et rien de flouté (un flou se capture et se devine). Ce que le serveur ne
 * sert pas n'arrive nulle part ; l'app lit la loi d'accès et pose la rangée.
 */
export type MeeshyLockedRowForm = 'row' | 'tile' | 'inline';

export type MeeshyLockedRowWords = {
  readonly locked: string;
  readonly unlocked: string;
  readonly pending: string;
};

export const MEESHY_LOCKED_ROW_MEASURE = {
  strokeWidth: 1.5,
  dash: [5, 4.4],
  radius: { row: 20, tile: 24, inline: 0 },
  minHeight: 58,
  lockSize: { row: 22, tile: 22, inline: 16 },
  glyphSize: 28,
  chipHeight: 30,
  actionHeight: 44,
  pressedScale: 0.975,
  actionDisabledOpacity: 0.4,
  unlockMs: 420,
  reducedMs: 160,
  riseMs: 280,
} as const;

export type MeeshyLockedRowRecipeInput = {
  readonly form?: MeeshyLockedRowForm | undefined;
  readonly hasAction?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly isDone?: boolean | undefined;
  readonly isOpen?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isUnlocking?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyLockedRowRecipe = {
  readonly form: MeeshyLockedRowForm;
  readonly strokeWidth: number;
  readonly dash: readonly number[];
  readonly radius: number;
  readonly minHeight: number;
  readonly border: 'dashed' | 'solid' | 'none';
  readonly showsLock: boolean;
  readonly lockSize: number;
  readonly glyphSize: number;
  readonly chipHeight: number;
  readonly actionHeight: number;
  readonly requirementPlacement: 'chip' | 'line' | 'inline';
  readonly pressedScale: number;
  readonly actionOpacity: number;
  readonly rowOpacity: number;
  readonly unlockMs: number;
  readonly isAnimated: boolean;
};

export const meeshyLockedRowRecipe = (input: MeeshyLockedRowRecipeInput): MeeshyLockedRowRecipe => {
  const { form = 'row', isOpen = false } = input;
  const measure = MEESHY_LOCKED_ROW_MEASURE;
  const isInline = form === 'inline';
  const hasAction = input.hasAction === true && !isInline;
  return {
    form,
    strokeWidth: measure.strokeWidth,
    dash: measure.dash,
    radius: measure.radius[form],
    minHeight: isInline ? 0 : measure.minHeight,
    border: isInline ? 'none' : isOpen ? 'solid' : 'dashed',
    showsLock: !isOpen,
    lockSize: measure.lockSize[form],
    glyphSize: measure.glyphSize,
    chipHeight: measure.chipHeight,
    actionHeight: measure.actionHeight,
    requirementPlacement: isInline ? 'inline' : hasAction ? 'line' : 'chip',
    pressedScale: measure.pressedScale,
    actionOpacity: input.isEnabled === false ? measure.actionDisabledOpacity : 1,
    rowOpacity: 1,
    unlockMs: input.reduceMotion === true ? measure.reducedMs : measure.unlockMs,
    isAnimated: input.isUnlocking === true,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyLockedRowStyle = (recipe: MeeshyLockedRowRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-locked-stroke': `${recipe.strokeWidth}px`,
    '--kit-locked-dash': recipe.dash.map((part) => `${part}px`).join(' '),
    '--kit-locked-radius': rem(recipe.radius),
    '--kit-locked-min-h': rem(recipe.minHeight),
    '--kit-locked-lock': rem(recipe.lockSize),
    '--kit-locked-glyph': rem(recipe.glyphSize),
    '--kit-locked-chip': rem(recipe.chipHeight),
    '--kit-locked-action': rem(recipe.actionHeight),
    '--kit-locked-pressed': recipe.pressedScale,
    '--kit-locked-action-opacity': recipe.actionOpacity,
    '--kit-locked-unlock': `${recipe.unlockMs}ms`,
    ...(tint === undefined ? {} : { '--kit-locked-tint': tint }),
  }) as CSSProperties;
