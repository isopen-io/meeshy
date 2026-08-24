import { z } from 'zod';
import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';
import type {
  MessageSendData,
  MessageSendWithAttachmentsData,
} from '@meeshy/shared/types/socketio-events';
import {
  ENCRYPTION_ENVELOPE_SHAPE,
  noSilentDowngrade,
  NO_SILENT_DOWNGRADE_ISSUE,
} from './encryption-envelope.js';
import { MENTIONED_USER_IDS_SHAPE } from './mention-list.js';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';

const mongoId = z
  .string()
  .regex(OBJECT_ID_REGEX, 'Invalid MongoDB ObjectId format');

const clientMessageIdSchema = z
  .string()
  .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)');

// Safety ceiling for message content. Runtime per-role validation (MAX_MESSAGE_LENGTH=4000)
// is the precise limit for plaintext messages; encrypted payloads may be larger, so we
// use a generous ceiling here that only blocks truly abusive payloads.
const MAX_CONTENT_BYTES = 100_000;

// Maximum attachment IDs per message — imported from `@meeshy/shared` so the
// schema, `MessageValidator` and the REST body schema partagent UNE valeur.
// Enforced at schema level to reject bulk-fake-attachment DoS before DB lookups start.
// (This comment used to claim it mirrored MessageValidator "(regular conversations: 100)";
// the validator actually capped at 10, so the two gates disagreed by an order of magnitude.)

export const SocketMessageSendSchema = z.object({
  conversationId: z.string().min(1).max(255),
  content: z.string().max(MAX_CONTENT_BYTES),
  originalLanguage: z.string().optional(),
  messageType: z.string().optional(),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: clientMessageIdSchema,
  // Forward references — validated as ObjectIds so malformed strings are
  // rejected at the schema boundary before reaching the DB query in
  // broadcastNewMessage (which would otherwise throw P2023 on a bad id).
  forwardedFromId: mongoId.optional(),
  forwardedFromConversationId: mongoId.optional(),
  // TROISIÈME PORTE de l'exemption de contenu vide (`MessageValidator`
  // :55-69) : une diffusion à plusieurs destinataires copie ses pièces jointes
  // CÔTÉ SERVEUR (`copyAttachments.ts`) et n'envoie donc ni texte ni
  // `attachmentIds`. Sans cette déclaration, `z.object` STRIPPE le champ en
  // silence et le validateur, privé de son motif d'exemption, rejette l'envoi
  // en CONTENT_EMPTY — alors que le refine Zod de la route REST le laisse
  // passer. Validé en ObjectId comme les références de transfert ci-dessus :
  // `copyAttachments` l'utilise dans une requête Prisma, qui jetterait P2023
  // sur une chaîne malformée.
  copyAttachmentsFromMessageId: mongoId.optional(),
  // Effets de message — parité avec la route REST POST /messages.
  // `MessageProcessor.saveMessage` recompose le bitfield `effectFlags`
  // depuis `isBlurred` / `expiresAt` / `isViewOnce`.
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
  // Lieu partagé — champ dédié, JAMAIS un `metadata` brut (cf.
  // services/location/sharedPlace.ts). Forme non contrainte ici : la
  // validation stricte des coordonnées / longueurs vit dans
  // `parseSharedPlace`, appelé côté `MessageProcessor.saveMessage`.
  location: z.unknown().optional(),
  // Liste EXPLICITE de mentionnés — déclarée dans `mention-list.ts`, la MÊME
  // que celle de `POST /messages`. Elle était strippée ici, et le repli par
  // extraction des `@` du contenu ne la remplace que tant que le contenu porte
  // le texte : en `e2ee` il vaut `[Encrypted]`. Voir l'unité pour le récit.
  ...MENTIONED_USER_IDS_SHAPE,
  // Enveloppe de chiffrement — déclarée dans `encryption-envelope.ts`, la MÊME
  // que celle de `POST /messages`. Ces champs n'étaient déclarés NULLE PART
  // ici : `z.object` les strippait donc en silence, et le chiffré n'atteignait
  // jamais la base sur le chemin d'envoi PRIMAIRE. Voir l'unité pour le récit
  // complet du défaut.
  ...ENCRYPTION_ENVELOPE_SHAPE,
}).refine(noSilentDowngrade, NO_SILENT_DOWNGRADE_ISSUE);

export type SocketMessageSendData = z.infer<typeof SocketMessageSendSchema>;

export const SocketMessageSendWithAttachmentsSchema = z.object({
  conversationId: z.string().min(1).max(255),
  content: z.string().max(MAX_CONTENT_BYTES),
  originalLanguage: z.string().optional(),
  attachmentIds: z.array(mongoId).min(1).max(MAX_ATTACHMENTS_PER_MESSAGE),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: clientMessageIdSchema,
  // Forward references — validated as ObjectIds (mirrors SocketMessageSendSchema).
  forwardedFromId: mongoId.optional(),
  forwardedFromConversationId: mongoId.optional(),
  // Effets de message — parité avec SocketMessageSendSchema (path texte) et la
  // route REST POST /messages. Sans ces champs, `z.object` strip un
  // `isViewOnce` / `isBlurred` / `expiresAt` envoyé avec une photo sur le path
  // PRINCIPAL d'envoi de pièces jointes, dégradant silencieusement le média en
  // attachement normal non éphémère (une photo « view-once » reste rouvrable
  // indéfiniment). `MessageProcessor.saveMessage` recompose le bitfield
  // `effectFlags` depuis ces champs bruts.
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
  // Lieu partagé — même contrat que SocketMessageSendSchema ci-dessus.
  location: z.unknown().optional(),
  // Liste explicite de mentionnés — même unité que le path texte ci-dessus. Un
  // message porteur d'une pièce jointe nomme quelqu'un exactement comme un
  // message de texte, et ce path-ci est celui de TOUT l'audio : sa légende est
  // souvent le seul texte du message.
  ...MENTIONED_USER_IDS_SHAPE,
  // Enveloppe de chiffrement — même unité que le path texte ci-dessus. Ce
  // schéma-ci ne la portait pas davantage : une pièce jointe envoyée dans une
  // conversation chiffrée perdait son chiffré exactement de la même façon.
  ...ENCRYPTION_ENVELOPE_SHAPE,
}).refine(noSilentDowngrade, NO_SILENT_DOWNGRADE_ISSUE);

export type SocketMessageSendWithAttachmentsData = z.infer<typeof SocketMessageSendWithAttachmentsSchema>;

export const SocketTranslationRequestSchema = z.object({
  messageId: mongoId,
  targetLanguage: z.string().min(2).max(5),
});

export type SocketTranslationRequestData = z.infer<typeof SocketTranslationRequestSchema>;

export const SocketConversationJoinSchema = z.object({
  conversationId: z.string().min(1).max(255),
});

export type SocketConversationJoinData = z.infer<typeof SocketConversationJoinSchema>;

export const SocketConversationLeaveSchema = z.object({
  conversationId: z.string().min(1).max(255),
});

export type SocketConversationLeaveData = z.infer<typeof SocketConversationLeaveSchema>;

export const SocketTypingSchema = z.object({
  conversationId: z.string(),
  userId: z.string().optional(),
});

export type SocketTypingData = z.infer<typeof SocketTypingSchema>;

export const SocketReactionAddSchema = z.object({
  messageId: mongoId,
  emoji: z.string().min(1).max(10),
  conversationId: z.string().optional(),
});

export type SocketReactionAddData = z.infer<typeof SocketReactionAddSchema>;

export const SocketReactionRemoveSchema = z.object({
  messageId: mongoId,
  emoji: z.string().min(1).max(10),
  conversationId: z.string().optional(),
});

export type SocketReactionRemoveData = z.infer<typeof SocketReactionRemoveSchema>;

export const SocketCommentReactionAddSchema = z.object({
  commentId: mongoId,
  postId: mongoId,
  emoji: z.string().min(1).max(10),
});

export type SocketCommentReactionAddData = z.infer<typeof SocketCommentReactionAddSchema>;

export const SocketCommentReactionRemoveSchema = z.object({
  commentId: mongoId,
  postId: mongoId,
  emoji: z.string().min(1).max(10),
});

export type SocketCommentReactionRemoveData = z.infer<typeof SocketCommentReactionRemoveSchema>;

export const SocketCommentReactionRequestSyncSchema = z.object({
  commentId: mongoId,
});

export type SocketCommentReactionRequestSyncData = z.infer<
  typeof SocketCommentReactionRequestSyncSchema
>;

export const SocketPostRoomActionSchema = z.object({
  postId: mongoId,
});

export type SocketPostRoomActionData = z.infer<typeof SocketPostRoomActionSchema>;

export const SocketPostReactionAddSchema = z.object({
  postId: mongoId,
  emoji: z.string().min(1).max(10),
});

export type SocketPostReactionAddData = z.infer<typeof SocketPostReactionAddSchema>;

export const SocketPostReactionRemoveSchema = z.object({
  postId: mongoId,
  emoji: z.string().min(1).max(10),
});

export type SocketPostReactionRemoveData = z.infer<typeof SocketPostReactionRemoveSchema>;

export const SocketPostReactionRequestSyncSchema = z.object({
  postId: mongoId,
});

export type SocketPostReactionRequestSyncData = z.infer<typeof SocketPostReactionRequestSyncSchema>;

// Empty content is intentionally permitted: the message may carry attachments
// (photo/audio/file) whose caption is being cleared. The attachment-aware
// emptiness check lives in MessageHandler.handleMessageEdit (and the REST
// PUT /messages/:messageId path), which rejects empty content only when the
// message has no attachments. Enforcing `.min(1)` here would make that branch
// unreachable and silently break caption removal. Mirrors
// SocketMessageSendWithAttachmentsSchema, which also allows empty content.
export const SocketMessageEditSchema = z.object({
  messageId: mongoId,
  content: z.string().max(MAX_CONTENT_BYTES),
});

export type SocketMessageEditData = z.infer<typeof SocketMessageEditSchema>;

export const SocketMessageDeleteSchema = z.object({
  messageId: mongoId,
});

export type SocketMessageDeleteData = z.infer<typeof SocketMessageDeleteSchema>;

export const SocketAuthenticateSchema = z.object({
  userId: z.string().optional(),
  sessionToken: z.string().optional(),
  language: z.string().optional(),
  token: z.string().optional(),
});

export type SocketAuthenticateData = z.infer<typeof SocketAuthenticateSchema>;

// ─── Le cliquet de la porte d'ENVOI ────────────────────────────────────────
//
// Un envoi de message est décrit DEUX fois : par le CONTRAT que les trois
// clients compilent (`MessageSendData` / `MessageSendWithAttachmentsData`,
// `@meeshy/shared`) et par le SCHÉMA qui décide, à l'exécution, de ce que la
// passerelle accepte. Rien ne les confrontait, et les deux moitiés du fil ne
// disaient pas la même chose :
//
// - un champ que le SCHÉMA ignore est STRIPPÉ en silence (`z.object`). Un
//   client qui l'émet croit l'avoir envoyé ; il n'atteint jamais la base. C'est
//   ainsi que l'enveloppe de chiffrement entière — `encryptedContent`,
//   `encryptionMetadata` — se perdait sur le chemin d'envoi PRIMAIRE, laissant
//   les messages d'une conversation chiffrée persistés en clair (ou réduits au
//   littéral `[Encrypted]` en mode e2ee) ;
// - un champ que le CONTRAT ignore est INEXPRIMABLE. Dix champs que la
//   passerelle accepte et honore — les effets de message (`isViewOnce`,
//   `isBlurred`, `expiresAt`), le lieu partagé, le transfert, la réponse à une
//   story — n'existaient pour aucun client typé. Ils ne voyageaient que parce
//   que le web compose sa charge en `Record<string, unknown>`.
//
// Le cliquet est une ÉGALITÉ de jeux de clés, dans les DEUX sens : chacune des
// deux dérives ci-dessus en fait tomber la moitié correspondante, et aucune ne
// subsume l'autre. Il vit dans un fichier de PRODUCTION, jamais dans un
// `__tests__` — `tsconfig.json` les exclut, et un cliquet que le compilateur
// n'atteint pas n'est jamais rouge.
//
// Quand il tombe : le champ neuf s'ajoute des DEUX côtés. Il n'y a pas de champ
// légitime à ne déclarer que d'un seul — c'est exactement l'état que ce cliquet
// existe pour rendre impossible.

type Assert<T extends true> = T;
type KeysEqual<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;

export type SendDoorRatchet = [
  Assert<KeysEqual<SocketMessageSendData, MessageSendData>>,
  Assert<KeysEqual<SocketMessageSendWithAttachmentsData, MessageSendWithAttachmentsData>>,
];
