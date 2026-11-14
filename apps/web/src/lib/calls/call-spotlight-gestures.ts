import type { SpotlightChoice } from './call-spotlight';

/**
 * **LES GESTES DE LA UNE D'UN GROUPE** (#8392, #9098) — ce que la GRILLE fait
 * de la règle de `call-spotlight.ts` : nommer un choix (un membre, moi, la
 * grille) et zoomer l'écran partagé à la une. Séparés de la règle parce que
 * seule la grille, chargée à part (#17650), les emploie : l'écran d'appel ne
 * lit que la règle. Le zoom de l'écran partagé vit à part (`screen-zoom.ts`) : il part avec son crochet, dans l'écran.
 */

export const chooseMember = (userId: string): SpotlightChoice => ({ kind: 'member', userId });

export const chooseSelf = (): SpotlightChoice => ({ kind: 'self' });

export const chooseGrid = (dismissedSharer: string | null): SpotlightChoice => ({ kind: 'grid', dismissedSharer });
