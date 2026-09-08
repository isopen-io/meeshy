/**
 * LE MARQUEUR D'ARMEMENT D'UN MODULE (#5139) — un site unique pour les
 * modules de participation qui n'ont pas de marqueur d'état plus précis à
 * offrir (`.etat[data-etat]` pour un module qui tient un socket — voir
 * `participate.ts`/`liste.ts`, `data-brouillon` pour le composer, dont le
 * mot appartient au domaine du brouillon, pas à une convention).
 *
 * `data-participation="<nom>"` est posé par le SERVEUR dès le premier pixel
 * et dit quel module l'écran ATTEND ; il ne dit jamais que ce module a fini
 * de câbler ses écouteurs. Un témoin qui n'observe que sa présence complétait
 * jusqu'ici par un `waitForTimeout` — un pari sur la vitesse de la machine,
 * tenu en local et perdu sur un runner chargé (mesuré, #5139).
 *
 * `signaleArme` pose ce marqueur en DERNIÈRE ligne de l'amorçage d'un module,
 * une fois ses écouteurs (gestes, formulaires, garde-fous) câblés — jamais
 * avant, jamais comme promesse de connexion réseau : un module qui n'ouvre
 * aucun socket (contacts, feed, liens, commentaires) s'arme sans attendre
 * personne, exactement comme il s'utilise hors ligne.
 */
export const ATTRIBUT_ARME = 'data-arme';

export const signaleArme = (main: HTMLElement): void => {
  main.setAttribute(ATTRIBUT_ARME, '1');
};
