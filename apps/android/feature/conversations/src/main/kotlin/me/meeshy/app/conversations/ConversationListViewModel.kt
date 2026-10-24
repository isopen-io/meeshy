package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.conversationlist.ConversationListLoadState
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * Orchestre l'ecran de liste : possede l'etat et la liste brute, et delegue le temps
 * reel, le verrou, les actions de rangee et les observateurs a des collaborateurs
 * construits ici (aucun binding Hilt) qui tournent tous dans [viewModelScope].
 */
@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
    messageRepository: MessageRepository,
    messageSocketManager: MessageSocketManager,
    typingPresenceRelay: TypingPresenceRelay,
    workManager: WorkManager,
    draftStore: ConversationDraftStore,
    starredStore: StarredMessagesStore,
    categoryRepository: CategoryRepository,
    categorySocketManager: CategorySocketManager,
    preferencesSocketManager: PreferencesSocketManager,
    socketManager: SocketManager,
    sessionRepository: SessionRepository,
    lockStore: ConversationLockStore,
    storyRepository: StoryRepository,
    statusBarCache: StatusBarCache,
    messagePrefetch: ConversationListMessagePrefetchTriggers,
    networkMonitor: NetworkMonitor,
    statusRepository: StatusRepository,
    rowSignalsSource: ConversationListRowSignals,
    private val loadingDeps: ConversationListLoadingDeps = ConversationListLoadingDeps.detached(),
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    /**
     * Les signaux vivants des lignes (synchro en attente, pair a l'ecran, appel en cours) : un
     * flux a part, pour ne pas grossir [ConversationListUiState] ni recomposer la liste a chaque
     * battement de ces sources.
     */
    val rowSignals: StateFlow<ConversationRowSignals> = rowSignalsSource.observe()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConversationRowSignals())

    /**
     * Demandes de navigation a usage unique (tap direct ou code accepte) : un
     * [Channel], pas un `StateFlow`, car une re-collecte apres changement de
     * configuration ne doit pas re-naviguer.
     */
    private val openConversationRequests = Channel<String>(Channel.BUFFERED)
    val openConversation: Flow<String> = openConversationRequests.receiveAsFlow()

    /** Liste brute faisant autorite ; [ConversationListUiState.conversations] en est la vue filtree. */
    private var rawConversations: List<ApiConversation> = emptyList()

    private val lock = ConversationListLockCoordinator(
        state = _state,
        lockStore = lockStore,
        openConversation = { openConversationRequests.trySend(it) },
    )
    private val actions = ConversationListRowActions(
        scope = viewModelScope,
        state = _state,
        rawConversations = { rawConversations },
        repository = repository,
        messageRepository = messageRepository,
        categoryRepository = categoryRepository,
        draftStore = draftStore,
        workManager = workManager,
    )
    private val realtime = ConversationListRealtimeBinder(
        scope = viewModelScope,
        repository = repository,
        messageSocketManager = messageSocketManager,
        preferencesSocketManager = preferencesSocketManager,
        starredStore = starredStore,
        currentUserId = { _state.value.currentUserId },
    )
    private val pullRefresh = ConversationListPullRefresh(
        storyRepository = storyRepository,
        statusRepository = statusRepository,
        statusBarCache = statusBarCache,
        categoryRepository = categoryRepository,
    )
    private val observers = ConversationListObservers(
        scope = viewModelScope,
        state = _state,
        messageSocketManager = messageSocketManager,
        typingPresenceRelay = typingPresenceRelay,
        categoryRepository = categoryRepository,
        categorySocketManager = categorySocketManager,
        storyRepository = storyRepository,
        statusBarCache = statusBarCache,
    )

    private val loader = ConversationListLoader(viewModelScope, repository, loadingDeps) { rawConversations.isNotEmpty() }

    /** The explicit cache-first load state (fresh, stale, loading, offline, loaded, error). */
    val loadState: StateFlow<ConversationListLoadState> = loader.loadState

    /** One event per successful pull-to-refresh — the screen plays the success haptic. */
    val pullRefreshSucceeded: Flow<Unit> = loader.pullRefreshSucceeded

    init {
        viewModelScope.launch {
            repository.conversationsStream(
                onSyncError = { error ->
                    loader.onSyncFailed(error)
                    _state.update {
                        it.copy(errorMessage = syncErrorFor(error), showSkeleton = false, isSyncing = false)
                    }
                },
            ).collect { result ->
                rawConversations = result.rawListOr(rawConversations)
                loader.onStreamResult(result)
                messagePrefetch.onListLoaded(sessionRepository, rawConversations)
                _state.update { it.applyResultFlags(result, rawConversations).withVisible(rawConversations) }
            }
        }

        ConversationListConnectionObserver(
            scope = viewModelScope,
            state = _state,
            connectionState = socketManager.connectionState,
            networkOnline = networkMonitor.isOnline,
        ).start()

        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update {
                    it.copy(currentUserId = user?.id, currentUser = user).withVisible(rawConversations)
                }
            }
        }

        viewModelScope.launch {
            draftStore.observeAll().collect { drafts ->
                _state.update { it.copy(drafts = drafts).withVisible(rawConversations) }
            }
        }

        loader.start(networkMonitor.isOnline, socketManager.connectionState.map { it == SocketConnectionState.CONNECTED })
        viewModelScope.launch { lock.observe() }
        observers.startCategories()
        realtime.start()
        observers.startLive()
        messagePrefetch.start(viewModelScope, sessionRepository, socketManager) { rawConversations }
    }

    /** Selects a filter tab and re-derives the visible list from the cached conversations (no network). */
    fun selectFilter(filter: ConversationFilter) {
        _state.update { it.copy(selectedFilter = filter).withVisible(rawConversations) }
    }

    /** Updates the free-text search query and re-derives the visible list (no network). */
    fun setSearch(query: String) {
        _state.update { it.copy(searchText = query).withVisible(rawConversations) }
    }

    /** Opens or closes the search field; closing clears the query and restores the full list. */
    fun setSearchActive(active: Boolean) {
        _state.update {
            val next = if (active) it else it.copy(searchText = "")
            next.copy(isSearchActive = active).withVisible(rawConversations)
        }
    }

    fun togglePin(id: String) = actions.togglePin(id)
    fun toggleMute(id: String) = actions.toggleMute(id)
    fun toggleArchive(id: String) = actions.toggleArchive(id)
    fun toggleMentionsOnly(id: String) = actions.toggleMentionsOnly(id)
    fun setCustomName(id: String, name: String) = actions.setCustomName(id, name)

    /** Sets or clears (`emoji = null`) the conversation's favorite-reaction emoji. */
    fun setReaction(id: String, emoji: String?) = actions.setReaction(id, emoji)

    fun setTags(id: String, tags: List<String>) = actions.setTags(id, tags)
    fun markRead(id: String) = actions.markRead(id)
    fun markUnread(id: String) {
        loadingDeps.explicitUnreadMarks.note(id)
        actions.markUnread(id)
    }
    fun reassignCategory(id: String, targetCategoryId: String) = actions.reassignCategory(id, targetCategoryId)
    fun createCategoryAndAssign(id: String, name: String) = actions.createCategoryAndAssign(id, name)
    fun leaveConversation(id: String) = actions.leaveConversation(id)
    fun deleteConversationForMe(id: String) = actions.deleteConversationForMe(id)
    fun deleteConversationForAll(id: String) = actions.deleteConversationForAll(id)
    fun discardDraft(id: String) = actions.discardDraft(id)

    /** Loads (once, cache-only) the hard-press preview card's recent messages. */
    fun loadPreviewMessages(conversationId: String) = actions.loadPreviewMessages(conversationId)

    /** Row tap: opens straight through, or gates behind the lock code when locked. */
    fun onConversationTap(id: String) {
        loadingDeps.explicitUnreadMarks.clear(id)
        lock.onConversationTap(id)
    }
    fun onLockToggle(id: String) = lock.onLockToggle(id)
    fun onUnlockAll() = lock.onUnlockAll()
    fun onChangeMasterPin() = lock.onChangeMasterPin()
    fun onRemoveMasterPin() = lock.onRemoveMasterPin()
    fun onLockDigit(digit: Int) = lock.onLockDigit(digit)
    fun onLockDelete() = lock.onLockDelete()
    fun dismissLockPrompt() = lock.dismissLockPrompt()

    /**
     * Pull-to-refresh: the visible spinner tracks the user gesture only —
     * background SWR revalidations stay silent ([ConversationListUiState.isSyncing]).
     * The gesture reloads the conversations, the stories tray, the moods and the categories in
     * parallel (iOS `pullToRefresh`), invalidates the neighbour caches only when all of them came
     * back, and ends once every one of them is back.
     */
    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true, isUserRefreshing = true) }
        viewModelScope.launch {
            try {
                val surroundings = pullRefresh.reloads { moods -> _state.update { it.copy(moodStatuses = moods) } }
                loader.pullToRefresh(surroundings)?.let { failure ->
                    _state.update { it.copy(errorMessage = syncErrorFor(failure), showSkeleton = false) }
                }
            } finally {
                _state.update { it.copy(isUserRefreshing = false, isSyncing = false) }
            }
        }
    }

    /**
     * A failed sync only becomes an error STATE when nothing is on screen: over a populated
     * list it stays silent, so a later filter that empties the list reads « no results »,
     * never a stale error (parity iOS `emptyBranch`, which never recycles an old error).
     */
    private fun syncErrorFor(error: Throwable): String? =
        if (rawConversations.isEmpty()) error.message.orEmpty() else null

    companion object {
        /** How long the first socket connection may take before the strip announces it. */
        const val CONNECTION_GRACE_MILLIS: Long = ConversationListConnectionObserver.CONNECTION_GRACE_MILLIS
    }
}
