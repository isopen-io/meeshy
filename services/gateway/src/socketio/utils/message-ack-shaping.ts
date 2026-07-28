/**
 * Pure shaping helpers for the `message:send` ACK and `message:new` broadcast
 * contract (Phase 4 §6.2). Extracted from `MessageHandler` so the data-flow is
 * covered through a REAL import instead of a re-implemented copy — this module
 * is the single source of truth for two invariants the iOS / web clients rely
 * on:
 *
 *   1. `buildMessageAckData` — echo `clientMessageId` (and the authoritative
 *      server `createdAt`, normalized to an ISO string) back to the sender in
 *      the ACK. The optimistic row only carries a local `cid_*` id and learns
 *      the server `messageId` from this ACK, so the cid MUST round-trip or the
 *      by-cid reconciliation cannot promote the row to `.sent`.
 *
 *   2. `stripClientMessageId` — remove `clientMessageId` from the peers'
 *      `message:new` payload so a non-sender participant never learns the
 *      sender's optimistic-id space (the sender's own devices still receive the
 *      cid-aware payload).
 */

export type MessageAckSource = {
  readonly id: string;
  readonly clientMessageId?: string;
  readonly createdAt?: Date | string;
};

export type MessageAckData = {
  readonly messageId: string;
  readonly clientMessageId?: string;
  readonly createdAt?: string;
};

export function buildMessageAckData(source: MessageAckSource): MessageAckData {
  const createdAt =
    source.createdAt instanceof Date ? source.createdAt.toISOString() : source.createdAt;
  return {
    messageId: source.id,
    ...(source.clientMessageId ? { clientMessageId: source.clientMessageId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export function stripClientMessageId(
  senderPayload: Record<string, unknown>,
): Record<string, unknown> {
  const { clientMessageId: _clientMessageId, ...broadcastPayload } = senderPayload;
  return broadcastPayload;
}
