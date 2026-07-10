import { z } from 'zod';
import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

const clientMessageIdSchema = z
  .string()
  .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)');

export const SocketMessageSendSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  originalLanguage: z.string().optional(),
  messageType: z.string().optional(),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: clientMessageIdSchema,
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
  conversationId: z.string(),
  content: z.string(),
  originalLanguage: z.string().optional(),
  attachmentIds: z.array(mongoId).min(1),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: clientMessageIdSchema,
});

export type SocketMessageSendWithAttachmentsData = z.infer<typeof SocketMessageSendWithAttachmentsSchema>;

export const SocketTranslationRequestSchema = z.object({
  messageId: mongoId,
  targetLanguage: z.string().min(2).max(5),
});

export type SocketTranslationRequestData = z.infer<typeof SocketTranslationRequestSchema>;

export const SocketConversationJoinSchema = z.object({
  conversationId: z.string(),
});

export type SocketConversationJoinData = z.infer<typeof SocketConversationJoinSchema>;

export const SocketConversationLeaveSchema = z.object({
  conversationId: z.string(),
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

export const SocketAuthenticateSchema = z.object({
  userId: z.string().optional(),
  sessionToken: z.string().optional(),
  language: z.string().optional(),
  token: z.string().optional(),
});

export type SocketAuthenticateData = z.infer<typeof SocketAuthenticateSchema>;
