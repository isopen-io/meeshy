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
 *      « Echo » veut dire *celui de l'APPELANT*, et le corps rendait celui de
 *      la LIGNE (#17058). Les deux coïncident sur le chemin nominal et
 *      divergent là où ça compte : sur un hit de déduplication par contenu, la
 *      ligne relue est celle du PREMIER message, donc l'accusé de `cid2`
 *      portait `cid1`. iOS fait confiance au serveur
 *      (`MessageSocketManager+Send.swift` : `body.clientMessageId ?? requestCid`,
 *      dont le `??` ne protège de rien quand le serveur a répondu un cid —
 *      simplement celui d'un autre message), si bien que l'accusé était
 *      attribué à une ligne DÉJÀ confirmée et que la bulle de `cid2` restait
 *      en horloge « envoi » indéfiniment.
 *
 *      D'où le paramètre-objet : les deux cids sont des `string`, et c'est
 *      précisément cette interchangeabilité qui a laissé passer le défaut. Un
 *      nom par rôle rend l'erreur impossible à écrire.
 *
 *   2. `stripClientMessageId` — remove `clientMessageId` from the peers'
 *      `message:new` payload so a non-sender participant never learns the
 *      sender's optimistic-id space (the sender's own devices still receive the
 *      cid-aware payload).
 */
import type { E2EEDevicesMismatch } from '@meeshy/shared/types/e2ee-directory';

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

export function buildMessageAckData(input: {
  /**
   * La ligne ÉCRITE ou RELUE. Elle donne le `messageId` et le `createdAt`
   * autoritatifs — jamais le `clientMessageId`, qui est celui d'un autre
   * message dès qu'un dédup a eu lieu.
   */
  readonly row: MessageAckSource;
  /**
   * Le `clientMessageId` que l'APPELANT a soumis, et le seul que l'accusé a le
   * droit de nommer. Absent pour un transport qui n'en envoie pas.
   */
  readonly submittedClientMessageId?: string;
}): MessageAckData {
  const { row } = input;
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return {
    messageId: row.id,
    ...(input.submittedClientMessageId ? { clientMessageId: input.submittedClientMessageId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

/**
 * Le jumeau REST de {@link buildMessageAckData} : la réponse d'envoi ne nomme
 * que le `clientMessageId` SOUMIS (#17058).
 *
 * `POST /conversations/:id/messages` rend la LIGNE entière, donc son
 * `clientMessageId` — et sur un hit de déduplication par contenu la ligne est
 * celle du PREMIER message. La réponse à `cid_B` repartait sous `cid_A`, et le
 * web fusionne « par id OU clientMessageId » (`upsertThreadMessage`) : la
 * seconde bulle était absorbée par la ligne du premier message et
 * disparaissait. C'est le second transport du défaut, que l'issue ne nommait
 * pas.
 *
 * Il vit ICI et non dans la route, parce que ce module est déclaré « the single
 * source of truth for two invariants the iOS / web clients rely on » : une
 * règle retapée à chaque transport est une règle qu'un transport finira par ne
 * pas avoir.
 *
 * Soumis absent ⇒ la clé est RETIRÉE. Un transport qui n'envoie pas de cid ne
 * doit pas en recevoir un fabriqué depuis la ligne — le laisser passer est
 * exactement ce qui faisait nommer un autre message.
 */
export function withSubmittedClientMessageId<M extends object>(
  message: M,
  submittedClientMessageId: string | undefined,
): M {
  const { clientMessageId: _rowCid, ...rest } = message as M & { clientMessageId?: string };
  return (submittedClientMessageId ? { ...rest, clientMessageId: submittedClientMessageId } : rest) as M;
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
  /** L'écart Sesame d'un envoi libsignal refusé (#3706), étalé comme sur REST. */
  readonly e2eeMismatch?: E2EEDevicesMismatch;
};

export type MessageFailureAck = {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
  readonly retryAfter?: number;
} & Partial<E2EEDevicesMismatch>;

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
    ...(source.e2eeMismatch ?? {}),
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
