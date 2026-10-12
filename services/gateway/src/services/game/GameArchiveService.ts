/**
 * CE QU'UN LIEN DU JEU OUVRE (#9947) — une saison n, passée, en cours ou future,
 * et une semaine de ligue, passée ou en cours. Lecture seule.
 *
 *  - **le calendrier d'une saison se lit par UNE fonction** (`SeasonCalendarSource.season`).
 *    Le calendrier SERVI par la base (#10016, `SeasonScheduleService`), lu par la
 *    loi partagée (`scheduledSeasonCalendar`) ; la constante en repli ;
 *  - **l'état** (passée, en cours, à venir) se lit contre MON moment : mon fuseau,
 *    la fermeture du dimanche 20 h comprise (`leagueWeekOfMoment`) ;
 *  - **rien de la présence d'autrui** : la saison sert son calendrier et MA
 *    progression, la semaine MON résultat gravé (`LeagueMembership`). Aucun
 *    pseudonyme, total ou rang d'un autre membre ne se relit ;
 *  - **une semaine purgée le dit** (`retention: 'purged'`) : la purge (`LeagueSettlement.purgeOld`)
 *    et cette lecture partagent l'horizon de `leagueRetentionHorizon`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameArchiveStatus, GameLeagueWeekArchive, GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import { LEAGUE_KEYS, leagueWeekOfMoment, type LeagueKey, type LeagueMoment } from '@meeshy/shared/utils/game/league';
import { seasonCalendar, seasonProgress, seasonTenseAt, type SeasonCalendar } from '@meeshy/shared/utils/game/season';
import { scheduledSeasonAt, scheduledSeasonCalendar } from '@meeshy/shared/utils/game/season-schedule';
import { seasonSchedule } from './SeasonScheduleService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';
import { leagueRetentionHorizon } from './LeagueSettlement';

/** La lecture du calendrier d'une saison : `null` quand le numéro n'en nomme pas une. */
export type SeasonCalendarSource = {
  readonly season: (number: number) => Promise<SeasonCalendar | null>;
};

export const lawSeasonCalendar: SeasonCalendarSource = { season: async (number) => seasonCalendar(number) };

/** Le calendrier servi par la base (#10016) — la source par défaut. */
export const servedSeasonCalendar = (prisma: PrismaClient): SeasonCalendarSource => ({
  season: async (number) => scheduledSeasonCalendar(await seasonSchedule(prisma), number),
});

export type GameArchiveDeps = { readonly calendar?: SeasonCalendarSource };

const LEAGUE_ZONES = ['promotion', 'safe', 'relegation'] as const;
const LEAGUE_CUPS = ['gold', 'silver', 'bronze'] as const;

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  values.includes(value as T) ? (value as T) : null;

const statusOf = (params: { readonly firstWeek: string; readonly lastWeek: string; readonly myWeek: string }): GameArchiveStatus => {
  if (params.myWeek < params.firstWeek) return 'upcoming';
  return params.myWeek > params.lastWeek ? 'past' : 'current';
};

export class GameArchiveService {
  private readonly calendar: SeasonCalendarSource;

  constructor(
    private readonly prisma: PrismaClient,
    deps: GameArchiveDeps = {},
  ) {
    this.calendar = deps.calendar ?? servedSeasonCalendar(prisma);
  }

  /** MON moment, dans mon fuseau. */
  private async myMoment(userId: string, now: Date): Promise<LeagueMoment> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return { dayKey: dayKeyOf(now, row?.timezone), minuteOfDay: minuteOfDayInTimezone(now, row?.timezone) };
  }

  /** La semaine de ligue de MON moment : un dimanche passé 20 h appartient à la suivante. */
  private async myWeek(userId: string, now: Date): Promise<string> {
    return leagueWeekOfMoment(await this.myMoment(userId, now));
  }

  async season(userId: string, number: number, now: Date = new Date()): Promise<GameSeasonArchive | null> {
    if (!Number.isInteger(number) || number < 1) return null;
    const calendar = await this.calendar.season(number);
    if (calendar === null) return null;
    const [moment, row] = await Promise.all([
      this.myMoment(userId, now),
      this.prisma.gameSeason.findUnique({
        where: { userId_number: { userId, number: calendar.number } },
        select: { stars: true, claimedSteps: true, sealOwnedAt: true, settledAt: true },
      }),
    ]);
    // La loi partagée (#10131) : la même que celle qu'un client rejoue sur sa copie hors ligne (`liveSeasonTense`).
    const status = seasonTenseAt(calendar, moment);
    const progress = row === null || status === 'upcoming' ? null : seasonProgress({ stars: row.stars });
    return {
      number: calendar.number,
      status,
      themeKey: calendar.themeKey,
      startDay: calendar.startDay,
      endDay: calendar.endDay,
      weekKeys: [...calendar.weekKeys],
      progress:
        row === null || progress === null
          ? null
          : {
              stars: progress.stars,
              steps: progress.steps,
              claimedSteps: [...row.claimedSteps].sort((a, b) => a - b),
              sealOwned: row.sealOwnedAt !== null && row.sealOwnedAt !== undefined,
              completed: progress.completed,
              settled: row.settledAt !== null && row.settledAt !== undefined,
            },
    };
  }

  async leagueWeek(userId: string, weekKey: string, now: Date = new Date()): Promise<GameLeagueWeekArchive> {
    const [myWeek, membership, schedule] = await Promise.all([
      this.myWeek(userId, now),
      this.prisma.leagueMembership.findUnique({
        where: { userId_weekKey: { userId, weekKey } },
        select: { league: true, finalRank: true, finalPoints: true, zone: true, cup: true, settledAt: true },
      }),
      seasonSchedule(this.prisma),
    ]);
    const status = statusOf({ firstWeek: weekKey, lastWeek: weekKey, myWeek });
    const horizon = leagueRetentionHorizon(now);
    const purged = status === 'past' && horizon !== null && weekKey < horizon;
    const league = oneOf<LeagueKey>(LEAGUE_KEYS, membership?.league);
    return {
      weekKey,
      status,
      season: scheduledSeasonAt(schedule, weekKey),
      retention: purged && membership === null ? 'purged' : 'kept',
      result:
        membership === null || league === null
          ? null
          : {
              league,
              finalRank: membership.finalRank ?? null,
              finalPoints: membership.finalPoints ?? null,
              zone: oneOf(LEAGUE_ZONES, membership.zone),
              cup: oneOf(LEAGUE_CUPS, membership.cup),
              settled: membership.settledAt !== null && membership.settledAt !== undefined,
            },
    };
  }
}
