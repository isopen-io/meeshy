/**
 * LE PROGRÈS D'UN LIEN (#13932) : ce que les routes de cercles (`GET /relations`)
 * serviront en `progress` et `eligibleFor`, lu d'UN seul balayage de l'agrégat.
 *
 * - la série hebdomadaire : semaines actives d'affilée, éligibilité à Proche (4)
 *   ou à Sang (12, comptées depuis l'entrée en Proche) ;
 * - la Connaissance : ce qui manque encore, sens par sens.
 *
 * LECTURE SEULE. L'éligibilité PERMET la demande ; elle n'élève jamais, et une
 * série brisée ne baisse rien : le niveau atteint est conservé (le niveau est une
 * entrée, c'est `friendship.ts` qui le sert).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';
import { addUtcDays, isoWeekStart } from '@meeshy/shared/utils/iso-week';
import { relationThresholdsFor, type RelationThresholds } from '@meeshy/shared/utils/relation-levels';
import {
  acquaintanceProgress,
  pairDayFromRow,
  relationSeriesProgress,
  type AcquaintanceProgress,
  type RelationSeriesProgress,
} from '@meeshy/shared/utils/relation-interactions';

/** Douze semaines de Sang plus la semaine courante et une marge : sous la conservation de 120 jours. */
export const PROGRESS_LOOKBACK_WEEKS = 14;

export type RelationProgress = {
  readonly series: RelationSeriesProgress;
  readonly acquaintance: AcquaintanceProgress;
};

export async function loadRelationProgress(
  prisma: Pick<PrismaClient, 'pairInteractionDay'>,
  params: {
    userA: string;
    userB: string;
    level: RelationLevel;
    levelSince: Date | null;
    now: Date;
    thresholds?: RelationThresholds;
  },
): Promise<RelationProgress> {
  const pair = relationPairKey(params.userA, params.userB);
  const thresholds = params.thresholds ?? relationThresholdsFor(process.env.DEPLOY_ENV ?? process.env.NODE_ENV);
  const rows = await prisma.pairInteractionDay.findMany({
    where: {
      userLowId: pair.userLowId,
      userHighId: pair.userHighId,
      day: { gte: addUtcDays(isoWeekStart(params.now), -7 * PROGRESS_LOOKBACK_WEEKS) },
    },
  });
  const days = rows.map((row) => pairDayFromRow(row as Record<string, unknown>));
  return {
    series: relationSeriesProgress({ days, now: params.now, level: params.level, levelSince: params.levelSince, thresholds }),
    acquaintance: acquaintanceProgress({ days, now: params.now, thresholds }),
  };
}

export type RelationProgressTarget = {
  readonly otherId: string;
  readonly level: RelationLevel;
  readonly levelSince: Date | null;
};

/**
 * Le progrès de TOUS les liens d'une personne en UN balayage (#13933) : la liste
 * « Mes cercles » ne paie pas une requête par lien. Même calcul que
 * {@link loadRelationProgress}, sur les lignes de l'agrégat groupées par partenaire.
 */
export async function loadProgressByPartner(
  prisma: Pick<PrismaClient, 'pairInteractionDay'>,
  params: { userId: string; targets: ReadonlyArray<RelationProgressTarget>; now: Date; thresholds?: RelationThresholds },
): Promise<ReadonlyMap<string, RelationProgress>> {
  if (params.targets.length === 0) return new Map();
  const thresholds = params.thresholds ?? relationThresholdsFor(process.env.DEPLOY_ENV ?? process.env.NODE_ENV);
  const rows = await prisma.pairInteractionDay.findMany({
    where: {
      OR: [{ userLowId: params.userId }, { userHighId: params.userId }],
      day: { gte: addUtcDays(isoWeekStart(params.now), -7 * PROGRESS_LOOKBACK_WEEKS) },
    },
  });
  const partnerOf = (row: Record<string, unknown>): string =>
    String(row.userLowId === params.userId ? row.userHighId : row.userLowId);
  const byPartner = rows.reduce((groups, row) => {
    const partner = partnerOf(row as Record<string, unknown>);
    return groups.set(partner, [...(groups.get(partner) ?? []), pairDayFromRow(row as Record<string, unknown>)]);
  }, new Map<string, ReturnType<typeof pairDayFromRow>[]>());

  return new Map(
    params.targets.map(({ otherId, level, levelSince }) => {
      const days = byPartner.get(otherId) ?? [];
      return [
        otherId,
        {
          series: relationSeriesProgress({ days, now: params.now, level, levelSince, thresholds }),
          acquaintance: acquaintanceProgress({ days, now: params.now, thresholds }),
        },
      ] as const;
    }),
  );
}
