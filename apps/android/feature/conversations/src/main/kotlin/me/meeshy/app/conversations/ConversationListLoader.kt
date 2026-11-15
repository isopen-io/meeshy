package me.meeshy.app.conversations

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.chat.ExplicitUnreadMarks
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ListRefreshCoordinator
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.ConversationListCacheReading
import me.meeshy.sdk.model.conversationlist.ConversationListLoadState
import me.meeshy.sdk.model.conversationlist.ConversationListLoadStates
import me.meeshy.sdk.notification.ActiveConversationStore

/**
 * The injected collaborators of the list's loading slice, bundled so the ViewModel takes ONE
 * extra parameter. [detached] wires a self-contained set (no neighbour cache, no outside signal).
 */
class ConversationListLoadingDeps @Inject constructor(
    val refreshCoordinator: ListRefreshCoordinator,
    val foreground: AppForegroundSignal,
    val explicitUnreadMarks: ExplicitUnreadMarks,
    val activeConversation: ActiveConversationStore,
) {
    companion object {
        fun detached(): ConversationListLoadingDeps = ConversationListLoadingDeps(
            refreshCoordinator = ListRefreshCoordinator(emptySet()),
            foreground = AppForegroundSignal(),
            explicitUnreadMarks = ExplicitUnreadMarks(),
            activeConversation = ActiveConversationStore(),
        )
    }
}

/**
 * Cache-first loading of the conversation list with an EXPLICIT state (parity iOS
 * `ConversationListViewModel+Loading.swift` and `+ReconnectRecovery.swift`):
 *
 * - the first cache reading paints at once — fresh or stale never shows a spinner, an expired but
 *   recoverable cache reads « offline », only an empty cache loads; a fresh cache still triggers a
 *   silent sync so a change made while the app was closed lands;
 * - a sync failure over data is never an error ([ConversationListLoadStates.onSyncFailed]);
 * - a failed load repairs itself on a rising edge of the network or of the socket;
 * - the return to the foreground re-syncs silently (Room re-reads the cache by itself);
 * - pull-to-refresh reloads everything in parallel through [ListRefreshCoordinator];
 * - every successful sync reconciles the unread counters with the open conversation and the
 *   explicit « mark unread » gestures.
 */
internal class ConversationListLoader(
    private val scope: CoroutineScope,
    private val repository: ConversationRepository,
    private val deps: ConversationListLoadingDeps,
    private val hasData: () -> Boolean,
) {
    private val mutableState = MutableStateFlow<ConversationListLoadState>(ConversationListLoadState.Idle)
    val loadState: StateFlow<ConversationListLoadState> = mutableState.asStateFlow()

    private val refreshSucceededEvents = Channel<Unit>(Channel.BUFFERED)

    /** One event per pull-to-refresh whose conversations came back — the screen's success haptic. */
    val pullRefreshSucceeded: Flow<Unit> = refreshSucceededEvents.receiveAsFlow()

    private var repairing = false

    fun start(networkOnline: Flow<Boolean>, socketConnected: Flow<Boolean>) {
        repairOnRisingEdge(networkOnline)
        repairOnRisingEdge(socketConnected)
        scope.launch { deps.foreground.entered.collect { syncSilently() } }
    }

    /** Every emission of the cache-first stream. */
    fun onStreamResult(result: CacheResult<List<ApiConversation>>) {
        val current = mutableState.value
        if (current == ConversationListLoadState.Idle) {
            val next = ConversationListLoadStates.onCacheRead(
                reading = result.reading(),
                hasData = result.valueOrNull?.isNotEmpty() == true,
            )
            mutableState.value = next
            if (next == ConversationListLoadState.CachedFresh) scope.launch { syncSilently() }
            return
        }
        if (result is CacheResult.Fresh && current != ConversationListLoadState.Loaded) onSynced()
    }

    /** A background revalidation of the stream failed. */
    fun onSyncFailed(error: Throwable) {
        mutableState.value = ConversationListLoadStates.onSyncFailed(hasData(), error.message.orEmpty())
    }

    /**
     * Pull-to-refresh: conversations first in the list, then [surroundings] (stories, moods,
     * groupings), all in parallel. Returns the conversations' failure, or `null` when they came back.
     */
    suspend fun pullToRefresh(surroundings: List<suspend () -> Unit>): Throwable? {
        mutableState.value = ConversationListLoadStates.onRefreshStarted(mutableState.value, hasData())
        val reloads = listOf<suspend () -> Unit>({ repository.refresh() }) + surroundings
        val failure = deps.refreshCoordinator.refresh(reloads).failureAt(0)
        if (failure == null) {
            onSynced()
            refreshSucceededEvents.trySend(Unit)
        } else {
            onSyncFailed(failure)
        }
        return failure
    }

    private fun repairOnRisingEdge(connected: Flow<Boolean>) {
        scope.launch {
            var wasConnected = false
            connected.distinctUntilChanged().collect { isConnected ->
                val repairs = ConversationListLoadStates.repairsOnReconnect(mutableState.value, wasConnected, isConnected)
                wasConnected = isConnected
                if (repairs) repair()
            }
        }
    }

    private suspend fun repair() {
        if (repairing) return
        repairing = true
        try {
            mutableState.value = ConversationListLoadStates.onRefreshStarted(mutableState.value, hasData())
            repository.refresh()
            onSynced()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            onSyncFailed(e)
        } finally {
            repairing = false
        }
    }

    private suspend fun syncSilently() {
        if (repository.syncSilently()) onSynced()
    }

    private fun onSynced() {
        mutableState.value = ConversationListLoadStates.onSyncSucceeded()
        scope.launch {
            try {
                repository.reconcileUnreads(
                    openConversationId = deps.activeConversation.conversationId.value,
                    explicitlyUnread = deps.explicitUnreadMarks.snapshot(),
                )
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // The next complete sync reconciles again; a badge one sync late is harmless.
            }
        }
    }
}

/** How the cache-first stream's verdict reads for the load state. */
internal fun CacheResult<List<ApiConversation>>.reading(): ConversationListCacheReading = when (this) {
    is CacheResult.Fresh -> ConversationListCacheReading.FRESH
    is CacheResult.Stale -> ConversationListCacheReading.STALE
    is CacheResult.Syncing ->
        if (value == null) ConversationListCacheReading.EMPTY else ConversationListCacheReading.EXPIRED
    CacheResult.Empty -> ConversationListCacheReading.EMPTY
}
