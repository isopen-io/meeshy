/**
 * Single writer for `UserMessageDeletion` — the per-user "delete this message
 * from MY view" table.
 *
 * The row is per-USER, not per-device. Three routes wrote it
 * (`DELETE /api/messages/:id/delete-for-me`, its bulk sibling, and
 * `POST /api/messages/:id/restore-for-me`) and all three stopped after
 * persisting: nothing was broadcast, so the hiding only ever reached the device
 * that issued the request — which had removed the bubble optimistically. Every
 * OTHER device of the same user kept showing the message indefinitely.
 *
 * The reason is worth stating, because it is the same one `delta-tombstones.ts`
 * documents for the conversation list: **a read filter can only shrink what a
 * NEW query returns; it has no reach over a row a client already holds.**
 * `personalHistoryFilter` (the read half) is therefore necessary and not
 * sufficient — a client that never re-reads never learns. The fact needs a
 * channel of its own, and it needs two: this broadcast for the devices that are
 * online, and the `hidden` tombstone stream of `GET /sync` for the ones that
 * were not.
 *
 * Every write here owes three things that only work as a set:
 *   1. persist the row(s);
 *   2. retract the notification that still holds a COPY of the excerpt (a read
 *      filter never reaches it — see `retractHiddenMessageNotifications`);
 *   3. broadcast to `user:{id}` so the other devices converge.
 *
 * Keeping them in one module is what stops a fourth writer from honouring only
 * part of the contract, exactly as `conversationPreferencesSync` does for
 * `UserConversationPreferences`.
 *
 * Failure postures, deliberately different per step:
 *   - the PERSIST is the product: it propagates, and the caller answers 500;
 *   - the RETRACTION and the BROADCAST are side channels: they are logged and
 *     swallowed, because a hiding that succeeded must not be reported as failed
 *     (the user would retry a gesture that already took effect).
 */

import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  MessageHiddenForMeEventData,
  MessageRestoredForMeEventData,
  PersonalMessageVisibilityRef,
} from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../utils/socket-broadcast';
import { retractNotificationsForHiddenMessages } from './messaging/retractHiddenMessageNotifications';
import { logger } from '../utils/logger';

export interface HideMessagesForUserParams {
  readonly userId: string;
  /** Already scoped to conversations the user belongs to by the calling route. */
  readonly messages: readonly PersonalMessageVisibilityRef[];
}

/**
 * Hide `messages` from `userId`'s own view, on all of their devices.
 *
 * ONE broadcast for the whole batch, never one per message: the bulk route
 * accepts up to 100 ids, and a per-message fanout would turn a single "clear
 * these" gesture into 100 events every device has to reconcile separately.
 * The single-message route sends a one-element list so clients have exactly one
 * shape to handle.
 */
export async function hideMessagesForUser(
  fastify: FastifyInstance,
  { userId, messages }: HideMessagesForUserParams
): Promise<void> {
  if (messages.length === 0) return;

  const messageIds = messages.map((m) => m.messageId);

  await Promise.all(
    messageIds.map((messageId) =>
      fastify.prisma.userMessageDeletion.upsert({
        where: { userId_messageId: { userId, messageId } },
        create: { userId, messageId },
        update: { deletedAt: new Date() },
      })
    )
  );

  await retractNotificationsForHiddenMessages(fastify.prisma, { userId, messageIds }).catch(
    (error: unknown) => {
      logger.warn('[personalMessageVisibilitySync] notification retraction failed', {
        userId,
        messageCount: messageIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  );

  const payload: MessageHiddenForMeEventData = {
    userId,
    messages: messages.map((m) => ({
      messageId: m.messageId,
      conversationId: m.conversationId,
    })),
    hiddenAt: new Date().toISOString(),
  };
  broadcastToUser(fastify, userId, SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, payload);
}

export interface RestoreMessageForUserParams {
  readonly userId: string;
  readonly message: PersonalMessageVisibilityRef;
}

/**
 * Undo one hiding.
 *
 * The delete is NOT swallowed: unlike the hiding, the caller has already
 * verified the row exists, so a failure here means the restore did not happen
 * and the user must be told. Broadcasting a restore that did not take effect
 * would make every other device refetch a conversation whose message is still
 * hidden — a visible, self-inflicted flicker.
 */
export async function restoreMessageForUser(
  fastify: FastifyInstance,
  { userId, message }: RestoreMessageForUserParams
): Promise<void> {
  await fastify.prisma.userMessageDeletion.delete({
    where: { userId_messageId: { userId, messageId: message.messageId } },
  });

  const payload: MessageRestoredForMeEventData = {
    userId,
    messages: [{ messageId: message.messageId, conversationId: message.conversationId }],
    restoredAt: new Date().toISOString(),
  };
  broadcastToUser(fastify, userId, SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, payload);
}
