package me.meeshy.sdk.model.conversationlist

/** Appel en cours posé par la peau avant la loi ; `null` = aucun appel connu. */
data object SectionableLiveCall

/**
 * Projection minimale d'une conversation pour la loi des sections — miroir de
 * `SectionableConversation` (`packages/shared/utils/conversation-sections.ts`).
 * `lastMessage.createdAt` n'y figure PAS, délibérément : seule `lastMessageAt`
 * (repli `updatedAt`) fait foi. Les instants sont en millisecondes epoch.
 */
data class SectionableConversation(
    val id: String,
    val isPinned: Boolean,
    val categoryId: String? = null,
    val orderInCategory: Double? = null,
    val lastMessageAtMillis: Long? = null,
    val updatedAtMillis: Long,
    val liveCall: SectionableLiveCall? = null,
) {
    val effectiveTimestampMillis: Long get() = lastMessageAtMillis ?: updatedAtMillis
    internal val hasCategory: Boolean get() = !categoryId.isNullOrEmpty()
}

/**
 * Ordre total : épinglées, en direct, catégorie (`orderInCategory`), puis
 * `lastMessageAt` décroissant (repli `updatedAt`), puis `id` ordinal.
 */
object ConversationSortOrder {

    val comparator: Comparator<SectionableConversation> = Comparator { a, b ->
        if (a.isPinned != b.isPinned) return@Comparator if (a.isPinned) -1 else 1
        val aLive = a.liveCall != null
        val bLive = b.liveCall != null
        if (aLive != bLive) return@Comparator if (aLive) -1 else 1
        if (a.hasCategory != b.hasCategory) return@Comparator if (a.hasCategory) -1 else 1
        if (a.hasCategory) {
            val byCategory = a.categoryId.orEmpty().compareTo(b.categoryId.orEmpty())
            if (byCategory != 0) return@Comparator byCategory
            val byOrder = (a.orderInCategory ?: Double.POSITIVE_INFINITY)
                .compareTo(b.orderInCategory ?: Double.POSITIVE_INFINITY)
            if (byOrder != 0) return@Comparator byOrder
        }
        val byTime = b.effectiveTimestampMillis.compareTo(a.effectiveTimestampMillis)
        if (byTime != 0) return@Comparator byTime
        a.id.compareTo(b.id)
    }

    fun sort(conversations: List<SectionableConversation>): List<SectionableConversation> =
        conversations.sortedWith(comparator)
}
