import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'reactionOfflineQueue' });

export type ReactionEventType = 'reaction-added' | 'reaction-removed';

/**
 * The collaborators the enqueue needs, kept structural so the socket handler,
 * the manager and test doubles can all supply them without importing each other.
 */
export interface ReactionOfflineQueueDeps {
  deliveryQueue: { enqueue(userId: string, entry: QueuedMessagePayload): Promise<void> } | null | undefined;
  prisma: Pick<PrismaClient, 'participant'>;
  connectedUsers: { has(key: string): boolean };
}

export interface ReactionOfflineQueueParams {
  conversationId: string;
  actorParticipantId: string | null | undefined;
  eventType: ReactionEventType;
  messageId: string;
  emoji: string;
  payload: Record<string, unknown>;
}

/**
 * The single implementation of the offline-replay audience for a message
 * reaction, shared by every transport that can toggle one.
 *
 * Without it a reaction toggled while a participant is offline is only
 * broadcast to the live `conversation:<id>` room, so the offline peer's cached
 * reaction counts stay stale until an unrelated full refetch. On reconnect
 * `MeeshySocketIOManager._drainedEventName` replays the queued entry as
 * REACTION_ADDED / REACTION_REMOVED with the same payload as the live emit.
 *
 * Extracted from `ReactionHandler` because it was the ONLY writer honouring the
 * guarantee: the four REST reaction routes and the agent reaction path each
 * open-coded the room emit alone. REST is not a secondary path — the iOS SDK
 * reacts via `POST /reactions` and un-reacts via `DELETE /reactions/:id/:emoji`
 * (`ReactionService.swift`), so it is the PRIMARY reaction transport for the
 * mobile client and every reaction sent from an iPhone was lost for offline
 * peers. One implementation means a sixth transport cannot reopen the gap.
 *
 * The actor is excluded by participant id (Leçon 78: exclude on the CALLER's
 * identity, never on message content) and every online peer is skipped since
 * they already received the live broadcast.
 *
 * `dedupKey` scopes the delivery-queue dedup to (messageId, reactor, emoji)
 * instead of the default messageId — `RedisDeliveryQueue`'s default dedup
 * identity is (messageId, eventType), which would otherwise collapse two
 * different reactors' 'reaction-added' events on the same message into one,
 * silently dropping every reactor after the first for an offline peer.
 *
 * Best-effort side channel — never throws and never rejects. The reaction has
 * already been committed by the time this runs; a queue failure must not turn a
 * successful reaction into a 500 or flip an already-sent ACK to failure.
 */
export async function enqueueOfflineReactionEvent(
  deps: ReactionOfflineQueueDeps,
  params: ReactionOfflineQueueParams
): Promise<void> {
  const { deliveryQueue, prisma, connectedUsers } = deps;
  if (!deliveryQueue) return;

  const { conversationId, actorParticipantId, eventType, messageId, emoji, payload } = params;
  try {
    const participants = await prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { id: true, userId: true },
    });
    const dedupKey = `${messageId}:${actorParticipantId ?? 'unknown'}:${emoji}`;
    for (const p of participants) {
      const queueKey = p.userId ?? p.id;
      if (p.id === actorParticipantId || connectedUsers.has(queueKey)) continue;
      deliveryQueue
        .enqueue(queueKey, {
          messageId,
          conversationId,
          payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
          dedupKey,
        })
        .catch((err: unknown) =>
          logger.warn('Failed to enqueue offline reaction event', { userId: queueKey, eventType, error: err })
        );
    }
  } catch (err) {
    logger.warn('Failed to fetch participants for offline reaction enqueue', {
      conversationId,
      eventType,
      error: err,
    });
  }
}
