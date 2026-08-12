/**
 * Source unique du prédicat d'**expiration** (domaine `expiresAt`).
 *
 * Le formatage « temps restant » (compte à rebours heures/minutes) vit exclusivement dans
 * `@meeshy/shared/utils/time-remaining` (`formatTimeRemaining`) — l'unique implémentation
 * consommée en production (`v2/StatusBar.tsx`, `v2/StoryViewer.tsx`, `lib/story-transforms.ts`).
 * Une copie web divergente existait ici : jamais importée hors de son propre test, elle a
 * silencieusement dérivé (le clamp sous-minute « jamais 0m » de la version partagée n'y était
 * pas répercuté). Supprimée pour éliminer le doublon mort (single source of truth).
 *
 * `isExpired` — prédicat booléen « la cible est-elle dépassée ? » ; avant iter 60
 * réimplémenté à l'identique (`x && new Date(x) < new Date()`) dans au moins 6 fichiers
 * (`UserActivitySection`, `share-affiliate-modal`, `conversation-links-section`,
 * `admin/share-links`, `chat/[id]`, `links`). `null`/absent → `false` (« pas
 * d'expiration »), sémantique commune à tous les sites convergés.
 *
 * Pur et sans effet de bord : le « maintenant » est injecté (`nowMs`) plutôt que lu
 * via `Date.now()` par défaut, ce qui rend la fonction déterministe et testable.
 *
 * Contrat : `true` si `expiresAt` est défini ET strictement dans le passé.
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
