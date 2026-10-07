/**
 * LES LIMITES QUOTIDIENNES DE GESTES (#9584, décision porteur 2026-10-07).
 *
 * Par personne et par jour civil du COMPTE (son fuseau, comme le jour du jeu,
 * #9558) : combien de commentaires et de réactions de post elle peut faire, sur
 * un original ou sous une republication — les valeurs sont celles du barème
 * (`pathCaps`, réglables par l'administration).
 *
 * Une limite borne le geste ET ses points, avec UN seul compteur : le geste qui
 * passe consomme une place, puis rapporte ce que le barème lui accorde (les
 * opérations gouvernées n'ont aucun autre plafond quotidien) ; le geste qui ne
 * passe pas est REFUSÉ avant toute écriture, ne consomme rien et ne rapporte
 * rien. Retirer un geste ne rend pas sa place du jour.
 *
 * La place se prend par une écriture CONDITIONNELLE (`count < limite`) : deux
 * gestes concurrents ne passent jamais tous deux sous la limite, et un refus
 * n'incrémente rien — le compteur dit exactement combien de gestes ont eu lieu.
 * Un geste admis dont l'écriture échoue ensuite rend sa place (`release`).
 *
 * Les places vivent dans `EngagementQuota` (`gesture:<famille>`,
 * `<chemin>:day:<AAAA-MM-JJ>`), jamais lues par le crédit.
 *
 * Une lecture ou une écriture qui ÉCHOUE (le compteur, le fuseau) laisse passer
 * le geste sans place : la limite est un garde-fou contre le spam, pas une
 * condition du geste, et ce qu'elle protège — les points — tombe avec la même
 * base. Seule une limite ATTEINTE refuse.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types/errors';
import {
  dailyGestureLimit,
  type EngagementPathFamily,
  type EngagementPostPath,
} from '@meeshy/shared/types/engagement-scale';
import { dayKeyOf, instantOfLocal, markerOfDayKey } from '../game/gameClock';
import { civilDayKey, ONE_DAY_MS } from './civilDay';
import { engagementScaleServiceFor, type EngagementScaleSource } from './EngagementScaleService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'DailyGestureGate' });

type GatePrisma = Pick<PrismaClient, 'engagementQuota' | 'user' | 'engagementScaleConfig'>;

const LIMIT_CODE: Readonly<Record<EngagementPathFamily, ErrorCode>> = {
  comment: ErrorCode.DAILY_COMMENT_LIMIT,
  reaction: ErrorCode.DAILY_REACTION_LIMIT,
};

/** La place prise par un geste admis — `null` quand aucune limite ne s'appliquait. */
export type GestureTicket = { readonly userId: string; readonly operationKey: string; readonly bucket: string } | null;

/** Minuit qui ouvre le jour civil suivant `dayKey`, dans le fuseau du compte. */
export function nextMidnight(dayKey: string, timezone: string | null | undefined): Date {
  const nextDayKey = civilDayKey(new Date(markerOfDayKey(dayKey).getTime() + ONE_DAY_MS));
  return instantOfLocal({ dayKey: nextDayKey, minuteOfDay: 0, timezone });
}

/** Le refus : la limite du jour est atteinte, jusqu'à `resetAt`. */
export class DailyGestureLimitReached extends Error {
  readonly code: ErrorCode;

  constructor(
    readonly family: EngagementPathFamily,
    readonly path: EngagementPostPath,
    readonly limit: number,
    readonly resetAt: Date,
  ) {
    super(ErrorMessages[LIMIT_CODE[family]].fr);
    this.name = 'DailyGestureLimitReached';
    this.code = LIMIT_CODE[family];
  }

  /** Les secondes jusqu'à la remise à zéro — jamais moins d'une. */
  retryAfter(now: Date = new Date()): number {
    return Math.max(1, Math.ceil((this.resetAt.getTime() - now.getTime()) / 1000));
  }

  /** Ce que REST et socket servent à côté du `code` : quand, et quelle limite. */
  details(now: Date = new Date()): { readonly retryAfter: number; readonly resetAt: string; readonly limit: number; readonly path: EngagementPostPath } {
    return { retryAfter: this.retryAfter(now), resetAt: this.resetAt.toISOString(), limit: this.limit, path: this.path };
  }
}

const isP2002 = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export class DailyGestureGate {
  constructor(
    private readonly prisma: GatePrisma,
    private readonly scale: EngagementScaleSource = engagementScaleServiceFor(prisma),
  ) {}

  /**
   * Prend une place pour ce geste, ou lève `DailyGestureLimitReached`. À
   * appeler AVANT l'écriture du geste, et après les refus qui ne doivent rien
   * consommer (cible introuvable, plafond des cinq réactions).
   */
  async admit(userId: string, family: EngagementPathFamily, path: EngagementPostPath, now: Date = new Date()): Promise<GestureTicket> {
    const verdict = await this.decide(userId, family, path, now).catch((error: unknown) => {
      log.warn('daily gesture limit unreadable — the gesture passes uncounted', {
        family,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ticket: null } as const;
    });
    if ('refusal' in verdict) throw verdict.refusal;
    return verdict.ticket;
  }

  private async decide(
    userId: string,
    family: EngagementPathFamily,
    path: EngagementPostPath,
    now: Date,
  ): Promise<{ readonly ticket: GestureTicket } | { readonly refusal: DailyGestureLimitReached }> {
    const limit = dailyGestureLimit(await this.scale.current(), family, path);
    if (limit === null) return { ticket: null };
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const dayKey = dayKeyOf(now, owner?.timezone);
    const ticket = { userId, operationKey: `gesture:${family}`, bucket: `${path}:day:${dayKey}` };
    if (limit > 0 && (await this.take(ticket, limit))) return { ticket };
    return { refusal: new DailyGestureLimitReached(family, path, limit, nextMidnight(dayKey, owner?.timezone)) };
  }

  /** Rend la place d'un geste admis qui n'a finalement pas eu lieu. */
  async release(ticket: GestureTicket): Promise<void> {
    if (ticket === null) return;
    await this.prisma.engagementQuota
      .updateMany({ where: { ...ticket, count: { gt: 0 } }, data: { count: { decrement: 1 } } })
      .catch((error: unknown) => log.warn('daily gesture place not released', { error: error instanceof Error ? error.message : String(error) }));
  }

  private async take(ticket: NonNullable<GestureTicket>, limit: number): Promise<boolean> {
    const increment = () =>
      this.prisma.engagementQuota.updateMany({
        where: { ...ticket, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
    if ((await increment()).count > 0) return true;
    try {
      await this.prisma.engagementQuota.create({ data: { ...ticket, count: 1 } });
      return true;
    } catch (err) {
      if (!isP2002(err)) throw err;
      return (await increment()).count > 0;
    }
  }
}
