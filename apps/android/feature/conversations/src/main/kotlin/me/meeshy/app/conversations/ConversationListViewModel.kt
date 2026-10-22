package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
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
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

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

    init {
        viewModelScope.launch {
            repository.conversationsStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, showSkeleton = false, isSyncing = false)
                    }
                },
            ).collect { result ->
                rawConversations = result.rawListOr(rawConversations)
                _state.update { it.applyResultFlags(result, rawConversations).withVisible(rawConversations) }
            }
        }

        viewModelScope.launch {
            socketManager.connectionState.collect { connection ->
                _state.update { it.copy(connection = connection) }
            }
        }

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

        viewModelScope.launch { lock.observe() }
        observers.startCategories()
        realtime.start()
        observers.startLive()
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
    fun markUnread(id: String) = actions.markUnread(id)
    fun reassignCategory(id: String, targetCategoryId: String) = actions.reassignCategory(id, targetCategoryId)
    fun createCategoryAndAssign(id: String, name: String) = actions.createCategoryAndAssign(id, name)
    fun leaveConversation(id: String) = actions.leaveConversation(id)
    fun deleteConversationForMe(id: String) = actions.deleteConversationForMe(id)
    fun deleteConversationForAll(id: String) = actions.deleteConversationForAll(id)
    fun discardDraft(id: String) = actions.discardDraft(id)

    /** Loads (once, cache-only) the hard-press preview card's recent messages. */
    fun loadPreviewMessages(conversationId: String) = actions.loadPreviewMessages(conversationId)

    /** Row tap: opens straight through, or gates behind the lock code when locked. */
    fun onConversationTap(id: String) = lock.onConversationTap(id)
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
     */
    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true, isUserRefreshing = true) }
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(errorMessage = e.message, showSkeleton = false)
                }
            } finally {
                _state.update { it.copy(isUserRefreshing = false, isSyncing = false) }
            }
        }
    }
}
