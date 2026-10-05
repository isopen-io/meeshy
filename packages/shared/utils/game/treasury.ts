/**
 * LE TRÉSOR (#9373) — les Meeshes GARDÉES, six paliers visibles sur le profil.
 * Il baisse quand on dépense. `docs/product/jeu-meeshy-conception.html` § II.3.
 */

export const TREASURY_TIERS = [
  { key: 'bourse', minHeld: 1 },
  { key: 'escarcelle', minHeld: 10 },
  { key: 'coffret', minHeld: 50 },
  { key: 'coffre', minHeld: 100 },
  { key: 'tresor', minHeld: 500 },
  { key: 'reserve', minHeld: 1000 },
] as const;

export type TreasuryTierKey = (typeof TREASURY_TIERS)[number]['key'];

export type TreasuryStanding = {
  readonly held: number;
  /** `null` sans Meesh gardée. */
  readonly tier: TreasuryTierKey | null;
  /** Le palier suivant et ce qu'il manque, `null` à la réserve. */
  readonly next: { readonly key: TreasuryTierKey; readonly minHeld: number; readonly missing: number } | null;
};

export function treasuryTier(held: number): TreasuryStanding {
  const n = Number.isFinite(held) ? Math.max(0, Math.trunc(held)) : 0;
  const reached = TREASURY_TIERS.filter((tier) => n >= tier.minHeld);
  const upcoming = TREASURY_TIERS.find((tier) => n < tier.minHeld);
  return {
    held: n,
    tier: reached.at(-1)?.key ?? null,
    next: upcoming === undefined ? null : { key: upcoming.key, minHeld: upcoming.minHeld, missing: upcoming.minHeld - n },
  };
}
