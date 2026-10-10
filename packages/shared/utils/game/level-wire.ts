/**
 * LES NIVEAUX SUR LE FIL (#9688) — une composition, que la passerelle sert (`buildGameBlock`) et que
 * les clients rejouent en optimiste. Les champs d'hier gardent l'ANCIENNE loi (niveau borné à 100, dix
 * paliers), la seule que les clients publiés décodent ; la lecture ouverte par le rang voyage dans
 * `ladder`. Module léger : il n'importe que la loi des niveaux.
 */

import { canPrestige, legacyLevel, legacyLevelProgress, levelProgress, recordLevel, type LevelCap } from './levels.js';
import { levelStepGate, nextLevelStep, type LevelStepFacts } from './level-steps.js';
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
    // Jamais négatif (#9706) : une frappe qui fait une étape fait MONTER, et un ancien client décode ce champ en entier positif.
    levelsLost: Math.max(0, legacyBefore - legacyAfter),
    ladder: { levelBefore: preview.levelBefore, levelAfter: preview.levelAfter, levelsLost: preview.levelsLost },
  };
};

/**
 * Le niveau sur le fil (#9688) — UNE composition, que la passerelle sert et que les clients rejouent en
 * optimiste : les champs d'hier sous l'ancienne loi, la lecture ouverte par le rang dans `ladder`.
 *
 * Les étapes (#9706) retiennent les DEUX lectures : un ancien client lit le niveau servi, borné à 100,
 * jamais celui des seuls points. `ladder` dit en plus si le niveau attend une étape (`held`), laquelle
 * vient (`step`), et les compteurs qui la jugent (`steps`), pour que l'optimiste rejoue la même loi.
 * Sans faits (`steps: null`), rien ne retient : la lecture d'un serveur d'avant les étapes.
 */
export function levelOnTheWire(params: {
  readonly score: number;
  readonly levelCap: LevelCap;
  readonly levelRecord: number | null;
  readonly prestige: number;
  readonly steps: LevelStepFacts | null;
}): GameLevel {
  const gate = levelStepGate(params.steps);
  const progress = levelProgress(params.score, params.levelCap, gate);
  const legacy = legacyLevelProgress(params.score, gate);
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
      held: progress.held,
      step: nextLevelStep(progress.level, params.steps),
      steps:
        params.steps === null
          ? null
          : { minted: params.steps.minted, missionsDone: params.steps.missionsDone, flameRecord: params.steps.flameRecord },
    },
  };
}
