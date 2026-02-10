/**
 * Configuration des polices avec next/font/google
 * Optimisé pour: preload automatique, self-hosting, zero layout shift
 */
import {
  Inter,
  Nunito,
  Poppins,
  Open_Sans,
  Lato,
  Comic_Neue,
  Lexend,
  Roboto,
  DM_Sans,
  Playfair_Display,
} from 'next/font/google';

// Instances de polices avec next/font (self-hosted, preloaded)
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-nunito',
  display: 'swap',
});

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-poppins',
  display: 'swap',
});

const openSans = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-open-sans',
  display: 'swap',
});

const lato = Lato({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-lato',
  display: 'swap',
});

const comicNeue = Comic_Neue({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-comic-neue',
  display: 'swap',
});

const lexend = Lexend({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-lexend',
  display: 'swap',
});

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-roboto',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-playfair-display',
  display: 'swap',
});

// Geist-like font configuration (using CSS variables with fallback)
// These are placeholder objects that just provide the variable property
const geistSans = {
  variable: '--font-geist-sans',
};

const geistMono = {
  variable: '--font-geist-mono',
};

// Types et configuration
export type FontFamily =
  | 'inter'
  | 'nunito'
  | 'poppins'
  | 'open-sans'
  | 'lato'
  | 'comic-neue'
  | 'lexend'
  | 'roboto'
  | 'dm-sans'
  | 'playfair-display'
  | 'geist-sans'
  | 'geist-mono';

export interface FontConfig {
  id: FontFamily;
  name: string;
  description: string;
  category: 'modern' | 'friendly' | 'professional' | 'educational' | 'technical';
  variable: string;
  cssClass: string;
  recommended: boolean;
  ageGroup: 'kids' | 'teens' | 'adults' | 'all';
  accessibility: 'high' | 'medium' | 'low';
}

// Police par défaut - Nunito (la plus utilisée pour les jeunes)
export const defaultFont = nunito;

// Map des polices pour accès facile
const fontInstances = {
  'inter': inter,
  'nunito': nunito,
  'poppins': poppins,
  'open-sans': openSans,
  'lato': lato,
  'comic-neue': comicNeue,
  'lexend': lexend,
  'roboto': roboto,
  'dm-sans': dmSans,
  'playfair-display': playfairDisplay,
  'geist-sans': geistSans,
  'geist-mono': geistMono,
} as const;

// Fonction pour obtenir l'instance d'une police
export const getFontInstance = (fontId: FontFamily) => {
  return fontInstances[fontId] || nunito;
};

export const availableFonts: FontConfig[] = [
  {
    id: 'inter',
    name: 'Inter',
    description: 'Police moderne et lisible, parfaite pour les interfaces',
    category: 'modern',
    variable: '--font-inter',
    cssClass: 'font-inter',
    recommended: true,
    ageGroup: 'all',
    accessibility: 'high',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    description: 'Police ronde et amicale, idéale pour les jeunes',
    category: 'friendly',
    variable: '--font-nunito',
    cssClass: 'font-nunito',
    recommended: true,
    ageGroup: 'kids',
    accessibility: 'high',
  },
  {
    id: 'poppins',
    name: 'Poppins',
    description: 'Police géométrique moderne très populaire',
    category: 'modern',
    variable: '--font-poppins',
    cssClass: 'font-poppins',
    recommended: true,
    ageGroup: 'teens',
    accessibility: 'high',
  },
  {
    id: 'lexend',
    name: 'Lexend',
    description: 'Optimisée pour la lecture et l\'éducation',
    category: 'educational',
    variable: '--font-lexend',
    cssClass: 'font-lexend',
    recommended: true,
    ageGroup: 'all',
    accessibility: 'high',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    description: 'Excellente lisibilité, support multilingue',
    category: 'professional',
    variable: '--font-open-sans',
    cssClass: 'font-open-sans',
    recommended: false,
    ageGroup: 'adults',
    accessibility: 'high',
  },
  {
    id: 'lato',
    name: 'Lato',
    description: 'Police humaniste et chaleureuse',
    category: 'friendly',
    variable: '--font-lato',
    cssClass: 'font-lato',
    recommended: false,
    ageGroup: 'all',
    accessibility: 'medium',
  },
  {
    id: 'comic-neue',
    name: 'Comic Neue',
    description: 'Version moderne et professionnelle de Comic Sans',
    category: 'friendly',
    variable: '--font-comic-neue',
    cssClass: 'font-comic-neue',
    recommended: false,
    ageGroup: 'kids',
    accessibility: 'medium',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    description: 'Police Google, moderne et claire',
    category: 'modern',
    variable: '--font-roboto',
    cssClass: 'font-roboto',
    recommended: false,
    ageGroup: 'all',
    accessibility: 'high',
  },
  {
    id: 'geist-sans',
    name: 'Geist Sans',
    description: 'Police par défaut originale',
    category: 'technical',
    variable: '--font-geist-sans',
    cssClass: 'font-geist-sans',
    recommended: false,
    ageGroup: 'adults',
    accessibility: 'medium',
  }
];

// Fonction pour obtenir la configuration d'une police
export function getFontConfig(fontId: FontFamily): FontConfig | undefined {
  return availableFonts.find(font => font.id === fontId);
}

// Fonction optimisée pour obtenir uniquement la variable de la police active
export function getFontVariable(fontId?: FontFamily): string {
  if (!fontId) {
    return nunito.variable;
  }

  const fontInstance = getFontInstance(fontId);
  return fontInstance.variable;
}

// Fonction pour obtenir la classe CSS de la police active
export function getFontClassName(fontId?: FontFamily): string {
  if (!fontId) {
    return 'font-nunito';
  }

  return `font-${fontId}`;
}

// Fonction pour obtenir toutes les variables de polices (pour le layout)
export function getAllFontVariables(): string {
  return Object.values(fontInstances)
    .map(font => font.variable)
    .join(' ');
}

// Fonction pour obtenir les polices recommandées par groupe d'âge
export function getRecommendedFonts(ageGroup?: 'kids' | 'teens' | 'adults' | 'all'): FontConfig[] {
  if (!ageGroup) {
    return availableFonts.filter(font => font.recommended);
  }

  return availableFonts.filter(font =>
    font.recommended && (font.ageGroup === ageGroup || font.ageGroup === 'all')
  );
}

// Export des instances spécifiques pour usage direct
export { inter, nunito, poppins, openSans, lato, comicNeue, lexend, roboto, dmSans, playfairDisplay, geistSans, geistMono };
