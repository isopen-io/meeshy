/**
 * LES CONSTANTES DE L'ÉCOUTE PARTAGÉE (#13934, #16686) — catégories, bornes et codes.
 * Hors de `./now-playing.ts` pour qu'un client léger (le web) les lise sans Zod.
 */

/** Ce qu'un Proche voit : la nature de l'activité, jamais son titre ni son origine. */
export const NOW_PLAYING_CATEGORIES = ['music', 'video', 'browsing'] as const;
export type NowPlayingCategory = (typeof NOW_PLAYING_CATEGORIES)[number];

export const NOW_PLAYING_TITLE_MAX = 200;
export const NOW_PLAYING_SOURCE_MAX = 60;

/**
 * L'état courant vit au plus 15 minutes sans nouvel envoi : l'émetteur le renvoie à
 * chaque changement et au moins toutes les 10 minutes. Une app tuée en pleine écoute
 * n'affiche donc pas une écoute fantôme plus d'un quart d'heure.
 */
export const NOW_PLAYING_TTL_SECONDS = 900;
export const NOW_PLAYING_REFRESH_SECONDS = 600;

export const NOW_PLAYING_ERROR_CODES = {
  /** Charge illisible (catégorie inconnue, titre trop long, champ en trop). */
  INVALID: 'NOW_PLAYING_INVALID',
  /** Trop d'envois : un changement de morceau, pas un flux. */
  RATE_LIMITED: 'NOW_PLAYING_RATE_LIMITED',
  /** Le serveur ne peut pas sceller ou ranger l'état : rien ne part. */
  UNAVAILABLE: 'NOW_PLAYING_UNAVAILABLE',
} as const;
export type NowPlayingErrorCode = (typeof NOW_PLAYING_ERROR_CODES)[keyof typeof NOW_PLAYING_ERROR_CODES];
