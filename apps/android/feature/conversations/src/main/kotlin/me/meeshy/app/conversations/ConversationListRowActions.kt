package me.meeshy.app.conversations

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker

/**
 * Actions de rangee : mutations optimistes de preferences (retour arriere dans le
 * depot en cas d'echec), sorties, brouillons et apercu a la demande.
 */
internal class ConversationListRowActions(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<ConversationListUiState>,
    private val rawConversations: () -> List<ApiConversation>,
    private val repository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val categoryRepository: CategoryRepository,
    private val draftStore: ConversationDraftStore,
    private val workManager: WorkManager,
    /** La conversation à l'écran ([me.meeshy.sdk.notification.ActiveConversationStore]), ou `null`. */
    private val activeConversationId: () -> String? = { null },
) {

    /** Ids dont [loadPreviewMessages] est en vol : garde contre un double chargement. */
    private val previewLoadingIds = mutableSetOf<String>()

    fun togglePin(id: String) {
        val pinned = prefsOf(id)?.isPinned ?: false
        runPrefMutation { repository.setPinnedOptimistic(id, !pinned) }
    }

    fun toggleMute(id: String) {
        val muted = prefsOf(id)?.isMuted ?: false
        runPrefMutation { repository.setMutedOptimistic(id, !muted) }
    }

    fun toggleArchive(id: String) {
        val archived = prefsOf(id)?.isArchived ?: false
        runPrefMutation { repository.setArchivedOptimistic(id, !archived) }
    }

    /** Archive [id] sans bascule (le blocage d'un pair archive sa conversation). */
    fun archive(id: String) {
        runPrefMutation { repository.setArchivedOptimistic(id, true) }
    }

    fun toggleMentionsOnly(id: String) {
        val mentionsOnly = prefsOf(id)?.mentionsOnly ?: false
        runPrefMutation { repository.setMentionsOnlyOptimistic(id, !mentionsOnly) }
    }

    fun setCustomName(id: String, name: String) {
        runPrefMutation { repository.setCustomNameOptimistic(id, name) }
    }

    fun setReaction(id: String, emoji: String?) {
        runPrefMutation { repository.setReactionOptimistic(id, emoji) }
    }

    fun setTags(id: String, tags: List<String>) {
        runPrefMutation { repository.setTagsOptimistic(id, tags) }
    }

    /**
     * « Marquer comme lu » : la pastille tombe tout de suite à l'écran ([clearUnreadLocally]). La
     * conversation déjà ouverte ne part pas au réseau (parité iOS `shouldDispatchListMarkAsRead`) :
     * elle possède le marquage précis, seul le cache est mis à zéro.
     */
    fun markRead(id: String) {
        clearUnreadLocally(id)
        if (activeConversationId() == id) {
            scope.launch {
                try {
                    repository.markReadLocally(id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    reportError(e.message)
                }
            }
            return
        }
        runPrefMutation { repository.markReadOptimistic(id) }
    }

    /**
     * Efface la pastille de [id] dans l'état publié, sans attendre la réémission du cache. Les
     * sections ([ConversationSections.of]) se dérivent de cette liste : elles suivent d'elles-mêmes.
     */
    fun clearUnreadLocally(id: String) {
        state.update { current ->
            if (current.conversations.none { it.id == id && it.unreadCount != 0 }) {
                current
            } else {
                current.copy(conversations = current.conversations.map { if (it.id == id) it.copy(unreadCount = 0) else it })
            }
        }
    }

    fun markUnread(id: String) {
        runPrefMutation { repository.markUnreadOptimistic(id) }
    }

    /**
     * Reaffecte [id] a [targetCategoryId] ; [ConversationCategoryReassignment] rend
     * inerte un depot sur la categorie deja occupee (ni ecriture, ni outbox, ni flush).
     */
    fun reassignCategory(id: String, targetCategoryId: String) {
        when (val outcome =
            ConversationCategoryReassignment.resolve(prefsOf(id)?.categoryId, targetCategoryId)) {
            CategoryReassignment.Unchanged -> Unit
            is CategoryReassignment.AssignTo ->
                runPrefMutation { repository.setCategoryOptimistic(id, outcome.categoryId) }
        }
    }

    /** Cree la categorie [name] puis y range [id] ; un nom vide est inerte. */
    fun createCategoryAndAssign(id: String, name: String) {
        if (name.isBlank()) return
        scope.launch {
            when (val result = categoryRepository.create(name)) {
                is NetworkResult.Success -> reassignCategory(id, result.data.id)
                is NetworkResult.Failure -> reportError(result.error.message)
            }
        }
    }

    /** Quitte [id] : aucun retrait local, la purge socket fait tomber la rangee. */
    fun leaveConversation(id: String) = remote { repository.leave(id) }

    /** Masque [id] pour soi seul : la purge socket fait tomber la rangee. */
    fun deleteConversationForMe(id: String) = remote { repository.deleteForMe(id) }

    /** Termine [id] pour tous : la purge socket `conversation:closed` fait tomber la rangee. */
    fun deleteConversationForAll(id: String) = remote { repository.deleteForAll(id) }

    /**
     * Jette le brouillon de [id] : retrait optimiste de l'etat, puis effacement du
     * coffre ; un echec restaure l'instantane.
     */
    fun discardDraft(id: String) {
        val snapshot = state.value.drafts
        if (!DraftDiscard.isDiscardable(id, snapshot)) return
        state.update {
            it.copy(drafts = DraftDiscard.afterDiscard(id, it.drafts)).withVisible(rawConversations())
        }
        scope.launch {
            try {
                draftStore.clear(id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state.update { it.copy(drafts = snapshot, errorMessage = e.message).withVisible(rawConversations()) }
            }
        }
    }

    /**
     * Charge (une fois, cache seul) les derniers messages de l'apercu de [conversationId].
     * Une conversation verrouillee ne lit rien : l'apercu est scelle (parite iOS
     * `ConversationListPreviewLoader.load`, `guard !isLocked`).
     */
    fun loadPreviewMessages(conversationId: String) {
        if (state.value.isLocked(conversationId)) return
        if (state.value.previewMessages.containsKey(conversationId)) return
        if (!previewLoadingIds.add(conversationId)) return
        scope.launch {
            try {
                val recent = messageRepository.recentMessages(conversationId)
                state.update { it.copy(previewMessages = it.previewMessages + (conversationId to recent)) }
            } finally {
                previewLoadingIds -= conversationId
            }
        }
    }

    private fun prefsOf(id: String) =
        rawConversations().firstOrNull { it.id == id }?.resolvedPreferences

    private fun reportError(message: String?) {
        state.update { it.copy(errorMessage = message) }
    }

    private fun remote(call: suspend () -> NetworkResult<*>) {
        scope.launch {
            when (val result = call()) {
                is NetworkResult.Success -> reportError(null)
                is NetworkResult.Failure -> reportError(result.error.message)
            }
        }
    }

    /** Lance une mutation optimiste ; ne reveille WorkManager que si quelque chose est en file. */
    private fun runPrefMutation(mutate: suspend () -> Boolean) {
        scope.launch {
            try {
                if (mutate()) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                reportError(e.message)
            }
        }
    }
}
