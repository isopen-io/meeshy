import { ephemeralBurnFrontDirection, ephemeralBurnWind } from '@meeshy/shared/utils/ephemeral-burn';

/** Le sens où file le front, à l'écran : le feu part du bord d'où vient le vent par défaut. */
export type BurnFront = 'left' | 'right';

/**
 * Le web ne lit aucun capteur (aucune demande d'autorisation au moment d'une
 * destruction) : le vent est celui que la loi donne au CÔTÉ de la bulle. Le
 * côté est celui de l'ÉCRAN, si bien qu'une interface de droite à gauche
 * l'inverse.
 */
export function burnFrontOf(input: { readonly isMine: boolean; readonly rtl: boolean }): BurnFront {
  const onTheRight = input.isMine !== input.rtl;
  return ephemeralBurnFrontDirection(ephemeralBurnWind(null, onTheRight ? 'mine' : 'theirs')) === 1 ? 'right' : 'left';
}
