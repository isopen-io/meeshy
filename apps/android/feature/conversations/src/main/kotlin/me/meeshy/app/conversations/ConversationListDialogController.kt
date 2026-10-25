package me.meeshy.app.conversations

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest

/**
 * Les points d'entrée des actions confirmées d'une rangée (parité iOS
 * `ConversationListView+ConfirmationAnchor` / `+Presentations`) : chaque `request…` arme LE
 * [dialog] seulement si [ConversationRowMenuCapabilities] accorde le geste au lecteur (sinon il
 * est inerte), chaque `confirm…` le désarme puis agit. Le menu d'une rangée n'appelle que ces
 * points ; la loi n'est jamais recomposée ici.
 */
internal class ConversationListDialogController(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<ConversationListUiState>,
    val conversationOf: (String) -> ApiConversation?,
    private val actions: ConversationListRowActions,
    private val repository: ConversationRepository,
    private val deps: ConversationListDialogDeps,
    private val lock: ConversationListLockCoordinator,
    private val lockStore: ConversationLockStore,
) {
    private val mutableDialog = MutableStateFlow<ConversationListDialog?>(null)

    /** Le dialogue armé, ou `null`. Tenu par le ViewModel : une rotation le retrouve tel quel. */
    val dialog: StateFlow<ConversationListDialog?> = mutableDialog.asStateFlow()

    private val effectChannel = Channel<ConversationListDialogEffect>(Channel.BUFFERED)
    val effects: Flow<ConversationListDialogEffect> = effectChannel.receiveAsFlow()

    /** Un « Rechercher » sur une conversation verrouillée, armé seulement une fois le code franchi. */
    private var searchAfterUnlock: Boolean = false

    // ── Bloquer / débloquer ──

    fun requestBlock(conversationId: String) {
        val peer = peerOf(conversationId) ?: return
        show(ConversationListDialog.Block(conversationId, peer))
    }

    /** Bloque, puis archive la conversation ; un refus immédiat n'archive rien et le dit. */
    fun confirmBlock() {
        val target = take<ConversationListDialog.Block>() ?: return
        scope.launch {
            if (deps.blocker.block(target.userId)) {
                actions.archive(target.conversationId)
                emit(ConversationListDialogEffect.Haptic(HapticKind.SUCCESS))
            } else {
                toast(R.string.dialogs_block_error, FeedbackKind.Error)
            }
        }
    }

    /** Débloquer ne se confirme pas (parité iOS). */
    fun unblock(conversationId: String) {
        val peer = peerOf(conversationId) ?: return
        scope.launch {
            if (deps.blocker.unblock(peer)) {
                emit(ConversationListDialogEffect.Haptic(HapticKind.SUCCESS))
            } else {
                toast(R.string.dialogs_unblock_error, FeedbackKind.Error)
            }
        }
    }

    // ── Supprimer / masquer, quitter, renommer ──

    fun requestRemoval(conversationId: String) {
        val conversation = conversationOf(conversationId) ?: return
        val removal = capabilities(conversation).removal ?: return
        val name = conversation.displayTitle(state.value.currentUserId)
        show(ConversationListDialog.Removal(conversationId, name, removal))
    }

    fun confirmRemoval() {
        val target = take<ConversationListDialog.Removal>() ?: return
        emit(ConversationListDialogEffect.Haptic(HapticKind.HEAVY))
        actions.deleteConversationForMe(target.conversationId)
    }

    fun requestLeave(conversationId: String) {
        val conversation = conversationOf(conversationId) ?: return
        if (!capabilities(conversation).leave) return
        show(ConversationListDialog.Leave(conversationId))
    }

    fun confirmLeave() {
        val target = take<ConversationListDialog.Leave>() ?: return
        emit(ConversationListDialogEffect.Haptic(HapticKind.HEAVY))
        scope.launch {
            if (repository.leave(target.conversationId) is NetworkResult.Failure) {
                toast(R.string.dialogs_leave_error, FeedbackKind.Error)
            }
        }
    }

    fun requestRename(conversationId: String) {
        val conversation = conversationOf(conversationId) ?: return
        if (!capabilities(conversation).rename) return
        show(ConversationListDialog.Rename(conversationId, conversation.displayTitle(state.value.currentUserId)))
    }

    /** Un nom rogné vide ferme sans rien écrire ; sinon la file hors ligne porte le renommage. */
    fun confirmRename(name: String) {
        val target = take<ConversationListDialog.Rename>() ?: return
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        actions.setCustomName(target.conversationId, trimmed)
    }

    // ── Signaler ──

    /** Jamais proposé sur sa propre conversation : la capacité `report` le refuse. */
    fun requestReport(conversationId: String) {
        val conversation = conversationOf(conversationId) ?: return
        if (!capabilities(conversation).report) return
        show(ConversationListDialog.Report(conversationId))
    }

    fun submitReport(reason: ReportReason, details: String?) {
        val target = take<ConversationListDialog.Report>() ?: return
        scope.launch {
            when (deps.reporter.report(target.conversationId, reason, details)) {
                null -> Unit
                is NetworkResult.Success -> {
                    emit(ConversationListDialogEffect.Haptic(HapticKind.SUCCESS))
                    toast(R.string.dialogs_report_success, FeedbackKind.Success)
                }
                is NetworkResult.Failure -> {
                    emit(ConversationListDialogEffect.Haptic(HapticKind.ERROR))
                    toast(R.string.dialogs_report_error, FeedbackKind.Error)
                }
            }
        }
    }

    // ── Verrou ──

    /**
     * Verrouiller / déverrouiller depuis le menu : une conversation verrouillée ouvre la feuille de
     * déverrouillage ; sans code maître, l'alerte « code maître requis » renvoie vers les Réglages.
     */
    fun requestLock(conversationId: String) {
        if (!lockStore.isLocked(conversationId) && !lockStore.hasMasterPin()) {
            show(ConversationListDialog.MasterPinRequired(conversationId))
            return
        }
        dismiss()
        searchAfterUnlock = false
        lock.onLockToggle(conversationId)
    }

    fun confirmMasterPinRequired() {
        take<ConversationListDialog.MasterPinRequired>() ?: return
        emit(ConversationListDialogEffect.OpenSettings)
    }

    /** « Rechercher » : ouvre, et arme la recherche une fois la conversation ouverte. */
    fun openForSearch(conversationId: String) {
        dismiss()
        searchAfterUnlock = true
        lock.onConversationTap(conversationId)
    }

    /** Toute ouverture effective passe ici : elle arme la recherche demandée, une seule fois. */
    fun onConversationOpened(conversationId: String) {
        if (!searchAfterUnlock) return
        searchAfterUnlock = false
        emit(ConversationListDialogEffect.ArmSearch(conversationId))
    }

    fun dismissLockPrompt() {
        searchAfterUnlock = false
        lock.dismissLockPrompt()
    }

    // ── Infos, inviter ──

    fun requestInfo(conversationId: String) {
        conversationOf(conversationId) ?: return
        show(ConversationListDialog.Info(conversationId))
    }

    fun requestInvite(conversationId: String) {
        val conversation = conversationOf(conversationId) ?: return
        if (!capabilities(conversation).invite) return
        show(ConversationListDialog.Invite(conversationId))
    }

    /**
     * L'hôte prend une navigation armée AVANT de naviguer : `true` une seule fois pour [dialog],
     * donc une recomposition ou une rotation n'ouvre jamais l'écran deux fois.
     */
    fun takeNavigation(dialog: ConversationListDialog): Boolean = mutableDialog.compareAndSet(dialog, null)

    fun dismiss() {
        mutableDialog.value = null
    }

    private fun show(dialog: ConversationListDialog) {
        if (state.value.lockPrompt != null) dismissLockPrompt()
        mutableDialog.value = dialog
    }

    private inline fun <reified T : ConversationListDialog> take(): T? {
        val current = mutableDialog.value as? T ?: return null
        return if (mutableDialog.compareAndSet(current, null)) current else null
    }

    private fun capabilities(conversation: ApiConversation): ConversationRowMenuCapabilities =
        ConversationRowMenuCapabilities.make(conversation, state.value.currentUser)

    private fun peerOf(conversationId: String): String? {
        val conversation = conversationOf(conversationId) ?: return null
        if (!conversation.isDirect) return null
        val me = state.value.currentUserId ?: return null
        return conversation.otherParticipantUserId(me)?.takeIf { it != me }
    }

    private fun toast(messageRes: Int, kind: FeedbackKind) {
        emit(ConversationListDialogEffect.Toast(FeedbackToastRequest(messageRes, kind)))
    }

    private fun emit(effect: ConversationListDialogEffect) {
        effectChannel.trySend(effect)
    }
}
