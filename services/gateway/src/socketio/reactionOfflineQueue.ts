import type { QueuedVariantFor } from './queuedEventContract';
import { queuedVariantOf } from './queuedEventContract';
import {
  enqueueForOfflineParticipants,
  type OfflineParticipantQueueDeps,
} from './offlineParticipantQueue';

export type ReactionEventType = 'reaction-added' | 'reaction-removed';

/**
 * The collaborators the enqueue needs, kept structural so the socket handler,
 * the manager and test doubles can all supply them without importing each other.
 */
export type ReactionOfflineQueueDeps = OfflineParticipantQueueDeps;

export type ReactionOfflineQueueParams = QueuedVariantFor<ReactionEventType> & {
  conversationId: string;
  actorParticipantId: string | null | undefined;
  messageId: string;
  emoji: string;
};

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
 * The fan-out itself — active participants, actor excluded by participant id
 * (Leçon 78: exclude on the CALLER's identity, never on message content),
 * online peers skipped, never throws — is `enqueueForOfflineParticipants`,
 * shared with every other event family. What remains reaction-SPECIFIC, and the
 * only reason this wrapper exists, is the dedup key.
 *
 * `dedupKey` scopes the delivery-queue dedup to (messageId, reactor, emoji)
 * instead of the default messageId — `RedisDeliveryQueue`'s default dedup
 * identity is (messageId, eventType), which would otherwise collapse two
 * different reactors' 'reaction-added' events on the same message into one,
 * silently dropping every reactor after the first for an offline peer. It
 * belongs here rather than at the call sites so no transport can enqueue a
 * reaction without it.
 */
export async function enqueueOfflineReactionEvent(
  deps: ReactionOfflineQueueDeps,
  params: ReactionOfflineQueueParams
): Promise<void> {
  const { conversationId, actorParticipantId, messageId, emoji } = params;
  await enqueueForOfflineParticipants(deps, {
    conversationId,
    actorParticipantId,
    messageId,
    dedupKey: `${messageId}:${actorParticipantId ?? 'unknown'}:${emoji}`,
    // Le couple reste CORRÉLÉ : le destructurer rendrait `eventType` et
    // `payload` à deux unions indépendantes, et le relais perdrait la
    // vérification que la file vient d'acquérir.
    ...queuedVariantOf(params.eventType, params.payload),
  });
}
