import { z } from 'zod';

const mongoId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format');

// ============================================
// PARAMS SCHEMAS
// ============================================

export const MessageParamsSchema = z.object({
  messageId: mongoId
}).strict();

export const AttachmentParamsSchema = z.object({
  attachmentId: mongoId
}).strict();

// ============================================
// QUERY SCHEMAS
// ============================================

export const MessageStatusDetailsQuerySchema = z.object({
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a non-negative integer')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be >= 0')
    .default('0'),

  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .default('20'),

  filter: z
    .enum(['all', 'delivered', 'read', 'unread'])
    .default('all')
}).strict();

export const AttachmentStatusDetailsQuerySchema = z.object({
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a non-negative integer')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be >= 0')
    .default('0'),

  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .default('20'),

  filter: z
    .enum(['all', 'viewed', 'downloaded', 'listened', 'watched'])
    .default('all')
}).strict();

// ============================================
// BODY SCHEMAS
// ============================================

export const UpdateMessageBodySchema = z.object({
  content: z
    .string()
    .trim()
    .optional(),

  isEdited: z
    .boolean()
    .optional()
}).strict();

export const MessageStatusBodySchema = z.object({
  status: z.enum(['read', 'delivered']),

  timestamp: z
    .string()
    .datetime()
    .optional()
}).strict();

export const AttachmentStatusBodySchema = z.object({
  action: z.enum(['listened', 'watched', 'viewed', 'downloaded']),

  playPositionMs: z
    .number()
    .int()
    .nonnegative()
    .optional(),

  durationMs: z
    .number()
    .int()
    .nonnegative()
    .optional(),

  complete: z
    .boolean()
    .optional(),

  wasZoomed: z
    .boolean()
    .optional()
}).strict();

// ============================================
// TYPE EXPORTS
// ============================================

export type MessageParams = z.infer<typeof MessageParamsSchema>;
export type AttachmentParams = z.infer<typeof AttachmentParamsSchema>;
export type MessageStatusDetailsQuery = z.infer<typeof MessageStatusDetailsQuerySchema>;
export type AttachmentStatusDetailsQuery = z.infer<typeof AttachmentStatusDetailsQuerySchema>;
export type UpdateMessageBody = z.infer<typeof UpdateMessageBodySchema>;
export type MessageStatusBody = z.infer<typeof MessageStatusBodySchema>;
export type AttachmentStatusBody = z.infer<typeof AttachmentStatusBodySchema>;
