/**
 * LES POINTS DE LA SEMAINE (#9384, #9385) — le compteur que la ligue publique et
 * la ligue Amis classent. Écrit au CRÉDIT d'un gain (`EngagementGameHooks`),
 * jamais recalculé : un incrément atomique sur `(userId, weekKey)`, une seule
 * écriture sur la voie chaude.
 *
 * La semaine est celle du fuseau du compte (`leagueWeekOfMoment` : le lundi
 * local qui la commence, la fermeture du dimanche 20 h comprise) — la loi
 * vient de `@meeshy/shared/utils/game/league`, rien n'est réécrit ici. On ne
 * compte que les GAINS : un débit (la frappe) ne passe jamais par ce site.
 *
 * Le fuseau est mis en cache quelques minutes : relire le compte à chaque
 * crédit ajouterait une lecture à la voie chaude.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { leagueWeekOfMoment } from '@meeshy/shared/utils/game/league';
import { BoundedTtlCache } from '../../utils/bounded-cache';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';

/** La semaine locale (lundi) d'un instant, dans un fuseau. */
export const weekKeyOfInstant = (date: Date, timezone: string | null | undefined): string =>
  leagueWeekOfMoment({ dayKey: dayKeyOf(date, timezone), minuteOfDay: minuteOfDayInTimezone(date, timezone) });

export class GameWeekPointsRecorder {
  private readonly zones = new BoundedTtlCache<string, string | null>({ maxSize: 5000, ttlMs: 10 * 60 * 1000 });

  constructor(private readonly prisma: PrismaClient) {}

  private async timezone(userId: string): Promise<string | null> {
    const cached = this.zones.get(userId);
    if (cached !== undefined) return cached;
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const zone = row?.timezone ?? null;
    this.zones.set(userId, zone);
    return zone;
  }

  /** Un gain de `points` points : la semaine du compte monte d'autant. */
  async record(userId: string, points: number, now: Date = new Date()): Promise<void> {
    if (!Number.isInteger(points) || points <= 0) return;
    const weekKey = weekKeyOfInstant(now, await this.timezone(userId));
    await this.prisma.gameWeekPoints.upsert({
      where: { userId_weekKey: { userId, weekKey } },
      create: { userId, weekKey, points },
      update: { points: { increment: points } },
      select: { id: true },
    });
  }

  /** Les points d'une semaine pour plusieurs comptes (absent = 0). */
  async weekPoints(weekKey: string, userIds: readonly string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    const rows = await this.prisma.gameWeekPoints.findMany({
      where: { weekKey, userId: { in: [...userIds] } },
      select: { userId: true, points: true },
      take: userIds.length,
    });
    return Object.fromEntries(rows.map((row) => [row.userId, row.points]));
  }
}
