package me.meeshy.sdk.outbox

/**
 * A durable-payload write-back: rewrites one queued dependent's payload, swapping a
 * prerequisite's placeholder `cmid` for the real id it produced, or returns `null`
 * when the write-back is a no-op for that payload shape (see
 * [me.meeshy.sdk.conversation.MessageMediaWriteBack] /
 * [me.meeshy.sdk.story.PublishMediaWriteBack]).
 */
public typealias OutboxPayloadGraft = (payload: String, placeholder: String, realId: String) -> String?

/**
 * Composes the per-kind write-backs into the single graft the [OutboxDrainer]
 * takes. Each contributing graft owns exactly one payload shape and declines
 * (`null`) any other, so the order is immaterial for correctness — [firstOf]
 * simply returns the first non-`null` rewrite.
 *
 * A pure, stateless building block: it knows nothing about *which* payloads exist,
 * only how to try each graft in turn.
 */
public object OutboxPayloadGrafts {

    /**
     * Returns a graft that tries [grafts] left to right and yields the first
     * non-`null` rewrite, or `null` when every one declines. With no grafts it
     * declines everything.
     */
    public fun firstOf(vararg grafts: OutboxPayloadGraft): OutboxPayloadGraft =
        { payload, placeholder, realId ->
            grafts.firstNotNullOfOrNull { it(payload, placeholder, realId) }
        }
}
