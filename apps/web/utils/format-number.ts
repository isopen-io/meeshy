/**
 * Source unique du formatage **compact** d'un nombre (abréviation K / M / B),
 * à la manière des plateformes de l'état de l'art (YouTube, X, Instagram).
 *
 * Avant iter 61, cet algorithme était réimplémenté à l'identique (à des variantes
 * de casse et de paliers près) dans `v2/PostDetail.tsx` (`K`/`M`),
 * `v2/CommunityCarousel.tsx` (`k`/`M`) et `app/(connected)/me/page.tsx` (`k`, sans
 * palier million — un compteur ≥ 1 M s'affichait alors « 2000.0k » au lieu de « 2.0M »).
 *
 * Suffixe **majuscule** unifié (`K`/`M`/`B`), une décimale, seuil à 1 000.
 * En dessous de 1 000 : le nombre entier tel quel. Gère les négatifs symétriquement.
 * Pur et déterministe (aucune dépendance à la locale ni à l'horloge).
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
