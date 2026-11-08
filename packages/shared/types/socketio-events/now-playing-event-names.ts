/**
 * Les noms de l'ÉCOUTE PARTAGÉE (#13934, #16686) — une PARTIE de `SERVER_EVENTS` et
 * de `CLIENT_EVENTS` (`event-names.ts`), qui les répandent. Charges : `../now-playing.ts`.
 *
 * Audience : la room `user:<lecteur>`, lecteur par lecteur, chacun avec SA projection —
 * jamais une room partagée, qui servirait à tous la charge du plus proche.
 */

export const NOW_PLAYING_CLIENT_EVENTS = {
  /** L'émetteur publie son état courant complet ; l'accusé rend l'échéance ou un refus codé. */
  NOW_PLAYING_UPDATE: 'now-playing:update',
  /** Pause, fin, app exclue : l'état courant est effacé. */
  NOW_PLAYING_CLEAR: 'now-playing:clear',
} as const;

export const NOW_PLAYING_SERVER_EVENTS = {
  /** À un lecteur : l'écoute d'un lien, tronquée à SON niveau. */
  NOW_PLAYING_CHANGED: 'now-playing:changed',
  /** À un lecteur : l'écoute d'un lien est finie, ou ne lui est plus servie. */
  NOW_PLAYING_CLEARED: 'now-playing:cleared',
} as const;
