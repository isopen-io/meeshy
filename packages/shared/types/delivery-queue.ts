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
   * edits/deletes) — they never carry a delivery receipt. */
  readonly eventType?: 'new' | 'edited' | 'deleted' | 'reaction-added' | 'reaction-removed';
};

export const DELIVERY_QUEUE_PREFIX = 'delivery:queue:' as const;
export const DELIVERY_QUEUE_TTL_SECONDS = 172800;
