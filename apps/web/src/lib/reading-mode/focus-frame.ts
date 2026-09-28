import { focalLoupeScale } from '@meeshy/shared/utils/focal-metrics';

import { FOCUS_CARD_INNER_MARGIN, FOCUS_NEIGHBOUR_CLEARANCE } from './metrics';

/**
 * LE CADRE DE L'ÉLU (#8506) — directive porteur 2026-09-28 : « place les
 * contrôleurs et détails qui apparaissent à l'intérieur du cadre, en laissant
 * de l'espace sur les bords ! Agrandis tout le contenu intérieur par ×1,2
 * encore. »
 *
 * La géométrie est PURE : `use-focus-frame.ts` mesure la rangée une fois par
 * élection (et à chaque redimensionnement réel), cette fonction décide.
 *
 * - LA LOUPE grossit la rangée par le bord de DÉBUT du cadre (horizontalement)
 *   et par son CENTRE (verticalement). Le cadre, lui, garde sa LARGEUR — il
 *   est contre-échelonné en largeur (`thread-scene.css`, `--loupe-s`) et ne
 *   dépasse donc jamais la colonne moins sa marge. Le contenu grossi doit y
 *   tenir, marge de fin comprise : un contenu qui remplit déjà la largeur ne
 *   grossit pas (borne documentée, `focalLoupeScale({ room })`) ; un message
 *   court ou haut grossit du gain plein, ×1,26.
 * - LE TAMPON est ancré au bord de FIN : `endShift` le ramène, dans le repère
 *   non grossi de la rangée, pour que son bord de fin reste à la marge
 *   grossie du cadre — la même que sur les trois autres bords.
 * - LES VOISINES s'écartent de ce que le cadre grossi déborde de la rangée,
 *   plus `FOCUS_NEIGHBOUR_CLEARANCE` — par `translate` seul : aucune hauteur
 *   ne change, aucun relayout, le virtualiseur ne remesure rien.
 */
export type FocusFrameMeasure = {
  /** Bords haut et bas de la rangée (repère du viewport, sans loupe). */
  readonly rowTop: number;
  readonly rowBottom: number;
  /** Bords haut et bas du cadre de verre au repos. */
  readonly cardTop: number;
  readonly cardBottom: number;
  readonly cardWidth: number;
  /**
   * Distance du bord de DÉBUT du cadre à la fin du contenu le plus lointain
   * (texte, médias, identité, bande basse + tampon), au repos.
   */
  readonly contentExtent: number;
};

export type FocusFrame = {
  readonly scale: number;
  /** Origine verticale de la loupe, relevée depuis le haut de la rangée. */
  readonly originY: number;
  /** Déplacement du tampon vers le DÉBUT, dans le repère non grossi (≤ 0). */
  readonly endShift: number;
  readonly pushUp: number;
  readonly pushDown: number;
};

export function focusFrame(input: FocusFrameMeasure & { readonly reducedMotion: boolean }): FocusFrame {
  const cardHeight = input.cardBottom - input.cardTop;
  const scale = focalLoupeScale({
    isFocused: true,
    reducedMotion: input.reducedMotion,
    width: input.contentExtent + FOCUS_CARD_INNER_MARGIN,
    height: cardHeight,
    room: input.cardWidth,
  });
  const centre = (input.cardTop + input.cardBottom) / 2;
  const half = (scale * cardHeight) / 2;
  const above = input.rowTop - (centre - half);
  const below = centre + half - input.rowBottom;
  return {
    scale,
    originY: centre - input.rowTop,
    endShift: scale === 1 ? 0 : input.cardWidth * (1 / scale - 1),
    pushUp: above > 0 ? above + FOCUS_NEIGHBOUR_CLEARANCE : 0,
    pushDown: below > 0 ? below + FOCUS_NEIGHBOUR_CLEARANCE : 0,
  };
}
