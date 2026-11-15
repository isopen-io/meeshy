import type { MeeshyGlassTone } from './meeshy-glass-recipe';

export type MeeshyToggleRowKind = 'normal' | 'destructive' | 'accent';

export type MeeshyToggleRowAccessory =
  | { readonly type: 'none' }
  | { readonly type: 'toggle'; readonly isOn: boolean }
  | { readonly type: 'check'; readonly isSelected: boolean }
  | { readonly type: 'checkbox'; readonly isChecked: boolean }
  | { readonly type: 'chevron' }
  | { readonly type: 'value'; readonly text: string };

export type MeeshyToggleRowHaptic = 'light' | 'none';

export type MeeshyToggleRowValue =
  | { readonly type: 'none' }
  | { readonly type: 'toggle'; readonly isOn: boolean }
  | { readonly type: 'selected'; readonly isSelected: boolean }
  | { readonly type: 'text'; readonly text: string };

export const MEESHY_TOGGLE_ROW = {
  minimumHeight: 46,
  checkboxSide: 24,
  switchWidth: 51,
  switchHeight: 31,
  disabledOpacity: 0.62,
  pressedVeil: 0.15,
  hoveredVeil: 0.08,
  dividerAlpha: 8,
  subtitleAlpha: 70,
  fadeMs: 200,
} as const;

export type MeeshyToggleRowRecipeInput = {
  readonly accessory: MeeshyToggleRowAccessory;
  readonly kind: MeeshyToggleRowKind;
  readonly tone: MeeshyGlassTone | null;
  readonly tint: string | null;
  readonly isEnabled: boolean;
};

export type MeeshyToggleRowRecipe = {
  readonly minimumHeight: number;
  readonly contentOpacity: number;
  readonly titleInk: string;
  readonly subtitleInk: string;
  readonly accessoryInk: string;
  readonly trackOn: string;
  readonly dividerInk: string;
  readonly pressedVeil: number;
  readonly hoveredVeil: number;
  readonly isChosen: boolean;
  readonly value: MeeshyToggleRowValue;
};

const BRAND = 'var(--ios-indigo-500)';

export const meeshyToggleRowVisibleSubtitle = (subtitle: string | null | undefined): string | null => {
  const trimmed = subtitle?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const meeshyToggleRowAccessibilityLabel = (input: { readonly title: string; readonly subtitle?: string | null | undefined }): string => {
  const subtitle = meeshyToggleRowVisibleSubtitle(input.subtitle);
  return subtitle === null ? input.title : `${input.title}, ${subtitle}`;
};

export const meeshyToggleRowIsChosen = (accessory: MeeshyToggleRowAccessory): boolean => {
  if (accessory.type === 'check') return accessory.isSelected;
  if (accessory.type === 'checkbox') return accessory.isChecked;
  if (accessory.type === 'toggle') return accessory.isOn;
  return false;
};

const valueOf = (accessory: MeeshyToggleRowAccessory): MeeshyToggleRowValue => {
  if (accessory.type === 'toggle') return { type: 'toggle', isOn: accessory.isOn };
  if (accessory.type === 'check') return { type: 'selected', isSelected: accessory.isSelected };
  if (accessory.type === 'checkbox') return { type: 'selected', isSelected: accessory.isChecked };
  if (accessory.type === 'value') return { type: 'text', text: accessory.text };
  return { type: 'none' };
};

const baseInk = (isThemeInk: boolean): string => (isThemeInk ? 'var(--color-ios-ink)' : 'var(--color-on-media)');

const titleInk = (kind: MeeshyToggleRowKind, isThemeInk: boolean, tint: string | null): string => {
  if (kind === 'destructive') return isThemeInk ? 'var(--kit-row-destructive-theme)' : 'var(--ios-error)';
  if (kind === 'accent') return tint ?? 'var(--kit-row-mention)';
  return baseInk(isThemeInk);
};

export const meeshyToggleRowRecipe = (input: MeeshyToggleRowRecipeInput): MeeshyToggleRowRecipe => {
  const isThemeInk = input.tone === 'theme';
  const trackOn = input.tint ?? BRAND;
  const isChosen = meeshyToggleRowIsChosen(input.accessory);
  const mutedInk = isThemeInk ? 'var(--color-ios-ink-2)' : 'var(--ios-on-media-3)';
  return {
    minimumHeight: MEESHY_TOGGLE_ROW.minimumHeight,
    contentOpacity: input.isEnabled ? 1 : MEESHY_TOGGLE_ROW.disabledOpacity,
    titleInk: titleInk(input.kind, isThemeInk, input.tint),
    subtitleInk: mutedInk,
    accessoryInk: isChosen ? trackOn : mutedInk,
    trackOn,
    dividerInk: `color-mix(in srgb, ${baseInk(isThemeInk)} ${MEESHY_TOGGLE_ROW.dividerAlpha}%, transparent)`,
    pressedVeil: input.isEnabled ? MEESHY_TOGGLE_ROW.pressedVeil : 0,
    hoveredVeil: input.isEnabled ? MEESHY_TOGGLE_ROW.hoveredVeil : 0,
    isChosen,
    value: valueOf(input.accessory),
  };
};
