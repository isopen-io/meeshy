/**
 * LES LIGUES (#9384, #9385) — le consentement, le classement de MA semaine, et
 * la ligue Amis. La LOI (accès, classement, zones, coupes, instantané) vient de
 * `@meeshy/shared/utils/game/league` ; ce service lit la base et la lui passe.
 * Le règlement de fin de semaine, le placement et les purges vivent dans
 * `LeagueSettlement` — ce fichier ne ferme jamais une semaine.
 *
 * ## Ce que le classement ne révèle pas (conformité A-6, A-8, A-10)
 *
 * Un total de semaine qui monte à 14 h 03 dit que la personne était active à
 * 14 h 03 : c'est la fuite par ORDRE que la loi de présence interdit hors
 * amitié. Les AUTRES membres sont donc servis sur l'INSTANTANÉ du groupe (figé
 * une fois par jour à 4 h dans le fuseau du groupe) — rang, zone et coupe
 * compris. Seule la ligne `isMe` est en direct, et mon rang se calcule sur mon
 * total vif contre les totaux figés des autres. Aucune présence, aucune heure,
 * aucun identifiant, aucun avatar ne sort : le schéma de réponse est strict.
 * Deux comptes qui se sont bloqués ne se voient jamais, même dans un groupe
 * formé avant le blocage.
 *
 * ## Le consentement (conformité A-1, A-14)
 *
 * UNE colonne, `User.publicLeagueConsentAt`, que deux portes écrivent — `POST
 * /me/game/league/consent` et `PUT /me/consents/public-league` — par CE service.
 * Daté par le serveur, avec la version de la notice ; retirable d'un geste, et
 * le retrait emporte le pseudonyme, l'appartenance de la semaine et la ligne de
 * l'instantané.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { LeagueConsentResponse, LeagueFriendsResponse, LeagueWeekResponse } from '@meeshy/shared/types/game';
import {
  LEAGUE_MIN_LEVEL,
  friendsLeagueRanking,
  leagueSnapshotDay,
  leagueStandings,
  leagueWeekClose,
  leagueWeekOfMoment,
  type LeagueKey,
} from '@meeshy/shared/utils/game/league';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { GameProfileService } from './GameProfileService';
import { GameRefusal } from './GameRefusal';
import { GameWeekPointsRecorder, totalOfDays } from './GameWeekPoints';
import { accessOf, loadLeagueFacts, presenceCutAmong, suspendedAmong } from './LeagueAccess';
import { LeaguePseudonymService } from './LeaguePseudonymService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';

/** Une ligue Amis ne sert pas plus d'amis que le contrat n'en porte. */
export const FRIENDS_LEAGUE_CAP = 200;

const momentOf = (now: Date, timezone: string | null) => ({ dayKey: dayKeyOf(now, timezone), minuteOfDay: minuteOfDayInTimezone(now, timezone) });

export type LeaguePlacement = {
  readonly weekKey: string;
  readonly moment: { readonly dayKey: string; readonly minuteOfDay: number };
  readonly consented: boolean;
  readonly adultVerified: boolean;
  readonly group: {
    readonly groupId: string;
    readonly league: LeagueKey;
    readonly snapshotDay: string;
    readonly members: readonly { readonly userId: string; readonly weekPoints: number }[];
    readonly names: ReadonlyMap<string, string>;
  } | null;
};

export type FriendsFacts = { readonly weekKey: string; readonly friendIds: readonly string[]; readonly weekPoints: Readonly<Record<string, number>> };

export type LeagueServiceDeps = {
  readonly pseudonyms?: LeaguePseudonymService;
  readonly weekPoints?: GameWeekPointsRecorder;
  readonly profile?: GameProfileService;
};

export class LeagueService {
  readonly pseudonyms: LeaguePseudonymService;

  private readonly points: GameWeekPointsRecorder;

  private readonly profile: GameProfileService;

  constructor(
    private readonly prisma: PrismaClient,
    deps: LeagueServiceDeps = {},
  ) {
    this.pseudonyms = deps.pseudonyms ?? new LeaguePseudonymService(prisma);
    this.points = deps.weekPoints ?? new GameWeekPointsRecorder(prisma);
    this.profile = deps.profile ?? new GameProfileService(prisma);
  }

  // --- Le consentement ---

  /**
   * Pose ou retire le consentement. Idempotent : consentir de nouveau garde la
   * date d'origine (la preuve du premier accord), la version seule se met à
   * jour. Refuse ce que `leagueAccess` refuse — niveau, majorité.
   */
  async setConsent(params: {
    readonly userId: string;
    readonly consent: boolean;
    readonly policyVersion: string;
    readonly pseudonym?: string;
    readonly now?: Date;
  }): Promise<LeagueConsentResponse> {
    const { userId } = params;
    const now = params.now ?? new Date();

    if (!params.consent) {
      await this.prisma.user.update({ where: { id: userId }, data: { publicLeagueConsentAt: null, publicLeagueConsentVersion: null } });
      await this.leave(userId);
      return { consent: false, pseudonym: null };
    }

    const facts = await loadLeagueFacts(this.prisma, userId, now);
    const access = accessOf(facts);
    if (access.status === 'locked') throw new GameRefusal('LEAGUE_LOCKED', { requiredLevel: LEAGUE_MIN_LEVEL });
    if (access.status === 'minor') throw new GameRefusal('LEAGUE_MINOR');

    const alreadyConsented = access.status === 'open';
    await this.prisma.user.update({
      where: { id: userId },
      data: alreadyConsented
        ? { publicLeagueConsentVersion: params.policyVersion }
        : { publicLeagueConsentAt: now, publicLeagueConsentVersion: params.policyVersion },
    });
    const pseudonym = params.pseudonym
      ? await this.pseudonyms.choose({ userId, value: params.pseudonym })
      : await this.pseudonyms.ensure(userId, now);
    return { consent: true, pseudonym };
  }

  /**
   * Choisit son pseudonyme — réservé à qui joue la ligue : le niveau, la majorité
   * vérifiée et le consentement passent AVANT le nom (mêmes refus que le consentement).
   */
  async choosePseudonym(userId: string, value: string, now: Date = new Date()): Promise<string> {
    const access = accessOf(await loadLeagueFacts(this.prisma, userId, now));
    if (access.status === 'locked') throw new GameRefusal('LEAGUE_LOCKED', { requiredLevel: LEAGUE_MIN_LEVEL });
    if (access.status === 'minor') throw new GameRefusal('LEAGUE_MINOR');
    if (access.status === 'consent-required') throw new GameRefusal('LEAGUE_CONSENT_REQUIRED');
    return this.pseudonyms.choose({ userId, value });
  }

  /** Sort de la ligue : pseudonyme, appartenance de la semaine, ligne de l'instantané. */
  private async leave(userId: string): Promise<void> {
    await this.pseudonyms.release(userId);
    const memberships = await this.prisma.leagueMembership.findMany({
      where: { userId, settledAt: null },
      select: { id: true, groupId: true },
      take: 8,
    });
    for (const membership of memberships) {
      await this.prisma.leagueMembership.delete({ where: { id: membership.id } });
      const group = await this.prisma.leagueGroupWeek.findUnique({ where: { groupId: membership.groupId }, select: { snapshot: true } });
      const snapshot = (group?.snapshot ?? null) as Record<string, number> | null;
      if (snapshot && userId in snapshot) {
        const { [userId]: _removed, ...rest } = snapshot;
        await this.prisma.leagueGroupWeek.update({ where: { groupId: membership.groupId }, data: { snapshot: rest } });
      }
    }
  }

  // --- Le classement de MA semaine ---

  /**
   * Où le joueur est placé cette semaine, et les totaux que SA vue peut montrer :
   * les autres sur l'instantané, lui en direct, les blocages et les suspendus
   * écartés. Un site unique pour l'écran de la ligue et le bloc `game`.
   */
  async placement(userId: string, now: Date = new Date()): Promise<LeaguePlacement> {
    const facts = await loadLeagueFacts(this.prisma, userId, now);
    const moment = momentOf(now, facts.timezone);
    const weekKey = leagueWeekOfMoment(moment);
    const base = { weekKey, moment, consented: facts.consented, adultVerified: facts.adultVerified, group: null } as const;

    const open = accessOf(facts).status === 'open' && !(await suspendedAmong(this.prisma, [userId])).has(userId);
    if (!open) return base;

    const membership = await this.prisma.leagueMembership.findUnique({ where: { userId_weekKey: { userId, weekKey } }, select: { groupId: true } });
    if (membership === null) return base;
    const group = await this.prisma.leagueGroupWeek.findUnique({
      where: { groupId: membership.groupId },
      select: { groupId: true, league: true, timezone: true, snapshotDay: true, snapshot: true },
    });
    if (group === null) return base;

    const [rows, related] = await Promise.all([
      this.prisma.leagueMembership.findMany({ where: { groupId: group.groupId }, select: { userId: true }, take: 40 }),
      getBlockRelatedUserIds(this.prisma, userId),
    ]);
    const memberIds = rows.map((row) => row.userId).filter((id) => id === userId || !related.has(id));
    const [suspended, names, mine] = await Promise.all([
      suspendedAmong(this.prisma, memberIds.filter((id) => id !== userId)),
      this.pseudonyms.of(memberIds),
      this.points.weekPoints(weekKey, [userId]),
    ]);
    const frozen = (group.snapshot ?? {}) as Record<string, number>;
    const members = memberIds
      .filter((id) => id === userId || (!suspended.has(id) && names.has(id)))
      .map((id) => ({ userId: id, weekPoints: id === userId ? (mine[userId] ?? 0) : (frozen[id] ?? 0) }));

    return {
      ...base,
      group: {
        groupId: group.groupId,
        league: group.league as LeagueKey,
        snapshotDay: group.snapshotDay ?? leagueSnapshotDay(momentOf(now, group.timezone)),
        members,
        names,
      },
    };
  }

  async weekBoard(userId: string, now: Date = new Date()): Promise<LeagueWeekResponse> {
    const placement = await this.placement(userId, now);
    const closes = leagueWeekClose(placement.weekKey);
    if (placement.group === null) {
      return { weekKey: placement.weekKey, snapshotDay: leagueSnapshotDay(placement.moment), closes, placed: false, league: null, groupId: null, entries: [] };
    }
    const { group } = placement;
    const standings = leagueStandings({ groupId: group.groupId, league: group.league, members: group.members });
    return {
      weekKey: placement.weekKey,
      snapshotDay: group.snapshotDay,
      closes,
      placed: true,
      league: group.league,
      groupId: group.groupId,
      entries: standings.map((entry) => ({
        rank: entry.rank,
        displayName: group.names.get(entry.userId) ?? '',
        weekPoints: entry.weekPoints,
        zone: entry.zone,
        cup: entry.cup,
        isMe: entry.userId === userId,
      })),
    };
  }

  // --- La ligue Amis ---

  /**
   * Les amis de la ligue Amis et leur total de la semaine. Audience de la loi de
   * présence : un ami qui a coupé sa présence en ligne se montre à la
   * granularité du jour (fin de la veille) — son total ne bouge pas à la minute
   * (conformité B-3). L'opposition (`friendsLeagueOptOutAt`) retire un compte de
   * la ligue des autres, et son propriétaire de la sienne (conformité B-2) ;
   * « Jeu masqué » aussi. Les blocages sont écartés.
   */
  async friendsFacts(userId: string, now: Date = new Date()): Promise<FriendsFacts> {
    const facts = await loadLeagueFacts(this.prisma, userId, now);
    const moment = momentOf(now, facts.timezone);
    const weekKey = leagueWeekOfMoment(moment);

    const mySettings = await this.profile.settings(userId);
    const optedOutMyself = mySettings.friendsLeagueOptedOut || mySettings.gameHidden;

    const candidates = optedOutMyself ? [] : await this.acceptedFriends(userId);
    const related = await getBlockRelatedUserIds(this.prisma, userId);
    const settings = await this.profile.settingsOfMany(candidates);
    const friendIds = candidates.filter(
      (id) => !related.has(id) && !(settings.get(id)?.friendsLeagueOptedOut ?? false) && !(settings.get(id)?.gameHidden ?? false),
    );

    const [days, cut] = await Promise.all([this.points.weekDays(weekKey, [userId, ...friendIds]), presenceCutAmong(this.prisma, friendIds)]);
    const weekPoints: Record<string, number> = {
      [userId]: totalOfDays(days.get(userId)),
      ...Object.fromEntries(friendIds.map((id) => [id, totalOfDays(days.get(id), cut.has(id) ? { before: moment.dayKey } : {})])),
    };
    return { weekKey, friendIds, weekPoints };
  }

  /** La ligue Amis : le MÊME classement restreint au joueur et à ses amis acceptés. */
  async friendsBoard(userId: string, now: Date = new Date()): Promise<LeagueFriendsResponse> {
    const { weekKey, friendIds, weekPoints } = await this.friendsFacts(userId, now);
    const ranking = friendsLeagueRanking({ weekKey, viewerId: userId, friendIds, weekPoints });
    return {
      weekKey,
      closes: leagueWeekClose(weekKey),
      entries: ranking.map((entry) => ({ rank: entry.rank, userId: entry.userId, weekPoints: entry.weekPoints, isMe: entry.isMe })),
    };
  }

  /** Les amis acceptés, au plus `FRIENDS_LEAGUE_CAP`, les plus récemment acceptés d'abord. */
  async acceptedFriends(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendRequest.findMany({
      where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
      orderBy: { updatedAt: 'desc' },
      take: FRIENDS_LEAGUE_CAP,
    });
    return [...new Set(rows.map((row) => (row.senderId === userId ? row.receiverId : row.senderId)))];
  }
}
