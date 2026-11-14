import type { FullScreenLevel, SpotlightChoice } from './call-spotlight';

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

/** Les boutons de la capsule de la une, dans leur ordre (loi 15, U1, U2, U2b) — `GroupCallSpotlightButton` d'Android. */
export type SpotlightButton = 'grid' | 'full-screen' | 'total-full-screen' | 'exit-full-screen' | 'exit-total-full-screen';

/** « Plein écran » monte d'un niveau à chaque appui (#17961, 2026-11-14) : un écran partagé jusqu'au total, une caméra une fois. */
export const raisedFullScreen = (level: FullScreenLevel, screen: boolean): FullScreenLevel => (level === 'off' ? 'full' : screen ? 'total' : level);

/** « Quitter » (glyphe rentrer) redescend d'un niveau. */
export const loweredFullScreen = (level: FullScreenLevel): FullScreenLevel => (level === 'total' ? 'full' : 'off');

/** La capsule : « Revenir à la grille », puis le niveau suivant s'il y en a un, puis la descente d'un niveau. */
export const spotlightCapsuleButtons = (level: FullScreenLevel, screen: boolean): readonly SpotlightButton[] => {
  if (level === 'off') return ['grid', 'full-screen'];
  if (level === 'total') return ['grid', 'exit-total-full-screen'];
  return screen ? ['grid', 'total-full-screen', 'exit-full-screen'] : ['grid', 'exit-full-screen'];
};

/** Le niveau où mène un bouton de la capsule ; « Revenir à la grille » sort de tout. */
export const fullScreenLevelAfter = (button: SpotlightButton, level: FullScreenLevel, screen: boolean): FullScreenLevel => {
  if (button === 'grid') return 'off';
  return button === 'full-screen' || button === 'total-full-screen' ? raisedFullScreen(level, screen) : loweredFullScreen(level);
};

/** Le bandeau des autres reste au plein écran (U2) ; seul le plein écran total (U2b) le retire. */
export const fullScreenHidesStrip = (level: FullScreenLevel): boolean => level === 'total';
