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
import { starFragmentsCollected } from '@meeshy/shared/utils/game/star-fragments';

type StarFragmentsDb = Pick<PrismaClient, 'gameDay' | 'gameSeason'>;

/** Les saisons d'un compte se comptent par dizaines au plus (huit semaines chacune) : la lecture est bornée large. */
const SEASONS_READ_MAX = 1000;

export async function starFragmentsOf(db: StarFragmentsDb, userId: string): Promise<number> {
  const chestDays = await db.gameDay.count({ where: { userId, chestFragment: true } });
  const seasons = await db.gameSeason.findMany({ where: { userId }, select: { claimedSteps: true }, take: SEASONS_READ_MAX });
  return starFragmentsCollected({ chestDays, seasons: seasons.map((s) => s.claimedSteps ?? []) });
}
