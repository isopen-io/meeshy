/**
 * LA FIDÉLITÉ (#10390) — les paliers que l'ancienneté d'un compte atteint.
 *
 * L'ancienneté se compte en JOURS CIVILS dans le fuseau du compte, de son jour
 * de création (`User.createdAt`) à aujourd'hui : la même horloge que la série.
 * Chaque palier atteint se paie une fois, par le seau `loyalty:<jours>` — le
 * paiement lui-même est celui des séries (`EngagementStreaks.payBonus`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  civilDaysBetween,
  reachedLoyaltyTiers,
  type EngagementStreakTier,
} from '@meeshy/shared/types/engagement-act-streaks';
import { civilDayInTimezone, civilDayKey } from './civilDay';

/** Le seau anti-rejeu d'un palier de fidélité. */
export const loyaltyBucket = (days: number): string => `loyalty:${days}`;

/** L'ancienneté, en jours civils, d'un compte créé à `createdAt`, au jour `today` (`YYYY-MM-DD`). */
export function accountAgeDays(createdAt: Date, timezone: string | null, today: string): number {
  const age = civilDaysBetween(civilDayKey(civilDayInTimezone(createdAt, timezone)), today);
  return Number.isFinite(age) ? Math.max(0, age) : 0;
}

/** Les paliers de fidélité que ce compte atteint aujourd'hui — vide sans palier ou sans date de création. */
export async function dueLoyaltyTiers(params: {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly userId: string;
  readonly tiers: readonly EngagementStreakTier[];
  readonly today: string;
  readonly timezone: string | null;
}): Promise<readonly EngagementStreakTier[]> {
  if (params.tiers.length === 0) return [];
  const account = await params.prisma.user.findUnique({ where: { id: params.userId }, select: { createdAt: true } });
  const createdAt = account?.createdAt;
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return [];
  return reachedLoyaltyTiers(params.tiers, accountAgeDays(createdAt, params.timezone, params.today));
}
