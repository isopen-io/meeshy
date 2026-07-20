package me.meeshy.app.conversations

import me.meeshy.sdk.net.api.UserSearchResult

/**
 * One selectable user row in the "new conversation" picker.
 *
 * Pure UI projection of [UserSearchResult] — no Android types — so the
 * selection/creation rules can be unit-tested on the JVM.
 */
data class SelectableUser(
    val id: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val isOnline: Boolean,
    val isSelected: Boolean = false,
)

/**
 * Stateless rules behind the new-conversation flow (port of the iOS
 * `NewConversationViewModel` create logic). Kept pure so the debounce/search
 * ViewModel and the Compose screen never re-derive the type/title contract.
 */
object NewConversationLogic {
    const val TYPE_DIRECT: String = "direct"
    const val TYPE_GROUP: String = "group"

    /** Min selected participants before a conversation can be created. */
    const val MIN_PARTICIPANTS: Int = 1

    /** A single peer is a direct chat; two or more is a group. */
    fun conversationType(selectedCount: Int): String =
        if (selectedCount >= 2) TYPE_GROUP else TYPE_DIRECT

    fun canCreate(selectedCount: Int): Boolean = selectedCount >= MIN_PARTICIPANTS

    /** Group conversations carry a user-typed title; direct chats derive theirs. */
    fun resolvedTitle(rawTitle: String, selectedCount: Int): String? =
        rawTitle.trim().takeIf { it.isNotEmpty() && conversationType(selectedCount) == TYPE_GROUP }

    fun displayName(result: UserSearchResult): String =
        result.displayName?.takeIf { it.isNotBlank() } ?: result.username

    /** Project search results into selectable rows, flagging already-picked users. */
    fun rows(
        results: List<UserSearchResult>,
        selectedIds: Set<String>,
    ): List<SelectableUser> = results.map { result ->
        SelectableUser(
            id = result.id,
            displayName = displayName(result),
            username = result.username,
            avatarUrl = result.avatar,
            isOnline = result.isOnline == true,
            isSelected = result.id in selectedIds,
        )
    }
}
