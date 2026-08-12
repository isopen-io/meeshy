package me.meeshy.app.chat

/**
 * The minimal projection of a message needed to place it in the conversation
 * timeline: the parsed send time in epoch millis ([createdAtMillis] is null when
 * the timestamp is missing/unparsable) and the server-assigned per-conversation
 * sequence number ([seq], null until the server acks the message).
 */
data class MessageOrderInput(
    val createdAtMillis: Long?,
    val seq: Long? = null,
)

/**
 * Pure SSOT that lays a message list out in stable ascending (oldest → newest)
 * order — the foundation every downstream chat computation trusts (consecutive
 * grouping, day labels, scroll anchoring), so an out-of-order socket arrival or a
 * merged page can never render messages jumbled.
 *
 * The order is a **total, deterministic** projection of two keys:
 *  - **Send time first.** Messages sort by [MessageOrderInput.createdAtMillis]
 *    ascending. A message with no parsed timestamp is treated as the newest and
 *    pins to the bottom — a freshly-composed local echo belongs at the end, not
 *    hoisted above dated history.
 *  - **Sequence breaks ties.** Within an identical instant, messages sort by
 *    ascending [MessageOrderInput.seq]; a message without a seq (an un-acked
 *    optimistic send) is treated as the newest and trails its acked siblings.
 *  - **Server order is the final tiebreak.** When two messages are otherwise
 *    indistinguishable the sort is stable, so the caller's incoming (server)
 *    order is preserved rather than reshuffled.
 */
object MessageOrdering {

    private val COMPARATOR: Comparator<MessageOrderInput> =
        compareBy({ it.createdAtMillis ?: Long.MAX_VALUE }, { it.seq ?: Long.MAX_VALUE })

    /**
     * Returns [items] in stable ascending timeline order, projecting each through
     * [selector] to read its ordering keys. Ties preserve [items]' incoming order.
     */
    fun <T> order(items: List<T>, selector: (T) -> MessageOrderInput): List<T> =
        items.sortedWith { a, b -> COMPARATOR.compare(selector(a), selector(b)) }

    /** Orders a bare list of [MessageOrderInput]s in ascending timeline order. */
    fun order(inputs: List<MessageOrderInput>): List<MessageOrderInput> =
        order(inputs) { it }
}
