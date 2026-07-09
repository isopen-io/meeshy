/**
 * Types for the Redis persistent delivery queue.
 * Used to queue messages for offline participants and deliver on reconnect.
 */

export type QueuedMessagePayload = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly payload: Record<string, unknown>;
  readonly enqueuedAt: string;
  /** Absent (or 'new') = original behavior: a MESSAGE_NEW replay that also
   * bumps the recipient's delivered receipt on drain. 'edited'/'deleted'
   * replay the matching event without touching delivery receipts.
   * 'reaction-added'/'reaction-removed' replay REACTION_ADDED/REACTION_REMOVED
   * so an offline peer's reaction state converges on reconnect (same as
   * edits/deletes) — they never carry a delivery receipt.
   * 'pinned'/'unpinned' replay MESSAGE_PINNED/MESSAGE_UNPINNED so an offline
   * peer's pin state converges on reconnect — like edits/deletes, at most one
   * relevant transition per message per event type, so messageId+eventType
   * dedup is correct and no finer dedupKey is needed; never a delivery
   * receipt. */
  readonly eventType?:
    | 'new'
    | 'edited'
    | 'deleted'
    | 'reaction-added'
    | 'reaction-removed'
    | 'pinned'
    | 'unpinned';
  /** Overrides the identity used for enqueue-time dedup (default: messageId).
   * messageId+eventType alone is correct for edits/deletes/pins (at most one
   * relevant transition matters per message), but reactions need a finer key:
   * two different reactors adding a reaction to the same message both queue
   * a 'reaction-added' entry, and messageId+eventType would collapse them
   * into one — silently dropping every reactor after the first. */
  readonly dedupKey?: string;
};

export const DELIVERY_QUEUE_PREFIX = 'delivery:queue:' as const;
export const DELIVERY_QUEUE_TTL_SECONDS = 172800;
