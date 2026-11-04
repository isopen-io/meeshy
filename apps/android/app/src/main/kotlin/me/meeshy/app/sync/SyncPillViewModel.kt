package me.meeshy.app.sync

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.connection.ConnectionStatusStore
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.ConnectionPillState
import me.meeshy.sdk.model.connection.SyncPillReducer
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiProjection
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillRow
import me.meeshy.sdk.model.syncpill.SyncPillState
import me.meeshy.sdk.model.syncpill.SyncPillTypers
import me.meeshy.sdk.outbox.OfflineQueuePillProviding

@Immutable
data class SyncPillUiState(val rows: List<SyncPillRow> = emptyList())

sealed interface SyncPillEffect {
    /** Le résultat d'une relance : la pastille le dit en toast, comme iOS. */
    data class RetryResult(val started: Boolean) : SyncPillEffect
    data class Open(val source: OutboxNavigationSource) : SyncPillEffect
}

sealed interface SyncPillUiEvent {
    data class Retry(val outboxId: String) : SyncPillUiEvent
    data class Navigate(val source: OutboxNavigationSource) : SyncPillUiEvent
}

/**
 * La dérivation de la pastille globale (miroir d'iOS `SyncPillViewModel` + `ConnectionBanner.entries`) : connexion,
 * file de l'outbox et frappes d'amis agrégées en rangées prêtes à peindre. La logique est dans :core:model ; ce
 * ViewModel n'ajoute que le temps (grâce de 3 s, « En ligne » de 4 s, péremption des échecs) et le câblage.
 */
@HiltViewModel
class SyncPillViewModel @Inject constructor(
    private val connection: ConnectionStatusStore,
    private val queuePort: OfflineQueuePillProviding,
    private val typing: SyncPillTypingSource,
    private val clock: SyncPillClock,
) : ViewModel() {
    private val typers = MutableStateFlow<Map<String, Map<String, String>>>(emptyMap())
    private val typingExpiry = HashMap<String, Job>()
    private val effects = Channel<SyncPillEffect>(Channel.BUFFERED)

    val effectFlow: Flow<SyncPillEffect> = effects.receiveAsFlow()

    val uiState: StateFlow<SyncPillUiState> = combine(
        connectionPills(),
        queueItems(),
        typers,
        typing.openConversationId,
    ) { pill, items, typerState, open ->
        val entries = SyncPillReducer.entries(items, SyncPillTypers.typers(typerState), open)
        SyncPillUiState(SyncPillPresenter.rows(pill, entries))
    }.distinctUntilChanged().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SyncPillUiState())

    init {
        observeTyping()
    }

    fun onEvent(event: SyncPillUiEvent) {
        when (event) {
            is SyncPillUiEvent.Retry -> viewModelScope.launch {
                val started = runCatching { queuePort.retryItem(event.outboxId) }.getOrDefault(false)
                effects.send(SyncPillEffect.RetryResult(started))
            }
            is SyncPillUiEvent.Navigate -> effects.trySend(SyncPillEffect.Open(event.source))
        }
    }

    /** Le réducteur de connexion avance sur chaque statut ET sur chaque échéance (grâce, confirmation), jamais sur un minuteur permanent. */
    private fun connectionPills(): Flow<ConnectionPill> = channelFlow {
        var state: ConnectionPillState? = null
        connection.status.collectLatest { status ->
            val arrival = clock.nowMs()
            state = state?.let { SyncPillReducer.onStatus(it, status, arrival) } ?: SyncPillReducer.initial(status, arrival)
            while (true) {
                val now = clock.nowMs()
                val settled = SyncPillReducer.settle(checkNotNull(state), now)
                state = settled
                send(SyncPillReducer.pill(settled, now))
                val deadline = SyncPillReducer.nextDeadline(settled, now) ?: break
                delay((deadline - now).coerceAtLeast(1L))
            }
        }
    }.distinctUntilChanged()

    /** La tête de file affichable, ré-évaluée à la péremption de la plus proche entrée terminale. */
    private fun queueItems(): Flow<List<OutboxUiItem>> = channelFlow {
        queuePort.pendingUiItems.collectLatest { items ->
            while (true) {
                val now = clock.nowMs()
                val visible = OutboxUiProjection.head(items, now)
                send(visible)
                val expiry = SyncPillState.nextExpiry(visible, now) ?: break
                delay((expiry - now).coerceAtLeast(1L) + EXPIRY_MARGIN_MS)
            }
        }
    }.distinctUntilChanged()

    private fun observeTyping() {
        viewModelScope.launch {
            typing.started.collect { event ->
                val before = typers.value
                val after = SyncPillTypers.started(before, event, typing.selfId)
                if (after === before) return@collect
                typers.value = after
                armExpiry(event.conversationId, event.userId)
            }
        }
        viewModelScope.launch {
            typing.stopped.collect { event -> endTyping(event.conversationId, event.userId) }
        }
        viewModelScope.launch {
            typing.sent.collect { (conversationId, userId) -> endTyping(conversationId, userId) }
        }
    }

    private fun endTyping(conversationId: String, userId: String) {
        typingExpiry.remove("$conversationId $userId")?.cancel()
        typers.value = SyncPillTypers.stopped(typers.value, conversationId, userId)
    }

    private fun armExpiry(conversationId: String, userId: String) {
        val key = "$conversationId $userId"
        typingExpiry.remove(key)?.cancel()
        typingExpiry[key] = viewModelScope.launch {
            delay(TYPING_SAFETY_TIMEOUT_MS)
            typers.value = SyncPillTypers.stopped(typers.value, conversationId, userId)
            typingExpiry.remove(key)
        }
    }

    companion object {
        /** iOS : un pair sans `typing:stop` s'éteint après 15 s. */
        const val TYPING_SAFETY_TIMEOUT_MS: Long = 15_000L
        private const val EXPIRY_MARGIN_MS: Long = 50L
    }
}
