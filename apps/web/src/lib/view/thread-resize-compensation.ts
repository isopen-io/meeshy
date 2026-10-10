import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

/**
 * **UNE RANGÉE QUI COMMENCE AU-DESSUS DE L'ÉCRAN ET CHANGE DE TAILLE NE
 * DÉPLACE PAS LES RANGÉES QU'ON LIT** (#9216, #9219) — la loi du critère 4 de
 * `scripts/check-thread-virtualization.mjs`, appliquée par le virtualiseur.
 *
 * `@tanstack/virtual-core` ne compense, par défaut, une rangée DÉJÀ mesurée
 * que si elle est ENTIÈREMENT au-dessus du haut de l'écran, et jamais pendant
 * un défilement VERS LE HAUT. Les deux exceptions frappent le fil au moment
 * précis où il charge son historique — on remonte, et la page préfixée change
 * la taille de l'ancienne tête du fil : elle portait le séparateur de jour en
 * ouvrant la liste, et le PERD dès qu'un prédécesseur du même jour la précède.
 * À cheval sur le haut de l'écran, elle rétrécissait de 40 px, deux images
 * après l'insertion, et tout ce qu'on lisait remontait d'autant — à chaque
 * page, mesuré au navigateur sur la variante de banc.
 *
 * La loi retenue tient TOUT ce qui est entièrement visible : une rangée dont
 * le DÉBUT est au-dessus du haut de l'écran est compensée, qu'elle soit
 * mesurée pour la première fois ou re-mesurée, dans les deux sens de
 * défilement. Le prix est porté par la seule rangée à cheval sur le bord, dont
 * la partie visible bouge si elle grandit par le bas — jamais par les rangées
 * qu'on lit en dessous. Le fil se lit en remontant, et ce qui le fait changer
 * de taille par le haut (séparateur de jour, en-tête d'expéditeur) en est le
 * cas nominal.
 *
 * Le haut de l'écran est l'offset du virtualiseur PLUS les compensations qu'il
 * a déjà écrites dans le même lot de mesures — sa propre définition.
 */
export function compensatesResize(params: { readonly start: number; readonly viewportTop: number }): boolean {
  return params.start < params.viewportTop;
}

/** Le prédicat posé sur `virtualizer.shouldAdjustScrollPositionOnItemSizeChange`. */
export function keepReadingInPlace(item: VirtualItem, _delta: number, instance: Virtualizer<HTMLElement, Element>): boolean {
  return compensatesResize({ start: item.start, viewportTop: (instance.scrollOffset ?? 0) + instance.scrollAdjustments });
}
