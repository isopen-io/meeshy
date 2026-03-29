/**
 * Types for the Redis persistent delivery queue.
 * Used to queue messages for offline participants and deliver on reconnect.
 */

export type QueuedMessagePayload = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly payload: Record<string, unknown>;
  readonly enqueuedAt: string;
};

export const DELIVERY_QUEUE_PREFIX = 'delivery:queue:' as const;
export const DELIVERY_QUEUE_TTL_SECONDS = 172800;
