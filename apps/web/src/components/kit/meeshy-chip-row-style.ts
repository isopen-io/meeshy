import type { CSSProperties } from 'react';

import {
  MEESHY_CHIP_ROW_MEASURE,
  meeshyChipRecipe,
  meeshyChipSize,
  type MeeshyChipFill,
  type MeeshyChipInk,
  type MeeshyChipRowSize,
  type MeeshyChipRowSurface,
} from './meeshy-chip-row-rule';

const REM = 16;

const rem = (px: number): string => `${px / REM}rem`;

const FILL_TOKEN: Readonly<Record<Exclude<MeeshyChipFill, 'tint'>, string>> = {
  onMedia: 'var(--color-on-media)',
  themeInk: 'var(--color-ios-ink)',
};

const INK_TOKEN: Readonly<Record<MeeshyChipInk, string>> = {
  onMedia: 'var(--color-on-media)',
  indigo950: 'var(--ios-indigo-950)',
  themeInk: 'var(--color-ios-ink)',
  themeInverse: 'var(--color-ios-surface)',
};

export const meeshyChipInkToken = (ink: MeeshyChipInk): string => INK_TOKEN[ink];

export type MeeshyChipStyleInput = {
  readonly surface: MeeshyChipRowSurface;
  readonly isSelected: boolean;
  readonly isEnabled: boolean;
  readonly tint: string | undefined;
};

const STYLES = new Map<string, CSSProperties>();
const ROW_STYLES = new Map<string, CSSProperties>();
const STYLE_MEMORY = 96;

const remember = (memory: Map<string, CSSProperties>, key: string, style: CSSProperties): CSSProperties => {
  if (memory.size >= STYLE_MEMORY) {
    const oldest = memory.keys().next();
    if (oldest.done !== true) memory.delete(oldest.value);
  }
  memory.set(key, style);
  return style;
};

const styleOf = ({ surface, isSelected, isEnabled, tint }: MeeshyChipStyleInput): CSSProperties => {
  const isTinted = tint !== undefined;
  const base = { surface, isSelected, isEnabled, isTinted } as const;
  const rest = meeshyChipRecipe(base);
  const pressed = meeshyChipRecipe({ ...base, isPressed: true });
  const hovered = meeshyChipRecipe({ ...base, isHovered: true });
  return {
    '--kit-chip-fill': rest.fill === 'tint' ? (tint ?? FILL_TOKEN.onMedia) : FILL_TOKEN[rest.fill],
    '--kit-chip-fill-rest': rest.fillOpacity,
    '--kit-chip-fill-pressed': pressed.fillOpacity,
    '--kit-chip-fill-hover': hovered.fillOpacity,
    '--kit-chip-ink': INK_TOKEN[rest.ink],
    '--kit-chip-opacity': rest.opacity,
  } as CSSProperties;
};

export const meeshyChipStyle = (input: MeeshyChipStyleInput): CSSProperties => {
  const key = [input.surface, input.isSelected, input.isEnabled, input.tint ?? ''].join('|');
  return STYLES.get(key) ?? remember(STYLES, key, styleOf(input));
};

export const meeshyChipRowStyle = ({ size, inset }: { readonly size: MeeshyChipRowSize; readonly inset: number }): CSSProperties => {
  const key = `${size}|${inset}`;
  const known = ROW_STYLES.get(key);
  if (known !== undefined) return known;
  const measured = meeshyChipSize(size);
  const { glyph, spacing, edgeFade, edgeFadeMs, toneFadeMs } = MEESHY_CHIP_ROW_MEASURE;
  const style = {
    '--kit-chip-h': rem(measured.height),
    '--kit-chip-pad': rem(measured.padding),
    '--kit-chip-font': rem(measured.font),
    '--kit-chip-gap': rem(spacing.chips),
    '--kit-chip-row-gap': rem(spacing.rows),
    '--kit-chip-glyph-gap': rem(spacing.glyphAndText),
    '--kit-chip-glyph-lead': rem(glyph.leading),
    '--kit-chip-glyph-alone': rem(glyph.alone),
    '--kit-chip-glyph-trailing': rem(glyph.trailing),
    '--kit-chip-inset': rem(inset),
    '--kit-chip-fade': rem(edgeFade),
    '--kit-chip-edge-ms': `${edgeFadeMs}ms`,
    '--kit-chip-tone-ms': `${toneFadeMs}ms`,
  } as CSSProperties;
  return remember(ROW_STYLES, key, style);
};
