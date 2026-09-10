/**
 * LE FOND DU FIL (#5774, travail 3/3) — DÉRIVÉ de
 * `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift:213-221`
 * (`baseGradient`) : un dégradé à TROIS arrêts, teinté par l'accent de la
 * conversation, STATIQUE — `animationsEnabled = false` (:118-124, décision
 * produit batterie) : iOS ne l'anime PAS, la v3.1 ne le fait pas non plus
 * (D-1 prime sur toute intention d'animation lente).
 *
 * Ces trois hexadécimaux ne viennent PAS de `MeeshyColors.swift` : ce sont
 * des littéraux `Color(hex:)` INLINE dans `ConversationAnimatedBackground`,
 * hors de portée du pipeline `packages/design-tokens/scripts/
 * generate-from-ios.mjs` (qui ne lit que `MeeshyColors.swift` /
 * `DesignTokens.swift`). Même dispositif que les cotes de
 * `reading-mode/metrics.ts` : une comparaison TEXTUELLE, gardée par
 * `scripts/check-curve.mjs`, plutôt qu'une deuxième table recopiée à la
 * main.
 */

/** Sombre : `[0F0C29, tinted(0F0C29, accent, 12%), 24243E]`. */
export const BACKDROP_DARK_START = '0F0C29';
export const BACKDROP_DARK_END = '24243E';
export const BACKDROP_DARK_TINT = 0.12;

/** Clair : `[tinted(FFFFFF, accent, 8%), FFFFFF, tinted(FFFFFF, accent, 5%)]`. */
export const BACKDROP_LIGHT_BASE = 'FFFFFF';
export const BACKDROP_LIGHT_TINT_START = 0.08;
export const BACKDROP_LIGHT_TINT_END = 0.05;

/**
 * LA SEULE PORTE par laquelle ces cotes atteignent le CSS — posée sur
 * l'hôte commun (`routes/thread.tsx`, à côté de `withAccent()`) : `.thread-backdrop`
 * (`thread-scene.css`) ne porte AUCUNE valeur numérique en dur.
 */
export function backdropStyleVars(): Record<string, string> {
  return {
    '--backdrop-dark-start': `#${BACKDROP_DARK_START}`,
    '--backdrop-dark-end': `#${BACKDROP_DARK_END}`,
    '--backdrop-dark-tint': String(BACKDROP_DARK_TINT),
    '--backdrop-light-base': `#${BACKDROP_LIGHT_BASE}`,
    '--backdrop-light-tint-start': String(BACKDROP_LIGHT_TINT_START),
    '--backdrop-light-tint-end': String(BACKDROP_LIGHT_TINT_END),
  };
}
