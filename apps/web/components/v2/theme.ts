/**
 * Meeshy Design System - Theme Configuration
 *
 * Palette alignée sur la v1 (indigo / slate / gris). Les NOMS de tokens
 * (terracotta, deepTeal, royalIndigo…) sont conservés pour compatibilité
 * avec les composants existants ; seules leurs VALEURS pointent désormais
 * vers la palette v1. L'ancienne identité « Global Pulse » (terracotta) a
 * été retirée avec l'application v2.
 *
 * Supports light and dark modes following Web Interface Guidelines.
 */

import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

// Light mode colors — palette v1 (indigo / slate)
const lightColors = {
  // Base Palette
  warmCanvas: '#F8FAFC',
  deepInk: '#0F172A',
  parchment: '#F1F5F9',
  charcoal: '#1E293B',

  // Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',

  // Brand Colors (v1 indigo)
  terracotta: '#4F46E5',
  terracottaLight: '#818CF8',
  deepTeal: '#4338CA',
  goldAccent: '#F59E0B',

  // Language-Inspired Accents
  asianRuby: '#E11D48',
  saffron: '#F59E0B',
  jadeGreen: '#10B981',
  royalIndigo: '#6366F1',
  sakuraPink: '#EC4899',

  // Semantic Text (slate)
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#4F46E5',

  // Interactive
  hover: 'rgba(15, 23, 42, 0.04)',
  active: 'rgba(15, 23, 42, 0.08)',
  focus: 'rgba(79, 70, 229, 0.3)',
};

// Dark mode colors - carefully crafted for accessibility (slate / indigo)
const darkColors = {
  // Base Palette
  warmCanvas: '#0F172A',
  deepInk: '#F8FAFC',
  parchment: '#1E293B',
  charcoal: '#E2E8F0',

  // Surfaces
  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  border: '#334155',
  borderSubtle: '#1E293B',

  // Brand Colors (v1 indigo, brightened for dark mode)
  terracotta: '#818CF8',
  terracottaLight: '#A5B4FC',
  deepTeal: '#6366F1',
  goldAccent: '#FBBF24',

  // Language-Inspired Accents (brightened for dark mode)
  asianRuby: '#FB7185',
  saffron: '#FBBF24',
  jadeGreen: '#34D399',
  royalIndigo: '#A5B4FC',
  sakuraPink: '#F472B6',

  // Semantic Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',

  // Status (brightened for visibility)
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#818CF8',

  // Interactive
  hover: 'rgba(255, 255, 255, 0.06)',
  active: 'rgba(255, 255, 255, 0.12)',
  focus: 'rgba(129, 140, 248, 0.4)',
};

export const theme = {
  colors: lightColors,
  darkColors: darkColors,

  fonts: {
    display: '"Playfair Display", Georgia, serif',
    body: '"DM Sans", system-ui, sans-serif',
    mono: '"JetBrains Mono", monospace',
  },

  radii: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    full: '9999px',
  },

  shadows: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.05)',
    md: '0 4px 20px rgba(0, 0, 0, 0.08)',
    lg: '0 10px 40px rgba(0, 0, 0, 0.12)',
    xl: '0 20px 60px rgba(0, 0, 0, 0.15)',
    terracotta: '0 4px 14px rgba(79, 70, 229, 0.4)',
    teal: '0 4px 14px rgba(67, 56, 202, 0.3)',
  },

  // Language color mapping
  languageColors: {
    fr: '#6366F1', // Indigo
    en: '#10B981', // Emerald
    es: '#F59E0B', // Amber
    zh: '#E11D48', // Rose
    ja: '#EC4899', // Pink
    ar: '#F59E0B', // Amber
    de: '#4338CA', // Deep Indigo
    pt: '#10B981', // Emerald
    ru: '#6366F1', // Indigo
    ko: '#E11D48', // Rose
    default: '#64748B',
  },
} as const;

export type Theme = typeof theme;
export type ThemeColor = keyof typeof theme.colors;
export type LanguageCode = keyof typeof theme.languageColors;

/**
 * Get language color by code.
 *
 * Le code est réduit via le SSOT partagé `normalizeLanguageCode` (639-2/3 → 639-1,
 * BCP-47) plutôt que par une troncature aveugle `slice(0, 2)` : `'spa'` → `'es'`
 * (ambre) et non `'sp'` → gris `default`. Garde la couleur d'accent cohérente
 * quelle que soit la forme du code, comme `getFlag` dans `flags.ts`.
 */
export function getLanguageColor(code: string): string {
  const normalizedCode = normalizeLanguageCode(code);
  return (
    theme.languageColors[normalizedCode as LanguageCode] || theme.languageColors.default
  );
}

/**
 * CSS Variables for the theme - Light and Dark modes
 * Following Web Interface Guidelines for proper dark mode support
 */
export const cssVariables = `
  /* Light Mode (default) */
  :root {
    color-scheme: light;

    /* Base Palette */
    --gp-warm-canvas: ${lightColors.warmCanvas};
    --gp-deep-ink: ${lightColors.deepInk};
    --gp-parchment: ${lightColors.parchment};
    --gp-charcoal: ${lightColors.charcoal};

    /* Surfaces */
    --gp-background: ${lightColors.background};
    --gp-surface: ${lightColors.surface};
    --gp-surface-elevated: ${lightColors.surfaceElevated};
    --gp-border: ${lightColors.border};
    --gp-border-subtle: ${lightColors.borderSubtle};

    /* Brand Colors */
    --gp-terracotta: ${lightColors.terracotta};
    --gp-terracotta-light: ${lightColors.terracottaLight};
    --gp-deep-teal: ${lightColors.deepTeal};
    --gp-gold-accent: ${lightColors.goldAccent};

    /* Language Accents */
    --gp-asian-ruby: ${lightColors.asianRuby};
    --gp-saffron: ${lightColors.saffron};
    --gp-jade-green: ${lightColors.jadeGreen};
    --gp-royal-indigo: ${lightColors.royalIndigo};
    --gp-sakura-pink: ${lightColors.sakuraPink};

    /* Semantic Text */
    --gp-text-primary: ${lightColors.textPrimary};
    --gp-text-secondary: ${lightColors.textSecondary};
    --gp-text-muted: ${lightColors.textMuted};
    --gp-text-inverse: ${lightColors.textInverse};

    /* Status */
    --gp-success: ${lightColors.success};
    --gp-warning: ${lightColors.warning};
    --gp-error: ${lightColors.error};
    --gp-info: ${lightColors.info};

    /* Interactive */
    --gp-hover: ${lightColors.hover};
    --gp-active: ${lightColors.active};
    --gp-focus: ${lightColors.focus};

    /* Fonts */
    --gp-font-display: ${theme.fonts.display};
    --gp-font-body: ${theme.fonts.body};
    --gp-font-mono: ${theme.fonts.mono};

    /* Shadows */
    --gp-shadow-sm: ${theme.shadows.sm};
    --gp-shadow-md: ${theme.shadows.md};
    --gp-shadow-lg: ${theme.shadows.lg};
    --gp-shadow-xl: ${theme.shadows.xl};
  }

  /* Dark Mode */
  :root[data-theme="dark"],
  .dark {
    color-scheme: dark;

    /* Base Palette */
    --gp-warm-canvas: ${darkColors.warmCanvas};
    --gp-deep-ink: ${darkColors.deepInk};
    --gp-parchment: ${darkColors.parchment};
    --gp-charcoal: ${darkColors.charcoal};

    /* Surfaces */
    --gp-background: ${darkColors.background};
    --gp-surface: ${darkColors.surface};
    --gp-surface-elevated: ${darkColors.surfaceElevated};
    --gp-border: ${darkColors.border};
    --gp-border-subtle: ${darkColors.borderSubtle};

    /* Brand Colors */
    --gp-terracotta: ${darkColors.terracotta};
    --gp-terracotta-light: ${darkColors.terracottaLight};
    --gp-deep-teal: ${darkColors.deepTeal};
    --gp-gold-accent: ${darkColors.goldAccent};

    /* Language Accents */
    --gp-asian-ruby: ${darkColors.asianRuby};
    --gp-saffron: ${darkColors.saffron};
    --gp-jade-green: ${darkColors.jadeGreen};
    --gp-royal-indigo: ${darkColors.royalIndigo};
    --gp-sakura-pink: ${darkColors.sakuraPink};

    /* Semantic Text */
    --gp-text-primary: ${darkColors.textPrimary};
    --gp-text-secondary: ${darkColors.textSecondary};
    --gp-text-muted: ${darkColors.textMuted};
    --gp-text-inverse: ${darkColors.textInverse};

    /* Status */
    --gp-success: ${darkColors.success};
    --gp-warning: ${darkColors.warning};
    --gp-error: ${darkColors.error};
    --gp-info: ${darkColors.info};

    /* Interactive */
    --gp-hover: ${darkColors.hover};
    --gp-active: ${darkColors.active};
    --gp-focus: ${darkColors.focus};

    /* Shadows - darker for dark mode */
    --gp-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
    --gp-shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
    --gp-shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.5);
    --gp-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.6);
  }

  /* System preference detection */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;

      --gp-warm-canvas: ${darkColors.warmCanvas};
      --gp-deep-ink: ${darkColors.deepInk};
      --gp-parchment: ${darkColors.parchment};
      --gp-charcoal: ${darkColors.charcoal};
      --gp-background: ${darkColors.background};
      --gp-surface: ${darkColors.surface};
      --gp-surface-elevated: ${darkColors.surfaceElevated};
      --gp-border: ${darkColors.border};
      --gp-border-subtle: ${darkColors.borderSubtle};
      --gp-terracotta: ${darkColors.terracotta};
      --gp-terracotta-light: ${darkColors.terracottaLight};
      --gp-deep-teal: ${darkColors.deepTeal};
      --gp-gold-accent: ${darkColors.goldAccent};
      --gp-asian-ruby: ${darkColors.asianRuby};
      --gp-saffron: ${darkColors.saffron};
      --gp-jade-green: ${darkColors.jadeGreen};
      --gp-royal-indigo: ${darkColors.royalIndigo};
      --gp-sakura-pink: ${darkColors.sakuraPink};
      --gp-text-primary: ${darkColors.textPrimary};
      --gp-text-secondary: ${darkColors.textSecondary};
      --gp-text-muted: ${darkColors.textMuted};
      --gp-text-inverse: ${darkColors.textInverse};
      --gp-success: ${darkColors.success};
      --gp-warning: ${darkColors.warning};
      --gp-error: ${darkColors.error};
      --gp-info: ${darkColors.info};
      --gp-hover: ${darkColors.hover};
      --gp-active: ${darkColors.active};
      --gp-focus: ${darkColors.focus};
      --gp-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
      --gp-shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
      --gp-shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.5);
      --gp-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.6);
    }
  }

  /* Respect prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

/**
 * Helper to get theme colors based on mode
 */
export function getThemeColors(isDark: boolean) {
  return isDark ? darkColors : lightColors;
}
