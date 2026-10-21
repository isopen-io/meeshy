/**
 * LE RATTRAPAGE DES COMPTEURS D'ACTIONS — #10845, décision du porteur (2026-10-16).
 *
 * `EngagementCounter.count` est parti de 0 le 2026-09-07 sans rattrapage de l'historique, et l'ancienne frappe en
 * débitait des actions (donc éteignait des badges). Résultat : « 🏆 Palier 3 atteint — Messages texte : 50 » pour un
 * compte aux milliers de messages. Ce passage relève chaque compteur au TOTAL RÉEL quand une source fiable existe
 * (`engagementAxisHistory.ts` dit lesquelles, et documente celles qu'on ne peut pas reconstruire).
 *
 * ## La loi
 *
 *  - cible = max(compteur actuel, historique) — un compteur ne BAISSE jamais ;
 *  - les paliers de badge ≤ cible non gravés sont gravés EN SILENCE : `EngagementMilestone`, P2002 ignoré, aucune
 *    notification (un palier éteint par une ancienne frappe se regrave aussi) ;
 *  - IDEMPOTENTE : rejouée sur l'état qu'elle a produit, elle n'écrit plus rien ;
 *  - l'écriture du compteur est GARDÉE par « la valeur est encore celle que j'ai lue » (`raiseEngagementCounterCount`) :
 *    un geste concurrent n'est jamais écrasé, le compte est laissé (`moved`) et le passage se relance ;
 *  - À BLANC par défaut : `apply: false` ne lit que.
 *
 * Ni `points`, ni `updatedAt` ne sont touchés. Le rapport ne porte aucun identifiant de compte.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BADGE_THRESHOLDS, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { raiseEngagementCounterCount } from './EngagementCounterWrites';
import { prefixRange } from '../../utils/prefix-range';
import { AXES_WITH_HISTORY, engraveBadgesSilently, historyCountFor } from './engagementAxisHistory';

export type CountBackfillPlan = {
  /** Le compteur lu — `null` : pas de ligne. */
  readonly from: number | null;
  readonly target: number;
  /** L'écriture du compteur, `null` si rien à relever. */
  readonly write: { readonly from: number | null; readonly to: number } | null;
  readonly thresholdsToEngrave: readonly number[];
};

/** La loi pure d'UN axe d'UN compte. */
export function planCountBackfill(params: {
  readonly current: number | null;
  readonly history: number;
  readonly engravedThresholds: readonly number[];
}): CountBackfillPlan {
  const current = params.current;
  const target = Math.max(current ?? 0, Math.max(0, Math.trunc(params.history)));
  const engraved = new Set(params.engravedThresholds);
  return {
    from: current,
    target,
    write: target > (current ?? 0) ? { from: current, to: target } : null,
    thresholdsToEngrave: BADGE_THRESHOLDS.filter((threshold) => threshold <= target && !engraved.has(threshold)),
  };
}

export type CountBackfillStatus = 'simulated' | 'applied' | 'unchanged' | 'moved';

export type CountBackfillAccountReport = {
  readonly axisKey: string;
  readonly status: CountBackfillStatus;
  readonly plan: CountBackfillPlan;
};

export type CountBackfillTotals = {
  readonly accounts: number;
  readonly accountsToWrite: number;
  readonly countsRaised: number;
  readonly badgesToEngrave: number;
  readonly applied: number;
  readonly moved: number;
};

export type CountBackfillReport = {
  readonly accounts: readonly CountBackfillAccountReport[];
  readonly totals: CountBackfillTotals;
};

const PAGE = 200;

const thresholdOf = (key: string, axisKey: string): number | null => {
  const suffix = key.startsWith(`${axisKey}:`) ? Number.parseInt(key.slice(axisKey.length + 1), 10) : Number.NaN;
  return Number.isFinite(suffix) ? suffix : null;
};

/**
 * Le PASSAGE : lit compte par compte (par pages), planifie, et n'écrit que si `apply`. Ne rapporte que les comptes qui
 * ont quelque chose à écrire — un compte juste n'apparaît pas.
 */
export async function backfillEngagementCounts(prisma: PrismaClient, options: { readonly apply: boolean }): Promise<CountBackfillReport> {
  const accounts: CountBackfillAccountReport[] = [];
  let seen = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor === undefined ? {} : { where: { id: { gt: cursor } } }),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;
    for (const { id: userId } of page) {
      seen += 1;
      for (const axisKey of AXES_WITH_HISTORY) {
        const history = await historyCountFor(prisma, userId, axisKey);
        if (history === null) continue;
        const [row, milestones] = await Promise.all([
          prisma.engagementCounter.findFirst({ where: { userId, axisKey }, select: { count: true } }),
          prisma.engagementMilestone.findMany({ where: { userId, milestoneType: 'badge', milestoneKey: prefixRange(`${axisKey}:`) }, select: { milestoneKey: true } }),
        ]);
        const plan = planCountBackfill({
          current: row === null ? null : (row.count ?? 0),
          history,
          engravedThresholds: milestones.map((m) => thresholdOf(m.milestoneKey, axisKey)).filter((t): t is number => t !== null),
        });
        if (plan.write === null && plan.thresholdsToEngrave.length === 0) continue;

        let status: CountBackfillStatus = 'simulated';
        if (options.apply) {
          const raised = plan.write === null ? true : await raiseEngagementCounterCount(prisma, { userId, axisKey, from: plan.write.from, to: plan.write.to });
          if (raised) {
            await engraveBadgesSilently(prisma, userId, axisKey as EngagementAxisKey, plan.target);
            status = 'applied';
          } else {
            status = 'moved';
          }
        }
        accounts.push({ axisKey, status, plan });
      }
    }
    if (page.length < PAGE) break;
  }

  const count = (predicate: (a: CountBackfillAccountReport) => boolean) => accounts.filter(predicate).length;
  return {
    accounts,
    totals: {
      accounts: seen,
      accountsToWrite: accounts.length,
      countsRaised: count((a) => a.plan.write !== null),
      badgesToEngrave: accounts.reduce((sum, a) => sum + a.plan.thresholdsToEngrave.length, 0),
      applied: count((a) => a.status === 'applied'),
      moved: count((a) => a.status === 'moved'),
    },
  };
}
