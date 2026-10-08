/**
 * LE PRESTIGE (#9389) — une boucle neuve, offerte à partir du niveau 100.
 * `docs/product/jeu-meeshy-conception.html` § II.2.
 *
 * Au niveau 100, on peut passer en Prestige — ou continuer à monter, le
 * Prestige reste FACULTATIF (#9688) : le niveau retombe à 1 (le score
 * en poche repart de zéro), une étoile se pose sur l'anneau (cinq au plus), le
 * joueur gagne `GLORY_POINTS.prestige` de Gloire et un trophée de Prestige numéroté.
 *
 * **Ce que le passage ne touche PAS** : le trésor (les Meeshes gardées), la
 * Gloire acquise et le rang, les badges, la Flamme. C'est pourquoi le résultat
 * ne porte que ce qui CHANGE : le score, le niveau, son record et l'étoile.
 *
 * Le niveau RECORD retombe à 1 avec le niveau : sinon le Vent arrière
 * (+25 % « jusqu'à revenir au niveau record ») resterait actif sur les cent
 * niveaux de la nouvelle boucle.
 */

import { GAME_LEVEL_MIN, GAME_PRESTIGE_LEVEL, GAME_PRESTIGE_MAX, NO_LEVEL_CAP, levelFromScore } from './levels.js';
import { GLORY_POINTS } from './glory.js';
import { prestigeTrophy, trophyKey } from './trophies.js';

export type PrestigeTransition =
  | {
      readonly allowed: true;
      readonly prestigeAfter: number;
      readonly scoreAfter: 0;
      readonly levelAfter: 1;
      readonly levelRecordAfter: 1;
      readonly gloryGained: number;
      readonly trophyKey: string;
    }
  | { readonly allowed: false; readonly reason: 'level-too-low' | 'at-maximum' };

export function prestigeTransition(params: { readonly score: number; readonly prestige: number }): PrestigeTransition {
  const stars = Number.isFinite(params.prestige) ? Math.max(0, Math.trunc(params.prestige)) : 0;
  if (stars >= GAME_PRESTIGE_MAX) return { allowed: false, reason: 'at-maximum' };
  // Tout plafond de rang vaut au moins 499 : la lecture sans plafond tranche le seuil 100 à l'identique.
  if (levelFromScore(params.score, NO_LEVEL_CAP) < GAME_PRESTIGE_LEVEL) return { allowed: false, reason: 'level-too-low' };
  const prestigeAfter = stars + 1;
  return {
    allowed: true,
    prestigeAfter,
    scoreAfter: 0,
    levelAfter: GAME_LEVEL_MIN,
    levelRecordAfter: GAME_LEVEL_MIN,
    gloryGained: GLORY_POINTS.prestige,
    trophyKey: trophyKey(prestigeTrophy(prestigeAfter)),
  };
}
