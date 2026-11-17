import type { CSSProperties } from 'react';

/**
 * K40 · MeeshyButton — LA RECETTE EN VALEURS (#18874).
 *
 * Toute action nommée est une capsule libellée : pleine, de verre, à contour ou en
 * texte, partout la même. Sept genres, quatre hauteurs, trois formes. La recette
 * ne dessine rien et ne lit rien : elle rend les nombres que le composant pose en
 * propriétés `--kit-button-*` (`styles/kit-button.css`) et que les suites de
 * l'autre plateforme relisent. Le verre du genre `glass` n'est pas ici : il est
 * demandé à K01 (`MeeshyGlass`), jamais dessiné.
 */
export type MeeshyButtonKind = 'primary' | 'accent' | 'tinted' | 'glass' | 'outline' | 'danger' | 'text';
export type MeeshyButtonSize = 56 | 50 | 44 | 36;
export type MeeshyButtonShape = 'capsule' | 'round' | 'hold';
export type MeeshyButtonWidth = 'fit' | 'fill';
export type MeeshyButtonScheme = 'dark' | 'light';
export type MeeshyButtonHoldState = 'idle' | 'held' | 'live' | 'refused';

export type MeeshyButtonBackground = 'brand' | 'accent' | 'tint16' | 'glass' | 'err13' | 'none';
export type MeeshyButtonInk = 'onBrand' | 'onSolid' | 'accent' | 'accentDeep' | 'onMedia' | 'themeInk' | 'err' | 'errDeep';
export type MeeshyButtonShade = 'rest' | 'pressed' | 'hovered';

export const MEESHY_BUTTON_KINDS: readonly MeeshyButtonKind[] = ['primary', 'accent', 'tinted', 'glass', 'outline', 'danger', 'text'];
export const MEESHY_BUTTON_SIZES: readonly MeeshyButtonSize[] = [56, 50, 44, 36];

const TAP_TARGET = 44;

export const MEESHY_BUTTON_MEASURE = {
  pressedScale: 0.94,
  disabledOpacity: 0.45,
  gap: 8,
  fontWeight: 700,
  trailingInsetReduction: 6,
  focusRing: { width: 2, offset: 3 },
  outlineWidth: 1.5,
  pair: { primary: 1.6, secondary: 1, gap: 8 },
  round: { diameter: 56, glyph: 28 },
  hold: { diameter: 96, glyph: 36, waveSeconds: 2.6, waveStaggerSeconds: 1.3 },
} as const;

const BY_SIZE: Readonly<Record<MeeshyButtonSize, { readonly paddingInline: number; readonly glyph: number; readonly fontSize: number }>> = {
  56: { paddingInline: 26, glyph: 22, fontSize: 16 },
  50: { paddingInline: 22, glyph: 22, fontSize: 15 },
  44: { paddingInline: 16, glyph: 16, fontSize: 13.5 },
  36: { paddingInline: 12, glyph: 16, fontSize: 12.5 },
};

type Look = { readonly background: MeeshyButtonBackground; readonly dark: MeeshyButtonInk; readonly light: MeeshyButtonInk; readonly border: number };

const LOOK: Readonly<Record<MeeshyButtonKind, Look>> = {
  primary: { background: 'brand', dark: 'onBrand', light: 'onBrand', border: 0 },
  accent: { background: 'accent', dark: 'onSolid', light: 'onSolid', border: 0 },
  tinted: { background: 'tint16', dark: 'accent', light: 'accentDeep', border: 0 },
  glass: { background: 'glass', dark: 'onMedia', light: 'themeInk', border: 0 },
  outline: { background: 'none', dark: 'themeInk', light: 'themeInk', border: MEESHY_BUTTON_MEASURE.outlineWidth },
  danger: { background: 'err13', dark: 'err', light: 'errDeep', border: 0 },
  text: { background: 'none', dark: 'themeInk', light: 'themeInk', border: 0 },
};

const PHARE_KINDS: ReadonlySet<MeeshyButtonKind> = new Set<MeeshyButtonKind>(['primary', 'accent', 'tinted']);

export type MeeshyButtonRecipeInput = {
  readonly kind?: MeeshyButtonKind | undefined;
  readonly size?: MeeshyButtonSize | undefined;
  readonly shape?: MeeshyButtonShape | undefined;
  readonly scheme?: MeeshyButtonScheme | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
  readonly isFocused?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly isDeferred?: boolean | undefined;
  readonly isDestructive?: boolean | undefined;
};

export type MeeshyButtonRecipe = {
  readonly kind: MeeshyButtonKind;
  readonly shape: MeeshyButtonShape;
  readonly height: number;
  readonly width: number | null;
  readonly paddingInline: number;
  readonly glyphSize: number;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly gap: number;
  readonly targetHeight: number;
  readonly hitSlack: number;
  readonly background: MeeshyButtonBackground;
  readonly ink: MeeshyButtonInk;
  readonly borderWidth: number;
  readonly shade: MeeshyButtonShade;
  readonly scale: number;
  readonly opacity: number;
  readonly focusRing: { readonly width: number; readonly offset: number } | null;
  readonly isActionEnabled: boolean;
  readonly playsHaptic: boolean;
  readonly isDeferred: boolean;
};

const shadeOf = ({ isPressed, isHovered }: MeeshyButtonRecipeInput): MeeshyButtonShade => (isPressed === true ? 'pressed' : isHovered === true ? 'hovered' : 'rest');

const shapeBox = (shape: MeeshyButtonShape, size: MeeshyButtonSize) => {
  if (shape === 'round') return { height: MEESHY_BUTTON_MEASURE.round.diameter, width: MEESHY_BUTTON_MEASURE.round.diameter, paddingInline: 0, glyph: MEESHY_BUTTON_MEASURE.round.glyph };
  if (shape === 'hold') return { height: MEESHY_BUTTON_MEASURE.hold.diameter, width: MEESHY_BUTTON_MEASURE.hold.diameter, paddingInline: 0, glyph: MEESHY_BUTTON_MEASURE.hold.glyph };
  const { paddingInline, glyph } = BY_SIZE[size];
  return { height: size, width: null, paddingInline, glyph };
};

/** La recette d'un bouton : genre, taille, forme et états deviennent des nombres. */
export const meeshyButtonRecipe = (input: MeeshyButtonRecipeInput): MeeshyButtonRecipe => {
  const shape = input.shape ?? 'capsule';
  const size = input.size ?? 50;
  const requested = input.kind ?? 'primary';
  const kind = shape !== 'capsule' && !PHARE_KINDS.has(requested) ? 'primary' : requested;
  const look = LOOK[kind];
  const scheme = input.scheme ?? 'dark';
  const isBusy = input.isPending === true;
  const isEnabled = input.isEnabled !== false;
  const isActionEnabled = isEnabled && !isBusy;
  const box = shapeBox(shape, size);
  const targetHeight = Math.max(box.height, TAP_TARGET);
  const ink = kind === 'text' && input.isDestructive === true ? (scheme === 'light' ? 'errDeep' : 'err') : look[scheme];
  return {
    kind,
    shape,
    height: box.height,
    width: box.width,
    paddingInline: box.paddingInline,
    glyphSize: box.glyph,
    fontSize: BY_SIZE[size].fontSize,
    fontWeight: MEESHY_BUTTON_MEASURE.fontWeight,
    gap: MEESHY_BUTTON_MEASURE.gap,
    targetHeight,
    hitSlack: (targetHeight - box.height) / 2,
    background: look.background,
    ink,
    borderWidth: look.border,
    shade: shadeOf(input),
    scale: input.isPressed === true && isActionEnabled ? MEESHY_BUTTON_MEASURE.pressedScale : 1,
    opacity: isEnabled ? 1 : MEESHY_BUTTON_MEASURE.disabledOpacity,
    focusRing: input.isFocused === true ? MEESHY_BUTTON_MEASURE.focusRing : null,
    isActionEnabled,
    playsHaptic: isActionEnabled,
    isDeferred: input.isDeferred === true,
  };
};

export type MeeshyButtonHold = {
  readonly down: () => void;
  readonly up: () => void;
  readonly cancel: () => void;
  readonly isHeld: () => boolean;
};

/**
 * Le maintien rapporte `true` au doigt posé et `false` au doigt levé, sorti, ou si
 * le bouton disparaît : jamais deux `true` de suite, jamais un `false` sans `true`.
 */
export const meeshyButtonHold = (report: (held: boolean) => void): MeeshyButtonHold => {
  const state = { held: false };
  const set = (held: boolean): void => {
    if (state.held === held) return;
    state.held = held;
    report(held);
  };
  return { down: () => set(true), up: () => set(false), cancel: () => set(false), isHeld: () => state.held };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

const BACKGROUND_TOKEN: Readonly<Record<MeeshyButtonBackground, string>> = {
  brand: 'var(--color-ios-brand)',
  accent: 'var(--accent, var(--color-ios-brand))',
  tint16: 'color-mix(in srgb, var(--kit-button-tint, var(--accent, var(--color-ios-brand))) 16%, transparent)',
  glass: 'transparent',
  err13: 'color-mix(in srgb, var(--color-error) 13%, transparent)',
  none: 'transparent',
};

const INK_TOKEN: Readonly<Record<MeeshyButtonInk, string>> = {
  onBrand: 'var(--color-ios-on-brand)',
  onSolid: 'var(--ios-indigo-950)',
  accent: 'var(--kit-button-tint, var(--accent, var(--color-ios-brand)))',
  accentDeep: 'color-mix(in srgb, var(--kit-button-tint, var(--accent, var(--color-ios-brand))) 55%, var(--ios-indigo-950))',
  onMedia: 'var(--color-on-media)',
  themeInk: 'var(--color-ios-ink)',
  err: 'var(--color-error)',
  errDeep: 'var(--ios-error-ink)',
};

export const meeshyButtonStyle = (recipe: MeeshyButtonRecipe, tint: string | undefined, width: MeeshyButtonWidth): CSSProperties =>
  ({
    '--kit-button-h': rem(recipe.height),
    '--kit-button-w': recipe.width === null ? 'auto' : rem(recipe.width),
    '--kit-button-pad': rem(recipe.paddingInline),
    '--kit-button-glyph': rem(recipe.glyphSize),
    '--kit-button-font': rem(recipe.fontSize),
    '--kit-button-weight': recipe.fontWeight,
    '--kit-button-gap': rem(recipe.gap),
    '--kit-button-slack': rem(recipe.hitSlack),
    '--kit-button-fill': BACKGROUND_TOKEN[recipe.background],
    '--kit-button-ink': INK_TOKEN[recipe.ink],
    '--kit-button-border': rem(recipe.borderWidth),
    '--kit-button-scale-pressed': MEESHY_BUTTON_MEASURE.pressedScale,
    '--kit-button-opacity': recipe.opacity,
    '--kit-button-trailing-cut': rem(MEESHY_BUTTON_MEASURE.trailingInsetReduction),
    '--kit-button-ring': rem(MEESHY_BUTTON_MEASURE.focusRing.width),
    '--kit-button-ring-offset': rem(MEESHY_BUTTON_MEASURE.focusRing.offset),
    '--kit-button-display': width === 'fill' ? 'flex' : 'inline-flex',
    ...(tint === undefined ? {} : { '--kit-button-tint': tint }),
  }) as CSSProperties;
