/**
 * LA PURGE DU JEU À LA SUPPRESSION D'UN COMPTE (#9384 à #9392, conformité I-1) —
 * toutes les tables que le Jeu Meeshy tient PAR COMPTE disparaissent avec lui
 * (RGPD art. 17 ; App Store 5.1.1(v) ; Google Play) : missions, jours de jeu,
 * quotas, registres de Gloire et de Meeshes, réglages, pseudonyme, ligues,
 * points de semaine, duos, saisons, trophées, Atlas et leurs colonnes de `User`.
 *
 * Ce que la purge garantit au-delà de l'effacement (intégrité référentielle) :
 *  - un duo OUVERT est terminé proprement avant d'être effacé : le partenaire qui
 *    avait fini sa part reçoit sa part simple, ses emplacements se libèrent, et
 *    aucune ligne ne pointe plus vers le compte effacé ;
 *  - un groupe de ligue ne garde aucun membre fantôme : son appartenance, sa ligne
 *    de l'instantané et sa place dans l'effectif disparaissent, un groupe vide
 *    est supprimé — le classement des autres membres ne bouge pas ;
 *  - une visite de parrainage ne garde plus l'identifiant du compte (parrain ou
 *    visiteur converti).
 *
 * Conservation comptable : les registres de Gloire et de Meeshes sont SUPPRIMÉS
 * (aucune valeur ne se convertit en argent, rien n'impose de les garder). Si la
 * comptabilité exigeait un jour de les conserver, il faudrait les ANONYMISER
 * (`userId` remplacé par une valeur non réversible), jamais garder l'identifiant.
 *
 * `GAME_PURGED_MODELS` est l'INVENTAIRE : un témoin d'exhaustivité le confronte
 * au schéma (`GamePurge.test.ts`) — un modèle de jeu qui porte un `userId` et
 * n'y figure pas fait tomber la suite. Idempotent : rejouer ne coûte que des
 * requêtes vides.
 *
 * Ce qui reste : l'agrégat `engagementScore` et les compteurs sont des
 * agrégats non identifiants que `anonymizeUserIdentity` garde par décision
 * (#5691). Les lignes des AUTRES comptes qui nomment celui-ci comme acteur d'un
 * don (`actorId`) sont dépersonnalisées, pas supprimées : elles sont leur
 * historique à eux.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';

/** Les modèles purgés par `userId`. */
export const GAME_PURGED_MODELS = [
  'dailyMission',
  'gameDay',
  'engagementQuota',
  'meeshLedger',
  'gloryLedger',
  'gameProfile',
  'leaguePseudonym',
  'leagueMembership',
  'gameWeekPoints',
  'gameDuoSlot',
  'gameSeason',
  'gameTrophy',
  'atlasStamp',
] as const;

/** Les modèles de jeu par compte qui ne se purgent PAS par `deleteMany({ userId })`, et la raison. */
export const GAME_PURGE_EXCEPTIONS: Readonly<Record<string, string>> = {
  gameDuo: "partagé entre deux comptes : terminé proprement (partenaire payé de sa part simple), puis supprimé par ses deux bouts",
  affiliateVisitSession: "le parrain voit ses visites supprimées, le visiteur converti est dépersonnalisé (`referredUserId` à null)",
};

export type GamePurgeSummary = {
  readonly deleted: Readonly<Record<string, number>>;
  readonly duosDeleted: number;
  readonly duosSettled: number;
  readonly leagueGroupsTouched: number;
};

type PurgeDb = Pick<PrismaClient, (typeof GAME_PURGED_MODELS)[number] | 'gameDuo' | 'user' | 'leagueGroupWeek' | 'affiliateVisitSession'>;

export type GamePurgeDeps = {
  /** Le crédit des points de jeu — payer sa part simple au partenaire d'un duo. Absent : `EngagementService`. */
  readonly creditPoints?: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>;
};

async function settleOpenDuos(prisma: PurgeDb, userId: string, deps: GamePurgeDeps): Promise<number> {
  const { DuoService } = await import('./DuoService');
  let creditPoints = deps.creditPoints;
  if (!creditPoints) {
    const { EngagementService } = await import('../engagement/EngagementService');
    const engagement = new EngagementService(prisma as unknown as PrismaClient);
    creditPoints = (id, points, axisKey) => engagement.creditGamePoints(id, points, axisKey);
  }
  return new DuoService(prisma as unknown as PrismaClient, { creditPoints }).settleForDeletedAccount(userId);
}

/** Retire le compte de chaque groupe où il figure : appartenance, instantané, effectif ; supprime un groupe vidé. */
async function removeFromLeagueGroups(prisma: PurgeDb, userId: string): Promise<number> {
  const memberships = await prisma.leagueMembership.findMany({ where: { userId }, select: { groupId: true }, take: 500 });
  const groupIds = [...new Set(memberships.map((m) => m.groupId))];
  for (const groupId of groupIds) {
    const group = await prisma.leagueGroupWeek.findUnique({ where: { groupId }, select: { snapshot: true } });
    const snapshot = (group?.snapshot ?? null) as Record<string, number> | null;
    const rest = snapshot ? Object.fromEntries(Object.entries(snapshot).filter(([id]) => id !== userId)) : null;
    await prisma.leagueMembership.deleteMany({ where: { userId, groupId } });
    const remaining = await prisma.leagueMembership.count({ where: { groupId } });
    if (remaining === 0) {
      await prisma.leagueGroupWeek.deleteMany({ where: { groupId } });
    } else {
      await prisma.leagueGroupWeek.updateMany({ where: { groupId }, data: { memberCount: remaining, ...(rest ? { snapshot: rest } : {}) } });
    }
  }
  return groupIds.length;
}

export async function purgeGameData(prisma: PurgeDb, userId: string, deps: GamePurgeDeps = {}): Promise<GamePurgeSummary> {
  // 1. Les duos ouverts se TERMINENT proprement avant d'être effacés.
  const duosSettled = await settleOpenDuos(prisma, userId, deps);
  const duos = await prisma.gameDuo.findMany({ where: { OR: [{ inviterId: userId }, { inviteeId: userId }] }, select: { id: true }, take: 500 });
  const duoIds = duos.map((d) => d.id);
  if (duoIds.length > 0) await prisma.gameDuoSlot.deleteMany({ where: { duoId: { in: duoIds } } });
  const duosDeleted = await prisma.gameDuo.deleteMany({ where: { OR: [{ inviterId: userId }, { inviteeId: userId }] } });

  // 2. Aucun membre fantôme dans un groupe de ligue.
  const leagueGroupsTouched = await removeFromLeagueGroups(prisma, userId);

  // 3. Le reste, une écriture par modèle, nommée : le typage refuse un nom qui n'existe plus.
  const where = { userId };
  const counts = await Promise.all([
    prisma.dailyMission.deleteMany({ where }),
    prisma.gameDay.deleteMany({ where }),
    prisma.engagementQuota.deleteMany({ where }),
    prisma.meeshLedger.deleteMany({ where }),
    prisma.gloryLedger.deleteMany({ where }),
    prisma.gameProfile.deleteMany({ where }),
    prisma.leaguePseudonym.deleteMany({ where }),
    prisma.leagueMembership.deleteMany({ where }),
    prisma.gameWeekPoints.deleteMany({ where }),
    prisma.gameDuoSlot.deleteMany({ where }),
    prisma.gameSeason.deleteMany({ where }),
    prisma.gameTrophy.deleteMany({ where }),
    prisma.atlasStamp.deleteMany({ where }),
  ]);
  const deleted = Object.fromEntries(GAME_PURGED_MODELS.map((model, index) => [model, counts[index]!.count]));

  // 4. Les visites de parrainage : celles du parrain disparaissent, le visiteur converti est dépersonnalisé.
  await prisma.affiliateVisitSession.deleteMany({ where: { affiliateUserId: userId } });
  await prisma.affiliateVisitSession.updateMany({ where: { referredUserId: userId }, data: { referredUserId: null } });

  // Le compte n'est plus acteur des dons et des sanctions qu'il a faits aux autres.
  await Promise.all([
    prisma.meeshLedger.updateMany({ where: { actorId: userId }, data: { actorId: null } }),
    prisma.gloryLedger.updateMany({ where: { actorId: userId }, data: { actorId: null } }),
  ]);
  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      publicLeagueConsentAt: null,
      publicLeagueConsentVersion: null,
      guideSeen: [],
      levelRecord: null,
      prestige: null,
      flameFreezes: null,
      lastRelightDay: null,
      brokenStreakDays: null,
      brokenStreakLastDay: null,
    },
  });
  return { deleted, duosDeleted: duosDeleted.count, duosSettled, leagueGroupsTouched };
}
