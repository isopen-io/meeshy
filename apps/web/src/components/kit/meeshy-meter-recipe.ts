import type { CSSProperties } from 'react';

/**
 * K42 · MeeshyMeter — LA RECETTE EN VALEURS (#18874).
 *
 * Une jauge se lit, elle ne se règle pas : une valeur connue sur un total connu, une
 * piste de 5, 8 ou 12, un remplissage qui part du bord de début. L'hôte passe deux
 * nombres et des mots déjà traduits ; la jauge ne nomme ni quota, ni batterie, ni
 * niveau, ni lien. Elle ne mesure aucun temps (c'est `K09`) et ne se touche jamais.
 */
export type MeeshyMeterKind = 'accent' | 'ok' | 'warn' | 'err';
export type MeeshyMeterResolvedKind = MeeshyMeterKind | 'stale';
export type MeeshyMeterSize = 5 | 8 | 12;
export type MeeshyMeterForm = 'continuous' | 'indeterminate' | { readonly stepped: number };

export const MEESHY_METER_SIZES: readonly MeeshyMeterSize[] = [5, 8, 12];

export const MEESHY_METER_MEASURE = {
  indeterminateHeight: 4,
  segmentShare: 0.38,
  stepGap: 6,
  staleOpacity: 0.6,
  markWidth: 2,
  captionGap: 8,
  valueGap: 9,
} as const;

/** La fraction : bornée à 0…1, jamais de division par zéro ; un total nul ou négatif ne rend rien. */
export const meeshyMeterFraction = (value: number, total = 1): number | null => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(Math.max(value / total, 0), 1);
};

export type MeeshyMeterRecipeInput = {
  readonly form: MeeshyMeterForm;
  readonly size: MeeshyMeterSize | number;
  readonly fraction: number | null;
  readonly kind?: MeeshyMeterKind | undefined;
  readonly fullKind?: MeeshyMeterKind | undefined;
  readonly tint?: string | undefined;
  readonly isStale?: boolean | undefined;
  readonly isRtl?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyMeterRecipe = {
  readonly trackHeight: number;
  readonly minFill: number;
  readonly showsFill: boolean;
  readonly kind: MeeshyMeterResolvedKind;
  readonly tone: MeeshyMeterResolvedKind | 'tint';
  readonly opacity: number;
  readonly stepCount: number;
  readonly stepGap: number;
  readonly filledSteps: number;
  readonly segmentShare: number;
  readonly isMoving: boolean;
  readonly origin: 'start' | 'end';
};

const stepsOf = (form: MeeshyMeterForm): number => (typeof form === 'object' ? Math.max(1, Math.trunc(form.stepped)) : 0);

const kindOf = ({ kind = 'accent', fullKind, isStale, fraction }: MeeshyMeterRecipeInput): MeeshyMeterResolvedKind => {
  if (isStale === true) return 'stale';
  return fraction === 1 && fullKind !== undefined ? fullKind : kind;
};

/** La recette d'une jauge : forme, genre, hauteur et fraction deviennent des nombres. */
export const meeshyMeterRecipe = (input: MeeshyMeterRecipeInput): MeeshyMeterRecipe => {
  const { form, fraction } = input;
  const isIndeterminate = form === 'indeterminate';
  const trackHeight = isIndeterminate ? MEESHY_METER_MEASURE.indeterminateHeight : input.size;
  const share = fraction ?? 0;
  const stepCount = stepsOf(form);
  const kind = kindOf(input);
  return {
    trackHeight,
    minFill: share > 0 ? trackHeight : 0,
    showsFill: share > 0 && !isIndeterminate,
    kind,
    tone: input.tint !== undefined && kind !== 'stale' ? 'tint' : kind,
    opacity: kind === 'stale' ? MEESHY_METER_MEASURE.staleOpacity : 1,
    stepCount,
    stepGap: MEESHY_METER_MEASURE.stepGap,
    filledSteps: stepCount === 0 ? 0 : Math.round(share * stepCount),
    segmentShare: MEESHY_METER_MEASURE.segmentShare,
    isMoving: isIndeterminate && input.reduceMotion !== true,
    origin: input.isRtl === true ? 'end' : 'start',
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

const TONE_TOKEN: Readonly<Record<MeeshyMeterResolvedKind, string>> = {
  accent: 'var(--accent, var(--color-ios-brand))',
  ok: 'var(--color-success)',
  warn: 'var(--color-warning)',
  err: 'var(--color-error)',
  stale: 'color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
};

export const meeshyMeterStyle = (recipe: MeeshyMeterRecipe, tint: string | undefined, tintEnd: string | undefined): CSSProperties => {
  const from = recipe.tone === 'tint' ? (tint ?? TONE_TOKEN.accent) : TONE_TOKEN[recipe.kind];
  return {
    '--kit-meter-h': rem(recipe.trackHeight),
    '--kit-meter-min-fill': rem(recipe.minFill),
    '--kit-meter-step-gap': rem(recipe.stepGap),
    '--kit-meter-segment': recipe.segmentShare,
    '--kit-meter-mark': rem(MEESHY_METER_MEASURE.markWidth),
    '--kit-meter-caption-gap': rem(MEESHY_METER_MEASURE.captionGap),
    '--kit-meter-value-gap': rem(MEESHY_METER_MEASURE.valueGap),
    '--kit-meter-tone': from,
    '--kit-meter-tone-end': recipe.tone === 'tint' && tintEnd !== undefined ? tintEnd : from,
    '--kit-meter-opacity': recipe.opacity,
  } as CSSProperties;
};
