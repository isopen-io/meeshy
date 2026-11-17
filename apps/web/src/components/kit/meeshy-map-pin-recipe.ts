import type { CSSProperties } from 'react';

/**
 * K36 · MeeshyMapPin — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Une personne sur une carte est son avatar, son disque de flou et son onde. L'épingle ne
 * connaît ni la carte, ni les coordonnées, ni la personne : elle reçoit un contenu rond,
 * une précision déjà mesurée en pixels d'écran, et dessine autour. La précision change ce
 * qu'il y a AUTOUR de l'épingle, jamais l'épingle elle-même.
 */
export type MeeshyMapPinPrecision = 'exact' | { readonly area: number } | { readonly wide: number };
export type MeeshyMapPinKind = 'other' | 'own' | 'ghost';

export const MEESHY_MAP_PIN_MEASURE = {
  content: 48,
  selected: 56,
  own: 38,
  cluster: 36,
  clusterOverlap: 8,
  clusterMax: 3,
  clusterCount: 26,
  liner: 3,
  ownLiner: 2.5,
  pulseRing: 2,
  pulseOffset: 6,
  tapTarget: 44,
  minBlurRadius: 32,
  blurOpacity: 0.18,
  blurOpacitySelected: 0.28,
  pressScale: 0.94,
  captionMax: 18,
  captionHeight: 22,
  captionGap: 12,
  point: 14,
  badge: 14,
  ghostGlyph: 24,
} as const;

export const MEESHY_MAP_PIN_CLUSTER_MIN = 2;
export const MEESHY_MAP_PIN_CLUSTER_CAP = 99;

export type MeeshyMapPinRecipeInput = {
  readonly kind?: MeeshyMapPinKind | undefined;
  readonly precision?: MeeshyMapPinPrecision | undefined;
  readonly isLive?: boolean | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isStale?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyMapPinRecipe = {
  readonly kind: MeeshyMapPinKind;
  readonly content: number;
  readonly liner: number;
  readonly tapTarget: number;
  readonly drawsPoint: boolean;
  readonly drawsDisc: boolean;
  readonly discDiameter: number;
  readonly discOpacity: number;
  readonly discDashed: boolean;
  readonly drawsPulse: boolean;
  readonly pulseAnimates: boolean;
  readonly pressScale: number;
  readonly contentOpacity: number;
  readonly drawsRing: boolean;
  readonly isForeground: boolean;
};

/** Le rayon de précision en pixels d'écran ; `exact` n'en a pas. */
export const meeshyMapPinRadius = (precision: MeeshyMapPinPrecision | undefined): number => {
  if (precision === undefined || precision === 'exact') return 0;
  const radius = 'area' in precision ? precision.area : precision.wide;
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
};

export const meeshyMapPinRecipe = (input: MeeshyMapPinRecipeInput): MeeshyMapPinRecipe => {
  const kind = input.kind ?? 'other';
  const isOther = kind === 'other';
  const radius = isOther ? meeshyMapPinRadius(input.precision) : 0;
  const drawsDisc = radius >= MEESHY_MAP_PIN_MEASURE.minBlurRadius;
  const isSelected = isOther && input.isSelected === true;
  const isStale = isOther && input.isStale === true;
  const wantsPulse = kind === 'own' || (isOther && input.isLive === true && !isStale);
  return {
    kind,
    content: kind === 'own' ? MEESHY_MAP_PIN_MEASURE.own : isSelected ? MEESHY_MAP_PIN_MEASURE.selected : MEESHY_MAP_PIN_MEASURE.content,
    liner: kind === 'own' ? MEESHY_MAP_PIN_MEASURE.ownLiner : MEESHY_MAP_PIN_MEASURE.liner,
    tapTarget: MEESHY_MAP_PIN_MEASURE.tapTarget,
    drawsPoint: isOther && (input.precision === undefined || input.precision === 'exact'),
    drawsDisc,
    discDiameter: drawsDisc ? radius * 2 : 0,
    discOpacity: isSelected ? MEESHY_MAP_PIN_MEASURE.blurOpacitySelected : MEESHY_MAP_PIN_MEASURE.blurOpacity,
    discDashed: isStale,
    drawsPulse: wantsPulse,
    pulseAnimates: wantsPulse && input.reduceMotion !== true,
    pressScale: input.isPressed === true ? MEESHY_MAP_PIN_MEASURE.pressScale : 1,
    contentOpacity: isStale ? 0.55 : 1,
    drawsRing: isSelected,
    isForeground: isSelected,
  };
};

/** Un mot sous l'épingle : une ligne, coupé à 18 caractères. */
export const meeshyMapPinCaption = (caption: string | undefined): string | null => {
  if (caption === undefined || caption === '') return null;
  const chars = Array.from(caption);
  return chars.length <= MEESHY_MAP_PIN_MEASURE.captionMax ? caption : `${chars.slice(0, MEESHY_MAP_PIN_MEASURE.captionMax - 1).join('')}…`;
};

export const meeshyPinClusterCount = (count: number): string | null => {
  if (!Number.isFinite(count) || count < MEESHY_MAP_PIN_CLUSTER_MIN) return null;
  return count > MEESHY_MAP_PIN_CLUSTER_CAP ? `${MEESHY_MAP_PIN_CLUSTER_CAP}+` : String(Math.trunc(count));
};

const REM = 16;
export const mapPinRem = (px: number): string => `${px / REM}rem`;

export const meeshyMapPinStyle = (recipe: MeeshyMapPinRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-pin-size': mapPinRem(recipe.content),
    '--kit-pin-liner': mapPinRem(recipe.liner),
    '--kit-pin-target': mapPinRem(recipe.tapTarget),
    '--kit-pin-point': mapPinRem(MEESHY_MAP_PIN_MEASURE.point),
    '--kit-pin-badge': mapPinRem(MEESHY_MAP_PIN_MEASURE.badge),
    '--kit-pin-ring': mapPinRem(MEESHY_MAP_PIN_MEASURE.pulseRing),
    '--kit-pin-offset': mapPinRem(MEESHY_MAP_PIN_MEASURE.pulseOffset),
    '--kit-pin-press': recipe.pressScale,
    '--kit-pin-content-opacity': recipe.contentOpacity,
    ...(tint === undefined ? {} : { '--kit-pin-tint': tint }),
  }) as CSSProperties;
