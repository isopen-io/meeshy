/**
 * LA CONSTELLATION ET LA PROCHAINE BASCULE, MISES EN VECTEURS (#10053, #10225).
 *
 * Même contrat que `game-vectors-law-v2.ts`, qui les déclare et les assemble : chaque cas porte `input.law`,
 * `expected` est la sortie de la loi TS, rejouée par iOS (`GameLawVectorEvaluatorConstellation.swift`) sur le miroir
 * du SDK (`GameConstellation.swift`, `GameLeague.nextWeekClose`). Sur divergence, c'est le TS qui a raison.
 */

import { constellationOf, isConstellationCosmeticKey } from '../../utils/game/constellation.js';
import { nextLeagueWeekClose } from '../../utils/game/league.js';

export type GameVectorInputConstellation =
  | { readonly law: 'constellation'; readonly collected: number }
  | { readonly law: 'constellation-key'; readonly key: string }
  | { readonly law: 'league-next-close'; readonly dayKey: string; readonly minuteOfDay: number };

export const GAME_VECTOR_LAWS_CONSTELLATION = ['constellation', 'constellation-key', 'league-next-close'] as const;

export function evaluateGameVectorConstellation(input: GameVectorInputConstellation): unknown {
  switch (input.law) {
    case 'constellation':
      return constellationOf(input.collected);
    case 'constellation-key':
      return { valid: isConstellationCosmeticKey(input.key) };
    case 'league-next-close':
      return nextLeagueWeekClose(input);
  }
}

const vector = (_label: string, input: GameVectorInputConstellation) => ({ _label, input, expected: evaluateGameVectorConstellation(input) });

export function buildGameVectorsConstellation() {
  const constellations = [0, 1, 9, 10, 11, 19, 20, 29, 30, 31, 40, 99, 100, 137, -3].map((collected) =>
    vector(`constellation pour ${collected} fragments d'étoile`, { law: 'constellation', collected }),
  );
  const keys = [
    'constellation.star-1.halo',
    'constellation.star-2.frame',
    'constellation.star-3.sparkle',
    'constellation.star-13.halo',
    'constellation.star-2.halo',
    'constellation.star-0.halo',
    'constellation.star-01.halo',
    'season-1.seal-1',
    '',
  ].map((key) => vector(`clé de constellation « ${key} »`, { law: 'constellation-key', key }));
  const closes = (
    [
      ['2026-12-16', 600],
      ['2026-12-20', 1199],
      ['2026-12-20', 1200],
      ['2026-12-20', 1439],
      ['2026-12-21', 0],
      ['2027-02-14', 1200],
    ] as const
  ).map(([dayKey, minuteOfDay]) => vector(`prochaine fermeture après ${dayKey} ${minuteOfDay}`, { law: 'league-next-close', dayKey, minuteOfDay }));
  return [...constellations, ...keys, ...closes];
}
