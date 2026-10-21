/**
 * Les ÉCRANS où un contenu (post, réel, story, humeur) s'affiche — la source
 * UNIQUE de l'énumération que portent les événements `impression` et `view`
 * de `POST /api/v1/social/events` (#10483).
 *
 * `surface` dit OÙ le lecteur a vu le contenu ; `source` (énumération
 * `IMPRESSION_SOURCES` de la passerelle, inchangée) dit d'où venait le flux.
 * Le champ est FACULTATIF des deux côtés : un ancien client ne l'envoie pas,
 * un ancien serveur le retire en silence (objet Zod non strict). Un client neuf
 * ne dépend donc jamais d'un serveur neuf.
 *
 * Toute nouvelle surface cliente s'ajoute ICI, et seulement ici : la passerelle
 * et le web la réexportent.
 */
export const CONTENT_SURFACES = [
  'feed',
  'reels',
  'profile',
  'bookmarks',
  'hashtag',
  'community',
  'nearby',
  'sound',
  'story_rail',
  'mood_avatar',
  'citation',
  'detail',
  'story',
  'visitor',
  'search',
  'notifications',
  'comments',
  'link_preview',
  'status',
] as const;

export type ContentSurface = (typeof CONTENT_SURFACES)[number];

const SURFACES: ReadonlySet<string> = new Set(CONTENT_SURFACES);

export const isContentSurface = (value: unknown): value is ContentSurface =>
  typeof value === 'string' && SURFACES.has(value);
