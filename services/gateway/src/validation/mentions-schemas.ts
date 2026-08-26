import { z } from 'zod';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';

const mongoId = z
  .string()
  .regex(OBJECT_ID_REGEX, 'Invalid MongoDB ObjectId format');

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
  // Garde numérique `/^\d+$/` + plafond partagé (≤ 100), comme les schémas de
  // query paginés jumeaux (GetNotificationsQuerySchema…). C'est le `regex` qui
  // ferme le vrai défaut : `limit=-5` (ou tout négatif) ne matche pas `\d+` →
  // 400. Sans lui, `-5` survivait au `limit || 50` (truthy) de routes/mentions.ts
  // et atteignait Prisma en `take: -5` — sous `orderBy: { mentionedAt: 'desc' }`
  // un `take` négatif renvoie les mentions les plus ANCIENNES à l'envers au lieu
  // des plus récentes, servant le contraire du contrat « mentions récentes ». Un
  // `limit` démesuré (`100000`) contournait de plus le plafond.
  //
  // `0` est VOLONTAIREMENT admis (borne basse `>= 0`, pas `>= 1` comme les
  // jumeaux) : ce endpoint — et lui seul — traite `limit=0` comme « non
  // spécifié » via son garde falsy `limit || 50` (routes/mentions.ts), contrat
  // gelé par `mentions-routes.test.ts › falls back to limit=50 when limit=0`.
  // Le durcir en `>= 1` casserait ce repli sans rien gagner en sûreté (`take: 0`
  // n'a jamais été le bug — le négatif l'était).
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a non-negative integer')
    .transform(Number)
    .refine(val => val >= 0 && val <= 100, 'Limit must be between 0 and 100')
    .prefault('20')
}).strict();

export type SuggestionsQuery = z.infer<typeof SuggestionsQuerySchema>;
export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type MyMentionsQuery = z.infer<typeof MyMentionsQuerySchema>;
