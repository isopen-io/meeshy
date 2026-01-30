/**
 * Global Pulse Design System - Theme Configuration
 *
 * A distinctive design system for Meeshy that celebrates
 * global connectivity and cultural diversity.
 */

export const theme = {
  colors: {
    // Base Palette
    warmCanvas: '#FFF8F3',
    deepInk: '#16161A',
    parchment: '#F5EDE3',
    charcoal: '#2B2D42',

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

    // Semantic
    textPrimary: '#2B2D42',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',

    // Status
    success: '#2A9D8F',
    warning: '#F4A261',
    error: '#E76F51',
    info: '#5E60CE',
  },

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
 * CSS Variables for the theme
 */
export const cssVariables = `
  :root {
    /* Base Palette */
    --gp-warm-canvas: ${theme.colors.warmCanvas};
    --gp-deep-ink: ${theme.colors.deepInk};
    --gp-parchment: ${theme.colors.parchment};
    --gp-charcoal: ${theme.colors.charcoal};

    /* Brand Colors */
    --gp-terracotta: ${theme.colors.terracotta};
    --gp-terracotta-light: ${theme.colors.terracottaLight};
    --gp-deep-teal: ${theme.colors.deepTeal};
    --gp-gold-accent: ${theme.colors.goldAccent};

    /* Language Accents */
    --gp-asian-ruby: ${theme.colors.asianRuby};
    --gp-saffron: ${theme.colors.saffron};
    --gp-jade-green: ${theme.colors.jadeGreen};
    --gp-royal-indigo: ${theme.colors.royalIndigo};
    --gp-sakura-pink: ${theme.colors.sakuraPink};

    /* Semantic */
    --gp-text-primary: ${theme.colors.textPrimary};
    --gp-text-secondary: ${theme.colors.textSecondary};
    --gp-text-muted: ${theme.colors.textMuted};

    /* Fonts */
    --gp-font-display: ${theme.fonts.display};
    --gp-font-body: ${theme.fonts.body};
    --gp-font-mono: ${theme.fonts.mono};
  }
`;
