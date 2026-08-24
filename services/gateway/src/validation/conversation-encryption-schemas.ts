import { z } from 'zod';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';

const mongoId = z.string().regex(OBJECT_ID_REGEX);

export const ConversationIdParamSchema = z.object({
  conversationId: mongoId,
});

export const SetEncryptionModeBodySchema = z.object({
  mode: z.enum(['e2ee', 'server', 'hybrid']),
});

export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
export type SetEncryptionModeBody = z.infer<typeof SetEncryptionModeBodySchema>;
