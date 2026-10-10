/**
 * LES FRAGMENTS DE MEESH (#10011) — gagnés au coffre du jour, consommés par la frappe gratuite (cinq).
 *
 * Ils se LISENT, jamais une colonne incrémentée (leçon #6428) :
 *
 *     en poche = Σ GameDay.chestMeeshFragments − Σ MeeshLedger.fragmentsSpent
 *
 * Gagnés : gravés sur la journée DANS la réclamation du coffre (`MissionService.claimChest`). Consommés : gravés
 * sur la ligne `mint` de la frappe gratuite, dans la MÊME transaction qu'elle (`FragmentMint`) — une frappe sans
 * sa consommation, ou l'inverse, est impossible. Ils ne s'achètent pas, ne se transfèrent pas et ne servent qu'à
 * frapper.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { meeshFragmentProgress, type MeeshFragmentProgress } from '@meeshy/shared/utils/game/chest';

/** Le client ou la transaction : `meeshTotalsFromLedger` reçoit les deux de la même façon. */
type FragmentsDb = Pick<PrismaClient, 'gameDay' | 'meeshLedger'>;

/** Les fragments gagnés et consommés à vie. Les deux lectures sont SÉQUENTIELLES : en transaction, elles partagent la session. */
export async function meeshFragmentsLedger(db: FragmentsDb, userId: string): Promise<{ readonly earned: number; readonly spent: number }> {
  const earned = await db.gameDay.aggregate({ where: { userId, chestMeeshFragments: { gt: 0 } }, _sum: { chestMeeshFragments: true } });
  const spent = await db.meeshLedger.aggregate({ where: { userId, fragmentsSpent: { gt: 0 } }, _sum: { fragmentsSpent: true } });
  return { earned: earned._sum.chestMeeshFragments ?? 0, spent: spent._sum.fragmentsSpent ?? 0 };
}

/** Les fragments en poche, sur les cinq d'une frappe gratuite. */
export async function meeshFragmentsHeld(db: FragmentsDb, userId: string): Promise<MeeshFragmentProgress> {
  return meeshFragmentProgress(await meeshFragmentsLedger(db, userId));
}
