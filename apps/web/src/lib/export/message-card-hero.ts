import type { CardMedia } from './message-card-media';

/**
 * **LE HÉROS DU SUPPORT** (#10915) — LOIS PURES, miroir de `MessageCardHero.swift`
 * (`packages/MeeshySDK/.../MessageCard/`) : mêmes constantes, même formule.
 *
 * Un commentaire de post, de réel ou de story s'image avec le MÉDIA du support
 * en tête de la carte : grand, pleine largeur, AVANT tout texte ; puis la ligne
 * du support (auteur + extrait court), puis le commentaire. Le héros n'est pas
 * un média de la réponse : il a sa place, sa hauteur, et ne compte pas dans la
 * grille du corps.
 */

/** La marge entre le bord de la carte et le héros, de chaque côté (la colonne de texte en a 96). */
export const HERO_MARGIN = 48;
/** Le rapport hauteur / largeur permis : du 16:9 (0,5625) au 4:5 (1,25) — au-delà, le héros est recadré. */
export const HERO_RATIO_MIN = 0.5625;
export const HERO_RATIO_MAX = 1.25;
/** Le rapport d'un héros dont on ne connaît pas encore les côtés : 4:3. */
export const HERO_UNKNOWN_RATIO = 0.75;
/** La part du budget de hauteur qu'un héros ne dépasse jamais : le texte garde sa place. */
export const HERO_MAX_SHARE = 0.45;
/** L'espace entre le héros et la ligne du support. */
export const HERO_GAP = 40;

/** Le cadre horizontal du héros. Un en-tête couché dans la marge le ramène sur la colonne de texte. */
export function heroSpan(params: { readonly canvasWidth: number; readonly sideHeader: boolean; readonly textLeft: number; readonly textWidth: number }): {
  readonly x: number;
  readonly width: number;
} {
  return params.sideHeader ? { x: params.textLeft, width: params.textWidth } : { x: HERO_MARGIN, width: params.canvasWidth - 2 * HERO_MARGIN };
}

/** Le rapport hauteur / largeur du héros : celui du média, borné ; `HERO_UNKNOWN_RATIO` sans côtés connus. */
export function heroRatio(media: CardMedia): number {
  if (media.kind === 'audio' || media.width <= 0 || media.height <= 0) return HERO_UNKNOWN_RATIO;
  return Math.min(HERO_RATIO_MAX, Math.max(HERO_RATIO_MIN, media.height / media.width));
}

/** La hauteur du héros : sa largeur × son rapport, sans dépasser `HERO_MAX_SHARE` du budget. Un média plus haut est recadré. */
export const heroHeight = (media: CardMedia, width: number, budget: number): number => Math.min(Math.round(width * heroRatio(media)), Math.floor(budget * HERO_MAX_SHARE));
