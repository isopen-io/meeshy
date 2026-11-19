import type { CSSProperties } from 'react';

/**
 * K45 · MeeshyMedallion — LA RECETTE EN VALEURS (#18874).
 *
 * Un médaillon nomme, il ne se touche pas : un glyphe, ou une valeur courte, au
 * centre d'une forme teintée. Fond et encre sortent d'UNE teinte reçue ; au plus un
 * décor ; quatre états. La loi : s'il se touche, ce n'est plus un médaillon — c'est
 * un `K02`. Aucun rôle de bouton, aucune cible, aucun état pressé. Tout se mesure
 * en part du diamètre ; aucun bord, aucune ombre.
 */
export type MeeshyMedallionKind = 'accent' | 'ok' | 'warn' | 'err' | 'neutral';
export type MeeshyMedallionShape = 'disc' | 'squircle' | 'scallop' | 'blob';
export type MeeshyMedallionFill = 'soft' | 'solid';
export type MeeshyMedallionState = 'normal' | 'current' | 'earned' | 'locked';
export type MeeshyMedallionSize = 24 | 36 | 44 | 52 | 64 | 96;
export type MeeshyMedallionDecorName = 'none' | 'halo' | 'dashed' | 'struck' | { readonly waves: 1 | 2 | 3 };
export type MeeshyMedallionDecor = MeeshyMedallionDecorName | readonly MeeshyMedallionDecorName[];

export const MEESHY_MEDALLION_SIZES: readonly MeeshyMedallionSize[] = [24, 36, 44, 52, 64, 96];

export const MEESHY_MEDALLION_MEASURE = {
  softOpacity: 0.18,
  glyphShare: 0.5,
  glyphMin: 14,
  valueShare: 0.44,
  squircleShare: 0.34,
  lobes: 9,
  scallopSeconds: 22,
  blobSeconds: 8,
  halo: { share: 0.11, opacity: 0.07 },
  dashed: { width: 2, share: 0.11, seconds: 40 },
  struck: { width: 3, share: 0.64, angle: -45, cutout: 3 },
  lockedBorder: 1.5,
  lockedOpacity: 0.35,
  wavesSeconds: 2.4,
} as const;

export type MeeshyMedallionRecipeInput = {
  readonly kind?: MeeshyMedallionKind | undefined;
  readonly shape?: MeeshyMedallionShape | undefined;
  readonly fill?: MeeshyMedallionFill | undefined;
  readonly decor?: MeeshyMedallionDecor | undefined;
  readonly size?: MeeshyMedallionSize | undefined;
  readonly state?: MeeshyMedallionState | undefined;
  readonly tint?: string | undefined;
  readonly supportsShape?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyMedallionMotion =
  | { readonly kind: 'none' }
  | { readonly kind: 'spin'; readonly seconds: number }
  | { readonly kind: 'drift'; readonly seconds: number };

export type MeeshyMedallionRecipe = {
  readonly kind: MeeshyMedallionKind;
  readonly tone: MeeshyMedallionKind | 'tint';
  readonly shape: MeeshyMedallionShape;
  readonly diameter: number;
  readonly radius: number;
  readonly glyphSize: number;
  readonly valueSize: number;
  readonly background: 'soft' | 'solid' | 'none';
  readonly fillOpacity: number;
  readonly ink: 'tone' | 'dark';
  readonly hasBorder: boolean;
  readonly hasShadow: boolean;
  readonly borderWidth: number;
  readonly borderStyle: 'none' | 'dashed';
  readonly opacity: number;
  readonly lobes: number | null;
  readonly motion: MeeshyMedallionMotion;
  readonly rotatesContent: boolean;
  readonly halo: { readonly ring: number; readonly opacity: number } | null;
  readonly dashed: { readonly width: number; readonly inset: number; readonly seconds: number } | null;
  readonly struck: { readonly width: number; readonly length: number; readonly angle: number; readonly cutout: number } | null;
  readonly waves: number;
  readonly showsLock: boolean;
  readonly isInteractive: false;
  readonly targetSide: 0;
};

const decorsOf = (decor: MeeshyMedallionDecor): readonly MeeshyMedallionDecorName[] => {
  const list = Array.isArray(decor) ? (decor as readonly MeeshyMedallionDecorName[]) : [decor as MeeshyMedallionDecorName];
  const named = list.filter((item) => item !== 'none');
  const isStruckWithRing = named.length === 2 && named.includes('struck') && named.includes('dashed');
  return isStruckWithRing ? named : named.slice(0, 1);
};

const motionOf = (shape: MeeshyMedallionShape, reduceMotion: boolean): MeeshyMedallionMotion => {
  if (reduceMotion) return { kind: 'none' };
  if (shape === 'scallop') return { kind: 'spin', seconds: MEESHY_MEDALLION_MEASURE.scallopSeconds };
  if (shape === 'blob') return { kind: 'drift', seconds: MEESHY_MEDALLION_MEASURE.blobSeconds };
  return { kind: 'none' };
};

const isDrawnShape = (shape: MeeshyMedallionShape): boolean => shape === 'scallop' || shape === 'blob';

/** La recette d'un médaillon : genre, fond, forme, décor, taille et état deviennent des nombres. */
export const meeshyMedallionRecipe = (input: MeeshyMedallionRecipeInput): MeeshyMedallionRecipe => {
  const size = input.size ?? 44;
  const state = input.state ?? 'normal';
  const isLocked = state === 'locked';
  const reduceMotion = input.reduceMotion === true;
  const requested = input.shape ?? 'disc';
  const shape = isDrawnShape(requested) && (input.supportsShape === false || reduceMotion) ? 'disc' : requested;
  const kind = input.kind ?? 'accent';
  const decors = isLocked ? [] : decorsOf(input.decor ?? 'none');
  const wave = decors.find((item): item is { readonly waves: 1 | 2 | 3 } => typeof item === 'object');
  const { halo, dashed, struck } = MEESHY_MEDALLION_MEASURE;
  const isSolid = !isLocked && (input.fill === 'solid' || state === 'current');
  return {
    kind,
    tone: input.tint === undefined ? kind : 'tint',
    shape,
    diameter: size,
    radius: shape === 'squircle' ? Math.round(size * MEESHY_MEDALLION_MEASURE.squircleShare) : size / 2,
    glyphSize: Math.max(Math.round(size * MEESHY_MEDALLION_MEASURE.glyphShare), MEESHY_MEDALLION_MEASURE.glyphMin),
    valueSize: size * MEESHY_MEDALLION_MEASURE.valueShare,
    background: isLocked ? 'none' : isSolid ? 'solid' : 'soft',
    fillOpacity: MEESHY_MEDALLION_MEASURE.softOpacity,
    ink: isSolid ? 'dark' : 'tone',
    hasBorder: false,
    hasShadow: false,
    borderWidth: isLocked ? MEESHY_MEDALLION_MEASURE.lockedBorder : 0,
    borderStyle: isLocked ? 'dashed' : 'none',
    opacity: isLocked ? MEESHY_MEDALLION_MEASURE.lockedOpacity : 1,
    lobes: shape === 'scallop' ? MEESHY_MEDALLION_MEASURE.lobes : null,
    motion: motionOf(shape, reduceMotion),
    rotatesContent: false,
    halo: decors.includes('halo') ? { ring: size * halo.share, opacity: halo.opacity } : null,
    dashed: decors.includes('dashed') ? { width: dashed.width, inset: size * dashed.share, seconds: reduceMotion ? 0 : dashed.seconds } : null,
    struck: decors.includes('struck') ? { width: struck.width, length: size * struck.share, angle: struck.angle, cutout: struck.cutout } : null,
    waves: wave === undefined ? 0 : reduceMotion ? 1 : wave.waves,
    showsLock: isLocked,
    isInteractive: false,
    targetSide: 0,
  };
};

const OUTLINE_POINTS = 90;

const polygon = (radiusAt: (angle: number) => number): string => {
  const points = Array.from({ length: OUTLINE_POINTS }, (_, index) => {
    const angle = (index / OUTLINE_POINTS) * Math.PI * 2;
    const radius = radiusAt(angle);
    return `${(50 + radius * Math.cos(angle)).toFixed(2)}% ${(50 + radius * Math.sin(angle)).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
};

const OUTLINES: Readonly<Record<'scallop' | 'blob', string>> = {
  scallop: polygon((angle) => 46 + 4 * Math.cos(MEESHY_MEDALLION_MEASURE.lobes * angle)),
  blob: polygon((angle) => 45 + 2.4 * Math.cos(2 * angle + 1) + 1.6 * Math.cos(3 * angle)),
};

/** Le tracé d'une forme que le CSS ne sait pas écrire : un `clip-path` calculé, mêmes boîte et diamètre que le disque. */
export const meeshyMedallionOutline = (shape: 'scallop' | 'blob'): string => OUTLINES[shape];

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

const TONE_TOKEN: Readonly<Record<MeeshyMedallionKind, string>> = {
  accent: 'var(--accent, var(--color-ios-brand))',
  ok: 'var(--color-success)',
  warn: 'var(--color-warning)',
  err: 'var(--color-error)',
  neutral: 'var(--color-ios-ink-2)',
};

export const meeshyMedallionStyle = (recipe: MeeshyMedallionRecipe, tint: string | undefined, gradientEnd: string | undefined, surface: string | undefined): CSSProperties => {
  const tone = tint ?? TONE_TOKEN[recipe.kind];
  return {
    '--kit-medallion-d': rem(recipe.diameter),
    '--kit-medallion-radius': rem(recipe.radius),
    '--kit-medallion-glyph': rem(recipe.glyphSize),
    '--kit-medallion-value': rem(recipe.valueSize),
    '--kit-medallion-tone': tone,
    '--kit-medallion-tone-end': gradientEnd ?? tone,
    '--kit-medallion-fill-opacity': recipe.fillOpacity,
    '--kit-medallion-opacity': recipe.opacity,
    '--kit-medallion-border': rem(recipe.borderWidth),
    '--kit-medallion-ink': recipe.ink === 'dark' ? 'var(--ios-indigo-950)' : `color-mix(in srgb, ${tone} 80%, var(--color-ios-ink))`,
    '--kit-medallion-surface': surface ?? 'var(--color-ios-surface)',
    '--kit-medallion-halo': recipe.halo === null ? '0rem' : rem(recipe.halo.ring),
    '--kit-medallion-halo-opacity': recipe.halo?.opacity ?? 0,
    '--kit-medallion-dash-inset': recipe.dashed === null ? '0rem' : rem(recipe.dashed.inset),
    '--kit-medallion-dash-width': rem(recipe.dashed?.width ?? 0),
    '--kit-medallion-dash-seconds': `${recipe.dashed?.seconds ?? 0}s`,
    '--kit-medallion-strike-length': rem(recipe.struck?.length ?? 0),
    '--kit-medallion-strike-width': rem(recipe.struck?.width ?? 0),
    '--kit-medallion-strike-cutout': rem(recipe.struck?.cutout ?? 0),
    '--kit-medallion-strike-angle': `${recipe.struck?.angle ?? 0}deg`,
    '--kit-medallion-motion-seconds': recipe.motion.kind === 'none' ? '0s' : `${recipe.motion.seconds}s`,
    '--kit-medallion-waves-seconds': `${MEESHY_MEDALLION_MEASURE.wavesSeconds}s`,
  } as CSSProperties;
};
