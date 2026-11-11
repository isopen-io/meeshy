import type { CSSProperties } from 'react';

import type { MeeshyGlassMaterial, MeeshyGlassTone } from './meeshy-glass-recipe';

export type MeeshyGlassButtonKind = 'normal' | 'active' | 'destructive' | 'soft';
export type MeeshyGlassButtonSize = 36 | 40 | 44 | 48;
export type MeeshyGlassButtonHaptic = 'light' | 'none';
export type MeeshyGlassButtonFill = 'clear' | 'white' | 'red' | 'veil' | 'themeInk';
export type MeeshyGlassButtonGlassRequest = 'none' | 'neutral';
export type MeeshyGlassButtonInk = 'onMedia' | 'onSolid' | 'themeInk' | 'themeInverse' | 'custom';
export type MeeshyGlassButtonPopup = true | 'menu' | 'listbox' | 'dialog';

export type MeeshyGlassButtonActivation =
  | { readonly toggle: boolean }
  | { readonly selected: boolean }
  | { readonly expanded: boolean; readonly controls?: string | undefined; readonly popup?: MeeshyGlassButtonPopup | undefined };

export const MEESHY_GLASS_BUTTON_SIZES: readonly MeeshyGlassButtonSize[] = [36, 40, 44, 48];
export const MEESHY_GLASS_BUTTON_KINDS: readonly MeeshyGlassButtonKind[] = ['normal', 'active', 'destructive', 'soft'];

const TAP_TARGET = 44;

const MEASURE = {
  disabledOpacity: 0.4,
  restFillOpacity: 0.94,
  pressedActiveFillOpacity: 0.78,
  hoveredActiveFillOpacity: 0.86,
  softRestOpacity: 0.12,
  softPressedOpacity: 0.22,
  softHoveredOpacity: 0.17,
  pressVeilPressedOpacity: 0.22,
  pressVeilHoveredOpacity: 0.11,
  toneFadeMs: 200,
  activeShadow: { opacity: 0.22, blur: 14, y: 4 },
} as const;

export const MEESHY_GLASS_BUTTON_LONG_PRESS = { durationMs: 500, maxMovement: 10 } as const;

const GLYPH_SIZE: Readonly<Record<MeeshyGlassButtonSize, number>> = { 36: 18, 40: 18, 44: 20, 48: 22 };

export type MeeshyGlassButtonShadow = { readonly opacity: number; readonly blur: number; readonly y: number };

export type MeeshyGlassButtonRecipe = {
  readonly kind: MeeshyGlassButtonKind;
  readonly size: MeeshyGlassButtonSize;
  readonly diameter: number;
  readonly glyphSize: number;
  readonly targetSide: number;
  readonly hitSlack: number;
  readonly fill: MeeshyGlassButtonFill;
  readonly fillOpacity: number;
  readonly pressVeilOpacity: number;
  readonly glass: MeeshyGlassButtonGlassRequest;
  readonly ink: MeeshyGlassButtonInk;
  readonly shadow: MeeshyGlassButtonShadow | null;
  readonly opacity: number;
  readonly isActionEnabled: boolean;
  readonly respondsToTouch: boolean;
  readonly playsHaptic: boolean;
  readonly fadeMs: number;
  readonly className: string;
  readonly attributes: Readonly<Record<string, string>>;
};

export type MeeshyGlassButtonRecipeInput = {
  readonly kind?: MeeshyGlassButtonKind | undefined;
  readonly activation?: MeeshyGlassButtonActivation | undefined;
  readonly size: MeeshyGlassButtonSize;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly material?: MeeshyGlassMaterial | undefined;
  readonly isNested?: boolean | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly glyphTint?: string | null | undefined;
};

const isOn = (activation: MeeshyGlassButtonActivation | undefined): boolean => {
  if (activation === undefined) return false;
  if ('toggle' in activation) return activation.toggle;
  if ('selected' in activation) return activation.selected;
  return activation.expanded;
};

export const impliedMeeshyGlassButtonKind = (activation: MeeshyGlassButtonActivation | undefined): MeeshyGlassButtonKind =>
  isOn(activation) ? 'active' : 'normal';

const solidFill = (kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone): MeeshyGlassButtonFill => {
  if (kind === 'normal') return 'clear';
  if (kind === 'active') return tone === 'theme' ? 'themeInk' : 'white';
  return kind === 'destructive' ? 'red' : 'veil';
};

const glassRequest = (kind: MeeshyGlassButtonKind): MeeshyGlassButtonGlassRequest => (kind === 'normal' ? 'neutral' : 'none');

const fillOpacity = (kind: MeeshyGlassButtonKind, isPressed: boolean, isHovered: boolean): number => {
  if (kind === 'normal') return 0;
  if (kind === 'destructive') return MEASURE.restFillOpacity;
  if (kind === 'active') {
    if (isPressed) return MEASURE.pressedActiveFillOpacity;
    return isHovered ? MEASURE.hoveredActiveFillOpacity : MEASURE.restFillOpacity;
  }
  if (isPressed) return MEASURE.softPressedOpacity;
  return isHovered ? MEASURE.softHoveredOpacity : MEASURE.softRestOpacity;
};

const pressVeilOpacity = (kind: MeeshyGlassButtonKind, drawsOwnResponse: boolean, isPressed: boolean, isHovered: boolean): number => {
  if (!drawsOwnResponse || kind === 'active' || kind === 'soft') return 0;
  if (isPressed) return MEASURE.pressVeilPressedOpacity;
  return isHovered ? MEASURE.pressVeilHoveredOpacity : 0;
};

const inkOf = (kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone, glyphTint: string | null): MeeshyGlassButtonInk => {
  if (kind === 'active') return tone === 'theme' ? 'themeInverse' : 'onSolid';
  if (kind === 'destructive') return 'onMedia';
  if (glyphTint !== null) return 'custom';
  return tone === 'theme' ? 'themeInk' : 'onMedia';
};

export const meeshyGlassButtonRecipe = (input: MeeshyGlassButtonRecipeInput): MeeshyGlassButtonRecipe => {
  const kind = input.kind ?? impliedMeeshyGlassButtonKind(input.activation);
  const tone = input.tone ?? 'deep';
  const isEnabled = input.isEnabled ?? true;
  const isNested = input.isNested ?? false;
  const isPressed = (input.isPressed ?? false) && isEnabled;
  const isHovered = (input.isHovered ?? false) && isEnabled && !isPressed;
  const glass = glassRequest(kind);
  const drawsOwnResponse = glass === 'none' || isNested;
  const diameter = input.size;
  const targetSide = Math.max(diameter, TAP_TARGET);
  return {
    kind,
    size: input.size,
    diameter,
    glyphSize: GLYPH_SIZE[input.size],
    targetSide,
    hitSlack: (targetSide - diameter) / 2,
    fill: solidFill(kind, tone),
    fillOpacity: fillOpacity(kind, isPressed, isHovered),
    pressVeilOpacity: pressVeilOpacity(kind, drawsOwnResponse, isPressed, isHovered),
    glass,
    ink: inkOf(kind, tone, input.glyphTint ?? null),
    shadow: kind === 'active' ? MEASURE.activeShadow : null,
    opacity: isEnabled ? 1 : MEASURE.disabledOpacity,
    isActionEnabled: isEnabled,
    respondsToTouch: isEnabled,
    playsHaptic: isEnabled,
    fadeMs: MEASURE.toneFadeMs,
    className: 'kit-btn',
    attributes: {
      'data-kit-btn-kind': kind,
      'data-kit-btn-glass': glass,
      ...(glass === 'none' ? { 'data-kit-solid': '' } : {}),
    },
  };
};

const INK_TOKEN: Readonly<Record<Exclude<MeeshyGlassButtonInk, 'custom'>, string>> = {
  onMedia: 'var(--color-on-media)',
  onSolid: 'var(--ios-indigo-950)',
  themeInk: 'var(--color-ios-ink)',
  themeInverse: 'var(--color-ios-surface)',
};

const FILL_TOKEN: Readonly<Record<Exclude<MeeshyGlassButtonFill, 'clear'>, string>> = {
  white: 'var(--color-on-media)',
  veil: 'var(--color-on-media)',
  red: 'var(--ios-error-strong)',
  themeInk: 'var(--color-ios-ink)',
};

export type MeeshyGlassButtonStyleInput = Omit<MeeshyGlassButtonRecipeInput, 'isPressed' | 'isHovered'>;

const STYLES = new Map<string, CSSProperties>();

const keyOf = (input: MeeshyGlassButtonStyleInput): string =>
  [input.kind ?? '', JSON.stringify(input.activation ?? null), input.size, input.tone ?? '', input.material ?? '', input.isNested ?? '', input.isEnabled ?? '', input.glyphTint ?? ''].join('|');

const shadowLayer = (shadow: MeeshyGlassButtonShadow | null): string =>
  shadow === null
    ? '0 0 0 0 transparent'
    : `0 ${shadow.y}px ${shadow.blur}px color-mix(in srgb, var(--ios-media-backdrop) ${shadow.opacity * 100}%, transparent)`;

const styleOf = (input: MeeshyGlassButtonStyleInput): CSSProperties => {
  const rest = meeshyGlassButtonRecipe(input);
  const pressed = meeshyGlassButtonRecipe({ ...input, isPressed: true });
  const hovered = meeshyGlassButtonRecipe({ ...input, isHovered: true });
  const ink = rest.ink === 'custom' ? (input.glyphTint ?? INK_TOKEN.onMedia) : INK_TOKEN[rest.ink];
  return {
    '--kit-btn-d': `${rest.diameter}px`,
    '--kit-btn-glyph': `${rest.glyphSize}px`,
    '--kit-btn-slack': `${rest.hitSlack}px`,
    '--kit-btn-fade': `${rest.fadeMs}ms`,
    '--kit-btn-ink': ink,
    '--kit-btn-fill': rest.fill === 'clear' ? 'transparent' : FILL_TOKEN[rest.fill],
    '--kit-btn-fill-rest': rest.fillOpacity,
    '--kit-btn-fill-pressed': pressed.fillOpacity,
    '--kit-btn-fill-hover': hovered.fillOpacity,
    '--kit-btn-veil-pressed': pressed.pressVeilOpacity,
    '--kit-btn-veil-hover': hovered.pressVeilOpacity,
    '--kit-btn-shadow': shadowLayer(rest.shadow),
    opacity: rest.opacity,
  } as CSSProperties;
};

export const meeshyGlassButtonStyle = (input: MeeshyGlassButtonStyleInput): CSSProperties => {
  const key = keyOf(input);
  const known = STYLES.get(key);
  if (known !== undefined) return known;
  const made = styleOf(input);
  STYLES.set(key, made);
  return made;
};

export const meeshyGlassPressReport = (wasPressed: boolean, isPressed: boolean | null): boolean | null => {
  if (isPressed === null) return wasPressed ? false : null;
  return wasPressed === isPressed ? null : isPressed;
};

export const performMeeshyGlassButtonTrigger = (input: {
  readonly isEnabled: boolean;
  readonly haptic: MeeshyGlassButtonHaptic;
  readonly play: (haptic: MeeshyGlassButtonHaptic) => void;
  readonly action: () => void;
}): boolean => {
  if (!input.isEnabled) return false;
  if (input.haptic !== 'none') input.play(input.haptic);
  input.action();
  return true;
};

export type MeeshyGlassButtonAccessibilityInput = {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly value?: string | undefined;
  readonly activation?: MeeshyGlassButtonActivation | undefined;
  readonly hasLongPress?: boolean | undefined;
  readonly longPressLabel?: string | undefined;
};

export type MeeshyGlassButtonAccessibility = {
  readonly 'aria-label': string;
  readonly title: string;
  readonly 'aria-description'?: string;
  readonly 'aria-pressed'?: boolean;
  readonly 'aria-expanded'?: boolean;
  readonly 'aria-controls'?: string;
  readonly 'aria-haspopup'?: MeeshyGlassButtonPopup;
  readonly 'aria-keyshortcuts'?: string;
  readonly 'data-long-press-action'?: string;
};

export const MEESHY_GLASS_BUTTON_LONG_PRESS_SHORTCUTS = 'ContextMenu Shift+F10';

const nonEmpty = (text: string | undefined): string | null => (text === undefined || text === '' ? null : text);

const stateOf = (activation: MeeshyGlassButtonActivation | undefined): Partial<MeeshyGlassButtonAccessibility> => {
  if (activation === undefined) return {};
  if ('toggle' in activation) return { 'aria-pressed': activation.toggle };
  if ('selected' in activation) return { 'aria-pressed': activation.selected };
  return {
    'aria-expanded': activation.expanded,
    ...(activation.controls === undefined ? {} : { 'aria-controls': activation.controls }),
    ...(activation.popup === undefined ? {} : { 'aria-haspopup': activation.popup }),
  };
};

export const meeshyGlassButtonAccessibility = (input: MeeshyGlassButtonAccessibilityInput): MeeshyGlassButtonAccessibility => {
  const description = [nonEmpty(input.value), nonEmpty(input.hint)].filter((part): part is string => part !== null).join('. ');
  return {
    'aria-label': input.label,
    title: input.label,
    ...(description === '' ? {} : { 'aria-description': description }),
    ...stateOf(input.activation),
    ...(input.hasLongPress === true
      ? {
          'aria-keyshortcuts': MEESHY_GLASS_BUTTON_LONG_PRESS_SHORTCUTS,
          'data-long-press-action': nonEmpty(input.longPressLabel) ?? input.label,
        }
      : {}),
  };
};
