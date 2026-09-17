/**
 * L'ÉLECTION D'UNE SEULE SURFACE QUI JOUE (#6898, § 1.2 — miroir
 * `FeedSceneAutoplay.swift:6-39`) — PURE : reçoit les candidats déjà filtrés
 * à la visibilité (≥ 50 %, `use-feed-autoplay.ts`), rend l'id le plus proche
 * du centre du viewport, ou `null` si rien ne doit jouer.
 */
export type SceneCandidate = { readonly id: string; readonly distance: number };

export function electActive(params: {
  readonly candidates: readonly SceneCandidate[];
  readonly reducedMotion: boolean;
  readonly hidden: boolean;
}): string | null {
  if (params.reducedMotion || params.hidden) return null;
  let best: SceneCandidate | undefined;
  for (const candidate of params.candidates) {
    if (best === undefined || candidate.distance < best.distance) best = candidate;
  }
  return best?.id ?? null;
}
