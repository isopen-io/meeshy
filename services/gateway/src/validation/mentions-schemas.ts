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
  // Même garde numérique + clamp 1..100 que TOUS les schémas de query paginés
  // du gateway (GetNotificationsQuerySchema, MessageStatusDetailsQuerySchema…).
  // Sans le clamp, `limit=-5` survivait au `limit || 50` (truthy) de
  // routes/mentions.ts et atteignait Prisma en `take: -5` : sous
  // `orderBy: { mentionedAt: 'desc' }`, un `take` négatif renvoie les mentions
  // les plus ANCIENNES à l'envers au lieu des plus récentes — l'endpoint
  // « mentions récentes » servait le contraire de son contrat. Un `limit`
  // démesuré (`100000`) contournait de plus le plafond partagé.
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .prefault('20')
}).strict();

export type SuggestionsQuery = z.infer<typeof SuggestionsQuerySchema>;
export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type MyMentionsQuery = z.infer<typeof MyMentionsQuerySchema>;
