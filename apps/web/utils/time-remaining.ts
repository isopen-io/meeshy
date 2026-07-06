/**
 * Source unique des utilitaires d'**expiration** (domaine `expiresAt`).
 *
 * `formatTimeRemaining` — compte à rebours grossier heures/minutes, miroir « futur »
 * de `classifyRelativeTime` (temps écoulé) ; avant iter 59 réimplémenté à l'identique
 * dans `v2/StatusBar.tsx` et `v2/StoryViewer.tsx`.
 *
 * `isExpired` — prédicat booléen « la cible est-elle dépassée ? » ; avant iter 60
 * réimplémenté à l'identique (`x && new Date(x) < new Date()`) dans au moins 6 fichiers
 * (`UserActivitySection`, `share-affiliate-modal`, `conversation-links-section`,
 * `admin/share-links`, `chat/[id]`, `links`). `null`/absent → `false` (« pas
 * d'expiration »), sémantique commune à tous les sites convergés.
 *
 * Purs et sans effet de bord : le « maintenant » est injecté (`nowMs`) plutôt que lu
 * via `Date.now()` par défaut, ce qui rend les fonctions déterministes et testables.
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

/**
 * `true` si `expiresAt` est défini ET strictement dans le passé.
 * `null`/`undefined`/absent → `false` (interprété comme « sans expiration »).
 * Une date invalide (`NaN`) → `false`.
 */
export function isExpired(
  expiresAt: string | number | Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (expiresAt == null) return false;
  const expiry =
    expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return expiry < nowMs;
}
