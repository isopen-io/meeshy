/**
 * LE COFFRE DU JOUR (#9373) — déterministe par utilisateur et par jour.
 * `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * 60 à 200 points, un fragment de cosmétique (1 chance sur 6), un gel de
 * Flamme (1 sur 20). Les probabilités s'affichent AVANT l'ouverture ; jamais de
 * Meesh, aucune valeur monétaire.
 */

import { seededRng } from './day-prng.js';

export const CHEST_ODDS = {
  minPoints: 60,
  maxPoints: 200,
  fragment: 1 / 6,
  freeze: 1 / 20,
} as const;

export type DailyChest = {
  readonly points: number;
  readonly fragment: boolean;
  readonly freeze: boolean;
};

export function dailyChest(params: { readonly userId: string; readonly dayKey: string }): DailyChest {
  const rng = seededRng({ ...params, salt: 'chest' });
  const span = CHEST_ODDS.maxPoints - CHEST_ODDS.minPoints + 1;
  return {
    points: CHEST_ODDS.minPoints + Math.floor(rng() * span),
    fragment: rng() < CHEST_ODDS.fragment,
    freeze: rng() < CHEST_ODDS.freeze,
  };
}
