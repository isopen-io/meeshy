package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.theme.otherParticipantUserId
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
    /** « Rejoindre » l'appel en cours ; la ligne ne montre le bouton que si un appel est servi. */
    val onJoinCall: () -> Unit = {},
    /** Entrées de menu dont la destination dépend de l'hôte de navigation : `null` = entrée masquée. */
    val onViewInfo: (() -> Unit)? = null,
    val onViewProfile: (() -> Unit)? = null,
    val onCreateShareLink: (() -> Unit)? = null,
    /** « Gérer les membres » ; la rangée ne l'offre que si la loi l'accorde (#12865). */
    val onManageMembers: ((accent: Color) -> Unit)? = null,
) {
    /** Ajoute les destinations de navigation de [conversation] (profil du pair pour une directe). */
    fun withNavigation(
        navigation: ConversationRowNavigation,
        conversation: ApiConversation,
        currentUserId: String?,
    ): ConversationRowActions {
        val peerId = if (conversation.type == "direct") conversation.otherParticipantUserId(currentUserId) else null
        return copy(
            onViewInfo = navigation.onViewInfo?.let { open -> { open(conversation.id) } },
            onViewProfile = peerId?.let { id -> navigation.onViewProfile?.let { open -> { open(id) } } },
            onCreateShareLink = navigation.onCreateShareLink?.let { open -> { open(conversation.id) } },
            onManageMembers = navigation.onManageMembers?.let { open -> { accent -> open(conversation.id, accent) } },
        )
    }

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
            onLockToggle = { viewModel.dialogs.requestLock(conversationId) },
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
    /** The list's minute clock: relative time, preview countdowns and heat age with it. */
    val nowMillis: Long,
    /** Tablette: la rangée ouverte porte une barre d'accent, jamais un fond. */
    val isSelected: Boolean = false,
    /** Rangée tenue à la main pour un glisser-déposer. */
    val isDragging: Boolean = false,
    /** Le pair d'une directe a l'écran de CETTE conversation ouvert (annonce serveur `viewing:*`, point « ici »). */
    val here: ConversationHere = ConversationHere.ABSENT,
    /** La phrase des points d'engagement, déjà localisée, lue par TalkBack. */
    val spokenPoints: String? = null,
    /** Une mutation de la conversation (épingle, muet, archive, section) n'est pas encore livrée. */
    val hasPendingSync: Boolean = false,
    /** Un appel est en cours et rejoignable dans cette conversation. */
    val callInProgress: Boolean = false,
)
