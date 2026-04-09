import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

export const SocketMessageSendSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  originalLanguage: z.string().optional(),
  messageType: z.string().optional(),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: z.string().optional(),
});

export type SocketMessageSendData = z.infer<typeof SocketMessageSendSchema>;

export const SocketMessageSendWithAttachmentsSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  originalLanguage: z.string().optional(),
  attachmentIds: z.array(mongoId).min(1),
  replyToId: mongoId.optional(),
  storyReplyToId: mongoId.optional(),
  clientMessageId: z.string().optional(),
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

export const SocketAuthenticateSchema = z.object({
  userId: z.string().optional(),
  sessionToken: z.string().optional(),
  language: z.string().optional(),
});

export type SocketAuthenticateData = z.infer<typeof SocketAuthenticateSchema>;
