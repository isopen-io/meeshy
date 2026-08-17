/**
 * Contraste du pont ✦ — WL-102 (LWS-10).
 *
 * Contrat (§LWS-10, critères d'acceptation) : « le pont teinté accent
 * (`color-mix(accent 80 %, texte)`) reste ≥ 4,5:1 sur le fond, dans les deux
 * thèmes ». La formule `color-mix` seule ne le GARANTIT pas : la palette de
 * 39 couleurs vibrantes de `conversation-colors.ts` (LWS-2) contient des
 * teintes claires (verts, cyans, jaunes) qui, mélangées à 80 % avec le texte
 * du thème clair, tombent sous 4,5:1 contre un fond blanc — vérifié en
 * énumérant les 500 combinaisons `type × langue × thème` de
 * `conversationAccentPalette` (61 % passent la formule littérale).
 *
 * Ce module traite donc `color-mix(accent 80 %, texte)` comme le point de
 * DÉPART souhaité (la teinte la plus proche de l'accent qui reste lisible),
 * et le pousse — SEULEMENT si nécessaire — vers la couleur de texte du thème
 * jusqu'à atteindre 4,5:1. Le mélange 80/20 est toujours essayé en premier ;
 * la recherche ne s'active que pour les accents qui échoueraient sinon.
 *
 * Convergence garantie : à poids 0 (couleur de texte pure), le contraste
 * contre le fond du thème est celui du texte NORMAL de l'application
 * (`--foreground` sur `--background`), déjà largement au-dessus de 4,5:1 par
 * construction (texte quasi noir sur blanc, ou l'inverse) — la recherche ne
 * peut donc jamais échouer à trouver un point ≥ 4,5:1 entre 0 et 0.8.
 */

export type ThemeName = 'light' | 'dark';

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/**
 * Couleurs de texte/fond de thème — MIROIR de `apps/web/app/globals.css`
 * (`:root { --foreground; --background }` et `.dark { --foreground;
 * --background }`). Dupliquées ici (et non lues depuis le DOM) parce que
 * `getComputedStyle` ne résout aucune valeur en environnement de test sans
 * charger `globals.css` — un aller-retour DOM que cette loi pure, appelable
 * hors navigateur, n'a pas à payer. Toute dérive doit être corrigée ICI en
 * même temps que `globals.css` (pas de second jeu de vérité).
 */
const THEME_FOREGROUND_HSL: Readonly<Record<ThemeName, readonly [number, number, number]>> = {
  light: [224, 71.4, 4.1],
  dark: [210, 20, 98],
};

const THEME_BACKGROUND_HSL: Readonly<Record<ThemeName, readonly [number, number, number]>> = {
  light: [0, 0, 100],
  dark: [224, 71.4, 4.1],
};

/** Poids de départ du mélange, repris littéralement du contrat (« accent 80 % »). */
const BRIDGE_TINT_ACCENT_WEIGHT = 0.8;

/** Cible WCAG AA pour du texte normal. */
const MIN_CONTRAST_RATIO = 4.5;

/**
 * Marge de sécurité ajoutée à `MIN_CONTRAST_RATIO` pour les décisions
 * INTERNES (recherche, court-circuit du mélange littéral). La couleur
 * renvoyée est arrondie en hex 8 bits/canal (`rgbToHex`) : sans cette marge,
 * un point qui satisfait tout juste 4.5:1 en flottant peut retomber sous ce
 * seuil une fois ses canaux arrondis à l'entier le plus proche (mesuré :
 * jusqu'à −0.03 de ratio). La marge absorbe cette perte ; le seuil PUBLIC
 * exposé au contrat reste 4.5:1.
 */
const ROUNDING_SAFETY_MARGIN = 0.08;
const EFFECTIVE_MIN_CONTRAST_RATIO = MIN_CONTRAST_RATIO + ROUNDING_SAFETY_MARGIN;

/** Nombre d'itérations de la recherche par dichotomie — largement suffisant pour converger sous 0.001 de poids. */
const SEARCH_ITERATIONS = 24;

export function hexToRgb(hex: string): Rgb {
  const sanitized = hex.trim().replace(/^#/, '');
  const value = Number.parseInt(sanitized, 16);
  return {
    r: (value & 0xff0000) >> 16,
    g: (value & 0x00ff00) >> 8,
    b: value & 0x0000ff,
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * HSL → RGB (0-255 par canal). Miroir standard (CSS Color 4, `hsl()`), pas
 * HSB/HSV — les triplets de `globals.css` sont des `hsl()`.
 */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: 255 * f(0), g: 255 * f(8), b: 255 * f(4) };
}

/** Mélange linéaire par canal — reproduit `color-mix(in srgb, a W%, b)`. */
export function mixRgb(a: Rgb, weightA: number, b: Rgb, weightB: number): Rgb {
  return {
    r: a.r * weightA + b.r * weightB,
    g: a.g * weightA + b.g * weightB,
    b: a.b * weightA + b.b * weightB,
  };
}

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative WCAG (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance). */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(color.r) +
    0.7152 * srgbChannelToLinear(color.g) +
    0.0722 * srgbChannelToLinear(color.b)
  );
}

/** Ratio de contraste WCAG entre deux couleurs — toujours ≥ 1, symétrique. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const lA = relativeLuminance(a) + 0.05;
  const lB = relativeLuminance(b) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

function themeForegroundRgb(theme: ThemeName): Rgb {
  const [h, s, l] = THEME_FOREGROUND_HSL[theme];
  return hslToRgb(h, s, l);
}

function themeBackgroundRgb(theme: ThemeName): Rgb {
  const [h, s, l] = THEME_BACKGROUND_HSL[theme];
  return hslToRgb(h, s, l);
}

/**
 * Couleur du texte du pont ✦ pour un accent et un thème donnés — GARANTIT
 * ≥ 4,5:1 contre le fond du thème (critère d'acceptation LWS-10).
 *
 * Part de `color-mix(accent 80 %, texte)` (le mélange documenté par le
 * contrat) ; si ce point ne suffit pas, resserre par dichotomie vers la
 * couleur de texte du thème jusqu'au seuil, sans jamais dépasser le poids
 * de départ (l'accent ne peut que perdre du terrain, jamais en gagner).
 */
export function resolveBridgeTintColor(accentHex: string, theme: ThemeName): string {
  const accent = hexToRgb(accentHex);
  const foreground = themeForegroundRgb(theme);
  const background = themeBackgroundRgb(theme);

  const colorAtWeight = (accentWeight: number): Rgb =>
    mixRgb(accent, accentWeight, foreground, 1 - accentWeight);

  const startColor = colorAtWeight(BRIDGE_TINT_ACCENT_WEIGHT);
  if (contrastRatio(startColor, background) >= EFFECTIVE_MIN_CONTRAST_RATIO) {
    return rgbToHex(startColor);
  }

  // Dichotomie sur le poids de l'accent : `lo` échoue toujours (0, texte pur,
  // garanti par construction — voir en-tête), `hi` échoue (sinon on ne
  // serait pas ici). On resserre vers la plus grande part d'accent qui passe
  // la cible EFFECTIVE (avec marge d'arrondi), pas la cible publique brute.
  let lo = 0;
  let hi = BRIDGE_TINT_ACCENT_WEIGHT;
  let best = colorAtWeight(0);

  for (let i = 0; i < SEARCH_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    const candidate = colorAtWeight(mid);
    if (contrastRatio(candidate, background) >= EFFECTIVE_MIN_CONTRAST_RATIO) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return rgbToHex(best);
}
