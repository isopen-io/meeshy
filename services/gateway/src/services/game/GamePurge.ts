/**
 * LA PURGE DU JEU À LA SUPPRESSION D'UN COMPTE (#9384 à #9392, conformité I-1) —
 * toutes les tables que le Jeu Meeshy tient PAR COMPTE disparaissent avec lui
 * (RGPD art. 17 ; App Store 5.1.1(v) ; Google Play) : missions, jours de jeu,
 * quotas, registres de Gloire et de Meeshes, réglages, pseudonyme, ligues,
 * points de semaine, duos, saisons, trophées, Atlas et leurs colonnes de `User` —
 * et ce que chaque post a rapporté au compte (#9569) : une ligne par post, donc
 * la trace de ses gestes, de même nature que les quotas par cible.
 *
 * Ce que la purge garantit au-delà de l'effacement (intégrité référentielle) :
 *  - un duo OUVERT est terminé proprement avant d'être effacé : le partenaire qui
 *    avait fini sa part reçoit sa part simple, ses emplacements se libèrent, et
 *    aucune ligne ne pointe plus vers le compte effacé ;
 *  - un groupe de ligue ne garde aucun membre fantôme : son appartenance, sa ligne
 *    de l'instantané et sa place dans l'effectif disparaissent, un groupe vide
 *    est supprimé — le classement des autres membres ne bouge pas ;
 *  - une visite de parrainage ne garde plus l'identifiant du compte (parrain ou
 *    visiteur converti) ;
 *  - une notification de duo qui le NOMME chez un partenaire (« Marie t'invite »)
 *    disparaît : elle désigne un compte qui n'existe plus.
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
import { MythicSeatService } from './MythicSeatService';

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
  'engagementPostPoints',
] as const;

/** Les modèles de jeu par compte qui ne se purgent PAS par `deleteMany({ userId })`, et la raison. */
export const GAME_PURGE_EXCEPTIONS: Readonly<Record<string, string>> = {
  gameDuo: "partagé entre deux comptes : terminé proprement (partenaire payé de sa part simple), puis supprimé par ses deux bouts",
  affiliateVisitSession: "le parrain voit ses visites supprimées, le visiteur converti est dépersonnalisé (`referredUserId` à null)",
  mythicSeat:
    "la place du Mythe est définitive (#9636) : elle reste PRISE, jamais réattribuée, mais `userId` reçoit un identifiant neuf tiré au hasard — elle ne nomme plus personne",
};

export type GamePurgeSummary = {
  readonly deleted: Readonly<Record<string, number>>;
  readonly duosDeleted: number;
  readonly duosSettled: number;
  readonly duoNotificationsErased: number;
  readonly leagueGroupsTouched: number;
  /** La place du Mythe dépersonnalisée (0 ou 1) — jamais libérée. */
  readonly mythicSeatsVacated: number;
};

type PurgeDb = Pick<PrismaClient, (typeof GAME_PURGED_MODELS)[number] | 'gameDuo' | 'user' | 'leagueGroupWeek' | 'affiliateVisitSession' | 'notification' | 'mythicSeat'>;

/** Les notifications de jeu qui NOMMENT un autre joueur (`actor`) : celles d'un duo. */
const DUO_NOTIFICATION_TYPES = ['game_duo_invited', 'game_duo_accepted'] as const;

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

/** La taille d'une page de purge : on PAGINE jusqu'à épuisement, jamais « les 500 premiers ». */
const PURGE_PAGE = 500;

/**
 * Retire le compte de chaque groupe où il figure : appartenance, instantané, effectif ; supprime un
 * groupe vidé. Pagine jusqu'à épuisement — chaque page SUPPRIME ses appartenances, la suivante repart
 * donc du reste ; une page qui ne fait rien reculer arrête la boucle (jamais de tour sans fin).
 */
async function removeFromLeagueGroups(prisma: PurgeDb, userId: string): Promise<number> {
  const touched = new Set<string>();
  for (;;) {
    const memberships = await prisma.leagueMembership.findMany({ where: { userId }, select: { groupId: true }, take: PURGE_PAGE });
    const groupIds = [...new Set(memberships.map((m) => m.groupId))];
    if (groupIds.length === 0 || groupIds.every((id) => touched.has(id))) break;
    await removeFromGroups(prisma, userId, groupIds);
    groupIds.forEach((id) => touched.add(id));
  }
  return touched.size;
}

async function removeFromGroups(prisma: PurgeDb, userId: string, groupIds: readonly string[]): Promise<void> {
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
}

/**
 * Les duos du compte, page par page : les ids se relèvent puis se SUPPRIMENT, la page suivante repart du reste.
 * Rend aussi les PARTENAIRES croisés : ce sont les seules boîtes où une notification de duo nomme ce compte.
 */
async function deleteDuos(prisma: PurgeDb, userId: string): Promise<{ readonly deleted: number; readonly partners: ReadonlySet<string> }> {
  const where = { OR: [{ inviterId: userId }, { inviteeId: userId }] };
  const partners = new Set<string>();
  let deleted = 0;
  for (;;) {
    const page = await prisma.gameDuo.findMany({ where, select: { id: true, inviterId: true, inviteeId: true }, take: PURGE_PAGE });
    if (page.length === 0) break;
    page.forEach((duo) => partners.add(duo.inviterId === userId ? duo.inviteeId : duo.inviterId));
    const duoIds = page.map((d) => d.id);
    await prisma.gameDuoSlot.deleteMany({ where: { duoId: { in: duoIds } } });
    const removed = await prisma.gameDuo.deleteMany({ where: { id: { in: duoIds } } });
    if (removed.count === 0) break;
    deleted += removed.count;
  }
  partners.delete(userId);
  return { deleted, partners };
}

const actorIdOf = (actor: unknown): unknown => (actor !== null && typeof actor === 'object' ? (actor as { readonly id?: unknown }).id : undefined);

/**
 * « Marie t'invite au duo » reste chez le partenaire après l'effacement de Marie : son nom et son
 * avatar désignent un compte qui n'existe plus (même règle que les annonces `contact_joined`). Seules
 * les boîtes des partenaires sont lues, par paquets bornés.
 */
async function eraseDuoNotificationsNaming(prisma: PurgeDb, userId: string, partners: ReadonlySet<string>): Promise<number> {
  const ids = [...partners];
  let erased = 0;
  for (let start = 0; start < ids.length; start += PURGE_PAGE) {
    const rows = await prisma.notification.findMany({
      where: { userId: { in: ids.slice(start, start + PURGE_PAGE) }, type: { in: [...DUO_NOTIFICATION_TYPES] } },
      select: { id: true, actor: true },
    });
    const naming = rows.filter((row) => actorIdOf(row.actor) === userId).map((row) => row.id);
    if (naming.length > 0) erased += (await prisma.notification.deleteMany({ where: { id: { in: naming } } })).count;
  }
  return erased;
}

export async function purgeGameData(prisma: PurgeDb, userId: string, deps: GamePurgeDeps = {}): Promise<GamePurgeSummary> {
  // 1. Les duos ouverts se TERMINENT proprement avant d'être effacés.
  const duosSettled = await settleOpenDuos(prisma, userId, deps);
  const { deleted: duosDeleted, partners } = await deleteDuos(prisma, userId);
  const duoNotificationsErased = await eraseDuoNotificationsNaming(prisma, userId, partners);

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
    prisma.engagementPostPoints.deleteMany({ where }),
  ]);
  const deleted = Object.fromEntries(GAME_PURGED_MODELS.map((model, index) => [model, counts[index]!.count]));

  // 4. La place du Mythe reste prise, mais ne nomme plus le compte effacé.
  const mythicSeatsVacated = await new MythicSeatService(prisma).vacate(userId);

  // 5. Les visites de parrainage : celles du parrain disparaissent, le visiteur converti est dépersonnalisé.
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
  return { deleted, duosDeleted, duosSettled, duoNotificationsErased, leagueGroupsTouched, mythicSeatsVacated };
}
