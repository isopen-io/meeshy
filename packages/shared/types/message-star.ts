import { z } from 'zod';

/**
 * LE FAVORI DE MESSAGE — contrat de `/api/v1/me/starred-messages` (#7377).
 *
 * Une étoile PERSONNELLE par (lecteur, message) — `MessageStar`,
 * @see ../prisma/schema.prisma — jamais l'épingle (`Message.pinnedAt`), qui est
 * commune à toute la conversation. Les règles de ce que la liste a le droit de
 * servir sont dans `services/gateway/decisions.md`, § « Le favori de message ».
 *
 * Les schémas vivent ICI, et non dans la route, pour la raison qu'énonce
 * `link-join.ts` : un client qui décode la réponse (ou qui refuse un paramètre
 * avant l'aller-retour) le fait avec le schéma même que le serveur applique,
 * jamais avec une copie qui dériverait.
 */

export const STARRED_MESSAGES_DEFAULT_LIMIT = 20;
export const STARRED_MESSAGES_MAX_LIMIT = 50;

/** Un curseur keyset est opaque, mais borné : c'est un paramètre de requête attaquable. */
const STARRED_MESSAGES_CURSOR_MAX_LENGTH = 512;

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

/**
 * `:messageId` des deux écritures. Prisma LÈVE sur une valeur qui n'est pas un
 * ObjectId dans une colonne `@db.ObjectId` : sans cette porte, une faute de
 * frappe du client devenait un 500.
 */
export const starMessageParamsSchema = z.object({
  messageId: objectIdSchema,
});

export type StarMessageParams = z.output<typeof starMessageParamsSchema>;

/** `GET /me/starred-messages?cursor=&limit=` — `limit` arrive en chaîne de requête. */
export const starredMessagesQuerySchema = z.object({
  cursor: z.string().min(1).max(STARRED_MESSAGES_CURSOR_MAX_LENGTH).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STARRED_MESSAGES_MAX_LIMIT)
    .default(STARRED_MESSAGES_DEFAULT_LIMIT),
});

export type StarredMessagesQuery = z.output<typeof starredMessagesQuerySchema>;

/**
 * Une traduction servie — la forme que les clients décodent déjà pour un
 * message (`APITextTranslation` côté iOS), SANS l'enveloppe de chiffrement.
 */
export const starredMessageTranslationSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  targetLanguage: z.string(),
  translatedContent: z.string(),
  translationModel: z.string().optional(),
  confidenceScore: z.number().optional(),
});

export type StarredMessageTranslation = z.output<typeof starredMessageTranslationSchema>;

/**
 * Une pièce jointe en APERÇU. `isMasked` : la pièce est protégée à son propre
 * niveau (`maskedAttachment`), et part sans URL ni vignette.
 */
export const starredMessageAttachmentSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  fileUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  isMasked: z.boolean(),
});

export type StarredMessageAttachment = z.output<typeof starredMessageAttachmentSchema>;

/**
 * Le message VIVANT. `isProtected` : la ligne est un PLACEHOLDER (flouté,
 * chiffré, éphémère encore vivant) — `content`, `originalLanguage` et
 * `editedAt` valent `null`, `translations` et `attachments` sont vides. Le
 * client résout le Prisme à la LECTURE, depuis `content`, `originalLanguage`
 * et `translations`.
 */
export const starredMessageBodySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageType: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  isProtected: z.boolean(),
  content: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  translations: z.array(starredMessageTranslationSchema),
  attachments: z.array(starredMessageAttachmentSchema),
});

export type StarredMessageBody = z.output<typeof starredMessageBodySchema>;

/** L'auteur — `id` est un `Participant.id`, `userId` est `null` pour un anonyme. Aucune présence. */
export const starredMessageSenderSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  displayName: z.string().nullable(),
  avatar: z.string().nullable(),
  username: z.string().nullable(),
});

export type StarredMessageSender = z.output<typeof starredMessageSenderSchema>;

/**
 * La conversation — de quoi la nommer et calculer son accent (`type`). Pour une
 * conversation directe, `name` et `avatar` sont ceux de l'autre participant.
 */
export const starredMessageConversationSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  type: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable(),
});

export type StarredMessageConversation = z.output<typeof starredMessageConversationSchema>;

/** Une ligne de la liste. `id` et `starredAt` sont ceux de l'ÉTOILE, qui ordonnent la liste. */
export const starredMessageItemSchema = z.object({
  id: z.string(),
  starredAt: z.string(),
  message: starredMessageBodySchema,
  sender: starredMessageSenderSchema.nullable(),
  conversation: starredMessageConversationSchema,
});

export type StarredMessageItem = z.output<typeof starredMessageItemSchema>;

/** Réponse de `PUT /me/starred-messages/:messageId` — idempotente : reposer ne change pas la date. */
export type MessageStarPlacedResult = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly starred: true;
  readonly starredAt: string;
};

/** Réponse de `DELETE /me/starred-messages/:messageId` — idempotente. */
export type MessageStarRemovedResult = {
  readonly messageId: string;
  readonly starred: false;
};

/** Les deux codes machine qu'une pose d'étoile peut refuser. */
export const MESSAGE_STAR_ERROR_CODES = {
  NOT_FOUND: 'MESSAGE_NOT_FOUND',
  NOT_STARRABLE: 'MESSAGE_NOT_STARRABLE',
} as const;
