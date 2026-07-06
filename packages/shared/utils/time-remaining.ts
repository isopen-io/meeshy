/**
 * Source unique du formatage « temps restant avant expiration » (sémantique future).
 *
 * Symétrique de `classifyRelativeTime` (temps écoulé, passé) : cette fonction couvre le
 * compte à rebours d'expiration (stories TTL 24 h, statuts, liens). Avant iter 59 l'arithmétique
 * était réimplémentée à l'identique dans trois endroits web :
 * `lib/story-transforms.ts` (`timeRemaining`), `components/v2/StoryViewer.tsx` (IIFE inline) et
 * `components/v2/StatusBar.tsx` (`getTimeRemaining`).
 *
 * Pure et sans effet de bord : le « maintenant » est injecté (`nowMs`) plutôt que lu via
 * `Date.now()`, ce qui rend la fonction déterministe et trivialement testable.
 *
 * Retourne `null` quand la cible est déjà atteinte (`diff <= 0`) — l'appelant décide alors du rendu
 * (rien, ou un libellé « Expiré »). Sinon : `< 1 h` → `Xm` ; `>= 1 h` avec reste → `XhYm` ;
 * `>= 1 h` sans reste → `Xh`.
 */
export function formatTimeRemaining(targetMs: number, nowMs: number): string | null {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return null;

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) return `${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`;
  return `${minutes}m`;
}
