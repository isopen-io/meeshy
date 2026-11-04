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
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.ConversationUnlockSessionStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.conversationlist.ChipDropAction
import me.meeshy.sdk.model.conversationlist.ChipDropResolver
import me.meeshy.sdk.model.conversationlist.ConversationAvatarRoute
import me.meeshy.sdk.model.conversationlist.ConversationAvatarTarget
import me.meeshy.sdk.model.conversationlist.ConversationFilterComposition
import me.meeshy.sdk.model.conversationlist.avatarTarget
import me.meeshy.sdk.model.conversationlist.ConversationListLoadState
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.sdk.search.ListMessageSearchSource
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CategorySocketManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.link.ConversationListEntryRequests
import me.meeshy.sdk.story.StoryRepository
import java.util.Locale
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
    workManager: WorkManager,
    draftStore: ConversationDraftStore,
    starredStore: StarredMessagesStore,
    categoryRepository: CategoryRepository,
    categorySocketManager: CategorySocketManager,
    preferencesSocketManager: PreferencesSocketManager,
    socketManager: SocketManager,
    sessionRepository: SessionRepository,
    lockStore: ConversationLockStore,
    unlockSession: ConversationUnlockSessionStore,
    storyRepository: StoryRepository,
    statusBarCache: StatusBarCache,
    messagePrefetch: ConversationListMessagePrefetchTriggers,
    networkMonitor: NetworkMonitor,
    statusRepository: StatusRepository,
    rowSignalsSource: ConversationListRowSignals,
    livePatcher: ConversationLivePatcher,
    private val loadingDeps: ConversationListLoadingDeps = ConversationListLoadingDeps.detached(),
    dialogDeps: ConversationListDialogDeps = ConversationListDialogDeps.detached(),
    messageSearchSource: ListMessageSearchSource = NoListMessageSearch,
    entryRequests: ConversationListEntryRequests = ConversationListEntryRequests(),
    private val sectionExpansion: ConversationSectionExpansionStore = ConversationSectionExpansionStore(),
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

    /** Le toucher d'avatar d'une ligne (#15989) : profil du pair ou détails, à usage unique. */
    private val avatarEffectRequests = Channel<ConversationAvatarEffect>(Channel.BUFFERED)
    val avatarEffects: Flow<ConversationAvatarEffect> = avatarEffectRequests.receiveAsFlow()

    /** Liste brute faisant autorite ; [ConversationListUiState.conversations] en est la vue filtree. */
    private var rawConversations: List<ApiConversation> = emptyList()

    private val lock: ConversationListLockCoordinator = ConversationListLockCoordinator(
        state = _state,
        lockStore = lockStore,
        openConversation = { dialogs.onConversationOpened(it); openConversationRequests.trySend(it) },
        unlockSession = unlockSession,
        openInfo = { avatarEffectRequests.trySend(ConversationAvatarEffect.OpenInfo(it)) },
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
        activeConversationId = { loadingDeps.activeConversation.conversationId.value },
        obsoleter = dialogDeps.obsoleter,
        remover = dialogDeps.remover,
    )
    /** Les dialogues confirmés de la liste (bloquer, masquer, quitter, renommer, signaler, verrou). */
    internal val dialogs: ConversationListDialogController = ConversationListDialogController(
        viewModelScope, _state, { id -> rawConversations.firstOrNull { it.id == id } }, actions, repository, dialogDeps, lock, lockStore,
    )
    private val realtime = ConversationListRealtimeBinder(
        scope = viewModelScope,
        repository = repository,
        messageSocketManager = messageSocketManager,
        preferencesSocketManager = preferencesSocketManager,
        starredStore = starredStore,
        currentUserId = { _state.value.currentUserId },
        patcher = livePatcher,
        connectionState = socketManager.connectionState,
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
        categoryRepository = categoryRepository,
        categorySocketManager = categorySocketManager,
        storyRepository = storyRepository,
        statusBarCache = statusBarCache,
        sectionExpansion = sectionExpansion,
    )
    private val sectionController = ConversationSectionController(
        viewModelScope, sectionExpansion, categoryRepository,
    ) { _state.value.categories }

    /** Les sections dépliées gardées pour la session (`null` = défauts de première ouverture). */
    val rememberedSections: StateFlow<Set<String>?> = sectionExpansion.rememberedSections

    /** Replie ou déplie [section] : mémoire de session à l'instant, serveur en silence pour une catégorie. */
    fun onSectionToggled(section: ConversationSection, expanded: Boolean) =
        sectionController.onToggled(section, expanded)

    /** Déplie [sectionId] en mémoire de session seulement (la cible d'un dépôt), sans écriture serveur. */
    fun revealSection(sectionId: String) = sectionController.reveal(sectionId)

    /**
     * Le dépôt d'une conversation sur un en-tête (iOS `ConversationSectionDropHandler`) : « Épinglées » épingle,
     * une catégorie déplace, « Mes conversations » efface la catégorie. Rend la décision pour l'haptique.
     */
    fun onConversationDropped(conversationId: String, sectionId: String, isAutoScrolling: Boolean): ChipDropAction {
        val prefs = _state.value.conversations.firstOrNull { it.id == conversationId }?.resolvedPreferences
        val action = ChipDropResolver.action(sectionId, prefs?.isPinned == true, prefs?.categoryId.orEmpty(), isAutoScrolling)
        when (action) {
            ChipDropAction.Pin -> actions.togglePin(conversationId)
            is ChipDropAction.Move ->
                if (action.sectionId.isEmpty()) actions.removeCategory(conversationId) else actions.reassignCategory(conversationId, action.sectionId)
            ChipDropAction.None -> Unit
        }
        return action
    }

    private val messageSearcher = ConversationListMessageSearcher(
        scope = viewModelScope,
        source = messageSearchSource,
        readerPrism = { _state.value.currentUser?.let { ReaderPrism.resolve(it, Locale.getDefault()) }.orEmpty() },
        conversations = { rawConversations },
        isConcealed = { _state.value.isLocked(it) },
    )

    /** La section « Messages » de la recherche (#14619) : un flux à part, la liste ne se recompose pas à chaque frappe. */
    val messageSearch: StateFlow<ListMessageSearchState> = messageSearcher.state

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

        viewModelScope.launch { entryRequests.requested.collect { filter -> if (filter != null) selectFilter(filter).also { entryRequests.consume() } } }
        loader.start(networkMonitor.isOnline, socketManager.connectionState.map { it == SocketConnectionState.CONNECTED })
        viewModelScope.launch { lock.observe() }
        observers.startCategories()
        realtime.start()
        observers.startLive()
        messagePrefetch.start(viewModelScope, sessionRepository, socketManager) { rawConversations }
    }

    /** La conversation brute de [id], même hors du filtre courant : la ligne d'un message trouvé la nomme. */
    fun conversationFor(id: String): ApiConversation? = rawConversations.firstOrNull { it.id == id }

    /** Remplace la sélection par le seul [filter] (entrée par lien profond) et re-dérive la liste, sans réseau. */
    fun selectFilter(filter: ConversationFilter) {
        _state.update { it.copy(selectedFilters = setOf(filter)).withVisible(rawConversations) }
    }

    /** Un appui pose le [filter], un second le retire ; vider la sélection ramène à Tous (iOS `ConversationFilterComposition`). */
    fun toggleFilter(filter: ConversationFilter) {
        _state.update {
            it.copy(selectedFilters = ConversationFilterComposition.toggling(filter, it.selectedFilters)).withVisible(rawConversations)
        }
    }

    /** Updates the free-text search query and re-derives the visible list (no network). */
    fun setSearch(query: String) {
        _state.update { it.copy(searchText = query).withVisible(rawConversations) }
        messageSearcher.onQueryChanged(query)
    }

    /** Opens or closes the search field; closing clears the query and restores the full list. */
    fun setSearchActive(active: Boolean) {
        _state.update {
            val next = if (active) it else it.copy(searchText = "")
            next.copy(isSearchActive = active).withVisible(rawConversations)
        }
        if (!active) messageSearcher.onQueryChanged("")
    }

    fun togglePin(id: String) = actions.togglePin(id)
    fun toggleMute(id: String) = actions.toggleMute(id)
    fun toggleArchive(id: String) = actions.toggleArchive(id)
    fun toggleMentionsOnly(id: String) = actions.toggleMentionsOnly(id)
    fun setCustomName(id: String, name: String) = actions.setCustomName(id, name)

    /** Sets or clears (`emoji = null`) the conversation's favorite-reaction emoji. */
    fun setReaction(id: String, emoji: String?) = actions.setReaction(id, emoji)

    fun setTags(id: String, tags: List<String>) = actions.setTags(id, tags)
    /** Lire défait la marque « non lu » : sinon la réconciliation d'un rafraîchissement la rétablirait. */
    fun markRead(id: String) {
        loadingDeps.explicitUnreadMarks.clear(id)
        actions.markRead(id)
    }
    fun markUnread(id: String) {
        loadingDeps.explicitUnreadMarks.note(id)
        actions.markUnread(id)
    }
    fun reassignCategory(id: String, targetCategoryId: String) = actions.reassignCategory(id, targetCategoryId)
    fun createCategoryAndAssign(id: String, name: String) = actions.createCategoryAndAssign(id, name)
    fun removeCategory(id: String) = actions.removeCategory(id)
    fun leaveConversation(id: String) = actions.leaveConversation(id)
    fun deleteConversationForMe(id: String) = actions.deleteConversationForMe(id)
    fun deleteConversationForAll(id: String) = actions.deleteConversationForAll(id)
    fun discardDraft(id: String) = actions.discardDraft(id)

    /** Loads (once, cache-only) the hard-press preview card's recent messages. */
    fun loadPreviewMessages(conversationId: String) = actions.loadPreviewMessages(conversationId)
    fun openPreview(conversationId: String) = actions.openPreview(conversationId)

    /** Row tap: opens straight through, or gates behind the lock code when locked. */
    fun onConversationTap(id: String) {
        loadingDeps.explicitUnreadMarks.clear(id)
        lock.onConversationTap(id)
    }
    /** Toucher d'avatar : la loi relue AU TOUCHER — un verrou ou un blocage posés depuis le rendu comptent. */
    fun onAvatarTap(id: String) {
        val target = conversationFor(id)
            ?.avatarTarget(_state.value.currentUserId, isPeerBlocked = dialogs.isPeerBlocked(id) == true)
            ?: ConversationAvatarTarget.ConversationInfo
        when (val route = ConversationAvatarRoute.route(target, lock.isLocked(id))) {
            is ConversationAvatarRoute.Profile ->
                avatarEffectRequests.trySend(ConversationAvatarEffect.OpenProfile(route.userId))
            ConversationAvatarRoute.Info, ConversationAvatarRoute.UnlockThenInfo -> lock.onAvatarInfo(id)
        }
    }
    /** « Infos de la conversation » du menu d'avatar : les détails, derrière le code si verrouillée. */
    fun onAvatarInfo(id: String) = lock.onAvatarInfo(id)
    fun onLockToggle(id: String) = lock.onLockToggle(id)
    fun onUnlockAll() = lock.onUnlockAll()
    fun onChangeMasterPin() = lock.onChangeMasterPin()
    fun onRemoveMasterPin() = lock.onRemoveMasterPin()
    fun onLockDigit(digit: Int) = lock.onLockDigit(digit)
    fun onLockDelete() = lock.onLockDelete()
    fun dismissLockPrompt() = dialogs.dismissLockPrompt()

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
