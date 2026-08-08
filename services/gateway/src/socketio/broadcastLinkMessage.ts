import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/**
 * The `MeeshySocketIOManager` surface this helper needs, kept structural so it
 * accepts both the production manager and a test double, and so the link route
 * file never has to import the manager class.
 */
export interface LinkMessageManager {
  getIO(): { to(room: string): { emit(event: string, payload: unknown): void } } | null | undefined;
  enqueueOfflineLinkMessage(params: {
    conversationId: string;
    actorParticipantId: string | null | undefined;
    messageId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * The single broadcaster for a message sent through a share link.
 *
 * A new message has to reach TWO audiences here:
 *
 *  1. participants connected right now → the `conversation:<id>` room emit;
 *  2. participants who are OFFLINE right now → the delivery queue, replayed as
 *     `link:message:new` by `_drainPendingMessages` on their next connection.
 *
 * Both share-link send routes open-coded (1) alone, so a message sent through a
 * link — the only send transport an anonymous participant has — simply never
 * arrived for anyone offline at that instant. Nothing replays it on reconnect
 * and the web client does not refetch (`staleTime: Infinity`), so it surfaced
 * only at the next unrelated full refetch of the conversation.
 *
 * TWO audiences, not the three `broadcastMessageMutation` fans out to: the
 * conversation-list preview needs no separate channel on this path. `AuthHandler`
 * joins every conversation room at connection time, so a participant sitting on
 * the list is still IN the room, and the web `link:message:new` handler bumps
 * the conversation's preview and ordering from this very event. Emitting
 * `conversation:updated` too would cost a DB read per link message for an update
 * the clients already applied. Stated here so a reader does not mistake the
 * absence for the omission it looks like.
 *
 * `payload` is the peer-facing body — the cid-stripped `{ message }` envelope.
 * Both audiences MUST receive the same object: a queued replay carrying the
 * author's `clientMessageId` would hand a third party the author's local
 * optimistic id.
 *
 * Best-effort side channel — never throws. The message is already committed by
 * the time this runs; a broadcast failure must not turn a successful send into
 * a 500. `onError` lets callers log against the originating request.
 */
export async function broadcastLinkMessage(params: {
  manager: LinkMessageManager | null | undefined;
  conversationId: string;
  senderParticipantId: string | null | undefined;
  messageId: string;
  payload: Record<string, unknown>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { manager, conversationId, senderParticipantId, messageId, payload, onError } = params;
  if (!manager) return;

  try {
    manager.getIO()?.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.LINK_MESSAGE_NEW, payload);
  } catch (error) {
    onError?.(error);
  }

  // Fire-and-forget: `enqueueOfflineLinkMessage` swallows its own failures, so
  // awaiting it would only add the participant lookup's latency to the 201 for
  // no observable benefit. The try/catch guards the CALL itself (a manager
  // double without the method), not the returned promise; the `.catch` guards
  // the promise, because a rejection with no handler terminates the process
  // under Node 22's default `--unhandled-rejections=throw`.
  try {
    void manager.enqueueOfflineLinkMessage({
      conversationId,
      actorParticipantId: senderParticipantId,
      messageId,
      payload,
    })?.catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
