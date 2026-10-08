/**
 * LES NIVEAUX SUR LE FIL (#9688) — une composition, que la passerelle sert (`buildGameBlock`) et que
 * les clients rejouent en optimiste. Les champs d'hier gardent l'ANCIENNE loi (niveau borné à 100, dix
 * paliers), la seule que les clients publiés décodent ; la lecture ouverte par le rang voyage dans
 * `ladder`. Module léger : il n'importe que la loi des niveaux.
 */

import { canPrestige, legacyLevel, legacyLevelProgress, levelProgress, recordLevel, type LevelCap } from './levels.js';
import type { MintPreview } from './mint.js';
import type { GameLevel, GameMintPreview } from '../../types/game.js';

/**
 * La frappe sur le fil (#9688) : les champs d'hier sous l'ancienne loi (bornés à 100, que les clients
 * publiés décodent strictement), la lecture ouverte par le rang dans `ladder`.
 */
export const mintOnTheWire = (preview: MintPreview): GameMintPreview => {
  const legacyBefore = legacyLevel(preview.levelBefore);
  const legacyAfter = legacyLevel(preview.levelAfter);
  return {
    ...preview,
    levelBefore: legacyBefore,
    levelAfter: legacyAfter,
    levelsLost: legacyBefore - legacyAfter,
    ladder: { levelBefore: preview.levelBefore, levelAfter: preview.levelAfter, levelsLost: preview.levelsLost },
  };
};

/**
 * Le niveau sur le fil (#9688) — UNE composition, que la passerelle sert et que les clients rejouent en
 * optimiste : les champs d'hier sous l'ancienne loi, la lecture ouverte par le rang dans `ladder`.
 */
export function levelOnTheWire(params: {
  readonly score: number;
  readonly levelCap: LevelCap;
  readonly levelRecord: number | null;
  readonly prestige: number;
}): GameLevel {
  const progress = levelProgress(params.score, params.levelCap);
  const legacy = legacyLevelProgress(params.score);
  const record = recordLevel({ level: progress.level, previousRecord: params.levelRecord });
  return {
    level: legacy.level,
    tier: legacy.tier,
    score: legacy.score,
    floorScore: legacy.floorScore,
    nextThreshold: legacy.nextThreshold,
    pointsToNext: legacy.pointsToNext,
    progress: legacy.progress,
    record: legacyLevel(record),
    prestige: params.prestige,
    canPrestige: canPrestige({ level: progress.level, prestige: params.prestige }),
    ladder: {
      level: progress.level,
      tier: progress.tier,
      floorScore: progress.floorScore,
      nextThreshold: progress.nextThreshold,
      pointsToNext: progress.pointsToNext,
      progress: progress.progress,
      record,
      cap: progress.cap,
      isMax: progress.isMax,
    },
  };
}
