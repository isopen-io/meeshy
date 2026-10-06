/**
 * La section `game` de `GET /me/export` (#9384 à #9392, conformité I-2) — tout
 * ce que le Jeu Meeshy garde d'UN compte : progression, réglages, consentement
 * de ligue, pseudonyme, historique des ligues, points de semaine, duos, saisons,
 * trophées, tampons de l'Atlas, missions, Gloire et Meeshes (RGPD art. 15 et 20).
 *
 * Ce que la section ne contient JAMAIS :
 *  - rien d'un AUTRE compte : le duo ne nomme pas le partenaire, la ligue ne
 *    sort ni les pseudonymes ni les totaux des autres membres, le registre des
 *    Meeshes ne nomme pas l'auteur d'un don (`actorId`) ;
 *  - aucune chaîne de présence (`lastActiveAt`, `isOnline`).
 *
 * Chaque liste est bornée par la page de la requête (jamais un `findMany` nu).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ExportPage } from './export-sections';

const asIso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export async function exportGame(prisma: PrismaClient, userId: string, page: ExportPage) {
  const take = page.limit + 1;
  const skip = page.offset;
  const clip = <T>(rows: T[]): { items: T[]; more: boolean } => ({ items: rows.slice(0, page.limit), more: rows.length > page.limit });

  const [account, settings, pseudonym, memberships, weekPoints, duosAsInviter, duosAsInvitee, seasons, trophies, atlas, missions, glory, meeshes] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          engagementScore: true,
          levelRecord: true,
          prestige: true,
          flameFreezes: true,
          lastRelightDay: true,
          guideSeen: true,
          publicLeagueConsentAt: true,
          publicLeagueConsentVersion: true,
        },
      }),
      prisma.gameProfile.findUnique({ where: { userId } }),
      prisma.leaguePseudonym.findUnique({ where: { userId }, select: { pseudonym: true, kind: true, seasonNumber: true, createdAt: true } }),
      prisma.leagueMembership.findMany({
        where: { userId },
        select: { weekKey: true, league: true, finalRank: true, finalPoints: true, zone: true, cup: true, settledAt: true },
        orderBy: { weekKey: 'desc' },
        take, skip,
      }),
      prisma.gameWeekPoints.findMany({ where: { userId }, select: { weekKey: true, dayKey: true, points: true }, orderBy: { dayKey: 'desc' }, take, skip }),
      prisma.gameDuo.findMany({
        where: { inviterId: userId },
        select: { weekKey: true, status: true, templateKey: true, partTarget: true, inviterProgress: true, inviterPaidAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take, skip,
      }),
      prisma.gameDuo.findMany({
        where: { inviteeId: userId },
        select: { weekKey: true, status: true, templateKey: true, partTarget: true, inviteeProgress: true, inviteePaidAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take, skip,
      }),
      prisma.gameSeason.findMany({
        where: { userId },
        select: { number: true, stars: true, claimedSteps: true, sealOwnedAt: true, settledAt: true },
        orderBy: { number: 'desc' },
        take, skip,
      }),
      prisma.gameTrophy.findMany({ where: { userId }, select: { key: true, awardedAt: true }, orderBy: { awardedAt: 'desc' }, take, skip }),
      prisma.atlasStamp.findMany({ where: { userId }, select: { language: true, sentAt: true, receivedAt: true, stampedOn: true }, orderBy: { language: 'asc' }, take, skip }),
      prisma.dailyMission.findMany({
        where: { userId },
        select: { dayKey: true, slot: true, templateKey: true, difficulty: true, target: true, progress: true, reward: true, completedAt: true, paidPoints: true, startsAt: true, endsAt: true },
        orderBy: { dayKey: 'desc' },
        take, skip,
      }),
      prisma.gloryLedger.findMany({ where: { userId }, select: { delta: true, reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.meeshLedger.findMany({ where: { userId }, select: { delta: true, reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take, skip }),
    ]);

  const duos = [
    ...duosAsInviter.map((d) => ({ role: 'inviter', weekKey: d.weekKey, status: d.status, templateKey: d.templateKey, partTarget: d.partTarget, myProgress: d.inviterProgress, paidAt: asIso(d.inviterPaidAt), createdAt: d.createdAt })),
    ...duosAsInvitee.map((d) => ({ role: 'invitee', weekKey: d.weekKey, status: d.status, templateKey: d.templateKey, partTarget: d.partTarget, myProgress: d.inviteeProgress, paidAt: asIso(d.inviteePaidAt), createdAt: d.createdAt })),
  ];

  const lists = {
    leagueHistory: clip(memberships),
    weekPoints: clip(weekPoints),
    duos: clip(duos),
    seasons: clip(seasons),
    trophies: clip(trophies),
    atlas: clip(atlas),
    missions: clip(missions),
    gloryLedger: clip(glory),
    meeshLedger: clip(meeshes),
  };

  return {
    progress: account,
    settings: settings
      ? {
          showcaseVisibility: settings.showcaseVisibility ?? null,
          rankVisibility: settings.rankVisibility ?? null,
          treasuryVisibility: settings.treasuryVisibility ?? null,
          atlasVisibility: settings.atlasVisibility ?? null,
          gameHiddenAt: asIso(settings.gameHiddenAt),
          friendsLeagueOptOutAt: asIso(settings.friendsLeagueOptOutAt),
          showcaseOrder: settings.showcaseOrder ?? [],
          mythicAt: asIso(settings.mythicAt),
        }
      : null,
    pseudonym,
    leagueHistory: lists.leagueHistory.items,
    weekPoints: lists.weekPoints.items,
    duos: lists.duos.items,
    seasons: lists.seasons.items,
    trophies: lists.trophies.items,
    atlas: lists.atlas.items,
    missions: lists.missions.items,
    gloryLedger: lists.gloryLedger.items,
    meeshLedger: lists.meeshLedger.items,
    hasMore: Object.values(lists).some((list) => list.more),
  };
}

export type GameExport = Awaited<ReturnType<typeof exportGame>>;
