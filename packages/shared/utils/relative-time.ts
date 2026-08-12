/**
 * Source unique de la classification d'un délai écoulé en « temps relatif ».
 *
 * Avant iter 43, cet algorithme était réimplémenté à l'identique (à des variantes
 * de clés i18n et de queue près) dans au moins trois endroits web :
 * `notification-helpers.ts` (`formatNotificationTimeAgo`),
 * `v2/transform-conversation.ts` (`formatRelativeTime`) et
 * `feed/PostsFeedScreen.tsx` (`formatRelativeTime`). `classifyRelativeTime` unifie
 * la classification ; la présentation (clés i18n, queue date absolue) reste app-side.
 *
 * Pur et sans effet de bord : le « maintenant » est injecté (`nowMs`) plutôt que lu
 * via `Date.now()`, ce qui rend la fonction déterministe et trivialement testable.
 *
 * Paliers : < 1 min → `now` ; < 60 min → `minutes` ; < 24 h → `hours` ;
 * < `beyondDays` jours → `days` ; au-delà → `beyond` (l'appelant rend une date absolue).
 * Un délai négatif (cible dans le futur) est classé `now`.
 */

export type RelativeTimeBucket =
  | { readonly unit: 'now' }
  | { readonly unit: 'minutes'; readonly value: number }
  | { readonly unit: 'hours'; readonly value: number }
  | { readonly unit: 'days'; readonly value: number }
  | { readonly unit: 'beyond' };

export type RelativeTimeOptions = {
  /**
   * Nombre de jours écoulés à partir duquel le bucket devient `beyond`
   * (l'appelant rend alors une date absolue). Défaut `7`. Passer `Infinity`
   * pour ne jamais déborder (le bucket reste `days`).
   */
  readonly beyondDays?: number;
};

export function classifyRelativeTime(
  targetMs: number,
  nowMs: number,
  options: RelativeTimeOptions = {}
): RelativeTimeBucket {
  const { beyondDays = 7 } = options;
  const diffMs = nowMs - targetMs;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', value: minutes };

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return { unit: 'hours', value: hours };

  const days = Math.floor(diffMs / 86_400_000);
  if (days < beyondDays) return { unit: 'days', value: days };

  return { unit: 'beyond' };
}
