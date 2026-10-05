/**
 * LE CYCLE D'UNE LIGUE (#9384) — placement, instantané, règlement, purge. Les
 * tâches planifiées (`jobs/game-league.ts`) n'appellent que `runDue`. La LOI
 * (répartition en groupes, classement, zones, coupes, Gloire de montée,
 * instantané de 4 h, fermeture du dimanche 20 h) vient de
 * `@meeshy/shared/utils/game/league` : rien n'est réécrit ici.
 *
 * ## Idempotent et rejouable
 *
 *  - un groupe se pose une fois (`groupId` unique) ; une semaine déjà placée ne
 *    l'est pas deux fois ;
 *  - un groupe se règle une fois (`settledAt`) ; la Gloire et les coupes portent
 *    leur propre clé (`league:<semaine>`, `trophy.league-cup.…`) — rejouer un
 *    règlement interrompu ne paie rien deux fois ;
 *  - l'instantané ne change qu'une fois par jour de groupe.
 *
 * ## Ce que la ligue ne fait pas
 *
 *  - un groupe de moins de deux joueurs actifs ne paie RIEN : un classement
 *    sans adversaire n'est pas une compétition (et un compte seul y gagnerait
 *    l'or toutes les semaines) ;
 *  - un compte suspendu (présence coupée, caché de la recherche, « Jeu masqué »)
 *    ou sans consentement n'est ni placé ni réglé (conformité A-7) ;
 *  - deux comptes bloqués ne se retrouvent jamais ensemble (`leagueGrouping`) ;
 *  - la durée de conservation est tenue : groupes, appartenances et points de
 *    semaine disparaissent 4 semaines après la fin de la saison (conformité A-9).
 *
 * ## Approximations assumées
 *
 *  - le fuseau d'un groupe est celui de la majorité de ses membres : la
 *    fermeture et l'instantané suivent ce fuseau, les points de chaque membre
 *    suivent le sien (écart borné à quelques heures) ;
 *  - un inscrit en cours de semaine est placé la semaine SUIVANTE.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { addDays } from '@meeshy/shared/utils/game/day-prng';
import {
  leagueSnapshotDay,
  leagueWeekClose,
  leagueWeekKey,
  nextLeague,
  partitionLeagueGroups,
  previousLeague,
  settleLeagueGroup,
  type LeagueGroup,
  type LeagueKey,
} from '@meeshy/shared/utils/game/league';
import { seasonAt, seasonCalendar } from '@meeshy/shared/utils/game/season';
import { leagueCupTrophy } from '@meeshy/shared/utils/game/trophies';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { GloryService } from './GloryService';
import { GameWeekPointsRecorder, totalOfDays } from './GameWeekPoints';
import { accessOf, leagueFactsOf, suspendedAmong } from './LeagueAccess';
import { LeaguePseudonymService } from './LeaguePseudonymService';
import { TrophyService } from './TrophyService';
import { blockPairs, separateBlockedMembers } from './leagueGrouping';
import { dayKeyOf, effectiveZone, instantOfLocal, minuteOfDayInTimezone } from './gameClock';

const log = enhancedLogger.child({ module: 'LeagueSettlement' });

/** Combien de semaines récentes mesurent l'activité qui répartit les groupes. */
const ACTIVITY_WEEKS = 3;
const PAGE = 500;
/** La conservation : 4 semaines après la fin de la saison. */
export const LEAGUE_RETENTION_DAYS = 28;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export type LeagueRunReport = {
  readonly snapshots: number;
  readonly settled: number;
  readonly placed: number;
  readonly purged: number;
};

type Entrant = {
  readonly userId: string;
  readonly timezone: string | null;
  readonly blockedUserIds: readonly string[];
};

const ENTRANT_SELECT = {
  id: true,
  engagementScore: true,
  levelRecord: true,
  birthDate: true,
  publicLeagueConsentAt: true,
  timezone: true,
  blockedUserIds: true,
} as const;

/** Le fuseau le plus fréquent des membres (égalité : ordre alphabétique — déterministe). */
export function modalTimezone(zones: readonly (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const zone of zones) counts.set(effectiveZone(zone), (counts.get(effectiveZone(zone)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? 'UTC';
}

export type LeagueSettlementDeps = {
  readonly glory?: GloryService;
  readonly trophies?: TrophyService;
  readonly pseudonyms?: LeaguePseudonymService;
  readonly points?: GameWeekPointsRecorder;
};

export class LeagueSettlement {
  private readonly glory: GloryService;

  private readonly trophies: TrophyService;

  private readonly pseudonyms: LeaguePseudonymService;

  private readonly points: GameWeekPointsRecorder;

  constructor(
    private readonly prisma: PrismaClient,
    deps: LeagueSettlementDeps = {},
  ) {
    this.glory = deps.glory ?? new GloryService(prisma);
    this.trophies = deps.trophies ?? new TrophyService(prisma);
    this.pseudonyms = deps.pseudonyms ?? new LeaguePseudonymService(prisma);
    this.points = deps.points ?? new GameWeekPointsRecorder(prisma);
  }

  /** Un passage : instantanés, règlements dus, placement de la semaine, purge. */
  async runDue(now: Date = new Date()): Promise<LeagueRunReport> {
    const settled = await this.settleDue(now);
    const placed = await this.placeCurrentWeek(now);
    const snapshots = await this.refreshSnapshots(now);
    const purged = await this.purgeOld(now);
    return { snapshots, settled, placed, purged };
  }

  // --- L'instantané ---

  /** Fige, une fois par jour de groupe (4 h locales), les totaux que les AUTRES membres voient. */
  async refreshSnapshots(now: Date = new Date()): Promise<number> {
    const groups = await this.prisma.leagueGroupWeek.findMany({
      where: { settledAt: null },
      select: { groupId: true, weekKey: true, timezone: true, snapshotDay: true },
      take: 5000,
    });
    let refreshed = 0;
    for (const group of groups) {
      const day = leagueSnapshotDay({ dayKey: dayKeyOf(now, group.timezone), minuteOfDay: minuteOfDayInTimezone(now, group.timezone) });
      if (group.snapshotDay === day) continue;
      const members = await this.memberIds(group.groupId);
      const days = await this.points.weekDays(group.weekKey, members);
      const snapshot = Object.fromEntries(members.map((id) => [id, totalOfDays(days.get(id))]));
      await this.prisma.leagueGroupWeek.update({ where: { groupId: group.groupId }, data: { snapshot, snapshotDay: day } });
      refreshed += 1;
    }
    return refreshed;
  }

  private async memberIds(groupId: string): Promise<string[]> {
    const rows = await this.prisma.leagueMembership.findMany({ where: { groupId }, select: { userId: true }, take: 100 });
    return rows.map((row) => row.userId);
  }

  // --- Le règlement ---

  /** Règle chaque groupe dont la fermeture (dimanche 20 h, fuseau du groupe) est passée. */
  async settleDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.leagueGroupWeek.findMany({
      where: { settledAt: null, closeAt: { lte: now } },
      select: { groupId: true, weekKey: true, league: true },
      orderBy: { closeAt: 'asc' },
      take: 2000,
    });
    let settled = 0;
    for (const group of due) {
      try {
        await this.settleGroup({ groupId: group.groupId, weekKey: group.weekKey, league: group.league as LeagueKey, now });
        settled += 1;
      } catch (error) {
        log.error('league group settlement failed — it will be retried', { groupId: group.groupId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return settled;
  }

  private async settleGroup(params: { readonly groupId: string; readonly weekKey: string; readonly league: LeagueKey; readonly now: Date }): Promise<void> {
    const { groupId, weekKey, league, now } = params;
    const memberIds = await this.memberIds(groupId);
    const [users, suspended, days] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: memberIds } }, select: ENTRANT_SELECT, take: memberIds.length }),
      suspendedAmong(this.prisma, memberIds),
      this.points.weekDays(weekKey, memberIds),
    ]);
    const active = new Set(users.filter((u) => accessOf(leagueFactsOf(u, now)).status === 'open' && !suspended.has(u.id)).map((u) => u.id));
    const members = memberIds.filter((id) => active.has(id)).map((id) => ({ userId: id, weekPoints: totalOfDays(days.get(id)) }));

    // Un groupe sans adversaire ne paie rien : on grave les rangs, pas les récompenses.
    const rewarded = members.length >= 2;
    const outcomes = settleLeagueGroup({ groupId, league, members });

    for (const result of outcomes) {
      await this.prisma.leagueMembership.updateMany({
        where: { userId: result.userId, weekKey },
        data: {
          finalRank: result.rank,
          finalPoints: result.weekPoints,
          zone: rewarded ? result.zone : 'safe',
          cup: rewarded ? result.cup : null,
          settledAt: now,
        },
      });
      if (!rewarded) continue;
      if (result.outcome.glory > 0) {
        await this.glory.credit({
          userId: result.userId,
          delta: result.outcome.glory,
          reason: 'league',
          requestId: `league:${weekKey}`,
          meta: { weekKey, league, promoted: result.outcome.promoted, cup: result.cup },
        });
      }
      if (result.cup !== null) await this.trophies.award(result.userId, leagueCupTrophy({ weekKey, league, cup: result.cup }), now);
    }
    // Les membres écartés (suspendus, retirés) gardent leur ligne, sans rang ni récompense.
    await this.prisma.leagueMembership.updateMany({
      where: { groupId, settledAt: null },
      data: { settledAt: now, zone: 'safe', cup: null },
    });
    await this.prisma.leagueGroupWeek.update({ where: { groupId }, data: { settledAt: now } });
  }

  // --- Le placement ---

  /**
   * Place la semaine courante (celle du lundi UTC) quand la précédente est close
   * pour tout le monde. Ne fait rien si elle est déjà placée.
   */
  async placeCurrentWeek(now: Date = new Date()): Promise<number> {
    const weekKey = leagueWeekKey(dayKeyOf(now, 'UTC'));
    return this.placeWeek(weekKey, now);
  }

  async placeWeek(weekKey: string, now: Date = new Date()): Promise<number> {
    if (seasonAt(weekKey) === null) return 0;
    if ((await this.prisma.leagueGroupWeek.count({ where: { weekKey } })) > 0) return 0;
    const pending = await this.prisma.leagueGroupWeek.count({ where: { settledAt: null, weekKey: { lt: weekKey } } });
    if (pending > 0) return 0;

    const entrants = await this.loadEntrants(now);
    if (entrants.length === 0) return 0;

    const previousWeek = addDays(weekKey, -7);
    const lastWeeks = Array.from({ length: ACTIVITY_WEEKS }, (_, i) => addDays(weekKey, -7 * (i + 1)));
    const [leagueOf, activity] = await Promise.all([
      this.previousLeagues(previousWeek, entrants.map((e) => e.userId)),
      this.recentActivity(lastWeeks, entrants.map((e) => e.userId)),
    ]);

    const byLeague = new Map<LeagueKey, Entrant[]>();
    for (const entrant of entrants) {
      const league = leagueOf.get(entrant.userId) ?? 'quartz';
      byLeague.set(league, [...(byLeague.get(league) ?? []), entrant]);
    }

    const blocked = blockPairs(entrants.map((e) => ({ id: e.userId, blockedUserIds: e.blockedUserIds })));
    const byId = new Map(entrants.map((e) => [e.userId, e]));
    let placed = 0;
    for (const [league, members] of [...byLeague.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const groups = separateBlockedMembers(
        partitionLeagueGroups({ weekKey, league, entrants: members.map((m) => ({ userId: m.userId, activity: activity.get(m.userId) ?? 0 })) }),
        blocked,
      );
      for (const group of groups) {
        placed += await this.createGroup(group, byId, now);
      }
    }
    return placed;
  }

  /** Les inscrits dont l'accès est ouvert et l'appartenance non suspendue, pseudonyme posé. */
  private async loadEntrants(now: Date): Promise<Entrant[]> {
    const entrants: Entrant[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.user.findMany({
        where: { publicLeagueConsentAt: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: ENTRANT_SELECT,
        orderBy: { id: 'asc' },
        take: PAGE,
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1]!.id;
      const eligible = page.filter((user) => accessOf(leagueFactsOf(user, now)).status === 'open');
      const suspended = await suspendedAmong(this.prisma, eligible.map((u) => u.id));
      for (const user of eligible.filter((u) => !suspended.has(u.id))) {
        await this.pseudonyms.ensure(user.id, now);
        entrants.push({ userId: user.id, timezone: user.timezone ?? null, blockedUserIds: (user.blockedUserIds ?? []) as string[] });
      }
      if (page.length < PAGE) break;
    }
    return entrants;
  }

  /** La ligue où chacun joue : celle de la semaine précédente, déplacée par sa zone ; Quartz sinon. */
  private async previousLeagues(previousWeek: string, userIds: readonly string[]): Promise<Map<string, LeagueKey>> {
    const result = new Map<string, LeagueKey>();
    for (let i = 0; i < userIds.length; i += PAGE) {
      const rows = await this.prisma.leagueMembership.findMany({
        where: { weekKey: previousWeek, userId: { in: userIds.slice(i, i + PAGE) } },
        select: { userId: true, league: true, zone: true },
        take: PAGE,
      });
      for (const row of rows) {
        const league = row.league as LeagueKey;
        const moved = row.zone === 'promotion' ? nextLeague(league) : row.zone === 'relegation' ? previousLeague(league) : null;
        result.set(row.userId, moved ?? league);
      }
    }
    return result;
  }

  /** Les points des dernières semaines : l'activité qui répartit les groupes. */
  private async recentActivity(weekKeys: readonly string[], userIds: readonly string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    for (let i = 0; i < userIds.length; i += PAGE) {
      const rows = await this.prisma.gameWeekPoints.findMany({
        where: { weekKey: { in: [...weekKeys] }, userId: { in: userIds.slice(i, i + PAGE) } },
        select: { userId: true, points: true },
        take: PAGE * 8 * ACTIVITY_WEEKS,
      });
      for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.points);
    }
    return totals;
  }

  private async createGroup(group: LeagueGroup, entrants: ReadonlyMap<string, Entrant>, now: Date): Promise<number> {
    const timezone = modalTimezone(group.memberIds.map((id) => entrants.get(id)?.timezone ?? null));
    const close = leagueWeekClose(group.weekKey);
    const day = leagueSnapshotDay({ dayKey: dayKeyOf(now, timezone), minuteOfDay: minuteOfDayInTimezone(now, timezone) });
    try {
      await this.prisma.leagueGroupWeek.create({
        data: {
          groupId: group.groupId,
          weekKey: group.weekKey,
          league: group.league,
          timezone,
          memberCount: group.memberIds.length,
          closeAt: instantOfLocal({ dayKey: close.dayKey, minuteOfDay: close.minuteOfDay, timezone }),
          snapshotDay: day,
          snapshot: Object.fromEntries(group.memberIds.map((id) => [id, 0])),
          settledAt: null,
        },
        select: { id: true },
      });
    } catch (err) {
      if (isP2002(err)) return 0;
      throw err;
    }
    let placed = 0;
    for (const userId of group.memberIds) {
      try {
        await this.prisma.leagueMembership.create({
          data: { userId, weekKey: group.weekKey, groupId: group.groupId, league: group.league, settledAt: null },
          select: { id: true },
        });
        placed += 1;
      } catch (err) {
        if (!isP2002(err)) throw err;
      }
    }
    return placed;
  }

  // --- La conservation ---

  /**
   * Supprime groupes, appartenances et points de semaine des saisons terminées
   * depuis plus de `LEAGUE_RETENTION_DAYS` jours (conformité A-9). Les trophées
   * gardés ne portent ni pseudonyme ni total d'un autre.
   */
  async purgeOld(now: Date = new Date()): Promise<number> {
    const cutoffDay = addDays(dayKeyOf(now, 'UTC'), -LEAGUE_RETENTION_DAYS);
    const season = seasonAt(cutoffDay);
    const horizon = season === null ? null : seasonCalendar(season)?.startDay ?? null;
    if (horizon === null) return 0;
    const where = { weekKey: { lt: horizon } };
    const [groups, memberships, points] = await Promise.all([
      this.prisma.leagueGroupWeek.deleteMany({ where }),
      this.prisma.leagueMembership.deleteMany({ where }),
      this.prisma.gameWeekPoints.deleteMany({ where }),
    ]);
    return groups.count + memberships.count + points.count;
  }
}

