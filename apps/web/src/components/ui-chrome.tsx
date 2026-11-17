import { ChromeActionDisc } from './chrome-action';
import { Glyph } from './glyph';

/**
 * **LES PRIMITIVES DU CHROME — UNE ÉCRITURE POUR TOUS LES ÉCRANS** (#8879).
 *
 * La passe d'harmonie a relevé la même anatomie réécrite route par route :
 * dix `HEADER_HEIGHT = 64`, dix flèches de retour composées à la main, des
 * glyphes de 11 à 28 px sans échelle. Ce module est leur site unique ; la
 * charte (`docs/product/charte-visuelle-web.md`) dit quand employer chacun.
 */

/**
 * L'échelle FERMÉE des glyphes, relevée sur les tailles de symboles des vues
 * iOS (`Image(systemName:)` : 12–14 en ligne, 16 en rangée, 18–22 en en-tête).
 * `Glyph size={GLYPH_SIZE.md}` — jamais un nombre écrit à la main.
 */
export const GLYPH_SIZE = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 } as const;

/** Les classes des boutons, déclarées en `@utility` dans `styles/ui.css`. */
export const BUTTON = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  destructive: 'btn-destructive',
  icon: 'btn-icon',
  onMedia: 'btn-on-media',
} as const;

/** La hauteur de l'en-tête d'un écran plein cadre — celle que dix routes recopiaient. */
export const SCREEN_HEADER_HEIGHT = 64;

/** La flèche de retour, dans le disque de 28 du chrome, retournée en RTL. */
export function BackGlyph() {
  return (
    <ChromeActionDisc>
      <Glyph name="caretLeft" size={GLYPH_SIZE.md} className="rtl:-scale-x-100" />
    </ChromeActionDisc>
  );
}
