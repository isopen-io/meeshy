package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** One entry of `POST /user-preferences/reorder`: where a conversation now sits in its category. */
@Serializable
data class ConversationReorderItem(
    val conversationId: String,
    val orderInCategory: Int,
)

/** Body of `POST /user-preferences/reorder` — `{ updates: [{ conversationId, orderInCategory }] }`. */
@Serializable
data class ConversationReorderBody(val updates: List<ConversationReorderItem>)

/**
 * Drag-to-reorder inside one category section (parity iOS `reorderConversations`): the
 * pure translation of "row [from] was dropped on slot [to]" into the order updates to send.
 */
object ConversationReorder {

    /**
     * Moves the id at [from] to [to] within [orderedIds] and returns the new
     * `orderInCategory` (the index) of every conversation whose position changed — the
     * contiguous span between the two slots. Out-of-range or identical slots change
     * nothing and return an empty list.
     */
    fun move(orderedIds: List<String>, from: Int, to: Int): List<ConversationReorderItem> {
        val inRange = from in orderedIds.indices && to in orderedIds.indices
        if (!inRange || from == to) return emptyList()
        val reordered = orderedIds.toMutableList().apply { add(to, removeAt(from)) }
        return (minOf(from, to)..maxOf(from, to)).map { index ->
            ConversationReorderItem(conversationId = reordered[index], orderInCategory = index)
        }
    }

    /**
     * Folds a batch of pending updates into an older one: the latest `orderInCategory` per
     * conversation wins, so a queue replayed after several drags sends one entry per row.
     */
    fun coalesce(
        older: List<ConversationReorderItem>,
        newer: List<ConversationReorderItem>,
    ): List<ConversationReorderItem> =
        (older + newer).associateBy { it.conversationId }.values.toList()
}
