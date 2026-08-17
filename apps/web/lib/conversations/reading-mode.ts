/**
 * Les lentilles retenues par le verdict des modes.
 *
 * Source : `docs/design/2026-08-15-conversation-modes-verdict.html` (vol. 3).
 * Dix propositions, trois survivantes, une en sursis. Côté lecture d'un fil il
 * reste DEUX crans de zoom sémantique :
 *
 * - `focal`  — mode par défaut. Rangées plates, perspective au défilement, une
 *              seule carte : le message au point.
 * - `script` — la MÊME rangée plate, densité uniforme, sans perspective. C'est
 *              une typographie, pas un mode : le bouton `Aa` du volume 4.
 * - `bubble` — la vue à bulles historique. Ce n'est pas un mode non plus :
 *              c'est l'ancien rendu, gardé à un tap le temps de la transition.
 *
 * `resume` (Résumé Vivant), `riviere` et `scene` n'entrent PAS ici : le Résumé
 * attend l'API observer `assist:*` côté gateway, la Rivière doit gagner son
 * procès sur prototype, et la Scène est une couche live au-dessus de tout mode
 * — c'est la couche d'appel, pas une lentille de lecture.
 */
export const READING_MODES = ['focal', 'script', 'bubble'] as const;

export type ReadingMode = (typeof READING_MODES)[number];

export const DEFAULT_READING_MODE: ReadingMode = 'focal';

/** Les deux densités de la rangée plate — ce que bascule le bouton `Aa`. */
export const FLAT_READING_MODES: readonly ReadingMode[] = ['focal', 'script'];

export function isReadingMode(value: unknown): value is ReadingMode {
  return typeof value === 'string' && (READING_MODES as readonly string[]).includes(value);
}

export function isFlatReadingMode(mode: ReadingMode): boolean {
  return FLAT_READING_MODES.includes(mode);
}

/**
 * `Aa` : Focal ↔ Script. Depuis la vue bulles héritée, on rentre dans les
 * densités plates par Focal plutôt que de laisser l'utilisateur hors des deux.
 */
export function nextDensity(mode: ReadingMode): ReadingMode {
  return mode === 'focal' ? 'script' : 'focal';
}
