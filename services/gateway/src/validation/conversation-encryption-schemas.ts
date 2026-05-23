import { z } from 'zod';

const mongoId = z.string().regex(/^[0-9a-fA-F]{24}$/);

export const ConversationIdParamSchema = z.object({
  conversationId: mongoId,
});

export const SetEncryptionModeBodySchema = z.object({
  mode: z.enum(['e2ee', 'server', 'hybrid']),
});

export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
export type SetEncryptionModeBody = z.infer<typeof SetEncryptionModeBodySchema>;
