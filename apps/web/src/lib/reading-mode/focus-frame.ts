import { focalLoupeScale } from '@meeshy/shared/utils/focal-metrics';

import { FOCUS_CARD_INNER_MARGIN, FOCUS_CONTENT_AIR, FOCUS_NEIGHBOUR_CLEARANCE } from './metrics';

/**
 * LE CADRE DE L'ÉLU — #8506 puis #8536 (directive porteur 2026-09-28) :
 * « Seul le contenu grandit : la date, le bouton de changement de langue,
 * l'auteur et son avatar doivent rester à la taille originale. Enfin le bloc
 * de verre doit avoir de la marge haut et bas pour que le contenu soit
 * aéré ! »
 *
 * La géométrie est PURE : `use-focus-frame.ts` mesure la rangée une fois par
 * élection (et à chaque redimensionnement réel), cette fonction décide.
 *
 * - LA LOUPE ne grossit que le CONTENU (`[data-loupe]` : citation, médias,
 *   texte), par son coin haut du bord de DÉBUT. L'identité, la bande basse
 *   (pastille, drapeaux, réactions) et le tampon restent à l'échelle 1. Le
 *   contenu grossi doit tenir dans sa place jusqu'au bord de FIN du cadre,
 *   marge comprise : un contenu qui la remplit déjà ne grossit pas
 *   (`focalLoupeScale({ room })`) ; un message court ou haut grossit du gain
 *   plein, ×1,26.
 * - L'AIR (`FOCUS_CONTENT_AIR`) décolle le contenu de l'identité au-dessus
 *   et de la bande basse au-dessous. Ce n'est pas du mouvement : il tient
 *   aussi sous Réduire le mouvement.
 * - LE CADRE s'allonge vers le bas de `grow + 2 × air` ; la bande basse et le
 *   tampon descendent d'autant (`thread-scene.css`), toujours à la marge du
 *   verre. Tout passe par `transform`/`translate` et par le bord d'un calque
 *   absolu : aucune hauteur ne change, le virtualiseur ne remesure rien.
 * - LES VOISINES s'écartent de ce que le cadre allongé déborde de la rangée,
 *   plus `FOCUS_NEIGHBOUR_CLEARANCE`.
 */
export type FocusFrameMeasure = {
  /** Bords haut et bas de la rangée (repère du viewport, au repos). */
  readonly rowTop: number;
  readonly rowBottom: number;
  /** Bords haut et bas du cadre de verre au repos. */
  readonly cardTop: number;
  readonly cardBottom: number;
  /** Du bord de DÉBUT du contenu au bord de FIN du cadre. */
  readonly contentRoom: number;
  /** L'encre du contenu, mesurée depuis son bord de DÉBUT, au repos. */
  readonly contentWidth: number;
  /** La hauteur de mise en page du contenu, au repos. */
  readonly contentHeight: number;
};

export type FocusFrame = {
  readonly scale: number;
  /** Ce que le contenu gagne en hauteur une fois grossi. */
  readonly grow: number;
  /** La marge d'air posée au-dessus ET au-dessous du contenu. */
  readonly air: number;
  readonly pushUp: number;
  readonly pushDown: number;
};

export function focusFrame(input: FocusFrameMeasure & { readonly reducedMotion: boolean }): FocusFrame {
  const scale = focalLoupeScale({
    isFocused: true,
    reducedMotion: input.reducedMotion,
    width: input.contentWidth,
    height: input.contentHeight,
    room: input.contentRoom - FOCUS_CARD_INNER_MARGIN,
  });
  const grow = (scale - 1) * input.contentHeight;
  const air = FOCUS_CONTENT_AIR;
  const above = input.rowTop - input.cardTop;
  const below = input.cardBottom + grow + 2 * air - input.rowBottom;
  return {
    scale,
    grow,
    air,
    pushUp: above > 0 ? above + FOCUS_NEIGHBOUR_CLEARANCE : 0,
    pushDown: below > 0 ? below + FOCUS_NEIGHBOUR_CLEARANCE : 0,
  };
}

/**
 * L'ENCRE D'UN NŒUD TEXTE — les plages `[début, fin[` de ses caractères non
 * blancs. En `white-space: pre-wrap`, l'espace d'une coupure de ligne PEND
 * au-delà du dernier mot : la boîte du nœud entier le compte et recule la
 * portée du contenu jusqu'au bord de la colonne. Seuls les mots s'impriment.
 */
export function inkRuns(text: string): ReadonlyArray<readonly [number, number]> {
  return Array.from(text.matchAll(/\S+/g), (match) => [match.index, match.index + match[0].length] as const);
}
