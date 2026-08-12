import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'offlineParticipantQueue' });

/**
 * The collaborators the enqueue needs, kept structural so the socket handlers,
 * the manager, the REST broadcasters and test doubles can all supply them
 * without importing each other.
 */
export interface OfflineParticipantQueueDeps {
  deliveryQueue: { enqueue(userId: string, entry: QueuedMessagePayload): Promise<void> } | null | undefined;
  prisma: Pick<PrismaClient, 'participant'>;
  connectedUsers: { has(key: string): boolean };
}

export interface OfflineParticipantQueueParams {
  conversationId: string;
  /**
   * Who caused the event, in whichever identity the calling transport holds.
   * Both are accepted and both are honoured: the socket paths know the actor's
   * `Participant.id`, the REST pin/edit routes run under `requiredAuth` and know
   * only the `User.id`. A participant id and a user id never collide, so an
   * exclusion on either is safe — but a caller passing the WRONG one would
   * queue the event back to its own author, who already has it.
   */
  actorParticipantId?: string | null;
  actorUserId?: string | null;
  eventType: QueuedMessagePayload['eventType'];
  messageId: string;
  payload: Record<string, unknown>;
  /**
   * Overrides the (messageId, eventType) dedup identity `RedisDeliveryQueue`
   * uses by default. Required whenever more than one distinct occurrence of the
   * same eventType can matter for one message — see the per-caller reasoning at
   * each call site.
   */
  dedupKey?: string;
  /**
   * An already-loaded active-participant list to fan out over, skipping this
   * function's own query. `broadcastNewMessage` runs on the hottest path in the
   * service and has just fetched exactly this list to build its emits; making
   * it re-query per message would be a real regression, and letting it keep its
   * own inline copy of the fan-out is how the previous five copies happened.
   */
  participants?: { id: string; userId: string | null }[];
}

/**
 * THE implementation of the "offline participants" audience, shared by every
 * transport that mutates or creates conversation state.
 *
 * Every conversation event has to reach participants who are not connected at
 * the instant it happens. `io.to(ROOMS.conversation(id))` reaches CONNECTED
 * sockets only, so a room emit alone loses the event forever for anyone
 * offline: nothing replays it on reconnect and no client refetches
 * spontaneously. `RedisDeliveryQueue` is that replay, drained by
 * `MeeshySocketIOManager._drainPendingMessages`, which re-emits each entry
 * under the event name `_drainedEventName(eventType)` resolves.
 *
 * This function exists because that obligation had been re-implemented FIVE
 * times — twice inside `MessageHandler`, once on the manager, once for
 * reactions, once for attachment reactions — each one private to its owner, so
 * no other writer could call it even when it wanted to. Every gap closed in
 * cycles 13 and 14 was a transport that had no way to honour a guarantee it
 * could not reach. The bodies differed only in the exclusion identity and the
 * dedup key, both of which are parameters here, so a new event family is a call
 * rather than a sixth copy.
 *
 * Best-effort side channel — never throws and never rejects. The event has
 * already been committed by the time this runs; a queue failure must not turn a
 * successful write into a 500 or flip an already-sent ACK to failure.
 */
export async function enqueueForOfflineParticipants(
  deps: OfflineParticipantQueueDeps,
  params: OfflineParticipantQueueParams
): Promise<void> {
  const { deliveryQueue, prisma, connectedUsers } = deps;
  if (!deliveryQueue) return;

  const { conversationId, actorParticipantId, actorUserId, eventType, messageId, payload, dedupKey } = params;
  try {
    const participants =
      params.participants ??
      (await prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true },
      }));
    for (const p of participants) {
      // Queue key mirrors the presence-key convention: userId for registered
      // users, participant id for anonymous. `connectedUsers` and `ROOMS.user`
      // are keyed the same way on the drain side.
      const queueKey = p.userId ?? p.id;
      const isActor =
        (actorParticipantId != null && p.id === actorParticipantId) ||
        (actorUserId != null && p.userId === actorUserId);
      if (isActor || connectedUsers.has(queueKey)) continue;
      deliveryQueue
        .enqueue(queueKey, {
          messageId,
          conversationId,
          payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
          ...(dedupKey ? { dedupKey } : {}),
        })
        .catch((err) => logger.warn('Failed to enqueue offline event', { userId: queueKey, eventType, error: err }));
    }
  } catch (err) {
    logger.warn('Failed to fetch participants for offline enqueue', { conversationId, eventType, error: err });
  }
}
