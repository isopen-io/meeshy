import type { EngagementCounterEntry } from '@meeshy/shared/types/engagement';

/** CE QU'UNE FRAPPE ÉTEINT (#9383, #9379) — désormais RIEN (voir `mintBadgeImpact`). */
export type MintBadgeImpact = {
  /** Paliers de badge qui tombent, tous axes confondus. */
  readonly lost: number;
  /** Actions à refaire pour rallumer le plus proche ; `0` quand rien ne tombe. */
  readonly regain: number;
};

/**
 * La frappe n'éteint PLUS aucun badge (porteur, 2026-10-16, #10845) : elle dépense la poche d'étincelles et ne débite ni
 * `count` ni points d'axe. L'aperçu le dit donc toujours — « aucun badge ne s'éteint » — quels que soient les compteurs :
 * l'ancienne prévision (`computeMeeshMintPlan`) décrit une loi que le serveur n'applique plus.
 */
export function mintBadgeImpact(_counters: readonly EngagementCounterEntry[], _price: number): MintBadgeImpact | null {
  return { lost: 0, regain: 0 };
}
