package me.meeshy.sdk.model.conversationlist

/**
 * World Wide en tête de liste, sans en-tête (#10347) : non archivée elle monte
 * au-dessus de tout ; archivée elle se range comme les autres.
 */
object ConversationWorldHead {

    const val SECTION_ID = "world.head"

    fun isHead(sectionId: String): Boolean = sectionId == SECTION_ID

    data class Split<T>(val head: T?, val rest: List<T>)

    fun <T> split(
        items: List<T>,
        isWorldWide: (T) -> Boolean,
        isArchived: (T) -> Boolean,
    ): Split<T> {
        val index = items.indexOfFirst { isWorldWide(it) && !isArchived(it) }
        if (index < 0) return Split(null, items)
        return Split(items[index], items.filterIndexed { i, _ -> i != index })
    }
}
