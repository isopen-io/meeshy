import { preloadable } from '@/lib/view/preloadable';

import type { ScenePlayerProps } from './scene-player';

/**
 * LE MOTEUR DE SCÈNE, PARTAGÉ PAR LA CARTE DU FIL ET LA VISIONNEUSE (#8598) —
 * le même chunk qu'avant (`scene-player`, D-79), mais UN seul composant
 * paresseux : quand la carte l'a chargé, la page scène plein écran le rend au
 * premier rendu, jamais une image vide le temps d'un `Suspense`.
 */
export const lazyScenePlayer = preloadable<ScenePlayerProps>(() => import('./scene-player'));
