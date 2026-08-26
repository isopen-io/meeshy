/**
 * Types for the Redis persistent delivery queue.
 * Used to queue messages for offline participants and deliver on reconnect.
 */

export type QueuedMessagePayload = {
  readonly messageId: string;
  /**
   * `Conversation.id` — un ObjectId, et le seul champ de l'entrée que le drain
   * AGRÈGE : `_dropEndedMemberships` (le gate d'autorisation du rejeu) et la
   * résolution des accusés de remise construisent chacun un unique
   * `conversationId: { in: [...] }` portant TOUT le lot.
   *
   * Le type l'affirme à l'écriture seulement. À la relecture il sort d'un
   * `JSON.parse(…) as QueuedMessagePayload` sur des octets vieux de 48 h au plus
   * (`DELIVERY_QUEUE_TTL_SECONDS`), et un id que la colonne ne peut pas porter y
   * fait lever la requête pour le lot ENTIER. Le drain le vérifie donc AVANT
   * d'interroger — `isAddressableConversationId`
   * (`services/gateway/src/socketio/queuedEventContract.ts`).
   */
  readonly conversationId: string;
  readonly payload: Record<string, unknown>;
  readonly enqueuedAt: string;
  /** Absent (or 'new') = original behavior: a MESSAGE_NEW replay that also
   * bumps the recipient's delivered receipt on drain. 'edited'/'deleted'
   * replay the matching event without touching delivery receipts.
   * 'reaction-added'/'reaction-removed' replay REACTION_ADDED/REACTION_REMOVED
   * so an offline peer's reaction state converges on reconnect (same as
   * edits/deletes) — they never carry a delivery receipt.
   * 'attachment-reaction-added'/'attachment-reaction-removed' replay
   * ATTACHMENT_REACTION_ADDED/ATTACHMENT_REACTION_REMOVED so an offline peer's
   * per-attachment reaction summary converges on reconnect — like message
   * reactions they need a finer dedupKey (attachmentId:reactor:emoji) and never
   * carry a delivery receipt.
   * 'pinned'/'unpinned' replay MESSAGE_PINNED/MESSAGE_UNPINNED so an offline
   * peer's pin state converges on reconnect — like edits/deletes, at most one
   * relevant transition per message per event type, so messageId+eventType
   * dedup is correct and no finer dedupKey is needed; never a delivery
   * receipt.
   * 'link-message' replays a message sent through a share link under BOTH
   * LINK_MESSAGE_NEW and MESSAGE_NEW, exactly as the live room emit does (see
   * `linkMessageEmissions`). It is a CREATION like 'new', not a mutation, but
   * it keeps its own eventType because the two wire events carry different
   * payload shapes: `message:new` sends the message object, `link:message:new`
   * wraps it as `{ message }` — one queued envelope, two shapes on the wire.
   * Replaying LINK_MESSAGE_NEW alone left iOS and Android, which listen to
   * `message:new` only, with nothing to converge on at reconnect. messageId
   * dedup is correct (one creation per message).
   * It DOES bump the delivered receipt on drain, like 'new' — see
   * `services/gateway/src/socketio/queuedMessageArrival.ts`. Cette ligne a
   * d'abord affirmé le contraire, au motif que « le chemin d'envoi par lien ne
   * crée aucune ligne de statut de lecture » : c'était déjà faux au commit qui
   * l'écrivait, lequel branchait `autoDeliverToOnlineRecipients` sur ce même
   * chemin (`broadcastLinkMessage`, audience 4) — donc `markMessagesAsReceived`
   * pour tout destinataire CONNECTÉ. La moitié hors ligne, seule à ne rien
   * écrire, laissait l'auteur — le plus souvent un invité, dont c'est l'unique
   * transport d'envoi — sur un tic « envoyé » jusqu'à ce qu'on ouvre la
   * conversation, l'attente même que le drain existe pour supprimer.
   * 'attachment-updated' replays MESSAGE_ATTACHMENT_UPDATED so a peer who was
   * offline when Whisper finished transcribing (or when NLLB+Chatterbox
   * finished one language of translated audio) still gets the enrichment. The
   * `message:new` that was queued at SEND time carries the attachment as it
   * was then — no transcription, no translated audio, both landing a second or
   * two later — so without this entry the replayed message is permanently the
   * un-enriched one. It needs a dedupKey scoped to the ATTACHMENT id: two
   * audio attachments on one message would otherwise collapse into a single
   * entry, and the supersede-in-place rule (latest payload wins) is exactly
   * right per attachment since the payload carries its FULL state. Never a
   * delivery receipt.
   * 'translation' replays MESSAGE_TRANSLATION so a peer who was offline when
   * NLLB finished translating a TEXT message still gets the translation. Exact
   * text sibling of 'attachment-updated': the `message:new` queued at SEND time
   * carries `translations: []` — the translation lands a second or two later
   * over ZMQ — so without this entry the replayed message is permanently the
   * untranslated one, and the Prisme Linguistique becomes a function of whether
   * the reader happened to be connected when NLLB finished. It needs a dedupKey
   * scoped to the TARGET LANGUAGE: one message fans out to as many translations
   * as the conversation has reader languages, and messageId+eventType alone
   * would collapse them into a single entry, keeping only the first language.
   * Supersede-in-place (latest payload wins) is right per language — a
   * re-translation of the same (message, language) replaces the previous text.
   * Never a delivery receipt: a translation is not a message arriving. */
  readonly eventType?:
    | 'new'
    | 'edited'
    | 'deleted'
    | 'reaction-added'
    | 'reaction-removed'
    | 'attachment-reaction-added'
    | 'attachment-reaction-removed'
    | 'pinned'
    | 'unpinned'
    | 'link-message'
    | 'attachment-updated'
    | 'translation';
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

/**
 * Hard bound on the number of entries the DURABLE (Redis) slice keeps per user.
 *
 * The queue holds up to `DELIVERY_QUEUE_TTL_SECONDS` (48 h) of events for one
 * absent participant, and without a bound that is 48 h of a busy conversation.
 * Three costs grow with that backlog, and only the first is about storage:
 *
 * 1. **Enqueue cost.** The enqueue script reads the WHOLE list and cjson-decodes
 *    every entry to find the (dedup identity, eventType) it may have to
 *    supersede. Lua runs atomically inside Redis's SINGLE thread, so the cost of
 *    queueing one event for an absent participant was paid by every other client
 *    of that Redis — and it grew with how much was already queued for them.
 *    Filling a queue of N therefore cost O(N²) decodes of blocked Redis time.
 * 2. **Replay burst.** `_drainPendingMessages` emits every drained entry, so the
 *    reconnect of one long-absent user turned into an unbounded emit loop.
 * 3. **Redis memory**, held for the full TTL.
 *
 * Capping the list bounds all three at once: the scan can never read more than
 * this many entries, the replay can never exceed it, and neither can the stored
 * backlog. 500 keeps the scan well inside a sub-millisecond budget while staying
 * far above any plausible legitimate backlog — the drop only starts once the
 * replay was already pathological, and clients reconcile the remainder through
 * `/sync` and the normal message fetch when they open the conversation.
 *
 * The in-process memory fallback keeps a much tighter cap of its own
 * (`MEMORY_QUEUE_MAX_PER_USER`, 50) because it bounds a different resource —
 * gateway heap during a Redis outage, across up to 1000 users at once — not
 * Redis CPU. The two numbers are deliberately different; see
 * `RedisDeliveryQueue`.
 */
export const DELIVERY_QUEUE_MAX_PER_USER = 500;
