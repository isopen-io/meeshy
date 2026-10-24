package me.meeshy.sdk.model.conversationlist

/**
 * Ce qu'une section repliée cache (#8694) : somme de `max(0, unread)`, sans
 * plafond ; dépliée, 0 (les rangées portent déjà leurs pastilles).
 */
object SectionFoldedUnread {
    fun count(unreadCounts: List<Int>, isExpanded: Boolean): Int =
        if (isExpanded) 0 else unreadCounts.sumOf { maxOf(0, it) }
}
