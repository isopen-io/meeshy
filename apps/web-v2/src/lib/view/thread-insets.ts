import { DAY_PILL_TOP } from '@/lib/reading-mode/metrics';

/**
 * LES RÉSERVES DU DÉFILEUR DU FIL (#6213) — la loi, PURE et seule.
 *
 * ## Ce qu'elle ferme
 *
 * Le fil de la v2.0 posait une colonne flex de TROIS FRÈRES — en-tête
 * (`shrink-0`), enveloppe du défileur (`flex-1`), composeur (`shrink-0`) : le
 * contenu ne pouvait ni monter sous la bande, ni descendre sous le composeur,
 * et s'arrêtait à leur arête. Capture porteur du 2026-09-12 : la dernière
 * ligne du dernier message TRANCHÉE par la pilule de langue.
 *
 * Deux symptômes de la même pose :
 *
 * 1. L'en-tête était HABILLÉ en bande flottante (`backdrop-blur-xl`, fond à
 *    80 % — `components/thread-header.tsx`) mais POSÉ en frère de flux : un
 *    flou qui n'avait rien à flouter.
 * 2. L'escamotage du chrome (#5774) ne découvrait RIEN. `EdgeHiddenChrome`
 *    fait glisser l'en-tête et le composeur vers leur bord ; leur BOÎTE de
 *    flux reste. On libérait du vide, pas du contenu.
 *
 * ## La loi, dérivée d'iOS
 *
 * Là-bas la liste court de bord PHYSIQUE à bord physique et les réserves sont
 * des `contentInset`, jamais des boîtes de flux (`ConversationView.swift`) :
 *
 *     .ignoresSafeArea(.container, edges: [.top, .bottom])                     // :1873
 *     topInset:    previewMode ? 0 : DeviceLayout.safeAreaTop                  // :1556
 *     bottomInset: composerHeight + 16 + DeviceLayout.safeAreaBottom           // :1552
 *
 * `topInset` vaut l'ENCOCHE SEULE, jamais la hauteur de la bande : c'est ce
 * qui rend le défilement visible « du haut de l'écran au bas de l'écran »
 * (retour porteur). Réserver la bande entière déplacerait le couperet, ne le
 * retirerait pas.
 *
 * Le bord BAS porte déjà, dans le code iOS, un retour du porteur du
 * 2026-08-16 : « borné à la safe area basse, le représentable coupait les
 * messages ~34 pt AVANT le bord physique […] le fil doit sortir de l'écran par
 * le bord, exactement comme en haut. » **Le même défaut, la même personne le
 * signale, sur l'autre plateforme.**
 *
 * ## Pourquoi une loi en TypeScript plutôt qu'un `calc()` en CSS
 *
 * Les deux termes du bord bas ne sont pas de même nature : l'un est MESURÉ au
 * navigateur (le composeur grandit avec le texte saisi, la bande de citation,
 * le tiroir de pièces jointes), l'autre est une `env()`. Un `calc()` les
 * additionnerait sans pouvoir exprimer le PLANCHER — que le composeur soit
 * absent (Résumé Vivant) et la réserve tombait sous l'indicateur home. Une
 * fonction pure le dit, et se mesure sans navigateur.
 */

/**
 * `ConversationView.swift:1552` — le `+ 16` de `bottomInset`. C'est
 * littéralement « l'espace vers le bas » que le porteur décrit : la dernière
 * bulle ne touche jamais le composeur.
 */
export const LIST_BOTTOM_BREATH = 16;

/**
 * `MeeshySpacing.sm` — l'écart du bouton « revenir en bas » au bord bas
 * (`.padding(.bottom, composerScrollButtonAnchor + MeeshySpacing.sm)`,
 * `ConversationView.swift:1957`). Le défileur couvrant désormais TOUTE la
 * hauteur, le `bottom-2` d'avant laissait ce bouton DERRIÈRE le composeur.
 */
export const SCROLL_BUTTON_GAP = 8;

/** Les cotes que le navigateur remet à la loi : deux `env()` et une mesure. */
export type ThreadEdges = {
  /**
   * Hauteur MESURÉE de ce qui occupe le bord bas — composeur, barre de
   * sélection, ou rien (Résumé Vivant). Elle COMPREND déjà l'encoche basse :
   * `components/composer.tsx` porte `pb-safe` sur sa racine.
   */
  readonly bottomEdgeHeight: number;
  readonly safeAreaTop: number;
  readonly safeAreaBottom: number;
};

export type ThreadInsets = {
  /** Marge intérieure HAUTE du défileur — l'encoche, jamais la bande. */
  readonly top: number;
  /** Marge intérieure BASSE du défileur — le bord bas plus la respiration. */
  readonly bottom: number;
  /** Ancrage du bouton « revenir en bas », au-dessus du bord bas. */
  readonly scrollButtonBottom: number;
  /** Ancrage de la pilule d'annonce visible, sur le même bord. */
  readonly noticeBottom: number;
  /** Ancrage de la pilule de jour collante, sous la bande. */
  readonly dayPillTop: number;
};

/**
 * Une mesure qui n'a pas encore eu lieu vaut `NaN` (pas de
 * `ResizeObserver` au premier rendu), et une `env()` absente rend `0` :
 * les deux doivent donner une réserve POSITIVE, jamais un fil remonté
 * hors-cadre.
 */
const sane = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

export function threadInsets({ bottomEdgeHeight, safeAreaTop, safeAreaBottom }: ThreadEdges): ThreadInsets {
  const top = sane(safeAreaTop);
  /* LE PLANCHER, et c'est le cas du Résumé Vivant : aucun composeur n'est
     monté (`thread.tsx`, « LE COMPOSEUR NE SE MONTE JAMAIS EN RÉSUMÉ »), la
     mesure vaut 0, et sans ce `max` la dernière rangée passait sous
     l'indicateur home. Un `max` plutôt qu'une somme : quand le composeur EST
     monté, il porte DÉJÀ l'encoche (`pb-safe`) — l'ajouter la compterait
     deux fois. */
  const edge = Math.max(sane(bottomEdgeHeight), sane(safeAreaBottom));
  return {
    top,
    bottom: edge + LIST_BOTTOM_BREATH,
    scrollButtonBottom: edge + SCROLL_BUTTON_GAP,
    noticeBottom: edge + SCROLL_BUTTON_GAP,
    /* L'ARITHMÉTIQUE iOS ENTIÈRE, retrouvée : `MessageDayStickyPlacement.topOffset`
       est mesuré depuis le haut du CADRE. Tant que l'enveloppe du défileur
       commençait au bord bas de l'en-tête, la v2.0 devait en soustraire la
       bande — c'était `DAY_PILL_MARGIN`, une constante qui n'existait que pour
       décrire une divergence. L'enveloppe couvrant maintenant l'écran entier,
       la soustraction n'a plus d'objet : la divergence disparaît avec sa cause. */
    dayPillTop: top + DAY_PILL_TOP,
  };
}
