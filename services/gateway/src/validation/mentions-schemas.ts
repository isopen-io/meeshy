import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

export const SuggestionsQuerySchema = z.object({
  // New unified params
  contextId: mongoId.optional(),
  contextType: z.enum(['conversation', 'post']).optional(),
  // Legacy param (backwards compat — deprecated)
  conversationId: mongoId.optional(),
  query: z.string().max(64).optional(),
}).refine(
  data => (data.contextId !== undefined && data.contextType !== undefined) || data.conversationId !== undefined,
  { message: 'Either (contextId + contextType) or conversationId is required' }
);

export const MessageIdParamSchema = z.object({
  messageId: mongoId
}).strict();

export const MyMentionsQuerySchema = z.object({
  limit: z
    .string()
    .transform(Number)
    .prefault('20')
}).strict();

export type SuggestionsQuery = z.infer<typeof SuggestionsQuerySchema>;
export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type MyMentionsQuery = z.infer<typeof MyMentionsQuerySchema>;
