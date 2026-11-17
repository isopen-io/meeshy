import type { CSSProperties } from 'react';

/**
 * K33 · MeeshyCircleScale — LA LOI D'INTENSITÉ ET LA RECETTE (#18875, #18857).
 *
 * Un niveau de proximité se lit par l'INTENSITÉ d'une seule teinte, de plus en plus
 * pleine : le plus haut est plein, le plus bas n'a qu'un contour. La loi se compte
 * depuis le HAUT, donc le même nom a la même intensité que l'hôte passe cinq niveaux ou
 * six. Le composant montre un rang ; il ne sait pas ce qu'on range, ni ce que le rang
 * ouvre (la loi d'accès reste à l'app, qui passe un entier).
 */
export type MeeshyCircleScaleForm = 'dots' | 'pill' | 'rings';
export type MeeshyCircleScaleSize = 'compact' | 'regular' | 'large';

export const MEESHY_CIRCLE_SCALE_LEVELS = { min: 2, max: 8 } as const;

/** Du plus haut au plus bas : 100, 52, 32, 18, 8 %. Au-delà du cinquième rang : le contour seul (0). */
const INTENSITY_FROM_TOP: readonly number[] = [1, 0.52, 0.32, 0.18, 0.08];
/** Trois niveaux ou moins : un cran sur deux, 100 · 32 · 8. */
const INTENSITY_SPARSE: readonly number[] = [1, 0.32, 0.08];
const SPARSE_UP_TO = 3;
const DARK_INK_FROM = 0.52;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Le rang `level` (0 = le plus bas) sur `of` niveaux rend son intensité, de 0 (contour) à 1 (plein). */
export const meeshyCircleScaleIntensity = (level: number, of: number): number => {
  const top = of - 1 - clamp(Math.trunc(level), 0, of - 1);
  const table = of <= SPARSE_UP_TO ? INTENSITY_SPARSE : INTENSITY_FROM_TOP;
  return table[top] ?? 0;
};

export const MEESHY_CIRCLE_SCALE_MEASURE = {
  dot: { compact: 12, regular: 58, large: 58 },
  gap: { compact: 6, regular: 10, large: 10 },
  pill: { compact: 26, regular: 34, large: 44 },
  tapTarget: 44,
  ringStep: 20,
  ringStroke: 1.5,
  currentStroke: 4,
  glow: 26,
  centerSlot: 40,
  markerSlot: 48,
  markerCutout: 3,
  pressedScale: 0.92,
  disabledOpacity: 0.4,
} as const;

export type MeeshyCircleScaleRank = {
  readonly level: number;
  readonly intensity: number;
  readonly isOutline: boolean;
  readonly ink: 'dark' | 'theme';
  readonly isCurrent: boolean;
  readonly isOther: boolean;
};

export type MeeshyCircleScaleRecipeInput = {
  readonly count: number;
  readonly current?: number | null | undefined;
  readonly other?: number | null | undefined;
  readonly form?: MeeshyCircleScaleForm | undefined;
  readonly size?: MeeshyCircleScaleSize | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
};

export type MeeshyCircleScaleRecipe = {
  readonly isRenderable: boolean;
  readonly form: MeeshyCircleScaleForm;
  readonly size: MeeshyCircleScaleSize;
  readonly current: number | null;
  readonly other: number | null;
  readonly ranks: readonly MeeshyCircleScaleRank[];
  readonly dot: number;
  readonly gap: number;
  readonly pillHeight: number;
  readonly tapTarget: number;
  readonly ringStep: number;
  readonly ringStroke: number;
  readonly currentStroke: number;
  readonly glow: number;
  readonly pressedScale: number;
  readonly opacity: number;
};

const rankOrNull = (rank: number | null | undefined, count: number): number | null =>
  rank === null || rank === undefined || !Number.isFinite(rank) ? null : clamp(Math.trunc(rank), 0, count - 1);

export const meeshyCircleScaleRecipe = (input: MeeshyCircleScaleRecipeInput): MeeshyCircleScaleRecipe => {
  const { count, form = 'dots', size = 'regular' } = input;
  const isRenderable = Number.isInteger(count) && count >= MEESHY_CIRCLE_SCALE_LEVELS.min && count <= MEESHY_CIRCLE_SCALE_LEVELS.max;
  const current = isRenderable ? rankOrNull(input.current, count) : null;
  const other = isRenderable && form !== 'pill' ? rankOrNull(input.other, count) : null;
  const ranks = isRenderable
    ? Array.from({ length: count }, (_, level): MeeshyCircleScaleRank => {
        const intensity = meeshyCircleScaleIntensity(level, count);
        return { level, intensity, isOutline: intensity === 0, ink: intensity >= DARK_INK_FROM ? 'dark' : 'theme', isCurrent: level === current, isOther: level === other };
      })
    : [];
  const measure = MEESHY_CIRCLE_SCALE_MEASURE;
  return {
    isRenderable,
    form,
    size,
    current,
    other,
    ranks,
    dot: measure.dot[size],
    gap: measure.gap[size],
    pillHeight: measure.pill[size],
    tapTarget: measure.tapTarget,
    ringStep: measure.ringStep,
    ringStroke: measure.ringStroke,
    currentStroke: measure.currentStroke,
    glow: measure.glow,
    pressedScale: measure.pressedScale,
    opacity: input.isEnabled === false ? measure.disabledOpacity : 1,
  };
};

const REM = 16;
export const circleScaleRem = (px: number): string => `${px / REM}rem`;

export const meeshyCircleScaleStyle = (recipe: MeeshyCircleScaleRecipe, tint: string | undefined, otherTint: string | undefined): CSSProperties =>
  ({
    '--kit-scale-dot': circleScaleRem(recipe.dot),
    '--kit-scale-gap': circleScaleRem(recipe.gap),
    '--kit-scale-pill': circleScaleRem(recipe.pillHeight),
    '--kit-scale-target': circleScaleRem(recipe.tapTarget),
    '--kit-scale-stroke': circleScaleRem(recipe.ringStroke),
    '--kit-scale-current-stroke': circleScaleRem(recipe.currentStroke),
    '--kit-scale-glow': circleScaleRem(recipe.glow),
    '--kit-scale-center': circleScaleRem(MEESHY_CIRCLE_SCALE_MEASURE.centerSlot),
    '--kit-scale-marker': circleScaleRem(MEESHY_CIRCLE_SCALE_MEASURE.markerSlot),
    '--kit-scale-cutout': circleScaleRem(MEESHY_CIRCLE_SCALE_MEASURE.markerCutout),
    '--kit-scale-pressed': recipe.pressedScale,
    '--kit-scale-opacity': recipe.opacity,
    ...(tint === undefined ? {} : { '--kit-scale-tint': tint }),
    ...(otherTint === undefined ? {} : { '--kit-scale-other-tint': otherTint }),
  }) as CSSProperties;

/** Le diamètre de l'anneau `level` : le plus bas est dehors, vingt entre deux anneaux, le centre au milieu. */
export const meeshyCircleScaleRingDiameter = (level: number, count: number): number =>
  MEESHY_CIRCLE_SCALE_MEASURE.centerSlot + 2 * MEESHY_CIRCLE_SCALE_MEASURE.ringStep * (count - level);
