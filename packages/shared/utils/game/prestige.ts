/**
 * LE PRESTIGE (#9389) — une boucle neuve, offerte à partir du niveau 100 (un million de points et
 * ses dix étapes depuis #9706).
 * `docs/product/jeu-meeshy-conception.html` § II.2.
 *
 * Au niveau 100, on peut passer en Prestige — ou continuer à monter, le
 * Prestige reste FACULTATIF (#9688) : le niveau retombe à 1 (la poche ET le cycle d'étincelles
 * repartent de zéro, #10846), une étoile se pose sur l'anneau (cinq au plus), le
 * joueur gagne `GLORY_POINTS.prestige` de Gloire et un trophée de Prestige numéroté.
 *
 * **Ce que le passage ne touche PAS** : le trésor (les Meeshes gardées), la
 * Gloire acquise et le rang, les badges, la Flamme — et, depuis les étincelles (#10846), le TOTAL
 * ACCUMULÉ À VIE et le NIVEAU MAX À VIE, qui ne bougent pas. C'est pourquoi le résultat
 * ne porte que ce qui CHANGE : le score, le niveau, son record de cycle et l'étoile.
 *
 * ## Décision du porteur (2026-10-16) — le niveau max à vie survit, les ligues restent ouvertes
 *
 * La « DÉCISION PORTEUR ATTENDUE » (conformité G-5) est tranchée : le niveau MAX à vie survit au
 * prestige (`User.levelMaxLifetime`). Les ligues (niveau 10) et le duo (niveau 20) lisent ce max à
 * vie : un prestige ne les ferme plus. Le record de CYCLE (`levelRecord`), lui, retombe à 1 avec le
 * niveau — c'est ce que les clients publiés rejouent sur `game.vectors.json` (`levelRecordAfter: 1`).
 * Le Vent arrière, qu'il éteignait, est éteint pour de bon (`boosts.ts`).
 */

import { GAME_LEVEL_MIN, GAME_PRESTIGE_LEVEL, GAME_PRESTIGE_MAX, levelForUnlocks } from './levels.js';
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

/**
 * LE RECORD DU CYCLE QUE LE PRESTIGE CLÔT (#10911) — le plus haut du record gravé et du niveau, jamais sous le niveau
 * du Prestige (le passage l'exige). Gardé, cycle après cycle, dans `User.prestigeLevelRecords` : c'est lui qui dit combien
 * de fois un niveau a été atteint, tous cycles confondus (`levelReachCount`).
 */
export const closedCycleRecord = (params: { readonly levelRecord: number | null; readonly level: number }): number =>
  Math.max(GAME_PRESTIGE_LEVEL, Math.trunc(params.levelRecord ?? 0), Math.trunc(params.level));

/**
 * Les records des cycles clos après un Prestige — l'optimiste rejoue l'écriture de la passerelle. Devant un serveur qui
 * ne les sert pas (`undefined`), rien ne s'invente : la loi relit alors chaque cycle clos au niveau du Prestige.
 */
export const pastCycleRecordsAfterPrestige = (params: {
  readonly pastCycleRecords: readonly number[] | undefined;
  readonly levelRecord: number | null;
  readonly level: number;
}): readonly number[] | undefined =>
  params.pastCycleRecords === undefined ? undefined : [...params.pastCycleRecords, closedCycleRecord(params)];

/**
 * Le niveau 100 demande un million de points ET ses dix étapes (#9706) : le record prouve les étapes
 * (`levelForUnlocks`), le score en poche prouve les points.
 */
export function prestigeTransition(params: {
  readonly score: number;
  readonly prestige: number;
  readonly levelRecord: number | null;
}): PrestigeTransition {
  const stars = Number.isFinite(params.prestige) ? Math.max(0, Math.trunc(params.prestige)) : 0;
  if (stars >= GAME_PRESTIGE_MAX) return { allowed: false, reason: 'at-maximum' };
  if (levelForUnlocks({ score: params.score, levelRecord: params.levelRecord }) < GAME_PRESTIGE_LEVEL) return { allowed: false, reason: 'level-too-low' };
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
