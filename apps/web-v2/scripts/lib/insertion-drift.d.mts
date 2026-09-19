/**
 * Les types du module voisin — même motif que `check-media-grid.d.mts`,
 * `browser.d.mts` et `await-fact.d.mts` : plusieurs runtimes consomment le
 * `.mjs` (node pour les gates, bun pour les témoins), seul `tsc` lit ces
 * déclarations. Sans elles, `bun test` reste VERT et `tsc` rougit seul — les
 * deux couvrent des ensembles disjoints dans ce paquet.
 */

/**
 * Le verdict de dérive d'insertion — un type SOMME, jamais un nombre avec une
 * sentinelle (#7110).
 *
 * `-1` ou `NaN` se compareraient, donc se compareraient MAL : `NaN <= 2` rend
 * `false` sans le dire, et `Math.max(0, NaN)` rend `NaN`. La somme force
 * l'appelant à traiter la branche « la mesure n'a pas eu lieu », qui est tout
 * l'objet de l'issue.
 */
export type DériveDInsertion =
  | { readonly genre: 'mesurée'; readonly max: number; readonly pages: number }
  | { readonly genre: 'non-mesurable'; readonly perdues: number; readonly pages: number }
  | { readonly genre: 'aucune-page'; readonly pages: number };

/**
 * Agrège les tirages de pages en un verdict.
 *
 * Une ancre perdue (`drift: null`) rend le lot ENTIER non mesurable : le
 * maximum des tirages restants répondrait à une autre question, et c'est
 * précisément celle qui rassure à tort.
 */
export declare function insertionDrift(
  pulls: ReadonlyArray<{ readonly drift: number | null }>,
): DériveDInsertion;

/** La ligne imprimée pour ce verdict — un chiffre en pixels SEULEMENT sur une mesure. */
export declare function driftLine(verdict: DériveDInsertion): string;
