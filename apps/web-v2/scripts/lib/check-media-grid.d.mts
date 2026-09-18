/**
 * Les types du module voisin — même motif que `browser.d.mts` et
 * `resolve-dist-dir.d.mts` : plusieurs runtimes consomment le `.mjs` (node pour
 * les gates, bun pour les témoins), seul `tsc` lit ces déclarations. Sans
 * elles, `bun test` reste VERT et `tsc` rougit seul — les deux couvrent des
 * ensembles disjoints dans ce paquet.
 *
 * Seules les trois valeurs SONDÉES par `check-media-grid.test.ts` sont
 * déclarées. `checkThreadMediaGrid` ne l'est pas : son hôte
 * (`check-thread-states.mjs`) est un `.mjs` que `tsc` ne lit pas, et déclarer
 * une signature que personne ne vérifie créerait une jumelle libre de diverger.
 */

/**
 * Le pixel composité à `(x, y)`, en triplet `[r, g, b]` — ou, quand le point
 * tombe HORS du viewport, le MOTIF du refus en clair.
 *
 * Le type SOMME est le contrat lui-même (#7048) : une sonde hors écran ne lève
 * plus (l'exception de `page.screenshot` remontait en `uncaughtException` et
 * jetait les 588 témoins déjà verts), elle rend de quoi faire rougir le témoin
 * qui l'attendait, en NOMMANT le point. Tout consommateur doit donc traiter la
 * branche chaîne — c'est ce que `near` et `loin` font pour lui.
 */
export declare function paintedAt(
  page: {
    viewportSize(): { width: number; height: number } | null;
    screenshot(options: { clip: { x: number; y: number; width: number; height: number } }): Promise<Buffer>;
    evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
  },
  x: number,
  y: number,
  quoi?: string,
): Promise<readonly number[] | string>;

/** `rgb` est-il le pixel attendu, à 6 près ? Une sonde perdue (chaîne) rend `false`. */
export declare function near(rgb: readonly number[] | string, target: readonly number[]): boolean;

/**
 * `rgb` est-il un pixel RÉELLEMENT LU et différent de la cible ?
 *
 * Ce n'est PAS `!near` : sur une sonde perdue, `!near` rend `true` et une règle
 * négative verdirait par ABSENCE DE SUJET. Les deux sens exigent une mesure.
 */
export declare function loin(rgb: readonly number[] | string, target: readonly number[]): boolean;
