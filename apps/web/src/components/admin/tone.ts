import type { AdminTone } from '@/lib/admin/interpret/types';

/**
 * LES TONS DU KIT, en jetons (#8876) — jamais un hexadécimal : clair et sombre
 * se résolvent par les variables, et un ton n'est jamais la seule information
 * (un badge porte toujours son mot, et souvent un glyphe).
 *
 * `TONE_COLOR` est l'ENCRE d'un texte posé sur la teinte du même ton
 * (`toneBackground`) : elle doit atteindre 4,5:1. Les encres des tons colorés sont les
 * jetons `--color-admin-*-ink` (`styles/admin.css`) — les jetons de ton hérités, restés
 * la source des TEINTES, mesuraient 2,3:1 (info) à 4,49:1 (succès) en clair. Le neutre
 * prend l'encre pleine, pas l'encre discrète : un badge neutre est du texte, pas de la
 * décoration.
 */
export const TONE_COLOR: Readonly<Record<AdminTone, string>> = {
  neutral: 'var(--color-ios-ink)',
  brand: 'var(--color-admin-brand-ink)',
  success: 'var(--color-admin-success-ink)',
  warning: 'var(--color-admin-warning-ink)',
  danger: 'var(--color-admin-danger-ink)',
  info: 'var(--color-admin-info-ink)',
};

/**
 * La couleur d'une MARQUE — barre d'un graphique, filet : un composant graphique, pas du texte (WCAG
 * 1.4.11, 3:1). Les jetons de ton hérités y suffisent, sauf `info`, dont la variante claire manque
 * (2,3:1) : celui-là prend l'encre de l'administration.
 */
export const TONE_MARK: Readonly<Record<AdminTone, string>> = {
  neutral: 'var(--color-ios-ink-2)',
  brand: 'var(--color-ios-brand)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-admin-info-ink)',
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
