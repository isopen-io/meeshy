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
   * dedup is correct (one creation per message) and it carries no delivery
   * receipt — the share-link send path creates no read-status rows, so a
   * receipt on drain alone would claim a delivery the rest of the pipeline
   * never tracked.
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
