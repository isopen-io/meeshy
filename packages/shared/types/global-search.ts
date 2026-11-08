import { z } from 'zod';

/**
 * LA RECHERCHE GLOBALE — messages (#14619) et publications (#14620).
 *
 * Deux routes de la passerelle, une loi de FORME :
 * - `GET /api/v1/messages/search` rend des `MessageSearchHit` : les messages
 *   des conversations dont le lecteur est membre actif, jamais d'une
 *   conversation chiffrée de bout en bout, jamais un message qui disparaît, et
 *   leur texte SERVI par le Prisme du lecteur ;
 * - `GET /api/v1/posts/search` rend des posts, réels et stories sous la forme
 *   des listes du fil, filtrés par la loi de visibilité du fil.
 *
 * Le curseur est OPAQUE : le client renvoie tel quel `pagination.nextCursor`.
 * Les règles de qui voit quoi vivent dans la passerelle, pas ici.
 */

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_QUERY_LENGTH = 100;
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 20;
export const GLOBAL_SEARCH_MAX_LIMIT = 50;

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(GLOBAL_SEARCH_MIN_QUERY_LENGTH).max(GLOBAL_SEARCH_MAX_QUERY_LENGTH),
  limit: z.coerce.number().int().min(1).max(GLOBAL_SEARCH_MAX_LIMIT).default(GLOBAL_SEARCH_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(200).optional(),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;

/** Les formats qu'on cherche — le statut (humeur d'une heure) n'en fait pas partie. */
export const GLOBAL_SEARCH_POST_TYPES = ['POST', 'REEL', 'STORY'] as const;

export type GlobalSearchPostType = (typeof GLOBAL_SEARCH_POST_TYPES)[number];

const postTypeSchema = z.enum(GLOBAL_SEARCH_POST_TYPES);

const postTypesSchema = z
  .string()
  .optional()
  .transform((raw) => (raw === undefined || raw.trim() === '' ? [...GLOBAL_SEARCH_POST_TYPES] : raw.split(',').map((part) => part.trim())))
  .pipe(z.array(postTypeSchema).min(1))
  .transform((types) => [...new Set(types)]);

export const postSearchQuerySchema = globalSearchQuerySchema.extend({ types: postTypesSchema });

export type PostSearchQuery = z.infer<typeof postSearchQuerySchema>;

export const messageSearchSenderSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatar: z.string().nullable(),
});

export const messageSearchConversationSchema = z.object({
  id: z.string(),
  identifier: z.string().nullable(),
  type: z.string(),
  title: z.string(),
  avatar: z.string().nullable(),
});

/**
 * Un message trouvé. `content` est le texte SERVI au lecteur (la traduction
 * élue par son Prisme, ou l'original) ; `servedLanguage` dit sa langue quand
 * c'est une traduction, `null` quand c'est l'original.
 */
export const messageSearchHitSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  createdAt: z.string(),
  messageType: z.string(),
  content: z.string(),
  servedLanguage: z.string().nullable(),
  originalContent: z.string(),
  originalLanguage: z.string().nullable(),
  sender: messageSearchSenderSchema.nullable(),
  conversation: messageSearchConversationSchema,
});

export type MessageSearchHit = z.infer<typeof messageSearchHitSchema>;

export type GlobalSearchPagination = {
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};
