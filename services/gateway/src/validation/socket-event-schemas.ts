import { z } from 'zod';
import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

const clientMessageIdSchema = z
  .string()
  .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)');

// Safety ceiling for message content. Runtime per-role validation (MAX_MESSAGE_LENGTH=4000)
// is the precise limit for plaintext messages; encrypted payloads may be larger, so we
// use a generous ceiling here that only blocks truly abusive payloads.
const MAX_CONTENT_BYTES = 100_000;

// Maximum attachment IDs per message — mirrors MessageValidator.ts (regular conversations: 100).
// Enforced at schema level to reject bulk-fake-attachment DoS before DB lookups start.
const MAX_ATTACHMENT_IDS = 100;

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
  // Effets de message — parité avec la route REST POST /messages.
  // `MessageProcessor.saveMessage` recompose le bitfield `effectFlags`
  // depuis `isBlurred` / `expiresAt` / `isViewOnce`.
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
});

export type SocketMessageSendData = z.infer<typeof SocketMessageSendSchema>;

export const SocketMessageSendWithAttachmentsSchema = z.object({
  conversationId: z.string().min(1).max(255),
  content: z.string().max(MAX_CONTENT_BYTES),
  originalLanguage: z.string().optional(),
  attachmentIds: z.array(mongoId).min(1).max(MAX_ATTACHMENT_IDS),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: clientMessageIdSchema,
  // Forward references — validated as ObjectIds (mirrors SocketMessageSendSchema).
  forwardedFromId: mongoId.optional(),
  forwardedFromConversationId: mongoId.optional(),
});

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

export const SocketMessageEditSchema = z.object({
  messageId: mongoId,
  content: z.string().min(1).max(MAX_CONTENT_BYTES),
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
