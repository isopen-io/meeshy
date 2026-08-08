import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ReactionEventType, ReactionOfflineQueueParams } from './reactionOfflineQueue';

export interface ReactionEmitIO {
  to(room: string): { emit(event: string, payload: unknown): void };
}

/**
 * The `MeeshySocketIOManager` surface this helper needs, kept structural so it
 * accepts both the production manager and a test double, and so the REST route
 * files never have to import the manager class.
 */
export interface ReactionMutationManager {
  getIO(): ReactionEmitIO | null | undefined;
  enqueueOfflineReactionMutation(params: ReactionOfflineQueueParams): Promise<void>;
}

const EVENT_NAME = {
  'reaction-added': SERVER_EVENTS.REACTION_ADDED,
  'reaction-removed': SERVER_EVENTS.REACTION_REMOVED,
} as const;

/**
 * The single REST-side broadcaster for a message reaction toggle.
 *
 * A reaction mutation has to reach TWO audiences, and each is a separate
 * channel:
 *
 *  1. participants sitting in the conversation → the room emit;
 *  2. participants who are OFFLINE right now → the delivery queue, replayed by
 *     `_drainPendingMessages` on their next connection.
 *
 * Unlike `broadcastMessageMutation` there is no third, conversation-list
 * audience: a reaction changes no field of the conversation preview (last
 * message, sender, timestamp all stay put), so there is nothing for
 * `emitConversationPreviewUpdate` to refresh. Two audiences, deliberately.
 *
 * `ReactionHandler` (the socket transport) covered both. The four REST reaction
 * routes and the agent reaction path each open-coded (1) and none of them did
 * (2), so a reaction toggled over REST was lost FOREVER for anyone offline at
 * that instant — the exact failure `enqueueOfflineReactionEvent` exists to
 * prevent. That gap was invisible precisely because the five sites duplicated
 * the same room-emit block without referencing each other; collapsing them here
 * means a sixth transport cannot silently reopen it.
 *
 * REST is not a secondary path: the iOS SDK reacts via `POST /reactions` and
 * un-reacts via `DELETE /reactions/:messageId/:emoji`
 * (`MeeshySDK/Services/ReactionService.swift`), so this is the primary reaction
 * transport for the mobile client.
 *
 * Best-effort side channel — never throws. The reaction has already been
 * committed by the time this runs; a broadcast failure must not turn a
 * successful reaction into a 500. The two audiences are independent: a failure
 * reaching one must not cost the other its event, so each is guarded
 * separately. `onError` lets callers log against the originating request.
 */
export async function broadcastReactionMutation(params: {
  manager: ReactionMutationManager | null | undefined;
  conversationId: string;
  actorParticipantId: string | null | undefined;
  eventType: ReactionEventType;
  messageId: string;
  emoji: string;
  payload: Record<string, unknown>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { manager, conversationId, actorParticipantId, eventType, messageId, emoji, payload, onError } = params;
  if (!manager) return;

  try {
    manager.getIO()?.to(ROOMS.conversation(conversationId)).emit(EVENT_NAME[eventType], payload);
  } catch (error) {
    onError?.(error);
  }

  // Fire-and-forget: `enqueueOfflineReactionMutation` swallows its own failures,
  // so awaiting it would only add the participant lookup's latency to the
  // response for no observable benefit. The try/catch guards the CALL itself
  // (a manager without the method), and the `.catch` guards the returned
  // promise — Node 22 terminates the process on an unhandled rejection, so a
  // manager that ever rejects must not be able to take the gateway down from a
  // side channel whose whole contract is to be best-effort.
  try {
    void Promise.resolve(
      manager.enqueueOfflineReactionMutation({
        conversationId,
        actorParticipantId,
        eventType,
        messageId,
        emoji,
        payload,
      })
    ).catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
