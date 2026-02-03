/**
 * Global Pulse Design System - Theme Configuration
 *
 * A distinctive design system for Meeshy that celebrates
 * global connectivity and cultural diversity.
 *
 * Supports light and dark modes following Web Interface Guidelines.
 */

// Light mode colors
const lightColors = {
  // Base Palette
  warmCanvas: '#FFF8F3',
  deepInk: '#16161A',
  parchment: '#F5EDE3',
  charcoal: '#2B2D42',

  // Surfaces
  background: '#FFF8F3',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',

  // Brand Colors
  terracotta: '#E76F51',
  terracottaLight: '#F4A261',
  deepTeal: '#264653',
  goldAccent: '#E9C46A',

  // Language-Inspired Accents
  asianRuby: '#C1292E',
  saffron: '#F4A261',
  jadeGreen: '#2A9D8F',
  royalIndigo: '#5E60CE',
  sakuraPink: '#F28482',

  // Semantic Text
  textPrimary: '#2B2D42',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Status
  success: '#2A9D8F',
  warning: '#F4A261',
  error: '#E76F51',
  info: '#5E60CE',

  // Interactive
  hover: 'rgba(0, 0, 0, 0.04)',
  active: 'rgba(0, 0, 0, 0.08)',
  focus: 'rgba(231, 111, 81, 0.3)',
};

// Dark mode colors - carefully crafted for accessibility
const darkColors = {
  // Base Palette
  warmCanvas: '#0D0D0F',
  deepInk: '#FAFAFA',
  parchment: '#1A1A1E',
  charcoal: '#E5E5E7',

  // Surfaces
  background: '#0D0D0F',
  surface: '#1A1A1E',
  surfaceElevated: '#242428',
  border: '#2E2E32',
  borderSubtle: '#232327',

  // Brand Colors (adjusted for dark mode contrast)
  terracotta: '#F08A70',
  terracottaLight: '#F5B080',
  deepTeal: '#3A8A9A',
  goldAccent: '#F0D080',

  // Language-Inspired Accents (brightened for dark mode)
  asianRuby: '#E54B50',
  saffron: '#F5B080',
  jadeGreen: '#40C4B0',
  royalIndigo: '#8082E8',
  sakuraPink: '#F5A09E',

  // Semantic Text
  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A8',
  textMuted: '#707078',
  textInverse: '#16161A',

  // Status (brightened for visibility)
  success: '#40C4B0',
  warning: '#F5B080',
  error: '#F08A70',
  info: '#8082E8',

  // Interactive
  hover: 'rgba(255, 255, 255, 0.06)',
  active: 'rgba(255, 255, 255, 0.12)',
  focus: 'rgba(240, 138, 112, 0.4)',
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
    terracotta: '0 4px 14px rgba(231, 111, 81, 0.4)',
    teal: '0 4px 14px rgba(38, 70, 83, 0.3)',
  },

  // Language color mapping
  languageColors: {
    fr: '#5E60CE', // Royal Indigo
    en: '#2A9D8F', // Jade Green
    es: '#F4A261', // Saffron
    zh: '#C1292E', // Asian Ruby
    ja: '#F28482', // Sakura Pink
    ar: '#E9C46A', // Gold
    de: '#264653', // Deep Teal
    pt: '#2A9D8F', // Jade Green
    ru: '#5E60CE', // Royal Indigo
    ko: '#C1292E', // Asian Ruby
    default: '#6B7280',
  },
} as const;

export type Theme = typeof theme;
export type ThemeColor = keyof typeof theme.colors;
export type LanguageCode = keyof typeof theme.languageColors;

/**
 * Get language color by code
 */
export function getLanguageColor(code: string): string {
  const normalizedCode = code.toLowerCase().slice(0, 2);
  return theme.languageColors[normalizedCode as LanguageCode] || theme.languageColors.default;
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
