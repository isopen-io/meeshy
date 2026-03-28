import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

export const MessageIdParamSchema = z.object({
  messageId: mongoId
}).strict();

export const ConversationIdParamSchema = z.object({
  conversationId: mongoId
}).strict();

export const ReadStatusesQuerySchema = z.object({
  messageIds: z
    .string()
    .optional()
    .refine(
      val => !val || val.split(',').every(id => /^[0-9a-fA-F]{24}$/.test(id.trim())),
      'Each messageId must be a valid MongoDB ObjectId'
    )
}).strict();

export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
export type ReadStatusesQuery = z.infer<typeof ReadStatusesQuerySchema>;
