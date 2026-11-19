import type { CSSProperties } from 'react';

/**
 * K41 · MeeshyBadge — LA RECETTE EN VALEURS (#18874).
 *
 * Une pastille annote, elle ne commande pas : un mot, une valeur, un compte, un
 * code, un rang, une heure, ou un glyphe seul. Quatre surfaces, cinq genres, quatre
 * hauteurs. La loi : la teinte est un SENS, pas une décoration — un compte à
 * rattraper est `err`, toujours, jamais à l'accent de la conversation. Aucune
 * signature ne nomme un rang, un cercle, un pays, un message ou un profil : l'hôte
 * traduit sa donnée en mot ou en nombre avant d'appeler.
 */
export type MeeshyBadgeSurface = 'glass' | 'tonal' | 'solid' | 'outline';
export type MeeshyBadgeKind = 'neutral' | 'accent' | 'ok' | 'warn' | 'err';
export type MeeshyBadgeSize = 18 | 22 | 28 | 36;
export type MeeshyBadgeShape = 'capsule' | 'bubble';
export type MeeshyBadgeContentKind = 'label' | 'count' | 'code' | 'ordinal' | 'time' | 'glyph';
export type MeeshyBadgeFill = 'glass' | 'tint' | 'solid' | 'none';
export type MeeshyBadgeTone = MeeshyBadgeKind | 'tint';
export type MeeshyBadgeInk = 'tone' | 'onSolid' | 'onBrand';
export type MeeshyBadgeScheme = 'dark' | 'light';

export const MEESHY_BADGE_SIZES: readonly MeeshyBadgeSize[] = [18, 22, 28, 36];
export const MEESHY_BADGE_DEFAULT_CAP = 99;

export const MEESHY_BADGE_MEASURE = {
  gap: 5,
  tonalOpacity: 0.16,
  outlineWidth: 1.5,
  staleOpacity: 0.62,
  disabledOpacity: 0.4,
  pressedScale: 0.94,
  tapTarget: 44,
  cutoutRing: 3,
  multilineRadius: 14,
  bubble: { round: 18, tail: 6 },
  codeRadius: 7,
  codeMinWidth: 30,
  glassScrim: 0.66,
} as const;

const BY_SIZE: Readonly<Record<MeeshyBadgeSize, { readonly fontSize: number; readonly glyph: number; readonly paddingInline: number }>> = {
  18: { fontSize: 10, glyph: 11, paddingInline: 6 },
  22: { fontSize: 11, glyph: 11, paddingInline: 8 },
  28: { fontSize: 12, glyph: 13, paddingInline: 10 },
  36: { fontSize: 12.5, glyph: 16, paddingInline: 12 },
};

const finiteCount = (count: number): number => (Number.isFinite(count) ? Math.trunc(count) : 0);

export type MeeshyBadgeCountOptions = { readonly cap?: number; readonly of?: number | undefined };

/** Le compte vu à l'œil : rien à zéro ou en dessous, « 99+ » au-delà du plafond, « 2 / 3 » pour un quota. Jamais `min(count, 99)`. */
export const meeshyBadgeCountText = (count: number, { cap = MEESHY_BADGE_DEFAULT_CAP, of }: MeeshyBadgeCountOptions = {}): string => {
  const value = finiteCount(count);
  if (value <= 0) return '';
  if (of !== undefined) return `${value} / ${of}`;
  return value > cap ? `${cap}+` : String(value);
};

/** Le compte vu à la voix : le VRAI nombre, jamais le plafond. */
export const meeshyBadgeCountSpoken = (count: number, { of }: MeeshyBadgeCountOptions = {}): string => {
  const value = finiteCount(count);
  if (value <= 0) return '';
  return of === undefined ? String(value) : `${value} / ${of}`;
};

export type MeeshyBadgeRecipeInput = {
  readonly surface?: MeeshyBadgeSurface | undefined;
  readonly kind?: MeeshyBadgeKind | undefined;
  readonly tint?: string | undefined;
  readonly size?: MeeshyBadgeSize | undefined;
  readonly shape?: MeeshyBadgeShape | undefined;
  readonly content?: MeeshyBadgeContentKind | undefined;
  readonly scheme?: MeeshyBadgeScheme | undefined;
  readonly lineLimit?: number | null | undefined;
  readonly isCurrent?: boolean | undefined;
  readonly isStale?: boolean | undefined;
  readonly isInteractive?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
};

export type MeeshyBadgeRadii = { readonly start: number; readonly end: number; readonly endBottom: number; readonly startBottom: number };

export type MeeshyBadgeRecipe = {
  readonly surface: MeeshyBadgeSurface;
  readonly kind: MeeshyBadgeKind;
  readonly tone: MeeshyBadgeTone;
  readonly height: number;
  readonly fontSize: number;
  readonly glyphSize: number;
  readonly paddingInline: number;
  readonly gap: number;
  readonly fontWeight: number;
  readonly isMono: boolean;
  readonly minWidth: number;
  readonly radius: number;
  readonly radii: MeeshyBadgeRadii | null;
  readonly fill: MeeshyBadgeFill;
  readonly fillOpacity: number;
  readonly ink: MeeshyBadgeInk;
  readonly borderWidth: number;
  readonly opacity: number;
  readonly isDesaturated: boolean;
  readonly hasAccentRim: boolean;
  readonly role: 'none' | 'button';
  readonly isActionEnabled: boolean;
  readonly targetSide: number;
  readonly hitSlackBlock: number;
  readonly scale: number;
  readonly maxLines: number | null;
  readonly isFullWidth: boolean;
  readonly cutout: { readonly ring: number; readonly offset: number };
};

const WEIGHT: Readonly<Record<MeeshyBadgeContentKind, number>> = { label: 700, count: 800, code: 700, ordinal: 900, time: 600, glyph: 700 };

const FILL: Readonly<Record<MeeshyBadgeSurface, MeeshyBadgeFill>> = { glass: 'glass', tonal: 'tint', solid: 'solid', outline: 'none' };

const inkOf = (surface: MeeshyBadgeSurface, scheme: MeeshyBadgeScheme): MeeshyBadgeInk => {
  if (surface !== 'solid') return 'tone';
  return scheme === 'light' ? 'onBrand' : 'onSolid';
};

/** La recette d'une pastille : surface, genre, hauteur et états deviennent des nombres. */
export const meeshyBadgeRecipe = (input: MeeshyBadgeRecipeInput): MeeshyBadgeRecipe => {
  const surface = input.surface ?? 'tonal';
  const kind = input.kind ?? 'neutral';
  const size = input.size ?? 22;
  const contentKind = input.content ?? 'label';
  const measure = BY_SIZE[size];
  const isInteractive = input.isInteractive === true;
  const isEnabled = input.isEnabled !== false;
  const isMultiline = input.lineLimit !== undefined && input.lineLimit !== null && input.lineLimit !== 1;
  const targetSide = isInteractive ? MEESHY_BADGE_MEASURE.tapTarget : 0;
  const { round, tail } = MEESHY_BADGE_MEASURE.bubble;
  const isCode = contentKind === 'code';
  return {
    surface,
    kind,
    tone: input.tint === undefined ? kind : 'tint',
    height: size,
    fontSize: measure.fontSize,
    glyphSize: measure.glyph,
    paddingInline: measure.paddingInline,
    gap: MEESHY_BADGE_MEASURE.gap,
    fontWeight: WEIGHT[contentKind],
    isMono: isCode || contentKind === 'time',
    minWidth: isCode ? MEESHY_BADGE_MEASURE.codeMinWidth : size,
    radius: isMultiline ? MEESHY_BADGE_MEASURE.multilineRadius : isCode ? MEESHY_BADGE_MEASURE.codeRadius : size / 2,
    radii: input.shape === 'bubble' ? { start: round, end: round, endBottom: round, startBottom: tail } : null,
    fill: FILL[surface],
    fillOpacity: surface === 'tonal' ? MEESHY_BADGE_MEASURE.tonalOpacity : 1,
    ink: inkOf(surface, input.scheme ?? 'dark'),
    borderWidth: surface === 'outline' ? MEESHY_BADGE_MEASURE.outlineWidth : 0,
    opacity: !isEnabled ? MEESHY_BADGE_MEASURE.disabledOpacity : input.isStale === true ? MEESHY_BADGE_MEASURE.staleOpacity : 1,
    isDesaturated: input.isStale === true,
    hasAccentRim: input.isCurrent === true,
    role: isInteractive ? 'button' : 'none',
    isActionEnabled: isInteractive && isEnabled,
    targetSide,
    hitSlackBlock: isInteractive ? Math.max(0, (targetSide - size) / 2) : 0,
    scale: isInteractive && input.isPressed === true && isEnabled ? MEESHY_BADGE_MEASURE.pressedScale : 1,
    maxLines: isMultiline ? (input.lineLimit ?? null) : 1,
    isFullWidth: isMultiline,
    cutout: { ring: MEESHY_BADGE_MEASURE.cutoutRing, offset: size / 4 },
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

const TONE_TOKEN: Readonly<Record<MeeshyBadgeKind, string>> = {
  neutral: 'var(--color-ios-ink-2)',
  accent: 'var(--accent, var(--color-ios-brand))',
  ok: 'var(--color-success)',
  warn: 'var(--color-warning)',
  err: 'var(--color-error)',
};

export const meeshyBadgeStyle = (recipe: MeeshyBadgeRecipe, tint: string | undefined): CSSProperties => {
  const tone = tint ?? TONE_TOKEN[recipe.kind];
  const radii = recipe.radii;
  return {
    '--kit-badge-h': rem(recipe.height),
    '--kit-badge-min-w': rem(recipe.minWidth),
    '--kit-badge-pad': rem(recipe.paddingInline),
    '--kit-badge-font': rem(recipe.fontSize),
    '--kit-badge-weight': recipe.fontWeight,
    '--kit-badge-gap': rem(recipe.gap),
    '--kit-badge-glyph': rem(recipe.glyphSize),
    '--kit-badge-border': rem(recipe.borderWidth),
    '--kit-badge-radius': radii === null ? rem(recipe.radius) : `${rem(radii.start)} ${rem(radii.end)} ${rem(radii.endBottom)} ${rem(radii.startBottom)}`,
    '--kit-badge-tone': tone,
    '--kit-badge-fill-opacity': recipe.fillOpacity,
    '--kit-badge-opacity': recipe.opacity,
    '--kit-badge-slack': rem(recipe.hitSlackBlock),
    '--kit-badge-scale-pressed': recipe.scale === 1 ? 0.94 : recipe.scale,
    '--kit-badge-ink': recipe.ink === 'tone' ? tone : recipe.ink === 'onBrand' ? 'var(--color-ios-on-brand)' : 'var(--ios-indigo-950)',
    '--kit-badge-lines': recipe.maxLines ?? 1,
  } as CSSProperties;
};
