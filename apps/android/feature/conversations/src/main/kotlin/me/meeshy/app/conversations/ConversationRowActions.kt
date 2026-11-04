package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.theme.displayTitle
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
    /** « Rendre obsolète » (#14645) ; la rangée ne l'offre que si la loi l'accorde. */
    val onMakeObsolete: () -> Unit = {},
    val onRename: (String) -> Unit = {},
    val onSetReaction: (String?) -> Unit = {},
    val onSetTags: (List<String>) -> Unit = {},
    val onMarkRead: () -> Unit = {},
    val onMarkUnread: () -> Unit = {},
    val onDiscardDraft: () -> Unit = {},
    val onAssignCategory: (String) -> Unit = {},
    val onRemoveCategory: () -> Unit = {},
    val onCreateCategory: (String) -> Unit = {},
    val onLoadPreview: () -> Unit = {},
    val onLockToggle: () -> Unit = {},
    /** Glisser « Masquer » / « Supprimer » : ouvre la confirmation de retrait de la rangée. */
    val onRemove: () -> Unit = {},
    /** Glisser « Rendre obsolète » (#14645) : ouvre sa confirmation ; la rangée ne l'offre que si la loi l'accorde. */
    val onRequestObsolete: () -> Unit = {},
    /** « Rejoindre » l'appel en cours ; la ligne ne montre le bouton que si un appel est servi. */
    val onJoinCall: () -> Unit = {},
    /** Entrées de menu dont la destination dépend de l'hôte de navigation : `null` = entrée masquée. */
    val onViewInfo: (() -> Unit)? = null,
    val onViewProfile: (() -> Unit)? = null,
    val onCreateShareLink: (() -> Unit)? = null,
    /** « Gérer les membres » ; la rangée ne l'offre que si la loi l'accorde (#12865). */
    val onManageMembers: ((accent: Color) -> Unit)? = null,
    /** Les gestes du menu qui ouvrent un dialogue ou une destination (#14897). */
    val onRequestRename: () -> Unit = {},
    val onRequestLeave: () -> Unit = {},
    val onSearch: () -> Unit = {},
    val onInvite: () -> Unit = {},
    val onBlock: () -> Unit = {},
    val onUnblock: () -> Unit = {},
    val onReport: () -> Unit = {},
    val onOpenAdmin: () -> Unit = {},
    /** « Appeler » le pair d'un direct ; `null` = l'hôte ne sait pas ouvrir l'appel, l'entrée est absente. */
    val onCall: (() -> Unit)? = null,
    /**
     * Le toucher de l'avatar (#15989) : profil du pair ou détails, décidé par le ViewModel au toucher ;
     * `null` = l'hôte ne sait pas montrer les détails, le toucher reste à la ligne.
     */
    val onAvatarTap: (() -> Unit)? = null,
    /** « Infos de la conversation » du menu de l'avatar : les détails, derrière le code si verrouillée. */
    val onAvatarInfo: () -> Unit = {},
    /** L'anneau de story du pair d'un direct ; `null` = l'anneau ne s'ouvre pas. */
    val onViewStory: (() -> Unit)? = null,
    /** Le badge d'humeur du pair d'un direct ; `null` = le badge ne réagit pas. */
    val onMoodBadgeTap: (() -> Unit)? = null,
    /** L'humeur du pair peinte sur l'avatar : une impression. */
    val onMoodShown: () -> Unit = {},
    /** L'état de blocage du pair, lu à l'ouverture du menu ; `null` = pas un direct à pair connu. */
    val peerBlocked: () -> Boolean? = { null },
    /** L'administration est-elle joignable d'ici (origine web connue) ? */
    val adminReachable: Boolean = false,
) {
    /** Ajoute les destinations de navigation de [conversation] (profil du pair pour une directe). */
    fun withNavigation(
        navigation: ConversationRowNavigation,
        conversation: ApiConversation,
        currentUserId: String?,
    ): ConversationRowActions {
        val peerId = if (conversation.type == "direct") conversation.otherParticipantUserId(currentUserId) else null
        val interlocutorId = conversation.interlocutor(currentUserId)?.userId
        return copy(
            onAvatarTap = onAvatarTap.takeIf { navigation.onViewConversationInfo != null },
            onViewStory = interlocutorId?.let { id -> navigation.onViewStory?.let { open -> { open(id) } } },
            onMoodBadgeTap = interlocutorId?.let { id -> navigation.onMoodBadgeTap?.let { open -> { open(id) } } },
            onMoodShown = interlocutorId?.let { id -> navigation.onMoodShown?.let { shown -> { shown(id) } } } ?: {},
            onViewInfo = navigation.onViewInfo?.let { open -> { open(conversation.id) } },
            onViewProfile = peerId?.let { id -> navigation.onViewProfile?.let { open -> { open(id) } } },
            onCreateShareLink = navigation.onCreateShareLink?.let { open -> { open(conversation.id) } },
            onManageMembers = navigation.onManageMembers?.let { open -> { accent -> open(conversation.id, accent) } },
            onCall = navigation.onCall?.takeIf { conversation.type == "direct" }
                ?.let { open -> { open(conversation.id, conversation.displayTitle(currentUserId)) } },
        )
    }

    companion object {
        /** The actions of [conversationId] routed to the list ViewModel. */
        fun forConversation(viewModel: ConversationListViewModel, conversationId: String) = ConversationRowActions(
            onClick = { viewModel.onConversationTap(conversationId) },
            onAvatarTap = { viewModel.onAvatarTap(conversationId) },
            onAvatarInfo = { viewModel.onAvatarInfo(conversationId) },
            onTogglePin = { viewModel.togglePin(conversationId) },
            onToggleMute = { viewModel.toggleMute(conversationId) },
            onToggleMentionsOnly = { viewModel.toggleMentionsOnly(conversationId) },
            onToggleArchive = { viewModel.toggleArchive(conversationId) },
            onLeaveConversation = { viewModel.leaveConversation(conversationId) },
            onDeleteForMe = { viewModel.deleteConversationForMe(conversationId) },
            onDeleteForAll = { viewModel.deleteConversationForAll(conversationId) },
            onMakeObsolete = { viewModel.dialogs.makeObsolete(conversationId) },
            onRename = { viewModel.setCustomName(conversationId, it) },
            onSetReaction = { viewModel.setReaction(conversationId, it) },
            onSetTags = { viewModel.setTags(conversationId, it) },
            onMarkRead = { viewModel.markRead(conversationId) },
            onMarkUnread = { viewModel.markUnread(conversationId) },
            onDiscardDraft = { viewModel.discardDraft(conversationId) },
            onAssignCategory = { viewModel.reassignCategory(conversationId, it) },
            onCreateCategory = { viewModel.createCategoryAndAssign(conversationId, it) },
            onRemoveCategory = { viewModel.removeCategory(conversationId) },
            onLoadPreview = { viewModel.openPreview(conversationId) },
            onLockToggle = { viewModel.dialogs.requestLock(conversationId) },
            onRemove = { viewModel.dialogs.requestRemoval(conversationId) },
            onRequestObsolete = { viewModel.dialogs.requestObsolete(conversationId) },
            onRequestRename = { viewModel.dialogs.requestRename(conversationId) },
            onRequestLeave = { viewModel.dialogs.requestLeave(conversationId) },
            onSearch = { viewModel.dialogs.openForSearch(conversationId) },
            onInvite = { viewModel.dialogs.requestInvite(conversationId) },
            onBlock = { viewModel.dialogs.requestBlock(conversationId) },
            onUnblock = { viewModel.dialogs.unblock(conversationId) },
            onReport = { viewModel.dialogs.requestReport(conversationId) },
            onOpenAdmin = { viewModel.dialogs.openAdminConsole(conversationId) },
            peerBlocked = { viewModel.dialogs.isPeerBlocked(conversationId) },
            adminReachable = viewModel.dialogs.canOpenAdminConsole,
        )
    }
}

/** Everything a row DRAWS, as immutable snapshots: the row never sees a flow or the ViewModel. */
@Immutable
internal data class ConversationRowModel(
    val conversation: ApiConversation,
    val currentUserId: String?,
    val currentUserPrefs: MeeshyUser?,
    /**
     * Le pair d'une conversation directe (`null` : groupe, ou pas de pair). La présence n'est PAS ici : la
     * cellule d'avatar la lit elle-même (`rememberPresence`), donc un `user:status` ne change pas ce
     * snapshot et ne recompose pas la liste.
     */
    val peerUserId: String?,
    val storyRing: StoryRingState,
    val moodEmoji: String?,
    val draft: ConversationDraft?,
    val typingDisplayName: String?,
    val categories: List<CategoryOption>,
    val previewMessages: List<LocalMessage>?,
    val previewUnavailable: Boolean = false,
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
