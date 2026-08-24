/**
 * Invariant temporel PARTAGÉ pour toute paire `(startMs, endMs)` exprimant un
 * intervalle en millisecondes : la borne haute ne peut jamais précéder la borne
 * basse. Déclaré UNE SEULE FOIS ici — prédicat, message et `path` — pour que
 * chaque schéma qui porte un tel couple applique le MÊME contrat sans en
 * recopier ni le raisonnement ni le texte.
 *
 * Contexte (dette refermée à l'itération 238) : cet invariant a été re-posé
 * verbatim, site par site, à mesure que le défaut était découvert —
 * `transcriptionSegmentSchema` (shared, itération 234),
 * `socketTranscriptionSegmentSchema` (gateway, itération 236). Deux copies
 * du même contrat : exactement le genre de duplication qu'une brique partagée
 * supprime définitivement.
 *
 * Un site voisin exprime le MÊME invariant sous d'AUTRES noms de champ :
 * `CanvasV3` `TimingSchema` / `bounds` (itération 237) porte `start`/`end` en
 * secondes — hors de cette brique, qui ne parle que de `startMs`/`endMs`.
 *
 * La durée nulle (`endMs === startMs`, segment/intervalle ponctuel) est
 * ACCEPTÉE par {@link isMsRangeOrdered} — la borne est `>=`, jamais `>` :
 * décision produit gelée par l'itération 234. Le régime STRICT, où une durée
 * nulle est REFUSÉE, a sa propre brique jumelle : {@link isMsRangeStrictlyOrdered}.
 */
export const isMsRangeOrdered = (range: {
  readonly startMs: number;
  readonly endMs: number;
}): boolean => range.endMs >= range.startMs;

/**
 * Variante STRICTE de {@link isMsRangeOrdered} : la borne haute doit dépasser la
 * borne basse (`endMs > startMs`, PAS `>=`). Une durée nulle est REFUSÉE.
 *
 * Elle sert le domaine de la LECTURE MÉDIA, où une durée nulle n'est pas un
 * intervalle ponctuel admissible mais un non-événement : « une écoute réellement
 * CONTINUE » (`services/gateway/src/utils/playback-trace.ts`) ne peut pas durer
 * zéro milliseconde. Déclarée UNE SEULE FOIS ici — comme sa jumelle non stricte —
 * pour que ses trois consommateurs jusqu'ici indépendants (le gate de wire
 * `playbackStretch` dans `validation/messages-schemas.ts`, et les filtres
 * `isUsable` de `utils/playback-trace.ts` et `utils/playback-segments.ts`, que
 * leurs propres commentaires décrivaient déjà comme des « miroirs explicites »
 * l'un de l'autre) appliquent le MÊME prédicat sans le recopier.
 *
 * Ne PAS confondre les deux régimes : `>=` pour un segment/intervalle qui peut
 * être ponctuel (transcription, canvas), `>` pour une écoute qui doit avoir eu
 * une durée. Le choix appartient au domaine, pas au hasard du site.
 */
export const isMsRangeStrictlyOrdered = (range: {
  readonly startMs: number;
  readonly endMs: number;
}): boolean => range.endMs > range.startMs;

/**
 * Paramètres de `.refine()` associés à {@link isMsRangeOrdered} — le message et
 * le `path` que TOUS les sites partagent, pour qu'une erreur d'intervalle
 * inversé se lise à l'identique partout (`endMs`, pointé sur la borne haute).
 * Zod copie `path` dans l'issue produite, il ne mute jamais cet objet : le
 * partager entre plusieurs schémas est sûr.
 */
export const MS_RANGE_REFINEMENT: {
  message: string;
  path: (string | number)[];
} = {
  message: 'endMs must be greater than or equal to startMs',
  path: ['endMs'],
};
