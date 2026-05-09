/**
 * Runtime-validated `SendMessageRequest` schema.
 *
 * The TypeScript interface in `./index.ts` (`SendMessageRequest`) carries the
 * full "send a message" payload shape used across services for compile-time
 * checks. This Zod schema is the **runtime source of truth** for the subset
 * of fields the gateway validates on the wire (REST `POST /conversations/:id/messages`
 * and Socket.IO `message:send-with-attachments`).
 *
 * The mandatory `clientMessageId` field enforces the offline-queue dedup
 * contract: the gateway uses `(conversationId, clientMessageId)` as a unique
 * key to drop duplicate sends after a flaky reconnect. Format must match
 * `CLIENT_MESSAGE_ID_REGEX` from `../utils/client-message-id.ts` — kept in
 * lock-step with the Swift `ClientMessageId` helper.
 */
import { z } from 'zod';
import { CLIENT_MESSAGE_ID_REGEX } from '../utils/client-message-id.js';

export const SendMessageRequestSchema = z.object({
  content: z.string().min(1).max(50_000),
  clientMessageId: z
    .string()
    .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format'),
  originalLanguage: z.string().optional(),
  replyToId: z.string().optional(),
  forwardedFromId: z.string().optional(),
  forwardedFromConversationId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  messageType: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
