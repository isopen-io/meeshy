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

/** Les points d'un compte par jour d'une semaine : `{ '2026-10-13': 40 }`. */
export type DayPoints = Readonly<Record<string, number>>;

/**
 * Le total d'un compte pour la semaine. `before` coupe à la FIN DE LA VEILLE de
 * ce jour (exclu) : c'est la granularité du jour qu'on sert quand le compte a
 * coupé sa présence — l'activité d'aujourd'hui n'y est pas encore.
 */
export function totalOfDays(days: DayPoints | undefined, options: { readonly before?: string } = {}): number {
  return Object.entries(days ?? {})
    .filter(([dayKey]) => options.before === undefined || dayKey < options.before)
    .reduce((sum, [, points]) => sum + points, 0);
}

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

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

  /** Un gain de `points` points : le jour et la semaine du compte montent d'autant. */
  async record(userId: string, points: number, now: Date = new Date()): Promise<void> {
    if (!Number.isInteger(points) || points <= 0) return;
    const timezone = await this.timezone(userId);
    const weekKey = weekKeyOfInstant(now, timezone);
    const dayKey = dayKeyOf(now, timezone);
    const write = () =>
      this.prisma.gameWeekPoints.upsert({
        where: { userId_weekKey_dayKey: { userId, weekKey, dayKey } },
        create: { userId, weekKey, dayKey, points },
        update: { points: { increment: points } },
        select: { id: true },
      });
    try {
      await write();
    } catch (err) {
      // Deux premiers gains concurrents du jour : sur MongoDB, l'upsert qui perd la
      // création lève P2002 au lieu de basculer sur la mise à jour. Le rejouer
      // trouve la ligne et incrémente — sans quoi le gain se perdrait en silence.
      if (!isP2002(err)) throw err;
      await write();
    }
  }

  /** Les points par jour d'une semaine pour plusieurs comptes (absent = aucun jour). */
  async weekDays(weekKey: string, userIds: readonly string[]): Promise<Map<string, DayPoints>> {
    const ids = [...new Set(userIds)];
    const result = new Map<string, Record<string, number>>();
    if (ids.length === 0) return result;
    const rows = await this.prisma.gameWeekPoints.findMany({
      where: { weekKey, userId: { in: ids } },
      select: { userId: true, dayKey: true, points: true },
      take: ids.length * 8,
    });
    for (const row of rows) result.set(row.userId, { ...(result.get(row.userId) ?? {}), [row.dayKey]: row.points });
    return result;
  }

  /** Le total de la semaine, un nombre par compte (absent = 0). */
  async weekPoints(weekKey: string, userIds: readonly string[]): Promise<Record<string, number>> {
    const days = await this.weekDays(weekKey, userIds);
    return Object.fromEntries([...days.entries()].map(([userId, perDay]) => [userId, totalOfDays(perDay)]));
  }
}
