package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ReadStatusRepository
import me.meeshy.sdk.conversation.ReadStatusState
import me.meeshy.sdk.model.MessageViewsFilter

/** La fiche « Vu par » : le statut servi (cache d'abord) et l'onglet choisi. */
data class MessageViewsUiState(
    val status: ReadStatusState = ReadStatusState(),
    val chosen: MessageViewsFilter? = null,
) {
    /** Tant que rien n'est touché, l'onglet d'ouverture est celui que le décompte servi juge pertinent. */
    val filter: MessageViewsFilter
        get() = chosen ?: MessageViewsFilter.initial(
            readCount = status.data?.readCount ?: 0,
            deliveredCount = status.data?.receivedCount ?: 0,
            showReadReceipts = true,
        )
}

@HiltViewModel
class MessageViewsViewModel @Inject constructor(
    private val repository: ReadStatusRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MessageViewsUiState())
    val state: StateFlow<MessageViewsUiState> = _state.asStateFlow()

    private var boundMessageId: String? = null
    private var job: Job? = null

    /** Idempotent pour un message déjà écouté ; changer de message repart d'un état neuf. */
    fun bind(messageId: String, conversationId: String) {
        val sameMessage = boundMessageId == messageId
        if (sameMessage && job?.isActive == true) return
        boundMessageId = messageId
        job?.cancel()
        if (!sameMessage) _state.value = MessageViewsUiState()
        job = viewModelScope.launch {
            repository.observe(messageId, conversationId).collect { status ->
                _state.update { it.copy(status = status) }
            }
        }
    }

    /**
     * La fiche refermée cesse d'écouter : sans cela, la vue du fil garderait la lecture Room et
     * l'abonnement `read-status:updated` vivants jusqu'à la sortie de la conversation.
     */
    fun unbind() {
        job?.cancel()
        job = null
    }

    fun select(filter: MessageViewsFilter) = _state.update { it.copy(chosen = filter) }

    fun retry() {
        val id = boundMessageId ?: return
        viewModelScope.launch { repository.retry(id) }
    }
}
