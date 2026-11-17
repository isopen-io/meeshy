package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation

/** #18926 — the parts of a list row the realtime writes in place ([ConversationLivePatch]). */
enum class ConversationLiveFacet {
    /** The last message and its Prisme pair (translations, original language). */
    PREVIEW,

    /** Since the last message: its last reaction, the call in progress, the served rank. */
    ACTIVITY,

    /** The unread count and its bridge. */
    UNREAD,
}

/**
 * #18926 — what a live event moved on a list row, FACET BY FACET, and what a REST sweep built BEFORE it keeps of it
 * (compare-and-swap): the sweep's row replaces everything, except each facet a live event moved during its flight, which
 * stays as the realtime left it. A facet no live event moved takes the served value — a preview that went BACK (its last
 * message deleted while the device was away) included: keeping « the newest preview » would show a deleted message for
 * good.
 */
object ConversationLiveFacets {

    fun changed(before: ApiConversation, after: ApiConversation): Set<ConversationLiveFacet> = buildSet {
        if (before.previewGroup() != after.previewGroup()) add(ConversationLiveFacet.PREVIEW)
        if (before.activity() != after.activity()) add(ConversationLiveFacet.ACTIVITY)
        if (before.unread() != after.unread()) add(ConversationLiveFacet.UNREAD)
    }

    fun keepLive(served: ApiConversation, local: ApiConversation, facets: Set<ConversationLiveFacet>): ApiConversation =
        facets.fold(served) { row, facet ->
            when (facet) {
                ConversationLiveFacet.PREVIEW -> row.copy(
                    lastMessage = local.lastMessage,
                    lastMessageTranslations = local.lastMessageTranslations,
                    lastMessageOriginalLanguage = local.lastMessageOriginalLanguage,
                )
                ConversationLiveFacet.ACTIVITY -> row.copy(
                    lastReaction = local.lastReaction,
                    activeCall = local.activeCall,
                    listRankAt = local.listRankAt,
                )
                ConversationLiveFacet.UNREAD -> row.copy(unreadCount = local.unreadCount, bridge = local.bridge)
            }
        }

    private fun ApiConversation.previewGroup() = Triple(lastMessage, lastMessageTranslations, lastMessageOriginalLanguage)

    private fun ApiConversation.activity() = Triple(lastReaction, activeCall, listRankAt)

    private fun ApiConversation.unread() = unreadCount to bridge
}
