package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.thread.ThreadReplies
import me.meeshy.sdk.model.thread.ThreadReply

@Immutable
data class ReplyThreadUiState(
    val replies: List<ThreadReply> = emptyList(),
    /** Squelette : seulement quand le cache est vide ET que le serveur n'a pas encore répondu. */
    val isLoading: Boolean = false,
    /** Le serveur n'a pas répondu : état discret, jamais un écran d'erreur ; le cache reste affiché. */
    val isOffline: Boolean = false,
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val draft: String = "",
    val isSending: Boolean = false,
    val sendFailed: Boolean = false,
    val canReply: Boolean = true,
) {
    val canSend: Boolean get() = canReply && ThreadReplies.canSend(draft, isSending)
}

sealed interface ReplyThreadUiEvent {
    data class Open(val conversationId: String, val parentId: String, val canReply: Boolean) : ReplyThreadUiEvent
    data class DraftChanged(val text: String) : ReplyThreadUiEvent
    data object Send : ReplyThreadUiEvent
    data object LoadMore : ReplyThreadUiEvent
    data object Retry : ReplyThreadUiEvent
}

sealed interface ReplyThreadUiEffect {
    /** Une réponse est partie : la liste va chercher sa propre fin. */
    data object ScrollToEnd : ReplyThreadUiEffect
}

/**
 * Le fil de discussion d'un message (iOS `ThreadView`) : cache d'abord, réseau ensuite, jamais d'écrasement
 * d'une réponse optimiste (voir [ThreadReplies]), un échec réseau conserve l'existant.
 */
@HiltViewModel
class ReplyThreadViewModel @Inject constructor(
    private val replies: ThreadRepliesPort,
    private val sender: ThreadReplySenderPort,
) : ViewModel() {

    private val _state = MutableStateFlow(ReplyThreadUiState())
    val state: StateFlow<ReplyThreadUiState> = _state.asStateFlow()

    private val _effects = Channel<ReplyThreadUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var conversationId: String? = null
    private var parentId: String? = null
    private var loadJob: Job? = null

    fun onEvent(event: ReplyThreadUiEvent) {
        when (event) {
            is ReplyThreadUiEvent.Open -> open(event)
            is ReplyThreadUiEvent.DraftChanged -> _state.update { it.copy(draft = event.text, sendFailed = false) }
            ReplyThreadUiEvent.Send -> send()
            ReplyThreadUiEvent.LoadMore -> loadMore()
            ReplyThreadUiEvent.Retry -> refresh()
        }
    }

    private fun open(event: ReplyThreadUiEvent.Open) {
        if (parentId == event.parentId && conversationId == event.conversationId) {
            _state.update { it.copy(canReply = event.canReply) }
            if (loadJob?.isActive != true) refresh()
            return
        }
        conversationId = event.conversationId
        parentId = event.parentId
        loadJob?.cancel()
        _state.value = ReplyThreadUiState(canReply = event.canReply)
        loadJob = viewModelScope.launch {
            val seeded = try { replies.cached(event.conversationId, event.parentId) } catch (e: CancellationException) { throw e } catch (_: Exception) { emptyList() }
            _state.update { current ->
                if (ThreadReplies.shouldApplyCacheSeed(current.replies, seeded)) current.copy(replies = seeded) else current
            }
            _state.update { it.copy(isLoading = it.replies.isEmpty()) }
            fetchFirstPage(event.conversationId, event.parentId)
        }
    }

    private fun refresh() {
        val cid = conversationId ?: return
        val parent = parentId ?: return
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoading = it.replies.isEmpty()) }
            fetchFirstPage(cid, parent)
        }
    }

    private suspend fun fetchFirstPage(cid: String, parent: String) {
        try {
            val page = replies.load(cid, parent, offset = 0)
            if (parentId != parent) return
            _state.update {
                it.copy(
                    replies = ThreadReplies.mergeFirstPage(it.replies, page.replies),
                    hasMore = page.hasMore,
                    isLoading = false,
                    isOffline = false,
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (parentId == parent) _state.update { it.copy(isLoading = false, isOffline = true) }
        }
    }

    private fun loadMore() {
        val cid = conversationId ?: return
        val parent = parentId ?: return
        val current = _state.value
        if (!current.hasMore || current.isLoadingMore || current.isLoading) return
        val offset = current.replies.count { it.status == me.meeshy.sdk.model.thread.ThreadReplyStatus.SENT }
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                val page = replies.load(cid, parent, offset)
                if (parentId != parent) return@launch
                _state.update {
                    it.copy(
                        replies = ThreadReplies.appendPage(it.replies, page.replies),
                        hasMore = page.hasMore,
                        isLoadingMore = false,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                if (parentId == parent) _state.update { it.copy(isLoadingMore = false, isOffline = true) }
            }
        }
    }

    private fun send() {
        val cid = conversationId ?: return
        val parent = parentId ?: return
        val snapshot = _state.value
        if (!snapshot.canSend) return
        val text = snapshot.draft.trim()
        _state.update { it.copy(draft = "", isSending = true, sendFailed = false) }
        viewModelScope.launch {
            try {
                val optimistic = sender.send(cid, parent, text)
                if (parentId != parent) return@launch
                _state.update {
                    it.copy(replies = ThreadReplies.withOptimistic(it.replies, optimistic), isSending = false)
                }
                _effects.trySend(ReplyThreadUiEffect.ScrollToEnd)
                fetchFirstPage(cid, parent)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                if (parentId == parent) _state.update { it.copy(draft = text, isSending = false, sendFailed = true) }
            }
        }
    }
}
