/**
 * LA POSSESSION D'UN PACK, PAR QUELLE VOIE (#11272) — un pack payant se
 * possède par l'achat en Meeshes (#10632), mais aussi par le jeu (un rang, un
 * trophée, une saison), par un octroi de l'équipe ou par un événement. Décision
 * #11252 : on le gagne ou on le reçoit, on ne l'achète JAMAIS en argent réel.
 *
 * `UserPackOwnership.source` est OPTIONNEL en base (MongoDB : les lignes
 * d'avant n'ont pas le champ) : une ligne sans source est un ACHAT. La loi de
 * possession (`isPackOwned`) ne lit que la CLÉ — toute voie possède.
 *
 * L'éligibilité est une donnée (`PackEligibilityRule`) évaluée contre des faits
 * que le SERVEUR a lus : jamais un client ne dit qu'il est éligible.
 */
import { GLORY_RANKS, type GloryRankKey, type GloryRankOrMythic } from '../utils/game/glory.js';

export const PACK_OWNERSHIP_SOURCES = ['purchase', 'game', 'grant', 'event'] as const;
export type PackOwnershipSource = (typeof PACK_OWNERSHIP_SOURCES)[number];

export const packOwnershipSourceOf = (raw: string | null | undefined): PackOwnershipSource =>
  (PACK_OWNERSHIP_SOURCES as readonly (string | null | undefined)[]).includes(raw) ? (raw as PackOwnershipSource) : 'purchase';

/** Ce que la loi lit d'une ligne de possession : sa clé (le reste — prix, dépense, voie — est optionnel). */
export type PackOwnershipRow = { readonly packKey: string };

/** LES clés possédées, quelle que soit la voie par laquelle chaque ligne est née. */
export const ownedPackKeys = (rows: readonly PackOwnershipRow[]): ReadonlySet<string> => new Set(rows.map((row) => row.packKey));

// ── L'éligibilité ───────────────────────────────────────────────────────

export type PackEligibilityRule =
  | { readonly kind: 'rank'; readonly rank: GloryRankKey }
  | { readonly kind: 'trophy'; readonly key: string }
  | { readonly kind: 'season'; readonly number: number };

export type PackEligibilityKind = PackEligibilityRule['kind'];

/** Les faits lus par le serveur : le rang courant, les clés de trophées gravées, les saisons jouées. */
export type PackEligibilityFacts = {
  readonly rank: GloryRankOrMythic;
  readonly trophyKeys: ReadonlySet<string>;
  readonly seasonNumbers: ReadonlySet<number>;
};

const rankIndex = (rank: GloryRankKey): number => GLORY_RANKS.findIndex((candidate) => candidate.key === rank);

export function isPackEligible(rule: PackEligibilityRule, facts: PackEligibilityFacts): boolean {
  switch (rule.kind) {
    case 'rank':
      return facts.rank === 'mythe' || rankIndex(facts.rank) >= rankIndex(rule.rank);
    case 'trophy':
      return facts.trophyKeys.has(rule.key);
    case 'season':
      return facts.seasonNumbers.has(rule.number);
  }
}

/** Ce que la ligne consigne de la règle qui l'a ouverte (`rank:voix`, `trophy:<clé>`, `season:2`). */
export const packEligibilityReference = (rule: PackEligibilityRule): string => {
  switch (rule.kind) {
    case 'rank':
      return `rank:${rule.rank}`;
    case 'trophy':
      return `trophy:${rule.key}`;
    case 'season':
      return `season:${rule.number}`;
  }
};
