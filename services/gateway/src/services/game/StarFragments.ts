/**
 * LES FRAGMENTS D'ÉTOILE D'UN COMPTE (#10011) — le total collecté, toutes sources confondues.
 *
 * Il se LIT, jamais une colonne incrémentée (leçon #6428) :
 *
 *     collectés = #{ GameDay où chestFragment = true } + #{ étapes 5, 15, 25, 35 réclamées, par saison }
 *
 * Chaque source est déjà gravée de façon idempotente — le coffre une fois par jour (`MissionService.claimChest`,
 * `updateMany` conditionnel), une étape une fois par saison (`GameSeason.claimedSteps`) : une réclamation rejouée
 * ne compte jamais deux fois, et l'existant d'avant ce total est compté tel quel. Le fragment d'étoile est un
 * objet de collection : il ne se convertit en rien et ne paie aucune frappe (`star-fragments.ts`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { constellationVisitorBoundInstant, countsForVisitor } from '@meeshy/shared/utils/game/constellation';
import { starFragmentsCollected } from '@meeshy/shared/utils/game/star-fragments';

type StarFragmentsDb = Pick<PrismaClient, 'gameDay' | 'gameSeason'>;

/** Les saisons d'un compte se comptent par dizaines au plus (huit semaines chacune) : la lecture est bornée large. */
const SEASONS_READ_MAX = 1000;

export async function starFragmentsOf(db: StarFragmentsDb, userId: string): Promise<number> {
  const chestDays = await db.gameDay.count({ where: { userId, chestFragment: true } });
  const seasons = await db.gameSeason.findMany({ where: { userId }, select: { claimedSteps: true }, take: SEASONS_READ_MAX });
  return starFragmentsCollected({ chestDays, seasons: seasons.map((s) => s.claimedSteps ?? []) });
}

/**
 * Les fragments qu'un VISITEUR peut voir (#10053) : ceux collectés avant `bound` (`constellationVisitorBound`, le 1er
 * du mois courant) — les coffres d'un jour d'avant ET réclamés avant minuit UTC du 1er, les saisons terminées (marge
 * de réclamation comprise) avant. Jamais le total en direct : relire
 * une vitrine ne doit pas dire le jour où une étoile s'allume.
 */
export async function starFragmentsVisibleBefore(db: StarFragmentsDb, userId: string, bound: string): Promise<number> {
  // L'instant de la réclamation, jamais le jour local : une journée se réclame jusqu'à 20 h après son ouverture.
  const chestDays = await db.gameDay.count({
    where: { userId, chestFragment: true, dayKey: { lt: bound }, chestClaimedAt: { lt: constellationVisitorBoundInstant(bound) } },
  });
  const seasons = await db.gameSeason.findMany({ where: { userId }, select: { number: true, claimedSteps: true }, take: SEASONS_READ_MAX });
  return starFragmentsCollected({
    chestDays,
    seasons: seasons.filter((s) => countsForVisitor({ season: s.number }, bound)).map((s) => s.claimedSteps ?? []),
  });
}
