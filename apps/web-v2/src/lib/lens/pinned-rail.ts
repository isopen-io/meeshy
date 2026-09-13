/**
 * LES SEUILS DE LA BANDE ÉPINGLÉE (#6103) — quand la bande épinglée de
 * `ListHeader` prend la place du titre, et quand elle le lui rend.
 *
 * `PINNED_RAIL_REVEAL_RATIO = 0` : la bande ne se révèle que lorsque le
 * grand rail est ENTIÈREMENT sorti du scrollport — miroir direct du
 * commentaire iOS sur `inlineAccessoryRevealEnd` : « the full-size trail
 * […] sits under the 64pt expanded header, so it is FULLY HIDDEN behind
 * the collapsed bar after ~148pt of travel » (`CollapsibleHeader.swift:
 * 68-72`). Un seuil non nul révélerait la bande alors qu'un fragment du
 * grand rail est encore visible — les DEUX rails à l'écran à la fois,
 * jamais ce qu'iOS montre.
 *
 * `PINNED_RAIL_RELEASE_RATIO = 0,25` : un choix WEB, faute de rampe de
 * défilement à faire correspondre. Il vaut environ un quart du grand rail
 * (≈ 30 px sur les ≈ 118 px du rail + son padding vertical, l'ordre de
 * grandeur de la course de relâchement qu'iOS étale sur ses 70 derniers
 * points de la rampe `inlineAccessoryRevealStart → inlineAccessoryRevealEnd`)
 * — assez pour ne jamais clignoter à un pixel de défilement près (la raison
 * qui avait déjà fait doubler le seuil de l'ancienne compaction sur place,
 * 48 px pour compacter contre 24 pour rouvrir, #5946), jamais nul (ce qui
 * rouvrirait exactement au même point que la fermeture).
 *
 * Ces deux constantes sont les SEULES cotes de ce fichier — la loi qui les
 * consomme (`resolveOutOfView`) reste générique, voir `view/out-of-view.ts`.
 */
export const PINNED_RAIL_REVEAL_RATIO = 0;
export const PINNED_RAIL_RELEASE_RATIO = 0.25;
