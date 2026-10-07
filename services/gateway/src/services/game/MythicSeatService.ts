/**
 * LES CENT PLACES DU MYTHE (#9636) — le SEUL point d'écriture des registres
 * `MythicSeat` (les places) et `MythicEdition` (les émissions).
 *
 * Un compte qui atteint 1 000 000 de Gloire prend une place libre, tant qu'il en
 * reste une des cent, dans l'ordre d'arrivée. Chaque attribution tire un NUMÉRO
 * D'ÉMISSION neuf (1, 2, 3… jamais réattribué) dont dérive la Signature unique.
 * Tant que le compte existe, rien ne lui retire sa place. Sa suppression la
 * LIBÈRE (décision porteur 2026-10-08) : la ligne est effacée — aucune donnée du
 * compte ne reste — et la place revient au compte en attente qui a franchi le
 * million le plus tôt, avec une émission neuve.
 *
 * ## Une seule porte : `sweep`
 *
 * Toute attribution passe par `sweep`, et `sweep` seul décide qui entre : la
 * Gloire lue au REGISTRE (`Σ delta`, la source de `gloryTotalFromLedger`) et la
 * loi partagée (`reachesMythe`), un compte VIVANT (`eligibleUserIds` : actif, non
 * supprimé, pas un compte d'agent), l'ordre d'arrivée (`mythicArrivalOrder`). Le
 * crédit de Gloire, la lecture du bloc de jeu, la nuit et la purge ne font que
 * DEMANDER un passage — aucun n'écrit une place lui-même.
 *
 * ## Atomicité, sans transaction
 *
 *  - la place tentée est la plus petite libre ; son `_id` est DÉRIVÉ de son
 *    numéro : deux attributions de la même place se heurtent à l'index `_id`, et
 *    la perdante retente à la suivante — jamais au-delà de la 100e ;
 *  - l'émission est tirée au registre en ajout seul, `_id` dérivé lui aussi :
 *    deux tirages du même numéro se heurtent, aucun numéro ne sert deux fois ;
 *  - l'unique sur `userId` (migration `2026-10-07-mythic-seat-indexes`) refuse
 *    une seconde place au même compte : le perdant relit la sienne ;
 *  - la course avec une suppression se ferme APRÈS l'écriture : la place posée,
 *    le compte est relu ; s'il n'est plus vivant (marqué supprimé avant sa purge),
 *    la place est retirée aussitôt et rendue au suivant.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MYTHE_GLORY, MYTHE_SIZE, isMythicEdition, isMythicNumber, type MythicSeatRef } from '@meeshy/shared/utils/game/glory';
import { mythicArrivalOrder, mythicCrossedAt, nextMythicNumber, reachesMythe, type MythicArrival } from '@meeshy/shared/utils/game/mythe';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';

const log = enhancedLogger.child({ module: 'MythicSeatService' });

type SeatDb = Pick<PrismaClient, 'mythicSeat' | 'mythicEdition' | 'gloryLedger' | 'user'>;

const objectIdOf = (prefix: string, n: number): string => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;

/** `"mythe"` en hexadécimal, puis la place : un ObjectId stable par place. */
export const mythicSeatId = (number: number): string => objectIdOf('6d79746865', number);

/** `"medit"` en hexadécimal, puis l'émission : un ObjectId stable par émission. */
export const mythicEditionId = (edition: number): string => objectIdOf('6d65646974', edition);

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export type MythicGrant = { readonly userId: string; readonly number: number; readonly edition: number };

export class MythicSeatService {
  constructor(private readonly prisma: SeatDb) {}

  /** La place du compte et son émission, `null` s'il n'en a pas. */
  async seatOf(userId: string): Promise<MythicSeatRef | null> {
    const row = await this.prisma.mythicSeat.findUnique({ where: { userId }, select: { number: true, edition: true } });
    return row !== null && isMythicNumber(row.number) && isMythicEdition(row.edition) ? { number: row.number, edition: row.edition } : null;
  }

  /**
   * La place du compte : celle qu'il a, ou — si sa Gloire atteint le seuil et
   * qu'une place est libre — celle que le passage `sweep` lui donne à son rang
   * d'arrivée. `glory` n'est qu'un raccourci pour ne pas relire le registre quand
   * il est clairement sous le seuil ; la décision, elle, se prend au registre.
   */
  async claimIfEligible(userId: string, glory?: number, now: Date = new Date()): Promise<MythicSeatRef | null> {
    const held = await this.seatOf(userId);
    if (held !== null) return held;
    if (!reachesMythe(glory ?? (await this.gloryOf(userId)))) return null;
    if ((await this.prisma.mythicSeat.count()) >= MYTHE_SIZE) return null;
    await this.sweep(now);
    return this.seatOf(userId);
  }

  /**
   * LA porte d'entrée : les comptes vivants à 1 000 000 de Gloire ou plus qui
   * n'ont pas de place la prennent, dans l'ordre où leur Gloire a franchi le seuil,
   * tant qu'il reste des places. Ne retire jamais la place d'un compte vivant.
   * Rend les attributions faites par CE passage.
   */
  async sweep(now: Date = new Date()): Promise<readonly MythicGrant[]> {
    const seats = await this.prisma.mythicSeat.findMany({ select: { userId: true }, take: MYTHE_SIZE + 1 });
    if (seats.length >= MYTHE_SIZE) return [];
    const sums = await this.prisma.gloryLedger.groupBy({ by: ['userId'], _sum: { delta: true }, having: { delta: { _sum: { gte: MYTHE_GLORY } } } });
    const seated = new Set(seats.map((row) => row.userId));
    const waiting = sums.filter((row) => !seated.has(row.userId));
    if (waiting.length === 0) return [];
    const alive = await this.eligibleUserIds(waiting.map((row) => row.userId));

    const arrivals: MythicArrival[] = [];
    for (const row of waiting.filter((r) => alive.has(r.userId))) {
      const gains = await this.prisma.gloryLedger.findMany({ where: { userId: row.userId }, select: { delta: true, createdAt: true } });
      const crossedAt = mythicCrossedAt(gains.map((g) => ({ delta: g.delta, createdAt: g.createdAt.toISOString() })));
      if (crossedAt !== null) arrivals.push({ userId: row.userId, glory: row._sum.delta ?? 0, crossedAt });
    }

    const granted: MythicGrant[] = [];
    for (const arrival of mythicArrivalOrder(arrivals)) {
      const outcome = await this.grant(arrival.userId, arrival.glory, now);
      if (outcome === 'full') break;
      if (outcome !== null) granted.push(outcome);
    }
    return granted;
  }

  /**
   * La suppression d'un compte (RGPD art. 17, décision porteur 2026-10-08) : sa place
   * est EFFACÉE — aucun identifiant ne reste, l'émission reste au registre sans lien —
   * puis rendue au suivant. Rend le nombre de places libérées (0 ou 1).
   */
  async release(userId: string, now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.mythicSeat.deleteMany({ where: { userId } });
    if (count > 0) {
      await this.sweep(now).catch((error: unknown) =>
        log.warn('mythic seat released, reassignment left to the next pass', { error: error instanceof Error ? error.message : String(error) }),
      );
    }
    return count;
  }

  /** Les comptes qui peuvent tenir une place : actifs, non supprimés, et pas des comptes d'agent. */
  private async eligibleUserIds(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...ids] }, isActive: true, role: { not: 'AGENT' }, ...unsetOrNull('deletedAt') },
      select: { id: true },
      take: ids.length,
    });
    return new Set(rows.map((row) => row.id));
  }

  /** Une attribution : la plus petite place libre, une émission neuve, puis la relecture du compte. */
  private async grant(userId: string, glory: number, now: Date): Promise<MythicGrant | 'full' | null> {
    let edition: number | null = null;
    for (let attempt = 0; attempt <= MYTHE_SIZE; attempt += 1) {
      const taken = await this.prisma.mythicSeat.findMany({ select: { number: true }, take: MYTHE_SIZE + 1 });
      const number = nextMythicNumber(taken.map((row) => row.number));
      if (number === null) return 'full';
      edition ??= await this.issueEdition(now);
      try {
        await this.prisma.mythicSeat.create({ data: { id: mythicSeatId(number), number, userId, edition, glory: Math.trunc(glory), grantedAt: now } });
      } catch (error) {
        if (!isP2002(error)) throw error;
        if ((await this.seatOf(userId)) !== null) return null;
        continue;
      }
      if (!(await this.eligibleUserIds([userId])).has(userId)) {
        await this.prisma.mythicSeat.deleteMany({ where: { id: mythicSeatId(number), userId } });
        log.info('mythic seat withdrawn: the account left while it was granted', { number });
        return null;
      }
      log.info('mythic seat granted', { userId, number, edition });
      return { userId, number, edition };
    }
    return null;
  }

  /** Le numéro d'émission suivant, tiré au registre en ajout seul : jamais deux fois le même. */
  private async issueEdition(now: Date): Promise<number> {
    for (;;) {
      const edition = (await this.prisma.mythicEdition.count()) + 1;
      try {
        await this.prisma.mythicEdition.create({ data: { id: mythicEditionId(edition), edition, grantedAt: now } });
        return edition;
      } catch (error) {
        if (!isP2002(error)) throw error;
      }
    }
  }

  private async gloryOf(userId: string): Promise<number> {
    const somme = await this.prisma.gloryLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return somme._sum.delta ?? 0;
  }
}
