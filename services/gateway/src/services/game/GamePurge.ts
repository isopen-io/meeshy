/**
 * LA PURGE DU JEU À LA SUPPRESSION D'UN COMPTE (#9384 à #9392, conformité I-1) —
 * toutes les tables que le Jeu Meeshy tient PAR COMPTE disparaissent avec lui
 * (RGPD art. 17 ; App Store 5.1.1(v) ; Google Play) : missions, jours de jeu,
 * quotas, registres de Gloire et de Meeshes, réglages, pseudonyme, ligues,
 * points de semaine, duos, saisons, trophées, Atlas et leurs colonnes de `User`.
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

export type GamePurgeSummary = {
  readonly deleted: Readonly<Record<string, number>>;
  readonly duosDeleted: number;
};

type PurgeDb = Pick<PrismaClient, (typeof GAME_PURGED_MODELS)[number] | 'gameDuo' | 'user'>;

export async function purgeGameData(prisma: PurgeDb, userId: string): Promise<GamePurgeSummary> {
  const where = { userId };
  // Une écriture par modèle, nommée : le typage refuse un nom qui n'existe plus.
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
  const duos = await prisma.gameDuo.deleteMany({ where: { OR: [{ inviterId: userId }, { inviteeId: userId }] } });
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
  return { deleted, duosDeleted: duos.count };
}
