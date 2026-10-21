/**
 * LA SÉRIE D'UN ACTE (#10389) — seul écrivain d'`EngagementActStreak`.
 *
 * Lecture puis écriture CONDITIONNELLE : la ligne ne s'écrit que si elle vaut
 * encore ce qu'on a lu (`lastDay` et `currentDays`). Deux crédits concurrents
 * du même acte le même jour ne font avancer la série qu'une fois ; le perdant
 * relit, voit le jour déjà compté, et s'arrête. La loi de la série est
 * `nextActStreak`, partagée avec les clients.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ENGAGEMENT_STREAK_ACTS,
  isEngagementStreakAct,
  nextActStreak,
  type ActStreakView,
  type EngagementStreakAct,
} from '@meeshy/shared/types/engagement-act-streaks';

type ActStreakClient = Pick<PrismaClient, 'engagementActStreak'>;

const WRITE_ATTEMPTS = 3;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Ce qu'un crédit vient de faire à la série : de `previousDays` à `currentDays`. */
export type ActStreakAdvance = { readonly previousDays: number; readonly currentDays: number };

export class ActStreakRecorder {
  constructor(private readonly prisma: ActStreakClient) {}

  /**
   * Compte `today` (`YYYY-MM-DD`, jour civil du compte) dans la série de
   * `act`. Rend l'avancée quand la série vient de gagner un jour, `null`
   * quand ce jour était déjà compté.
   */
  async advance(userId: string, act: EngagementStreakAct, today: string): Promise<ActStreakAdvance | null> {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const row = await this.prisma.engagementActStreak.findUnique({
        where: { userId_act: { userId, act } },
        select: { currentDays: true, longestDays: true, lastDay: true },
      });
      const next = nextActStreak(row, today);
      if (!next.advanced) return null;
      const data = { currentDays: next.currentDays, longestDays: next.longestDays, lastDay: next.lastDay };
      const written = row === null ? await this.create(userId, act, data) : await this.update(userId, act, row, data);
      if (written) return { previousDays: next.currentDays - 1, currentDays: next.currentDays };
    }
    return null;
  }

  /** Les séries d'acte du compte, dans l'ordre des actes. */
  async list(userId: string): Promise<readonly ActStreakView[]> {
    const rows = await this.prisma.engagementActStreak.findMany({
      where: { userId },
      select: { act: true, currentDays: true, longestDays: true, lastDay: true },
    });
    return rows
      .filter((row): row is typeof row & { act: EngagementStreakAct } => isEngagementStreakAct(row.act))
      .map((row) => ({ act: row.act, currentDays: row.currentDays, longestDays: row.longestDays, lastDay: row.lastDay }))
      .sort((a, b) => ENGAGEMENT_STREAK_ACTS.indexOf(a.act) - ENGAGEMENT_STREAK_ACTS.indexOf(b.act));
  }

  private async create(
    userId: string,
    act: EngagementStreakAct,
    data: { readonly currentDays: number; readonly longestDays: number; readonly lastDay: string },
  ): Promise<boolean> {
    try {
      await this.prisma.engagementActStreak.create({ data: { userId, act, ...data } });
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  private async update(
    userId: string,
    act: EngagementStreakAct,
    seen: { readonly currentDays: number; readonly lastDay: string },
    data: { readonly currentDays: number; readonly longestDays: number; readonly lastDay: string },
  ): Promise<boolean> {
    const written = await this.prisma.engagementActStreak.updateMany({
      where: { userId, act, lastDay: seen.lastDay, currentDays: seen.currentDays },
      data,
    });
    return written.count === 1;
  }
}
