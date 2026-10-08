/**
 * LES FAITS DES ÉTAPES DES NIVEAUX (#9706) — ce que la passerelle lit pour juger les dix étapes
 * (`@meeshy/shared/utils/game/level-steps`) : les Meeshes frappées à vie et le record de Flamme (sur la
 * ligne du compte), les missions du jour accomplies (comptées jusqu'à la plus grande cible, jamais au-delà),
 * la Gloire et son rang. Trois lectures indexées, en parallèle, une fois par compte — jamais une par étape
 * (`GloryService.levelAccount`, `GameBlockService.build`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { LEVEL_STEP_MISSIONS_COUNTED, type LevelStepFacts } from '@meeshy/shared/utils/game/level-steps';

/** Les champs du compte que les étapes lisent, à joindre au `select` de l'appelant. */
export const LEVEL_STEP_USER_SELECT = { meeshMintedLifetime: true, longestStreakDays: true } as const;

/**
 * Les missions du jour accomplies à vie, comptées jusqu'à la plus grande cible des étapes. ASYNCHRONE de
 * bout en bout : posée dans un `Promise.all`, une levée synchrone abandonnerait ses voisines déjà lancées,
 * dont le rejet partirait sans écouteur et ferait tomber le processus.
 */
export const countMissionsDone = async (db: Pick<PrismaClient, 'dailyMission'>, userId: string): Promise<number> =>
  db.dailyMission.count({ where: { userId, completedAt: { not: null } }, take: LEVEL_STEP_MISSIONS_COUNTED });

/** Les faits des étapes depuis ce qu'on a déjà lu : la ligne du compte, les missions, la Gloire. */
export const levelStepFactsOf = (params: {
  readonly row: { readonly meeshMintedLifetime?: number | null; readonly longestStreakDays?: number | null } | null;
  readonly missionsDone: number;
  readonly glory: number;
  readonly mythic?: boolean;
}): LevelStepFacts => {
  const standing = gloryStanding({ glory: params.glory, mythic: params.mythic === true });
  return {
    minted: params.row?.meeshMintedLifetime ?? 0,
    missionsDone: params.missionsDone,
    flameRecord: params.row?.longestStreakDays ?? 0,
    glory: standing.glory,
    rank: standing.rank,
  };
};
