/**
 * LES CENT PLACES DU MYTHE (#9636) — le SEUL point d'écriture du registre `MythicSeat`.
 *
 * Un compte qui atteint 1 000 000 de Gloire prend la première place libre, tant
 * qu'il en reste une des cent, dans l'ordre d'arrivée. La place est DÉFINITIVE :
 * aucun chemin ne la retire, ne la renumérote ni ne la réattribue — pas même la
 * suppression du compte, qui la dépersonnalise (`vacate`) sans la libérer.
 *
 * L'attribution est ATOMIQUE sans transaction :
 *  - le numéro tenté est toujours `places prises + 1` (`nextMythicNumber`) — les
 *    places se prennent sans trou, donc ce numéro est libre ou vient d'être pris ;
 *  - le `_id` de la ligne est DÉRIVÉ du numéro : deux comptes qui tentent le même
 *    numéro se heurtent à l'index `_id`, qui existe toujours, et le perdant
 *    retente au numéro suivant — jamais au-delà du 100e ;
 *  - l'unique sur `userId` (migration `2026-10-07-mythic-seat-indexes`) refuse
 *    une seconde place au même compte : le perdant relit alors la sienne.
 *
 * Trois chemins y mènent, tous idempotents : le crédit de Gloire qui fait
 * franchir le seuil (`GloryService.credit`), la lecture du bloc de jeu (pour une
 * Gloire gravée hors de `credit`, comme la frappe), et le rattrapage nocturne
 * (`sweep`), qui range les arrivants par instant de franchissement.
 */

import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MYTHE_GLORY, MYTHE_SIZE, isMythicNumber } from '@meeshy/shared/utils/game/glory';
import { assignMythicSeats, mythicCrossedAt, nextMythicNumber, reachesMythe, type MythicArrival } from '@meeshy/shared/utils/game/mythe';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';

const log = enhancedLogger.child({ module: 'MythicSeatService' });

type SeatDb = Pick<PrismaClient, 'mythicSeat' | 'gloryLedger' | 'user'>;

/** `"mythe"` en hexadécimal, puis le numéro sur 14 chiffres : un ObjectId stable par place. */
export const mythicSeatId = (number: number): string => `6d79746865${number.toString(16).padStart(14, '0')}`;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class MythicSeatService {
  constructor(private readonly prisma: SeatDb) {}

  /** La place du compte, `null` s'il n'en a pas. */
  async seatOf(userId: string): Promise<number | null> {
    const row = await this.prisma.mythicSeat.findUnique({ where: { userId }, select: { number: true } });
    return row !== null && isMythicNumber(row.number) ? row.number : null;
  }

  /**
   * La place du compte : celle qu'il a, ou celle qu'il prend maintenant si sa Gloire
   * atteint le seuil et qu'il en reste une. `glory` évite une relecture du registre
   * quand l'appelant l'a déjà.
   */
  async claimIfEligible(userId: string, glory?: number, now: Date = new Date()): Promise<number | null> {
    const held = await this.seatOf(userId);
    if (held !== null) return held;
    const total = glory ?? (await this.gloryOf(userId));
    if (!reachesMythe(total)) return null;

    for (let attempt = 0; attempt <= MYTHE_SIZE; attempt += 1) {
      const number = nextMythicNumber(await this.prisma.mythicSeat.count());
      if (number === null) return null;
      try {
        await this.prisma.mythicSeat.create({ data: { id: mythicSeatId(number), number, userId, glory: Math.trunc(total), grantedAt: now } });
        log.info('mythic seat granted', { userId, number });
        return number;
      } catch (error) {
        if (!isP2002(error)) throw error;
        const mine = await this.seatOf(userId);
        if (mine !== null) return mine;
      }
    }
    return null;
  }

  /**
   * Le rattrapage nocturne : les comptes actifs à 1 000 000 de Gloire ou plus qui
   * n'ont pas de place la prennent, dans l'ordre où leur Gloire a franchi le seuil.
   * Rien n'est jamais retiré. Rend les places attribuées par CET appel.
   */
  async sweep(now: Date = new Date()): Promise<readonly { readonly userId: string; readonly number: number }[]> {
    if ((await this.prisma.mythicSeat.count()) >= MYTHE_SIZE) return [];
    const sums = await this.prisma.gloryLedger.groupBy({ by: ['userId'], _sum: { delta: true }, having: { delta: { _sum: { gte: MYTHE_GLORY } } } });
    if (sums.length === 0) return [];
    const ids = sums.map((row) => row.userId);
    const [seats, live] = await Promise.all([
      this.prisma.mythicSeat.findMany({ where: { userId: { in: ids } }, select: { userId: true }, take: ids.length }),
      this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, ...unsetOrNull('deletedAt') }, select: { id: true }, take: ids.length }),
    ]);
    const seated = new Set(seats.map((row) => row.userId));
    const alive = new Set(live.map((row) => row.id));
    const waiting = sums.filter((row) => alive.has(row.userId) && !seated.has(row.userId));

    const arrivals: MythicArrival[] = [];
    for (const row of waiting) {
      const gains = await this.prisma.gloryLedger.findMany({ where: { userId: row.userId }, select: { delta: true, createdAt: true } });
      const crossedAt = mythicCrossedAt(gains.map((g) => ({ delta: g.delta, createdAt: g.createdAt.toISOString() })));
      if (crossedAt !== null) arrivals.push({ userId: row.userId, glory: row._sum.delta ?? 0, crossedAt });
    }

    const order = assignMythicSeats({ taken: 0, seated: [], arrivals });
    const granted: { userId: string; number: number }[] = [];
    for (const { userId } of order) {
      const glory = arrivals.find((a) => a.userId === userId)?.glory ?? 0;
      const number = await this.claimIfEligible(userId, glory, now);
      if (number === null) break;
      granted.push({ userId, number });
    }
    return granted;
  }

  /**
   * La suppression d'un compte (RGPD art. 17) : la place reste PRISE — elle ne se
   * réattribue jamais — mais ne nomme plus personne. `userId` reçoit un identifiant
   * neuf, tiré au hasard, sans lien avec le compte effacé.
   */
  async vacate(userId: string, now: Date = new Date()): Promise<number> {
    const result = await this.prisma.mythicSeat.updateMany({
      where: { userId },
      data: { userId: randomBytes(12).toString('hex'), vacatedAt: now },
    });
    return result.count;
  }

  private async gloryOf(userId: string): Promise<number> {
    const somme = await this.prisma.gloryLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return somme._sum.delta ?? 0;
  }
}
