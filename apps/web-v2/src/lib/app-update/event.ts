/**
 * L'ÉVÉNEMENT DE LA MISE À JOUR — SEUL, dans un module SANS dépendance (#6936).
 *
 * C'est l'API que la v2 reprend du legacy
 * (`apps/web/utils/service-worker.ts` : `notifyUpdateAvailable` le dispatche,
 * `SystemStatusBanner` l'écoute), et ses DEUX bouts vivent dans des chunks
 * différents : le magasin d'annonce est dans le SOCLE (la coquille lit son
 * portillon), le contrôleur qui inscrit le worker est CHARGÉ À LA DEMANDE après
 * la première peinture.
 *
 * Mesuré : tant que le magasin importait ce nom depuis `service-worker.ts`,
 * rolldown refusait de séparer les chunks — « INEFFECTIVE_DYNAMIC_IMPORT …
 * dynamic import will not move module into another chunk » — et tout le
 * contrôleur remontait dans la première peinture. Un nom partagé par deux
 * chunks se déclare donc chez lui, jamais chez l'un des deux.
 */
export const SW_UPDATE_AVAILABLE_EVENT = 'sw-update-available';
