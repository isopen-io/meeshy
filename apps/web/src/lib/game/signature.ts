import { BRAND_DASH_BOX, BRAND_DASHES } from '@/lib/brand';

/**
 * LA SIGNATURE DU JEU (#9380) — les trois traits de la marque
 * (`MeeshyDashesShape`, `BRAND_DASHES`), posés sur tout objet du jeu.
 *
 * La GÉOMÉTRIE n'est pas réécrite ici : c'est la table de `lib/brand.ts`,
 * celle que lisent déjà `BrandMark` et le peintre des cadres de capture.
 * Longueurs 500 · 400 · 300 dans un carré de 1 024, opacités 0,7 · 1 · 0,75,
 * jamais déformées. Ce module ajoute seulement les COUCHES qui font la
 * matière (conception, IV.1) :
 *
 *   · `flat`     — en aplat, sur les fonds de couleur (anneaux, cœur de la Flamme) ;
 *   · `struck`   — frappée sur le métal : ombre en bas à droite, éclat en haut
 *                  à gauche, puis l'encre ;
 *   · `engraved` — gravée sur les blasons et les badges : un éclat dans le creux,
 *                  une encre légèrement atténuée.
 */

export const SIGNATURE_BOX = BRAND_DASH_BOX;
export const SIGNATURE_DASHES = BRAND_DASHES;

export type SignatureMode = 'flat' | 'struck' | 'engraved';
export type SignatureTone = 'shade' | 'light' | 'ink';

export type SignatureLayer = {
  readonly tone: SignatureTone;
  /** Décalage horizontal, en unités de l'écran (déjà multiplié par la taille). */
  readonly dx: number;
  readonly dy: number;
  readonly color: string;
  /** `null` : les opacités propres à chaque trait (0,7 · 1 · 0,75). */
  readonly opacity: number | null;
};

/** Les teintes d'ombre et d'éclat sont des jetons (`styles/game.css`), jamais des littéraux. */
export const SIGNATURE_TONE_COLOR = {
  shade: 'var(--game-shade)',
  light: 'var(--game-glint)',
} as const;

export const signatureLayers = ({ mode, size, color }: { readonly mode: SignatureMode; readonly size: number; readonly color: string }): readonly SignatureLayer[] => {
  const ink: SignatureLayer = { tone: 'ink', dx: 0, dy: 0, color, opacity: null };
  if (mode === 'struck') {
    return [
      { tone: 'shade', dx: size * 0.018, dy: size * 0.022, color: SIGNATURE_TONE_COLOR.shade, opacity: 0.5 },
      { tone: 'light', dx: -size * 0.012, dy: -size * 0.014, color: SIGNATURE_TONE_COLOR.light, opacity: 0.85 },
      ink,
    ];
  }
  if (mode === 'engraved') {
    return [{ tone: 'light', dx: size * 0.012, dy: size * 0.016, color: SIGNATURE_TONE_COLOR.light, opacity: 0.35 }, { ...ink, opacity: 0.85 }];
  }
  return [ink];
};
