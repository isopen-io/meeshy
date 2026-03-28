import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

export const SuggestionsQuerySchema = z.object({
  conversationId: mongoId,
  query: z.string().optional()
}).strict();

export const MessageIdParamSchema = z.object({
  messageId: mongoId
}).strict();

export const MyMentionsQuerySchema = z.object({
  limit: z
    .string()
    .transform(Number)
    .default('20')
}).strict();

export type SuggestionsQuery = z.infer<typeof SuggestionsQuerySchema>;
export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type MyMentionsQuery = z.infer<typeof MyMentionsQuerySchema>;
