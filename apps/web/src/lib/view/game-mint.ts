import { BADGE_THRESHOLDS, type EngagementCounterEntry, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { computeMeeshMintPlan } from '@meeshy/shared/utils/meesh';

/**
 * COMBIEN DE BADGES UNE FRAPPE ÉTEINT (#9383) — le chiffre de l'aperçu
 * (« 2 badges redescendent »), annoncé avant le geste.
 *
 * Le débit est la loi partagée (`computeMeeshMintPlan`, avec le prix de CETTE
 * frappe) ; ici on ne fait que compter, axe par axe, les paliers de badge que
 * `count - repris` ne tient plus. Un serveur qui ne sert pas les points par
 * axe (`points` absent) ne permet pas ce calcul : on rend `0`, jamais un chiffre
 * inventé — une promesse fausse avant un geste irréversible est pire qu'aucune.
 */

const tiersHeld = (count: number): number => BADGE_THRESHOLDS.filter((threshold) => count >= threshold).length;

export function badgesDroppedByMint(counters: readonly EngagementCounterEntry[], price: number): number {
  if (!counters.every((counter) => counter.points !== undefined)) return 0;
  const plan = computeMeeshMintPlan(
    counters.map((counter) => ({
      axisKey: counter.axisKey as EngagementAxisKey,
      count: counter.count,
      points: counter.points ?? 0,
    })),
    { mintCost: price },
  );
  const countOf = new Map(counters.map((counter) => [counter.axisKey, counter.count]));
  return plan.debits.reduce((lost, line) => {
    const before = countOf.get(line.axisKey) ?? 0;
    return lost + tiersHeld(before) - tiersHeld(Math.max(0, before - line.count));
  }, 0);
}
