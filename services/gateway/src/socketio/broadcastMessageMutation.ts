import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate, type PreviewEmitIO } from './emitConversationPreviewUpdate';

// `user` : `emitConversationPreviewUpdate` résout le Prisme de la ligne de
// liste par destinataire, ce qui demande de lire les préférences linguistiques
// des participants qui ont un compte.
type MutationPrisma = Pick<PrismaClient, 'participant' | 'message' | 'user'>;

/**
 * The `MeeshySocketIOManager` surface this helper needs, kept structural so it
 * accepts both the production manager and a test double, and so the REST route
 * files never have to import the manager class.
 */
export interface MessageMutationManager {
  getIO(): PreviewEmitIO | null | undefined;
  enqueueOfflineMessageMutation(params: {
    conversationId: string;
    actorUserId: string | null | undefined;
    eventType: 'edited' | 'deleted';
    messageId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

const EVENT_NAME = {
  edited: SERVER_EVENTS.MESSAGE_EDITED,
  deleted: SERVER_EVENTS.MESSAGE_DELETED,
} as const;

/**
 * The single REST-side broadcaster for a message edit or delete.
 *
 * A message mutation has to reach THREE audiences, and every one of them is a
 * separate channel:
 *
 *  1. participants sitting in the conversation → the room emit;
 *  2. participants sitting on the conversation LIST (joined `user:<id>`, no
 *     longer in `conversation:<id>`) → `emitConversationPreviewUpdate`;
 *  3. participants who are OFFLINE right now → the delivery queue, replayed by
 *     `_drainPendingMessages` on their next connection.
 *
 * The WebSocket transport (`MessageHandler.handleMessageEdit` /
 * `handleMessageDelete`) covers all three. The five REST mutation routes each
 * open-coded (1) and (2) and none of them did (3), so an edit or delete made
 * over REST was lost FOREVER for anyone offline at that instant — the exact
 * failure `MessageHandler._enqueueOfflineEventForParticipants` exists to
 * prevent. That gap was invisible precisely because the five sites duplicated
 * the same two-channel block without referencing each other; collapsing them
 * here means a sixth transport cannot silently reopen it.
 *
 * REST is not a secondary path: the iOS SDK edits via `PUT /messages/:messageId`
 * (`routes/messages.ts` — NOT the conversation-scoped sibling) and
 * deletes via `DELETE /conversations/:id/messages/:id` (`MessageService.swift`),
 * so this is the primary mutation transport for the mobile client.
 *
 * Best-effort side channel — never throws. The mutation has already been
 * committed by the time this runs; a broadcast failure must not turn a
 * successful edit into a 500. `onError` lets callers log against the
 * originating request.
 */
export async function broadcastMessageMutation(params: {
  prisma: MutationPrisma;
  manager: MessageMutationManager | null | undefined;
  conversationId: string;
  actorUserId: string;
  eventType: 'edited' | 'deleted';
  messageId: string;
  payload: Record<string, unknown>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { prisma, manager, conversationId, actorUserId, eventType, messageId, payload, onError } = params;
  if (!manager) return;

  try {
    manager.getIO()?.to(ROOMS.conversation(conversationId)).emit(EVENT_NAME[eventType], payload);
  } catch (error) {
    onError?.(error);
  }

  await emitConversationPreviewUpdate(prisma, manager.getIO(), conversationId, actorUserId, onError);

  // Fire-and-forget: `enqueueOfflineMessageMutation` swallows its own failures,
  // so awaiting it would only add the participant lookup's latency to the
  // response for no observable benefit. The try/catch guards the CALL itself
  // (a manager double without the method), not the returned promise.
  try {
    void manager.enqueueOfflineMessageMutation({
      conversationId,
      actorUserId,
      eventType,
      messageId,
      payload,
    });
  } catch (error) {
    onError?.(error);
  }
}
