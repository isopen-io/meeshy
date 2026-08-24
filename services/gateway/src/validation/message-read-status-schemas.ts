import { z } from 'zod';
import { OBJECT_ID_REGEX, isValidObjectId } from '@meeshy/shared/utils/object-id';

const mongoId = z
  .string()
  .regex(OBJECT_ID_REGEX, 'Invalid MongoDB ObjectId format');

export const MessageIdParamSchema = z.object({
  messageId: mongoId
}).strict();

export const ConversationIdParamSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required')
}).strict();

export const ReadStatusesQuerySchema = z.object({
  messageIds: z
    .string()
    .optional()
    .refine(
      val => !val || val.split(',').every(id => isValidObjectId(id.trim())),
      'Each messageId must be a valid MongoDB ObjectId'
    )
}).strict();

export const DeliveryReceiptParamsSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  messageId: mongoId
}).strict();

export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
export type ReadStatusesQuery = z.infer<typeof ReadStatusesQuerySchema>;
export type DeliveryReceiptParams = z.infer<typeof DeliveryReceiptParamsSchema>;
