import { BADGE_THRESHOLDS, type EngagementCounterEntry, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { computeMeeshMintPlan } from '@meeshy/shared/utils/meesh';

/**
 * CE QU'UNE FRAPPE ÉTEINT (#9383, #9379) — le chiffre de l'aperçu
 * (« 2 badges redescendent ») et celui du guide (« 11 actions pour le
 * rallumer »), annoncés avant le geste.
 *
 * Le débit est la loi partagée (`computeMeeshMintPlan`, avec le prix de CETTE
 * frappe) ; ici on ne fait que compter, axe par axe, les paliers de badge que
 * `count - repris` ne tient plus, et la distance au PLUS PROCHE d'entre eux —
 * c'est elle que le guide promet. Un serveur qui ne sert pas les points par
 * axe (`points` absent) ne permet pas ce calcul : on rend `null` (« inconnu »),
 * jamais un `0` qui dirait « aucun badge ne s'éteint » à tort.
 */

export type MintBadgeImpact = {
  /** Paliers de badge qui tombent, tous axes confondus. */
  readonly lost: number;
  /** Actions à refaire pour rallumer le plus proche ; `0` quand rien ne tombe. */
  readonly regain: number;
};

const tiersHeld = (count: number): readonly number[] => BADGE_THRESHOLDS.filter((threshold) => count >= threshold);

export function mintBadgeImpact(counters: readonly EngagementCounterEntry[], price: number): MintBadgeImpact | null {
  if (!counters.every((counter) => counter.points !== undefined)) return null;
  const plan = computeMeeshMintPlan(
    counters.map((counter) => ({
      axisKey: counter.axisKey as EngagementAxisKey,
      count: counter.count,
      points: counter.points ?? 0,
    })),
    { mintCost: price },
  );
  const countOf = new Map(counters.map((counter) => [counter.axisKey, counter.count]));
  const losses = plan.debits.flatMap((line) => {
    const before = countOf.get(line.axisKey) ?? 0;
    const after = Math.max(0, before - line.count);
    const dropped = tiersHeld(before).filter((threshold) => threshold > after);
    return dropped.length === 0 ? [] : [{ dropped: dropped.length, regain: Math.min(...dropped) - after }];
  });
  return {
    lost: losses.reduce((total, loss) => total + loss.dropped, 0),
    regain: losses.length === 0 ? 0 : Math.min(...losses.map((loss) => loss.regain)),
  };
}
