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

/**
 * Générique et préservant : le seul champ que la fonction retire est
 * `clientMessageId`, donc son type de retour doit rester celui de l'entrée
 * moins ce champ. Un retour `Record<string, unknown>` ré-élargirait tout
 * payload typé qui la traverse — c'est ce qui casse l'emit typé
 * `link:message:new`, dont le contrat exige `id`/`conversationId`/`senderId`
 * (cycle 7). Un helper de nettoyage ne doit rien coûter au typage de l'appelant.
 */
export function stripClientMessageId<T extends Record<string, unknown>>(
  senderPayload: T,
): Omit<T, 'clientMessageId'> {
  const { clientMessageId: _clientMessageId, ...broadcastPayload } = senderPayload;
  return broadcastPayload;
}

export type MessageRefusalSource = {
  readonly error?: string;
  readonly code?: string;
  readonly retryAfter?: number;
};

export type MessageFailureAck = {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
  readonly retryAfter?: number;
};

/** Les refus TEMPORAIRES — ceux dont l'expéditeur doit être prévenu hors de l'ACK aussi. */
const TEMPORARY_REFUSAL_CODES: ReadonlySet<string> = new Set(['NEWCOMER_SLOW_MODE']);

/**
 * L'ACK d'un envoi refusé. Il gardait le seul `error` : le `code` et le
 * décompte que `handleMessage` pose (#7740) se perdaient au dernier mètre, et
 * le client ne pouvait pas distinguer « pas encore » de « jamais ».
 */
export function buildMessageFailureAck(source: MessageRefusalSource): MessageFailureAck {
  return {
    success: false,
    error: source.error || 'Failed to send message',
    ...(source.code ? { code: source.code } : {}),
    ...(source.retryAfter !== undefined ? { retryAfter: source.retryAfter } : {}),
  };
}

/**
 * L'événement `error` qui double l'ACK d'un refus TEMPORAIRE — même forme que
 * `_sendError` (`{ message, code }`), plus le décompte. `null` pour tout autre
 * refus : ceux-là n'émettaient rien avant #7740, et continuent.
 */
export function messageRefusalEvent(
  source: MessageRefusalSource,
): { readonly message: string; readonly code: string; readonly retryAfter?: number } | null {
  if (!source.code || !TEMPORARY_REFUSAL_CODES.has(source.code)) return null;
  const ack = buildMessageFailureAck(source);
  return {
    message: ack.error,
    code: source.code,
    ...(ack.retryAfter !== undefined ? { retryAfter: ack.retryAfter } : {}),
  };
}
