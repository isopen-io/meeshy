/**
 * LE RATTRAPAGE DES ÉTINCELLES — #10846, décision du porteur (2026-10-16).
 *
 * Les colonnes `sparksEarnedLifetime` (le total accumulé à vie), `sparksSincePrestige` (le cycle, base du niveau) et
 * `levelMaxLifetime` (le niveau max à vie) sont NÉES avec les étincelles : tout compte antérieur les a ABSENTES. Ce
 * passage pose, pour chacun, une BORNE BASSE honnête — jamais une invention :
 *
 *     total à vie      ≥ poche + Σ prix des frappes (`MeeshLedger.meta.price`)
 *     cycle            ≥ poche + Σ prix des frappes DEPUIS le dernier prestige
 *     niveau max à vie ≥ record du cycle (`levelRecord`)
 *
 * ## Pourquoi une borne basse, et ce qui reste inconnu
 *
 * L'ancienne frappe DÉBITAIT la poche : tout ce qu'un compte a dépensé en Meeshes est sorti du score, et le prix
 * payé est gravé au registre. Poche + Σ prix est donc le MINIMUM de ce qu'il a gagné. Ne se reconstruisent pas : les
 * points repris par la suppression d'un contenu (`takeBackPoints`), ceux effacés par un prestige passé (≥ 100 000
 * selon la courbe de l'époque — non ajoutés, la courbe ayant changé le 2026-10-08), ni ce que des Meeshes d'avant le
 * registre auraient coûté. Un total à vie rattrapé est donc ≤ la vérité ; il ne la dépasse jamais.
 *
 * ## La loi
 *
 *  - ne BAISSE rien : chaque champ prend le plus haut de sa valeur actuelle et de la borne ; le total à vie n'est
 *    jamais sous le cycle ;
 *  - IDEMPOTENTE : rejouée sur l'état qu'elle a produit, elle n'écrit plus rien ;
 *  - l'écriture est GARDÉE par la valeur lue (la poche et chaque champ doivent valoir encore ce qu'on a lu) : un crédit
 *    arrivé entre la lecture et l'écriture n'est jamais écrasé, le compte est laissé (`moved`) et le passage se relance ;
 *  - À BLANC par défaut : `apply: false` ne lit que. Le rapport ne porte aucun identifiant de compte.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MEESH_MINT_COST } from '@meeshy/shared/utils/meesh';
import { sparkCount } from '../game/SparksFacts';

type Raise = { readonly from: number | null; readonly to: number };

export type SparksBackfillPlan = {
  readonly lifetime: Raise | null;
  readonly cycle: Raise | null;
  readonly levelMax: Raise | null;
};

/** La loi pure d'UN compte. `null` en entrée : le champ est absent. */
export function planSparksBackfill(account: {
  readonly pocket: number;
  readonly cycle: number | null;
  readonly lifetime: number | null;
  readonly levelRecord: number | null;
  readonly levelMaxLifetime: number | null;
  /** Les prix de TOUTES les frappes du registre. */
  readonly mintPrices: readonly number[];
  /** Σ des prix des frappes postérieures au dernier prestige (toutes, sans prestige). */
  readonly mintPricesSincePrestige: number;
}): SparksBackfillPlan {
  const spent = account.mintPrices.reduce((sum, price) => sum + price, 0);
  const cycleTarget = Math.max(account.cycle ?? 0, account.pocket + account.mintPricesSincePrestige);
  const lifetimeTarget = Math.max(account.lifetime ?? 0, account.pocket + spent, cycleTarget);
  const levelMaxTarget = Math.max(account.levelMaxLifetime ?? 0, account.levelRecord ?? 0);
  const raise = (from: number | null, to: number): Raise | null => (to > (from ?? 0) || (from === null && to > 0) ? { from, to } : null);
  return {
    lifetime: raise(account.lifetime, lifetimeTarget),
    cycle: raise(account.cycle, cycleTarget),
    levelMax: raise(account.levelMaxLifetime, levelMaxTarget),
  };
}

export type SparksBackfillStatus = 'simulated' | 'applied' | 'moved';

export type SparksBackfillAccountReport = { readonly status: SparksBackfillStatus; readonly plan: SparksBackfillPlan };

export type SparksBackfillTotals = {
  readonly accounts: number;
  readonly accountsToWrite: number;
  /** Σ des étincelles ajoutées au total à vie (borne basse). */
  readonly lifetimeAdded: number;
  readonly applied: number;
  readonly moved: number;
};

export type SparksBackfillReport = { readonly accounts: readonly SparksBackfillAccountReport[]; readonly totals: SparksBackfillTotals };

const PAGE = 200;

const priceOf = (meta: unknown): number => {
  const m = (meta ?? {}) as { price?: unknown; cost?: unknown };
  for (const candidate of [m.price, m.cost]) if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return Math.trunc(candidate);
  // Une frappe d'avant le reçu (#9374) : le prix d'alors était la base.
  return MEESH_MINT_COST;
};

/** Le champ lu tel que la base le porte : `null` si ABSENT ou null — la garde l'atteint par `isSet`. */
const readField = (value: unknown): number | null => (value === null || value === undefined ? null : sparkCount(value));

/** Une garde « la colonne vaut encore ce que j'ai lu » — l'absence se garde par `isSet: false`, pas par `null` (leçon 318). */
const guardOf = (field: string, read: number | null): Record<string, unknown> =>
  read === null ? { OR: [{ [field]: null }, { [field]: { isSet: false } }] } : { [field]: BigInt(read) };

export async function backfillEngagementSparks(prisma: PrismaClient, options: { readonly apply: boolean }): Promise<SparksBackfillReport> {
  const accounts: SparksBackfillAccountReport[] = [];
  let seen = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.user.findMany({
      select: { id: true, engagementScore: true, sparksSincePrestige: true, sparksEarnedLifetime: true, levelRecord: true, levelMaxLifetime: true, prestige: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor === undefined ? {} : { where: { id: { gt: cursor } } }),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const row of page) {
      seen += 1;
      const [mints, prestigeLine] = await Promise.all([
        prisma.meeshLedger.findMany({ where: { userId: row.id, reason: 'mint' }, select: { createdAt: true, meta: true } }),
        (row.prestige ?? 0) > 0
          ? prisma.gloryLedger.findFirst({ where: { userId: row.id, requestId: `prestige:${row.prestige}` }, select: { createdAt: true } })
          : Promise.resolve(null),
      ]);
      const since = prestigeLine?.createdAt ?? null;
      const prices = mints.map((m) => priceOf(m.meta));
      const sincePrestige = mints
        .filter((m) => since === null || m.createdAt > since)
        .reduce((sum, m) => sum + priceOf(m.meta), 0);
      const pocket = sparkCount(row.engagementScore);
      const cycle = readField(row.sparksSincePrestige);
      const lifetime = readField(row.sparksEarnedLifetime);
      const levelMax = readField(row.levelMaxLifetime);
      const plan = planSparksBackfill({
        pocket,
        cycle,
        lifetime,
        levelRecord: readField(row.levelRecord),
        levelMaxLifetime: levelMax,
        mintPrices: prices,
        // Un prestige gravé sans ligne de Gloire lisible : on ne compte AUCUNE frappe dans le cycle (borne basse).
        mintPricesSincePrestige: (row.prestige ?? 0) > 0 && since === null ? 0 : sincePrestige,
      });
      if (plan.lifetime === null && plan.cycle === null && plan.levelMax === null) continue;

      let status: SparksBackfillStatus = 'simulated';
      if (options.apply) {
        const written = await prisma.user.updateMany({
          // Garde : la poche et chaque colonne écrite valent ENCORE ce qu'on a lu.
          where: {
            id: row.id,
            AND: [
              { engagementScore: row.engagementScore ?? 0 },
              ...(plan.cycle ? [guardOf('sparksSincePrestige', cycle)] : []),
              ...(plan.lifetime ? [guardOf('sparksEarnedLifetime', lifetime)] : []),
              ...(plan.levelMax ? [levelMax === null ? { OR: [{ levelMaxLifetime: null }, { levelMaxLifetime: { isSet: false } }] } : { levelMaxLifetime: levelMax }] : []),
            ],
          },
          data: {
            ...(plan.cycle ? { sparksSincePrestige: BigInt(plan.cycle.to) } : {}),
            ...(plan.lifetime ? { sparksEarnedLifetime: BigInt(plan.lifetime.to) } : {}),
            ...(plan.levelMax ? { levelMaxLifetime: plan.levelMax.to } : {}),
          },
        });
        status = written.count > 0 ? 'applied' : 'moved';
      }
      accounts.push({ status, plan });
    }
    if (page.length < PAGE) break;
  }

  return {
    accounts,
    totals: {
      accounts: seen,
      accountsToWrite: accounts.length,
      lifetimeAdded: accounts.reduce((sum, a) => sum + (a.plan.lifetime ? a.plan.lifetime.to - (a.plan.lifetime.from ?? 0) : 0), 0),
      applied: accounts.filter((a) => a.status === 'applied').length,
      moved: accounts.filter((a) => a.status === 'moved').length,
    },
  };
}
