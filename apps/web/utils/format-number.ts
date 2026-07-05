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
 *
 * Le palier est choisi sur la valeur **après arrondi** : `999_999 / 1000 = 999.999`
 * que `toFixed(1)` remonte à `"1000.0"`, donc on promeut à l'unité supérieure
 * (`"1.0M"` et non `"1000.0K"`). Même garde que `formatCallDataSize`.
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return String(value);

  const units: ReadonlyArray<readonly [number, string]> = [
    [1_000, 'K'],
    [1_000_000, 'M'],
    [1_000_000_000, 'B'],
  ];

  let tier = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    if (abs >= units[i][0]) {
      tier = i;
      break;
    }
  }

  const roundedAtTier = Math.abs(Number((value / units[tier][0]).toFixed(1)));
  if (roundedAtTier >= 1_000 && tier < units.length - 1) {
    tier += 1;
  }

  const [threshold, suffix] = units[tier];
  return `${(value / threshold).toFixed(1)}${suffix}`;
}
