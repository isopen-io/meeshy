/**
 * Le temps pendant lequel le bandeau rappelé reste à l'écran (#17366) — « quelques secondes », bien moins que
 * l'ouverture. Module à part de `banner-recall.ts` : la coquille web le lit avant le premier pixel, sans emporter les
 * lois du Jeu (`attention`, `acts-ring`) que la loi du rappel compare.
 */
export const PLAYER_BANNER_RECALL_MS = 5_000;
