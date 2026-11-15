package me.meeshy.sdk.model

import me.meeshy.sdk.model.conversationlist.ConversationFilterComposition

/**
 * Conversation list filter — port of `MeeshyConversationFilter`
 * (packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift) and the
 * `filterConversations` pipeline in the iOS `ConversationListViewModel`.
 *
 * Each case carries the same accent [colorHex] as iOS so the Android filter
 * chips stay visually coherent with the iOS filter bar.
 */
enum class ConversationFilter(val colorHex: String) {
    ALL("4ECDC4"),
    UNREAD("FF6B6B"),
    PERSONAL("3498DB"),
    PRIVATE("F8B500"),
    OPEN("2ECC71"),
    GLOBAL("E74C3C"),
    CHANNELS("1ABC9C"),
    FAVORITES("F59E0B"),
    ARCHIVED("9B59B6"),
}

/**
 * Pure, Room-free filtering of a conversation list by [filter] and a free-text
 * `searchText`. Faithful to iOS `ConversationListViewModel.filterConversations`:
 *
 * - Soft-deleted conversations (`preferences.deletedForUserAt != null`) are
 *   hidden from EVERY filter, including [ConversationFilter.ARCHIVED].
 * - User-archived conversations are hidden from every filter except ARCHIVED.
 * - Search is a case-insensitive substring match on the display title.
 */
object ConversationFilters {

    fun apply(
        conversations: List<ApiConversation>,
        filter: ConversationFilter,
        searchText: String,
        currentUserId: String? = null,
    ): List<ApiConversation> = apply(conversations, setOf(filter), searchText, currentUserId)

    /** Sélection composée : types en OU, états en ET, entre familles ET ; ensemble vide = Tous. */
    fun apply(
        conversations: List<ApiConversation>,
        filters: Set<ConversationFilter>,
        searchText: String,
        currentUserId: String? = null,
    ): List<ApiConversation> {
        val query = searchText.trim()
        return conversations.filter { c -> c.matches(filters) && c.matchesSearch(query, currentUserId) }
    }

    private fun ApiConversation.matches(filters: Set<ConversationFilter>): Boolean {
        val prefs = resolvedPreferences
        if (prefs?.deletedForUserAt != null) return false
        val wantsArchived = ConversationFilterComposition.includesArchived(filters)
        if (wantsArchived != (prefs?.isArchived == true)) return false
        if (!wantsArchived && isActive == false) return false
        val types = ConversationFilterComposition.selectedTypes(filters)
        val typeOk = types.isEmpty() || types.any { matchesType(it) }
        val stateOk = ConversationFilterComposition.selectedStates(filters).all { matchesState(it, prefs) }
        return typeOk && stateOk
    }

    private fun ApiConversation.matchesType(type: ConversationFilter): Boolean = when (type) {
        ConversationFilter.PERSONAL -> this.type == "direct"
        ConversationFilter.PRIVATE -> this.type == "group"
        ConversationFilter.OPEN -> this.type == "public" || this.type == "community"
        ConversationFilter.GLOBAL -> this.type == "global"
        ConversationFilter.CHANNELS -> isAnnouncementChannel
        else -> false
    }

    private fun ApiConversation.matchesState(state: ConversationFilter, prefs: ApiConversationPreferences?): Boolean =
        when (state) {
            ConversationFilter.UNREAD -> unreadCount > 0
            ConversationFilter.FAVORITES -> !prefs?.reaction.isNullOrBlank()
            else -> true
        }

    private fun ApiConversation.matchesSearch(query: String, currentUserId: String?): Boolean {
        if (query.isEmpty()) return true
        return searchableTitle(currentUserId).contains(query, ignoreCase = true)
    }

    private fun ApiConversation.searchableTitle(currentUserId: String?): String {
        resolvedPreferences?.customName?.takeIf { it.isNotBlank() }?.let { return it }
        title?.takeIf { it.isNotBlank() }?.let { return it }
        val others = participants.filter { it.userId != currentUserId }
        return others
            .mapNotNull { it.displayName?.takeIf(String::isNotBlank) ?: it.username?.takeIf(String::isNotBlank) }
            .joinToString(", ")
    }
}
