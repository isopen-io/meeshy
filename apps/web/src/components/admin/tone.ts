import type { AdminTone } from '@/lib/admin/interpret/types';

/**
 * LES TONS DU KIT, en jetons (#8876) — jamais un hexadécimal : clair et sombre
 * se résolvent par les variables, et un ton n'est jamais la seule information
 * (un badge porte toujours son mot, et souvent un glyphe).
 */
export const TONE_COLOR: Readonly<Record<AdminTone, string>> = {
  neutral: 'var(--color-ios-ink-2)',
  brand: 'var(--color-ios-brand)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--ios-info)',
};

const TONE_TINT_SOURCE: Readonly<Record<AdminTone, string>> = {
  neutral: 'var(--color-ios-ink-3)',
  brand: 'var(--color-ios-brand)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--ios-info)',
};

export const toneBackground = (tone: AdminTone): string => `color-mix(in srgb, ${TONE_TINT_SOURCE[tone]} 14%, transparent)`;

export const INK = 'var(--color-ios-ink)';
export const INK2 = 'var(--color-ios-ink-2)';
export const INK3 = 'var(--color-ios-ink-3)';
export const SURFACE = 'var(--color-ios-surface)';
export const EDGE = 'var(--color-edge)';
export const BRAND = 'var(--color-ios-brand)';
export const HOVER = 'color-mix(in srgb, var(--color-ios-ink-3) 6%, transparent)';
