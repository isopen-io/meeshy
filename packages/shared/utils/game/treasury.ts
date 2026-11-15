/**
 * LE TRÉSOR (#9373) — les Meeshes GARDÉES, six paliers visibles sur le profil.
 * Il baisse quand on dépense. `docs/product/jeu-meeshy-conception.html` § II.3.
 *
 * ## Les réserves s'ouvrent par le RANG de Gloire (#10848, porteur 2026-10-16)
 *
 * La Bourse est ouverte à tous. Le **Coffre** (100 gardées) exige un rang STRICTEMENT supérieur à
 * **Voix II** — donc Voix I au moins ; le **Trésor** (500), au moins **Polyglotte III** ; la
 * **Réserve** (1000), au moins **Ambassadeur III**. L'Escarcelle et le Coffret, entre la Bourse et
 * le Coffre, ne sont pas visés par la règle : ouverts à tous.
 *
 * ⚠️ Dans `division5`, V est la division la plus FAIBLE et I la plus haute (`glory.ts`) : « II » est
 * donc AU-DESSUS de « III ». Le seuil se lit sur la Gloire de la marche demandée (`gloryLadder`),
 * jamais sur le numéro de division comparé en entier.
 *
 * Ce que la règle garde : la FRAPPE (la seule porte qui fait entrer une Meesh dans le trésor,
 * `MeeshService.mint`). Un compte qui tenait déjà plus que son rang n'est pas dépossédé — il ne
 * frappe plus tant que son rang ne l'a pas rattrapé.
 */

import {
  gloryLadder,
  gloryStanding,
  legacyGloryDivision,
  type GloryDivision,
  type GloryDivision5,
  type GloryRankKey,
} from './glory.js';

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

/** Un rang de Gloire exigé : la marche de l'échelle (`gloryLadder`), pas un entier à comparer. */
export type TreasuryRankRequirement = { readonly rank: GloryRankKey; readonly division5: GloryDivision5 };

/** Les réserves fermées par le rang — les autres paliers sont ouverts à tous. */
export const TREASURY_RANK_REQUIREMENTS: Readonly<Partial<Record<TreasuryTierKey, TreasuryRankRequirement>>> = {
  // « Strictement supérieur à Voix II » : la marche juste au-dessus de Voix II est Voix I.
  coffre: { rank: 'voix', division5: 1 },
  tresor: { rank: 'polyglotte', division5: 3 },
  reserve: { rank: 'ambassadeur', division5: 3 },
};

/** Le rang requis tel que le fil le sert : la division à cinq crans ET sa projection héritée (1–3). */
export type TreasuryRankRequirementWire = {
  readonly rank: GloryRankKey;
  readonly division: GloryDivision;
  readonly division5: GloryDivision5;
};

const requirementWire = (requirement: TreasuryRankRequirement): TreasuryRankRequirementWire => ({
  rank: requirement.rank,
  division: legacyGloryDivision(requirement.division5),
  division5: requirement.division5,
});

/** La Gloire où commence la marche exigée. `null` si la marche n'existe pas (l'échelle a changé) : fermé. */
const requirementMinGlory = (requirement: TreasuryRankRequirement): number | null =>
  gloryLadder().find((step) => step.rank === requirement.rank && step.division5 === requirement.division5)?.minGlory ?? null;

export type TreasuryReserveAccess = {
  readonly key: TreasuryTierKey;
  readonly minHeld: number;
  /** `true` : le rang du compte n'ouvre pas encore cette réserve. */
  readonly locked: boolean;
  /** Le rang exigé — `null` pour un palier ouvert à tous. */
  readonly requires: TreasuryRankRequirementWire | null;
};

/** Le rang lu sur la Gloire — ou le Mythe, que le serveur seul décerne. */
export type TreasuryRankFacts = { readonly glory: number; readonly mythic?: boolean };

const reaches = (facts: TreasuryRankFacts, requirement: TreasuryRankRequirement): boolean => {
  if (gloryStanding({ glory: facts.glory, mythic: facts.mythic === true }).rank === 'mythe') return true;
  const minGlory = requirementMinGlory(requirement);
  // FAIL-CLOSED : une marche introuvable ne s'ouvre pour personne.
  return minGlory !== null && Number.isFinite(facts.glory) && facts.glory >= minGlory;
};

/** Pour chaque réserve, son état et le rang qu'elle exige — ce que l'API sert à côté du trésor. */
export function treasuryReserveAccess(facts: TreasuryRankFacts): readonly TreasuryReserveAccess[] {
  return TREASURY_TIERS.map((tier) => {
    const requirement = TREASURY_RANK_REQUIREMENTS[tier.key];
    return {
      key: tier.key,
      minHeld: tier.minHeld,
      locked: requirement === undefined ? false : !reaches(facts, requirement),
      requires: requirement === undefined ? null : requirementWire(requirement),
    };
  });
}

/** La réserve qui barre la route de la prochaine pièce, et le rang qu'elle exige. */
export type TreasuryLock = {
  readonly tier: TreasuryTierKey;
  readonly minHeld: number;
  readonly requires: TreasuryRankRequirementWire;
};

/**
 * La prochaine Meesh gardée fait-elle entrer dans une réserve que le rang ne rouvre pas ? `null` : la
 * frappe est libre. La première réserve fermée en montant est celle qui barre la route.
 */
export function treasuryLockFor(params: TreasuryRankFacts & { readonly held: number }): TreasuryLock | null {
  const held = Number.isFinite(params.held) ? Math.max(0, Math.trunc(params.held)) : 0;
  const after = held + 1;
  for (const tier of TREASURY_TIERS) {
    if (tier.minHeld > after) break;
    const requirement = TREASURY_RANK_REQUIREMENTS[tier.key];
    if (requirement !== undefined && !reaches(params, requirement)) {
      return { tier: tier.key, minHeld: tier.minHeld, requires: requirementWire(requirement) };
    }
  }
  return null;
}
