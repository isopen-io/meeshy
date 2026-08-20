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
 * `socketTranscriptionSegmentSchema` (gateway, itération 236). Un troisième
 * site — `playbackStretch` (gateway, trace d'écoute) — portait la même paire
 * `startMs/endMs` SANS l'invariant. Trois copies divergentes du même contrat,
 * et un trou : exactement le genre de duplication qu'une brique partagée
 * supprime définitivement. Un quatrième site (`CanvasV3` `TimingSchema` /
 * `bounds`, itération 237) exprime le même invariant sous d'AUTRES noms de
 * champ (`start`/`end`, en secondes) et reste hors de cette brique `*Ms`.
 *
 * La durée nulle (`endMs === startMs`, segment/intervalle ponctuel) est
 * ACCEPTÉE — la borne est `>=`, jamais `>` : décision produit gelée par
 * l'itération 234.
 */
export const isMsRangeOrdered = (range: {
  readonly startMs: number;
  readonly endMs: number;
}): boolean => range.endMs >= range.startMs;

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
