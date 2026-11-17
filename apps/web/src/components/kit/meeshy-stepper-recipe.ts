import type { CSSProperties, ReactNode } from 'react';

/**
 * K53 · MeeshyStepper — LA LOI ET LA RECETTE (#18875, #18857).
 *
 * Une valeur qui avance par crans, jamais une glissière. Trois genres : `buttons`
 * (deux boutons, la valeur au milieu, l'appui long qui accélère), `track` (2 à 5 arrêts
 * ordonnés d'une ligne, un seul choisi), `milestones` (2 à 5 étapes en lecture seule).
 * L'hôte passe des nombres, des glyphes et des mots déjà traduits : le pas ne nomme ni
 * entrée, ni précision, ni cercle, ni lien, ni étape d'histoire.
 */
export type MeeshyStepperKind = 'buttons' | 'track' | 'milestones';
export type MeeshyStepperSize = 'regular' | 'compact';
export type MeeshyStepperRange = { readonly min: number; readonly max: number };
export type MeeshyStepperLadder = readonly { readonly from: number; readonly step: number }[];

export type MeeshyStepperStop = {
  readonly id: string;
  readonly title: string;
  readonly caption?: string | undefined;
  readonly glyph?: ReactNode;
  readonly markSize?: number | undefined;
};

export const MEESHY_STEPPER_HOLD = { delayMs: 400, firstIntervalMs: 120, fastIntervalMs: 60, fastAfter: 8 } as const;
export const MEESHY_STEPPER_STOPS = { min: 2, max: 5 } as const;

export const MEESHY_STEPPER_MEASURE = {
  disc: { regular: 44, compact: 36 },
  tapTarget: 44,
  capsule: { regular: 50, compact: 44 },
  capsuleInset: 3,
  capsuleGap: 4,
  boundOpacity: 0.36,
  disabledOpacity: 0.42,
  valueMinWidth: 34,
  trackLine: 3,
  markMin: 10,
  markMax: 56,
  markCell: 60,
  markDefault: 14,
  milestoneDisc: 44,
  milestoneTrace: 3,
  milestoneStagger: 180,
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** La répétition de l'appui long : d'abord toutes les 120 ms, puis toutes les 60. */
export const meeshyStepperHoldInterval = (repeatCount: number): number =>
  repeatCount < MEESHY_STEPPER_HOLD.fastAfter ? MEESHY_STEPPER_HOLD.firstIntervalMs : MEESHY_STEPPER_HOLD.fastIntervalMs;

const stepOf = (value: number, base: number, ladder: MeeshyStepperLadder): number =>
  ladder.reduce((step, rung) => (Math.abs(value) >= rung.from ? rung.step : step), base);

/** La loi des bornes : jamais hors de la plage ; à la butée la valeur ne bouge pas et `hitBound` le dit. */
export const meeshyStepperNext = (input: {
  readonly value: number;
  readonly delta: number;
  readonly range: MeeshyStepperRange;
  readonly step?: number | undefined;
  readonly ladder?: MeeshyStepperLadder | undefined;
}): { readonly value: number; readonly hitBound: boolean } => {
  const { value, delta, range } = input;
  const size = stepOf(value, input.step ?? 1, input.ladder ?? []);
  const next = clamp(value + Math.sign(delta) * size, range.min, range.max);
  return { value: next, hitBound: next === value };
};

export const meeshyStepperMarkSize = (size: number | undefined): number =>
  clamp(size ?? MEESHY_STEPPER_MEASURE.markDefault, MEESHY_STEPPER_MEASURE.markMin, MEESHY_STEPPER_MEASURE.markMax);

export type MeeshyStepperRecipeInput = {
  readonly kind?: MeeshyStepperKind | undefined;
  readonly size?: MeeshyStepperSize | undefined;
  readonly value: number;
  readonly range?: MeeshyStepperRange | undefined;
  readonly stopCount?: number | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isRtl?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyStepperRecipe = {
  readonly kind: MeeshyStepperKind;
  readonly isRenderable: boolean;
  readonly disc: number;
  readonly tapTarget: number;
  readonly capsuleHeight: number;
  readonly canIncrement: boolean;
  readonly canDecrement: boolean;
  readonly boundOpacity: number;
  readonly opacity: number;
  readonly fill: number;
  readonly trackLine: number;
  readonly markMin: number;
  readonly markMax: number;
  readonly markCell: number;
  readonly drawsTrace: boolean;
  readonly origin: 'start' | 'end';
};

const isStopCount = (count: number | undefined): boolean =>
  count !== undefined && Number.isInteger(count) && count >= MEESHY_STEPPER_STOPS.min && count <= MEESHY_STEPPER_STOPS.max;

export const meeshyStepperRecipe = (input: MeeshyStepperRecipeInput): MeeshyStepperRecipe => {
  const { kind = 'buttons', size = 'regular', value, range, stopCount } = input;
  const isButtons = kind === 'buttons';
  const fill = isStopCount(stopCount) ? clamp(value / ((stopCount ?? 2) - 1), 0, 1) : 0;
  return {
    kind,
    isRenderable: isButtons ? range !== undefined && range.max > range.min : isStopCount(stopCount),
    disc: MEESHY_STEPPER_MEASURE.disc[size],
    tapTarget: MEESHY_STEPPER_MEASURE.tapTarget,
    capsuleHeight: MEESHY_STEPPER_MEASURE.capsule[size],
    canIncrement: range === undefined || value < range.max,
    canDecrement: range === undefined || value > range.min,
    boundOpacity: MEESHY_STEPPER_MEASURE.boundOpacity,
    opacity: input.isEnabled === false ? MEESHY_STEPPER_MEASURE.disabledOpacity : 1,
    fill,
    trackLine: MEESHY_STEPPER_MEASURE.trackLine,
    markMin: MEESHY_STEPPER_MEASURE.markMin,
    markMax: MEESHY_STEPPER_MEASURE.markMax,
    markCell: MEESHY_STEPPER_MEASURE.markCell,
    drawsTrace: kind === 'milestones' && input.reduceMotion !== true,
    origin: input.isRtl === true ? 'end' : 'start',
  };
};

const REM = 16;
export const stepperRem = (px: number): string => `${px / REM}rem`;

export const meeshyStepperStyle = (recipe: MeeshyStepperRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-stepper-disc': stepperRem(recipe.disc),
    '--kit-stepper-target': stepperRem(recipe.tapTarget),
    '--kit-stepper-capsule': stepperRem(recipe.capsuleHeight),
    '--kit-stepper-inset': stepperRem(MEESHY_STEPPER_MEASURE.capsuleInset),
    '--kit-stepper-gap': stepperRem(MEESHY_STEPPER_MEASURE.capsuleGap),
    '--kit-stepper-value-min': stepperRem(MEESHY_STEPPER_MEASURE.valueMinWidth),
    '--kit-stepper-bound-opacity': recipe.boundOpacity,
    '--kit-stepper-opacity': recipe.opacity,
    '--kit-stepper-line': stepperRem(recipe.trackLine),
    '--kit-stepper-cell': stepperRem(recipe.markCell),
    '--kit-stepper-fill': recipe.fill,
    '--kit-stepper-trace': stepperRem(MEESHY_STEPPER_MEASURE.milestoneTrace),
    '--kit-stepper-milestone': stepperRem(MEESHY_STEPPER_MEASURE.milestoneDisc),
    '--kit-stepper-stagger': `${MEESHY_STEPPER_MEASURE.milestoneStagger}ms`,
    ...(tint === undefined ? {} : { '--kit-stepper-tint': tint }),
  }) as CSSProperties;
