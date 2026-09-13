/**
 * **LA COTE DU PLATEAU DES STORIES — ET CE QU'ELLE GOUVERNE** (#6133).
 *
 * **La cote iOS gouverne l'AVATAR, jamais la cellule.** `AvatarContext.size`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:46-52`)
 * est la taille du VISAGE : `.storyTray` = 88, `.storyTrayCompact` = 36.
 * L'anneau de story se dessine AUTOUR de lui (`ringSize = size + 6`,
 * `MeeshyAvatar.swift:165`), et la cellule se COMPOSE ensuite : l'anneau plus
 * la respiration de son libellé au grand plateau (`StoryRingCell`,
 * `.frame(width: 96)`, `StoryTrayView.swift:289`), l'anneau seul dans la bande
 * épinglée (« 36pt avatar + 6pt story ring plus breathing »,
 * `CollapsibleHeader.swift:80`).
 *
 * **Pourquoi l'écrire ici, une fois.** La première écriture du web faisait
 * valoir la cote iOS sur la CELLULE — `round(size × 1.222)`, avatar 72 →
 * cellule 88. Ce n'était pas une lecture d'iOS mais un rapport inventé : il
 * donnait 88 à la bonne case pour la mauvaise raison, et 37 au lieu de 42 à la
 * bande. Deux sessions l'ont rederivé à chaque revue, jusqu'au conflit de
 * #6100. Le grief de #6080 contre un grand avatar (« un huitième de l'écran pour
 * trois entrées ») ne tient plus depuis #6103 : le plateau SORT du champ au
 * défilement, et c'est la bande compacte qui prend la fente du titre.
 *
 * **Ce fichier ne peint rien.** `StoryTile` (`story-rail.tsx`) peint la loi,
 * dans les deux géographies, sur le Flux comme sur la liste — le MÊME
 * composant avec la MÊME cote. La tuile de CONVERSATION qui vivait ici
 * (`RailTile`) n'avait plus aucun appelant depuis la fusion #6080 ↔ #6103 : ses
 * témoins mesuraient une cellule qu'aucun écran ne montrait, et elle est
 * retirée avec eux.
 */

/** `AvatarContext.storyTray` — l'avatar du grand plateau. */
export const RAIL_TILE_GRANDE = 88;

/** `AvatarContext.storyTrayCompact` — l'avatar de la bande épinglée. */
export const RAIL_TILE_COMPACT = 36;

/** `ringSize = size + 6` : l'anneau déborde l'avatar de 3 px de chaque côté. */
const RING_OUTSET = 6;

/** `StoryRingCell` — la largeur du libellé sous l'anneau du grand plateau. */
const GRANDE_LABEL_FRAME = 96;

/**
 * La fente du titre de l'en-tête (`min-h-11`, `components/rail-title-slot.tsx`)
 * — la bande y est `absolute` et ne pousse rien : son anneau doit y tenir.
 */
export const RAIL_TITLE_SLOT = 44;

/** Charte, dimension 5 — cibles de 44 px au moins. */
export const MIN_TOUCH_TARGET = 44;

export const railRingBox = (size: number): number => size + RING_OUTSET;

export const railCellWidth = (size: number, showsLabel: boolean): number =>
  showsLabel ? Math.max(railRingBox(size), GRANDE_LABEL_FRAME) : railRingBox(size);

/**
 * La marge NÉGATIVE qui porte la cible tactile à 44 sans élargir la case :
 * la bande épinglée mesure 42, son lien s'étend d'un pixel de chaque côté.
 */
export const railHitPad = (cell: number): number => Math.max(0, (MIN_TOUCH_TARGET - cell) / 2);

/**
 * Le trait de l'anneau — `ringWidth` d'iOS (`MeeshyAvatar.swift:167-175`) :
 * 0,7 au grand plateau, 1,5 à la bande, DOUBLÉ pour une story non vue
 * (`lineWidth: context.ringWidth * 2`). Un trait sous le pixel ne se peint pas
 * sur tous les écrans : le plancher est le filet de 1 px.
 */
export const railStroke = (size: number, unseen: boolean): number => {
  const ringWidth = size === RAIL_TILE_GRANDE ? 0.7 : 1.5;
  return Math.max(1, Math.round(ringWidth * (unseen ? 2 : 1) * 10) / 10);
};
