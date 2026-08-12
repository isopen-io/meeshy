package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import javax.inject.Inject

/**
 * A single row in the starred-messages list: the frozen [StarredMessage] snapshot
 * plus its shared [PinnedSnippet] preview projection. Reusing [messageSnippetOf]
 * (the same SSOT the pinned list and reply-thread overlay use) means a media-only
 * star reads identically wherever a message is previewed.
 */
data class StarredMessageRow(
    val message: StarredMessage,
    val snippet: PinnedSnippet,
)

/**
 * The starred-messages list state — every star the user has bookmarked, newest-star
 * first. Ordering is delegated to [StarredMessages.sortedByStarredAtDesc] (the pure
 * SSOT), so this view and the star indicator on a bubble can never disagree.
 */
data class StarredMessagesUiState(
    val rows: List<StarredMessageRow> = emptyList(),
) {
    val isEmpty: Boolean get() = rows.isEmpty()

    companion object {
        fun of(starred: StarredMessages): StarredMessagesUiState =
            StarredMessagesUiState(starred.sortedByStarredAtDesc.map { it.toRow() })
    }
}

private fun StarredMessage.toRow(): StarredMessageRow = StarredMessageRow(
    message = this,
    snippet = messageSnippetOf(
        text = contentPreview,
        hasImage = attachmentKind == StarredAttachmentKind.IMAGE,
        hasFile = attachmentKind == StarredAttachmentKind.FILE,
    ),
)

/**
 * Backs the starred-messages list screen. Starring is **local-only** (the gateway
 * exposes no message-star endpoint), so the durable [StarredMessagesStore] is the
 * whole source of truth — no network, no outbox. The state is cache-first: the
 * initial value is projected synchronously from the store's hydrated snapshot, so
 * the list paints instantly, and it re-derives whenever a star is added or removed
 * anywhere in the app (mirrors iOS `StarredMessagesView`).
 */
@HiltViewModel
class StarredMessagesViewModel @Inject constructor(
    private val starredStore: StarredMessagesStore,
) : ViewModel() {

    val state: StateFlow<StarredMessagesUiState> =
        starredStore.starred
            .map(StarredMessagesUiState::of)
            .stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                StarredMessagesUiState.of(starredStore.starred.value),
            )

    /** Remove a bookmark straight from the list (no-op for an unknown id). */
    fun unstar(messageId: String) = starredStore.unstar(messageId)
}
