/**
 * **LA POSE DES MENUS FLOTTANTS** (#6104) — la loi, sans DOM.
 *
 * Miroir de `FreeFloatingButtonsContainer`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift`) et
 * de `RootView.menuLadder` (`apps/ios/.../RootView.swift:1677-1738`).
 *
 * **Pourquoi une loi séparée du composant.** `popover.ts` a posé la discipline
 * dans cette application : ce qui se positionne se calcule sans DOM, et le
 * composant peint le résultat. Une règle de placement écrite au milieu du JSX
 * ne se vérifie qu'à l'œil — et l'œil ne visite jamais les quatre coins, ni la
 * borne exacte où une comparaison bascule.
 */

import { FLOATING_BUTTON } from './floating-corridor';

/**
 * Le disque fermé (52), la marge latérale (20) et le haut du couloir (126)
 * vivent dans `floating-corridor.ts` depuis #6277 : le chrome des écrans qui
 * portent les disques les partage au pixel près, et une copie ici en aurait
 * refait la jumelle que ce module existe pour retirer.
 */
export { FLOATING_BUTTON, FLOATING_SIDE, FLOATING_TOP } from './floating-corridor';

/** Un barreau de l'échelle — 46 (`RootView.swift:1699`). */
export const LADDER_RUNG = 46;

/** L'air entre deux barreaux — `MeeshySpacing.md` (`RootView.swift:1700`). */
export const LADDER_GAP = 12;

/** Le pas d'iOS, du centre d'un barreau au centre du suivant — `46 + 12`. */
export const LADDER_PITCH = LADDER_RUNG + LADDER_GAP;

/**
 * L'air MINIMAL entre deux barreaux quand l'échelle se resserre (#6458). Deux
 * barreaux de 46 qui se touchent restent deux cibles de 44, mais un doigt posé
 * entre les deux n'appartient plus à personne : quatre est le plus petit air
 * qui garde la frontière visible.
 */
const LADDER_MIN_GAP = 4;

/** La marge que le dernier barreau garde avec le bord du cadre. */
export const LADDER_EDGE = 8;

/**
 * Le saut entre le CENTRE du bouton et le CENTRE du premier barreau —
 * `26 + 12 + 23` (`RootView.swift:1707`) : le rayon du bouton, l'air, puis le
 * rayon du barreau.
 */
const FIRST_RUNG = FLOATING_BUTTON / 2 + LADDER_GAP + LADDER_RUNG / 2;

/**
 * Une position est une FRACTION du couloir disponible, jamais des pixels.
 * iOS les sérialise ainsi (`"x,y"`, `RootView.swift:259-260`) pour une raison
 * qui vaut ici mot pour mot : une position en pixels mémorisée dans un cadre
 * pose le bouton HORS de l'écran dans un autre — rotation, fenêtre
 * redimensionnée, écran plus étroit.
 */
export type FloatingFraction = { readonly x: number; readonly y: number };

/** Haut GAUCHE — `@AppStorage("feedButtonPosition")`, défaut `"0.0,0.0"`. */
export const FEED_DEFAULT: FloatingFraction = { x: 0, y: 0 };

/** Haut DROITE — `@AppStorage("menuButtonPosition")`, défaut `"1.0,0.0"`. */
export const MENU_DEFAULT: FloatingFraction = { x: 1, y: 0 };

/**
 * La pose, en CSS plutôt qu'en pixels calculés.
 *
 * `calc()` interpole la fraction dans le couloir à la PEINTURE : la position
 * reste juste quand la fenêtre change de taille, sans écouteur de
 * redimensionnement, sans mesure, et sans l'image perdue qu'une mesure en
 * JavaScript coûterait à chaque redimensionnement (dimension 4).
 *
 * Les trois couloirs sont des variables de `styles/floating-menus.css`, où
 * elles sont MESURÉES et documentées — pas des nombres recopiés ici.
 */
export function floatingLeft({ x }: FloatingFraction): string {
  return `calc(var(--float-side) + ${x} * (100% - var(--float-side) * 2 - ${FLOATING_BUTTON}px))`;
}

export function floatingTop({ y }: FloatingFraction): string {
  return `calc(var(--float-top) + ${y} * (100% - var(--float-top) - var(--float-bottom) - ${FLOATING_BUTTON}px))`;
}

/**
 * **Le sens de dépliement suit la MOITIÉ de l'écran, jamais le bord le plus
 * proche.** Une échelle qui descendrait depuis le bas sortirait de l'écran —
 * et elle en sortirait SILENCIEUSEMENT, les barreaux existant toujours dans
 * le DOM.
 *
 * La borne est stricte comme chez iOS (`pos.y < 0.5`) : à exactement la
 * moitié, l'échelle MONTE.
 */
export function ladderExpandsDown(y: number): boolean {
  return y < 0.5;
}

/**
 * Le décalage SIGNÉ, en pixels, du centre du bouton au centre du barreau
 * `index`. Une seule formule pour les deux sens : écrite deux fois, elle
 * aurait divergé — c'est le motif que cette application a déjà payé trois fois.
 */
export function ladderRungOffset(index: number, expandsDown: boolean, pitch: number = LADDER_PITCH): number {
  const distance = FIRST_RUNG + index * pitch;
  return expandsDown ? distance : -distance;
}

/**
 * **LA PLACE DE L'ÉCHELLE, des deux côtés du disque** (#6458) — du CENTRE du
 * disque au bord du cadre, moins la marge du bord ; en haut, la barre d'état
 * d'une coque (`safeTop`) est déduite : un barreau posé dessous est sous
 * l'heure, pas à l'écran.
 */
export type LadderRooms = { readonly up: number; readonly down: number };

export function ladderRooms(frame: {
  readonly center: number;
  readonly frameTop: number;
  readonly frameBottom: number;
  readonly safeTop: number;
}): LadderRooms {
  return {
    up: frame.center - frame.frameTop - frame.safeTop - LADDER_EDGE,
    down: frame.frameBottom - frame.center - LADDER_EDGE,
  };
}

/**
 * **LE PAS DE L'ÉCHELLE** (#6458) — celui d'iOS tant que l'échelle tient, et
 * RESSERRÉ quand elle ne tient plus.
 *
 * Six barreaux tiennent partout où la charte mesure ; le septième (l'espace
 * d'administration, extension web) ne tient pas à 320 × 568 depuis la pose par
 * défaut : 152 + 61 + 6 × 58 + 23 = 584. Plutôt que de le laisser sortir de
 * l'écran — en silence, le clavier y menant un focus invisible —, le pas se
 * réduit à ce que la place autorise, jamais sous un air de quatre.
 *
 * `room: null` — la place n'est pas encore mesurée (premier rendu, cadre
 * dégénéré) : le pas d'iOS, qui est aussi celui de tout écran assez grand.
 */
export function ladderPitch({ count, room }: { readonly count: number; readonly room: number | null }): number {
  if (room === null || count <= 1) return LADDER_PITCH;
  const tient = Math.floor((room - FIRST_RUNG - LADDER_RUNG / 2) / (count - 1));
  return Math.min(LADDER_PITCH, Math.max(LADDER_RUNG + LADDER_MIN_GAP, tient));
}


/**
 * **CE QUE LE BOUTON PEUT ATTEINDRE** — les trois couloirs, lus depuis le CSS
 * plutôt que recopiés ici.
 *
 * Ils vivent dans `styles/floating-menus.css`, où ils sont MESURÉS et où
 * `env(safe-area-inset-top)` les résout. Une seconde table de nombres en
 * JavaScript aurait été la jumelle divergente que ce dépôt interdit — et elle
 * aurait divergé au pire endroit : le bouton se serait posé à un endroit et
 * dessiné à un autre.
 */
export type FloatingBounds = {
  readonly width: number;
  readonly height: number;
  readonly side: number;
  readonly top: number;
  readonly bottom: number;
};

/**
 * **Le seuil qui départage un APPUI d'un DÉPLACEMENT**, en pixels.
 *
 * iOS n'en a pas besoin : `DragGesture` et `TapGesture` y cohabitent par
 * `simultaneousGesture`. Le web n'a pas d'équivalent — c'est la DISTANCE
 * parcourue qui tranche, exactement comme `LONG_PRESS_MAX_DISTANCE_PX` le fait
 * déjà dans `long-press.ts`, et la valeur est la même pour que deux gestes de
 * la même application n'aient pas deux tolérances au tremblement.
 *
 * **L'égalité est GARDÉE par un témoin** (#6456, `floating-drag.test.ts`) : le
 * disque du Flux porte les deux gestes à la fois, et régler l'une sans l'autre
 * ouvrirait une bande de distances où l'appui long est annulé sans que le
 * glisser ait commencé — un disque qui ne fait RIEN. Le témoin plutôt qu'un
 * import : cette loi pure est lue par le chrome du Flux, et `long-press.ts`
 * tire React et ses gestionnaires.
 */
export const FLOATING_DRAG_THRESHOLD = 6;

export function isFloatingDrag(distance: number): boolean {
  return distance > FLOATING_DRAG_THRESHOLD;
}

const borne = (valeur: number) => Math.min(1, Math.max(0, valeur));

/**
 * **Un point de l'écran devient une FRACTION du couloir** — miroir de
 * `normalizedPosition` (`FloatingButtons.swift:277-306`).
 *
 * Deux règles, et elles ne sont pas symétriques :
 *
 * - **l'horizontale S'ACCROCHE** (`x < 0.5 ? 0 : 1`) : un bouton laissé au
 *   milieu d'un bord mangerait le contenu des deux côtés, et l'échelle n'aurait
 *   plus d'axe ;
 * - **la verticale reste LIBRE**, simplement bornée : c'est ce qui permet de
 *   poser le bouton à la hauteur de son pouce, et c'est toute la différence
 *   entre un objet déplaçable et quatre coins.
 *
 * Le cadre DÉGÉNÉRÉ — une fenêtre plus courte que ses propres couloirs, ce
 * qu'un clavier logiciel produit — rend une division par zéro. Sans la garde,
 * le `NaN` traverse jusqu'au `calc()`, où il ne lève AUCUNE erreur : il fait
 * simplement disparaître le bouton.
 */
export function normalizeFloating(
  centre: { readonly x: number; readonly y: number },
  bounds: FloatingBounds,
): FloatingFraction {
  const rayon = FLOATING_BUTTON / 2;
  const minX = bounds.side + rayon;
  const maxX = bounds.width - bounds.side - rayon;
  const minY = bounds.top + rayon;
  const maxY = bounds.height - bounds.bottom - rayon;

  const largeur = maxX - minX;
  const hauteur = maxY - minY;

  const x = largeur <= 0 ? 0 : borne((centre.x - minX) / largeur);
  const y = hauteur <= 0 ? 0 : borne((centre.y - minY) / hauteur);

  return { x: x < 0.5 ? 0 : 1, y };
}
