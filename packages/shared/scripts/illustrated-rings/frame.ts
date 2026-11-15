import type { RingStill } from './kit.js';

/**
 * Un CADRE ILLUSTRÉ (#13960) : son anneau fixe (l'image de repli, celle de « réduire les
 * animations » et des clients antérieurs) et ses films — `back` derrière l'avatar, `front`
 * au-dessus — composés dans le repère du kit (carré de 140 unités centré sur l'avatar).
 */
export type IllustratedFrame = {
  readonly key: string;
  readonly still: RingStill;
  readonly back?: () => unknown;
  readonly front?: () => unknown;
};
