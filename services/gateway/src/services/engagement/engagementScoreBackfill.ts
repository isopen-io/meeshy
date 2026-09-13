/**
 * Rattrapage de `User.engagementScore` — #5742.
 *
 * `updateEngagementScore` écrivait par `$inc` atomique sur un champ qui peut
 * valoir `null` (pas seulement ABSENT) dès la première activité créditée —
 * corrigé dans `EngagementService`, mais neuf comptes ont déjà ce champ figé
 * à `null` en production. Ce module recalcule, pour tout compte dont le
 * champ N'EST PAS UN NOMBRE, `Σ(EngagementCounter.count × poids de son axe)`
 * — la même somme que `recordActivity` aurait accumulée sans le défaut.
 *
 * Les paliers `LEVEL_THRESHOLDS` déjà franchis par le score corrigé sont
 * gravés en silence (`EngagementMilestone`, type `level`) sans notification :
 * un « Niveau 3 atteint ! » poussé des mois après le fait ne veut rien dire,
 * et sans cette écriture l'écran « Progression » d'un compte rattrapé
 * afficherait un score exact mais un historique de paliers incomplet.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ENGAGEMENT_AXIS_WEIGHTS,
  LEVEL_THRESHOLDS,
  levelMilestoneKey,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export type EngagementScoreBackfillCorrection = {
  userId: string;
  from: unknown;
  to: number;
};

export type EngagementScoreBackfillOptions = {
  /** Sans effet par défaut : rien n'est écrit tant que `apply` n'est pas `true`. */
  apply: boolean;
  onCorrect?: (correction: EngagementScoreBackfillCorrection) => void;
};

export type EngagementScoreBackfillReport = {
  /** Comptes portant au moins un `EngagementCounter` — le seul périmètre où ce défaut peut exister. */
  scanned: number;
  /** Comptes dont le champ n'était pas un nombre valide, et dont le score a été recalculé. */
  corrected: number;
  /** Comptes déjà sur un score numérique valide — laissés intacts, quelle que soit sa valeur. */
  alreadyValid: number;
};

/**
 * Recalcule `engagementScore` pour tout compte dont le champ n'est pas un
 * nombre valide, à partir de ses `EngagementCounter`. N'écrit rien tant que
 * `options.apply` n'est pas `true` — appeler à blanc d'abord.
 */
export async function backfillEngagementScores(
  prisma: PrismaClient,
  options: EngagementScoreBackfillOptions,
): Promise<EngagementScoreBackfillReport> {
  const counters = await prisma.engagementCounter.findMany({
    select: { userId: true, axisKey: true, count: true },
  });

  const expectedScoreByUser = new Map<string, number>();
  for (const counter of counters) {
    const weight = ENGAGEMENT_AXIS_WEIGHTS[counter.axisKey as EngagementAxisKey] ?? 0;
    const previous = expectedScoreByUser.get(counter.userId) ?? 0;
    expectedScoreByUser.set(counter.userId, previous + counter.count * weight);
  }

  let corrected = 0;
  let alreadyValid = 0;

  for (const [userId, expectedScore] of expectedScoreByUser) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { engagementScore: true } });
    const current: unknown = user?.engagementScore;

    if (isValidScore(current)) {
      alreadyValid += 1;
      continue;
    }

    options.onCorrect?.({ userId, from: current, to: expectedScore });
    corrected += 1;

    if (!options.apply) continue;

    await prisma.user.update({ where: { id: userId }, data: { engagementScore: expectedScore } });
    await gravePaliersEnSilence(prisma, userId, expectedScore);
  }

  return { scanned: expectedScoreByUser.size, corrected, alreadyValid };
}

/** Grave chaque palier `LEVEL_THRESHOLDS` déjà franchi par `score`, sans notifier — anti-rejeu par contrainte unique. */
async function gravePaliersEnSilence(prisma: PrismaClient, userId: string, score: number): Promise<void> {
  const reachedThresholds = LEVEL_THRESHOLDS.filter((threshold) => threshold <= score);
  for (const threshold of reachedThresholds) {
    try {
      await prisma.engagementMilestone.create({
        data: { userId, milestoneType: 'level', milestoneKey: levelMilestoneKey(threshold) },
      });
    } catch (err) {
      if (isP2002(err)) continue;
      throw err;
    }
  }
}
