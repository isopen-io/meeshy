/**
 * Source unique du formatage « temps restant avant expiration » (compte à rebours
 * grossier heures/minutes). Miroir « futur » de `classifyRelativeTime` (temps écoulé) :
 * avant iter 59, cet algorithme était réimplémenté à l'identique dans
 * `v2/StatusBar.tsx` (`getTimeRemaining`) et `v2/StoryViewer.tsx` (bloc inline).
 *
 * Retourne la chaîne `${h}h${m}m` / `${h}h` / `${m}m` pour un délai strictement
 * positif, et `null` quand la cible est atteinte ou dépassée — l'appelant décide
 * du rendu « expiré » (libellé « Expire », masquage, …).
 *
 * Pur et sans effet de bord : le « maintenant » est injecté (`nowMs`) plutôt que
 * lu via `Date.now()` par défaut, ce qui rend la fonction déterministe et testable.
 */
export function formatTimeRemaining(
  expiresAt: string | number | Date,
  nowMs: number = Date.now()
): string | null {
  const expiry =
    expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  const diff = expiry - nowMs;
  if (diff <= 0) return null;

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}
