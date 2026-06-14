/**
 * Reel affinity scoring — FONDATION.
 *
 * Quand un réel est touché dans le Feed, le plein écran génère un thread de
 * réels classés par AFFINITÉ : affinité au réel touché (« seed ») + affinité à
 * l'utilisateur connecté. Cette fonction est PURE et testable ; c'est le point
 * d'insertion (« seam ») du futur moteur de recommandation et de monétisation
 * de l'attention — watch-time pondéré (`PostView.duration`), filtrage
 * collaboratif (réacteurs communs au seed), embeddings de contenu, insertion
 * sponsorisée. Remplacer cette fonction NE change PAS le contrat de `getReels`.
 *
 * Signaux de la fondation (structurels, explicables, bornés) :
 *  - Similitude au seed : même auteur, même langue, entités @mentionnées communes
 *  - Affinité utilisateur : auteur ∈ contacts (amis/DM), langue ∈ langues lues
 *  - Popularité : engagement log-normalisé
 *  - Fraîcheur : décroissance douce (réels permanents → demi-vie longue, 48h)
 *  - Déjà-vu : forte pénalité (PostView) pour faire couler sans VIDER le feed
 *
 * La récupération reste chronologique (candidate pool récent) : le moteur final
 * remplacera AUSSI la phase de retrieval (similarité d'abord, pas seulement le
 * ranking) — c'est la limite assumée de cette fondation.
 */

export type ReelCandidate = {
  id: string;
  authorId: string;
  originalLanguage: string | null;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  bookmarkCount: number;
  viewCount: number;
  mentionedUserIds: readonly string[];
};

export type ReelSeed = {
  id: string;
  authorId: string;
  originalLanguage: string | null;
  mentionedUserIds: ReadonlySet<string>;
};

export type ReelAffinityContext = {
  /** `Date.now()` injecté — la fonction reste pure et déterministe en test. */
  nowMs: number;
  viewerId: string;
  /** Amis + contacts DM de l'utilisateur connecté. */
  contactIds: ReadonlySet<string>;
  /** Langues que l'utilisateur lit (system + regional + custom destination). */
  viewerLanguages: ReadonlySet<string>;
  /** Réels déjà vus par l'utilisateur (PostView). */
  seenReelIds: ReadonlySet<string>;
  /** Réel touché dans le Feed. `null` pour un onglet Reels « Pour toi » sans seed. */
  seed: ReelSeed | null;
};

export const REEL_AFFINITY_WEIGHTS = Object.freeze({
  seedSameAuthor: 0.3,
  seedSameLanguage: 0.1,
  seedSharedMention: 0.15,
  contactAuthor: 0.2,
  viewerLanguage: 0.1,
  engagement: 0.1, // contribution maximale
  freshness: 0.05, // contribution maximale
  seenPenalty: -0.5,
});

const FRESHNESS_HALF_LIFE_MS = 48 * 3_600_000;

function engagementScore(c: ReelCandidate): number {
  const raw =
    c.likeCount * 1 +
    c.commentCount * 3 +
    c.repostCount * 5 +
    c.bookmarkCount * 2 +
    c.viewCount * 0.1;
  return Math.min(1, Math.log10(1 + raw) / 5);
}

function freshnessScore(createdAt: Date, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - createdAt.getTime());
  return 1 / (1 + ageMs / FRESHNESS_HALF_LIFE_MS);
}

export type ReelScoreBreakdown = {
  seedSameAuthor: number;
  seedSameLanguage: number;
  seedSharedMention: number;
  contactAuthor: number;
  viewerLanguage: number;
  engagement: number;
  freshness: number;
  seenPenalty: number;
  total: number;
};

/**
 * Décompose le score par signal — exposé pour le débogage et le futur réglage
 * des poids (et pour des tests qui asserent un signal isolé).
 */
export function reelAffinityBreakdown(
  c: ReelCandidate,
  ctx: ReelAffinityContext
): ReelScoreBreakdown {
  const W = REEL_AFFINITY_WEIGHTS;
  const seed = ctx.seed;

  const seedSameAuthor = seed && c.authorId === seed.authorId ? W.seedSameAuthor : 0;
  const seedSameLanguage =
    seed &&
    c.originalLanguage &&
    seed.originalLanguage &&
    c.originalLanguage === seed.originalLanguage
      ? W.seedSameLanguage
      : 0;
  const seedSharedMention =
    seed && c.mentionedUserIds.some((id) => seed.mentionedUserIds.has(id))
      ? W.seedSharedMention
      : 0;

  const contactAuthor = ctx.contactIds.has(c.authorId) ? W.contactAuthor : 0;
  const viewerLanguage =
    c.originalLanguage && ctx.viewerLanguages.has(c.originalLanguage)
      ? W.viewerLanguage
      : 0;

  const engagement = engagementScore(c) * W.engagement;
  const freshness = freshnessScore(c.createdAt, ctx.nowMs) * W.freshness;
  const seenPenalty = ctx.seenReelIds.has(c.id) ? W.seenPenalty : 0;

  const total =
    seedSameAuthor +
    seedSameLanguage +
    seedSharedMention +
    contactAuthor +
    viewerLanguage +
    engagement +
    freshness +
    seenPenalty;

  return {
    seedSameAuthor,
    seedSameLanguage,
    seedSharedMention,
    contactAuthor,
    viewerLanguage,
    engagement,
    freshness,
    seenPenalty,
    total,
  };
}

export function reelAffinityScore(c: ReelCandidate, ctx: ReelAffinityContext): number {
  return reelAffinityBreakdown(c, ctx).total;
}
