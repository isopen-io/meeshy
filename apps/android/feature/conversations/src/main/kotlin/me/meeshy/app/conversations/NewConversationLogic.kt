package me.meeshy.app.conversations

import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.DIRECT_CONVERSATION_TYPE
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.directConversationRequest
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
    const val TYPE_DIRECT: String = DIRECT_CONVERSATION_TYPE
    const val TYPE_GROUP: String = "group"

    /** Min selected participants before a conversation can be created. */
    const val MIN_PARTICIPANTS: Int = 1

    /** A query shorter than this is not searched: the picker shows the contacts instead. */
    const val MIN_QUERY_LENGTH: Int = 2

    /** A single peer is a direct chat; two or more is a group. */
    fun conversationType(selectedCount: Int): String =
        if (selectedCount >= 2) TYPE_GROUP else TYPE_DIRECT

    fun canCreate(selectedCount: Int): Boolean = selectedCount >= MIN_PARTICIPANTS

    /** Group conversations carry a user-typed title; direct chats derive theirs. */
    fun resolvedTitle(rawTitle: String, selectedCount: Int): String? =
        rawTitle.trim().takeIf { it.isNotEmpty() && conversationType(selectedCount) == TYPE_GROUP }

    /**
     * The creation request for the picker's selection. A single peer is a DIRECT, built by the
     * very [directConversationRequest] that the story/mood reply and a profile's Message button
     * create through (`ConversationRepository.directConversationWith`, #11615) — so no two
     * entry points can ever describe a direct differently; two or more peers are a group.
     */
    fun request(participantIds: List<String>, rawTitle: String): CreateConversationRequest =
        participantIds.singleOrNull()?.let(::directConversationRequest)
            ?: CreateConversationRequest(
                type = conversationType(participantIds.size),
                title = resolvedTitle(rawTitle, participantIds.size),
                participantIds = participantIds,
            )

    fun displayName(result: UserSearchResult): String =
        result.displayName?.takeIf { it.isNotBlank() } ?: result.username

    /**
     * Project search results into selectable rows, flagging already-picked users. A user
     * served twice (offset pages shifting between two requests) keeps one row — the list
     * is keyed by id, a repeated key crashes Compose — and the signed-in user is never
     * offered (parity iOS `NewConversationViewModel`: `filter { $0.id != currentUserId }`).
     */
    fun rows(
        results: List<UserSearchResult>,
        selectedIds: Set<String>,
        signedInUserId: String? = null,
    ): List<SelectableUser> = results
        .distinctBy { it.id }
        .filterNot { it.id == signedInUserId }
        .map { result ->
            SelectableUser(
                id = result.id,
                displayName = displayName(result),
                username = result.username,
                avatarUrl = result.avatar,
                isOnline = result.isOnline == true,
                isSelected = result.id in selectedIds,
            )
        }

    /**
     * The « Your contacts » rows the picker opens on (iOS `NewConversationView.contactsSection`):
     * the accepted friends, in the roster's order, the signed-in user never offered.
     */
    fun contactRows(
        friends: List<FriendRequestUser>,
        selectedIds: Set<String>,
        signedInUserId: String? = null,
    ): List<SelectableUser> = friends
        .distinctBy { it.id }
        .filterNot { it.id == signedInUserId }
        .map { friend ->
            SelectableUser(
                id = friend.id,
                displayName = friend.displayName?.takeIf { it.isNotBlank() }
                    ?: listOfNotNull(friend.firstName, friend.lastName).joinToString(" ").takeIf { it.isNotBlank() }
                    ?: friend.username,
                username = friend.username,
                avatarUrl = friend.avatar,
                isOnline = friend.isOnline == true,
                isSelected = friend.id in selectedIds,
            )
        }
}
