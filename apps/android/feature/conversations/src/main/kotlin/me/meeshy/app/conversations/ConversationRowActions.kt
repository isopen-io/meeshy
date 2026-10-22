package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.StoryRingState

/**
 * Every callback a conversation row can raise, grouped so the row takes ONE parameter instead of
 * twenty. The defaults do nothing: a surface that cannot offer an action (a preview, a test) just
 * omits it. Immutable: [copy] derives a variant without touching the original.
 */
@Immutable
internal data class ConversationRowActions(
    val onClick: () -> Unit = {},
    val onTogglePin: () -> Unit = {},
    val onToggleMute: () -> Unit = {},
    val onToggleMentionsOnly: () -> Unit = {},
    val onToggleArchive: () -> Unit = {},
    val onLeaveConversation: () -> Unit = {},
    val onDeleteForMe: () -> Unit = {},
    val onDeleteForAll: () -> Unit = {},
    val onRename: (String) -> Unit = {},
    val onSetReaction: (String?) -> Unit = {},
    val onSetTags: (List<String>) -> Unit = {},
    val onMarkRead: () -> Unit = {},
    val onMarkUnread: () -> Unit = {},
    val onDiscardDraft: () -> Unit = {},
    val onAssignCategory: (String) -> Unit = {},
    val onCreateCategory: (String) -> Unit = {},
    val onLoadPreview: () -> Unit = {},
    val onLockToggle: () -> Unit = {},
) {
    companion object {
        /** The actions of [conversationId] routed to the list ViewModel. */
        fun forConversation(viewModel: ConversationListViewModel, conversationId: String) = ConversationRowActions(
            onClick = { viewModel.onConversationTap(conversationId) },
            onTogglePin = { viewModel.togglePin(conversationId) },
            onToggleMute = { viewModel.toggleMute(conversationId) },
            onToggleMentionsOnly = { viewModel.toggleMentionsOnly(conversationId) },
            onToggleArchive = { viewModel.toggleArchive(conversationId) },
            onLeaveConversation = { viewModel.leaveConversation(conversationId) },
            onDeleteForMe = { viewModel.deleteConversationForMe(conversationId) },
            onDeleteForAll = { viewModel.deleteConversationForAll(conversationId) },
            onRename = { viewModel.setCustomName(conversationId, it) },
            onSetReaction = { viewModel.setReaction(conversationId, it) },
            onSetTags = { viewModel.setTags(conversationId, it) },
            onMarkRead = { viewModel.markRead(conversationId) },
            onMarkUnread = { viewModel.markUnread(conversationId) },
            onDiscardDraft = { viewModel.discardDraft(conversationId) },
            onAssignCategory = { viewModel.reassignCategory(conversationId, it) },
            onCreateCategory = { viewModel.createCategoryAndAssign(conversationId, it) },
            onLoadPreview = { viewModel.loadPreviewMessages(conversationId) },
            onLockToggle = { viewModel.onLockToggle(conversationId) },
        )
    }
}

/** Everything a row DRAWS, as immutable snapshots: the row never sees a flow or the ViewModel. */
@Immutable
internal data class ConversationRowModel(
    val conversation: ApiConversation,
    val currentUserId: String?,
    val currentUserPrefs: MeeshyUser?,
    val presence: PresenceState?,
    val storyRing: StoryRingState,
    val moodEmoji: String?,
    val draft: ConversationDraft?,
    val typingDisplayName: String?,
    val categories: List<CategoryOption>,
    val previewMessages: List<LocalMessage>?,
    val isLocked: Boolean,
)
