package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.AcceptedContactsSource
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.sdk.model.CreationEncryptionOffer
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class NewConversationUiState(
    val query: String = "",
    val results: List<SelectableUser> = emptyList(),
    val selected: List<SelectableUser> = emptyList(),
    val groupTitle: String = "",
    val isSearching: Boolean = false,
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isCreating: Boolean = false,
    val error: NewConversationError? = null,
    val answeredQuery: String? = null,
    /** The last search BROKE (network or server) — told apart from « No user found », with a retry (iOS `searchFailed`). */
    val searchFailed: Boolean = false,
    val createdConversationId: String? = null,
    /** Hors ligne : la conversation est en file (ligne `pending_` dans la liste) ; l'écran se referme sans ouvrir de fil. */
    val queuedOffline: Boolean = false,
    val contacts: List<SelectableUser> = emptyList(),
    val isLoadingContacts: Boolean = false,
    /** Le `User.role` brut de l'utilisateur connecté : il décide si le bout en bout s'offre. */
    val platformRole: String? = null,
    /** Le mode touché dans la section Chiffrement ; `null` = le défaut de l'offre. */
    val pickedEncryptionMode: CreationEncryptionMode? = null,
    /** « Nouveau groupe » touché : un groupe, même sans invité (iOS `groupRequested`, #14646). */
    val groupRequested: Boolean = false,
    /** Les modes de chiffrement dépliés sous la ligne « Chiffrement · <mode> » (iOS `showsEncryptionOptions`). */
    val encryptionExpanded: Boolean = false,
    val openingUserId: String? = null,
) {
    /** What the selection draws (iOS `NewConversationShape`). */
    val shape: NewConversationShape get() = NewConversationLogic.shape(selected.size, groupRequested)

    /** A group — the switch, or two peers and more: its title field shows, and the title is required. */
    val isGroup: Boolean get() = shape == NewConversationShape.GROUP

    /** « Créer » belongs to the group only: in direct, one tap on a person opens the conversation (#14646). */
    val showsCreate: Boolean get() = isGroup

    /** Two peers and more already make a group: the switch says so and does not turn off. */
    val groupToggleEnabled: Boolean get() = selected.size <= 1

    /** La section Chiffrement (décision du 2026-11-01) : les modes offerts pour ce rôle et ce type. */
    val encryptionOffer: CreationEncryptionOffer
        get() = NewConversationLogic.encryptionOffer(platformRole, if (isGroup) selected.size else 1, groupRequested)

    /** Le mode coché, celui qui partira avec la demande. */
    val encryptionMode: CreationEncryptionMode
        get() = NewConversationLogic.resolvedEncryptionMode(encryptionOffer, pickedEncryptionMode)

    /** La ligne « Chiffrement · <mode> » est toujours là : en direct, le toucher crée aussitôt avec le mode coché. */
    val showsEncryption: Boolean get() = true

    /** Before a searchable query, the picker shows « Your contacts » (iOS `NewConversationView`). */
    val showsContacts: Boolean get() = query.trim().length < NewConversationLogic.MIN_QUERY_LENGTH

    /** « No contacts » once the roster has answered with nobody — never during its first load. */
    val showsNoContacts: Boolean get() = showsContacts && !isLoadingContacts && contacts.isEmpty()

    /**
     * « Aucun utilisateur trouvé » (parity iOS `conversation.new.no-user-found`): only once the
     * search for the query on screen has ANSWERED with nothing — a search that failed is [searchFailed],
     * a state of its own.
     */
    val showsNoResults: Boolean
        get() = !isSearching && !searchFailed && results.isEmpty() && answeredQuery != null && answeredQuery == query.trim()
    val canCreate: Boolean
        get() = NewConversationLogic.canCreate(selected.size, groupRequested, groupTitle) && !isCreating
}

/** A creation failure, told in words (parity iOS `new_conversation.error.blocked` / `conversation.new.create.error`). */
enum class NewConversationError { BLOCKED, CREATE_FAILED }

/**
 * Drives the "new conversation" picker (port of iOS `NewConversationView`):
 * debounced user search, multi-select with persistent chips, and direct/group
 * creation. Selected users survive query changes because they live in their own
 * map, independent of the latest search results.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class NewConversationViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val acceptedContacts: AcceptedContactsSource,
    private val blockedListRepository: BlockedListRepository,
    private val blockRepository: BlockRepository,
    private val blockCache: BlockCache,
) : ViewModel() {

    private val _state = MutableStateFlow(NewConversationUiState())
    val state: StateFlow<NewConversationUiState> = _state.asStateFlow()

    private val queryFlow = MutableStateFlow("")
    private val selectedById = LinkedHashMap<String, SelectableUser>()
    private var rawResults: List<me.meeshy.sdk.net.api.UserSearchResult> = emptyList()
    private var currentQuery: String = ""
    private var nextOffset: Int = 0
    private var blockedIds: Set<String> = emptySet()

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user -> _state.update { it.copy(platformRole = user?.role) } }
        }
        blockCache.currentBlockedIds.takeIf { it.isNotEmpty() }?.let { blockedIds = it }
        viewModelScope.launch { loadContacts() }
        viewModelScope.launch { loadBlocked() }
        viewModelScope.launch {
            blockCache.version.drop(1).collect { publishBlocked(blockCache.currentBlockedIds.toList()) }
        }
        viewModelScope.launch {
            queryFlow
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { runSearch(it) }
        }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, error = null) }
        queryFlow.value = value
    }

    fun onGroupTitleChange(value: String) {
        _state.update { it.copy(groupTitle = value) }
    }

    /** « Nouveau groupe » : bascule, sauf quand deux invités et plus font déjà un groupe. */
    fun toggleGroupRequested() {
        val current = _state.value
        if (!current.groupToggleEnabled) return
        if (current.groupRequested) selectedById.clear()
        _state.update { it.copy(groupRequested = !it.groupRequested) }
        publishSelection()
    }

    fun onPersonTapped(userId: String) {
        if (_state.value.groupRequested) toggleSelection(userId) else openDirect(userId)
    }

    private fun openDirect(userId: String) {
        val current = _state.value
        if (current.isCreating) return
        val row = (current.results + current.contacts).firstOrNull { it.id == userId } ?: return
        if (row.isBlocked) return
        val request = NewConversationLogic.request(listOf(userId), "", groupRequested = false, encryptionMode = current.encryptionMode)
        submit(request, openingUserId = userId)
    }

    /** Déplie ou replie les modes sous la ligne « Chiffrement · <mode> ». */
    fun toggleEncryptionOptions() {
        _state.update { it.copy(encryptionExpanded = !it.encryptionExpanded) }
    }

    /** Coche un mode de la section Chiffrement ; un mode « bientôt » ne se coche pas. */
    fun selectEncryptionMode(mode: CreationEncryptionMode) {
        val available = _state.value.encryptionOffer.choices.any { it.mode == mode && it.available }
        if (available) _state.update { it.copy(pickedEncryptionMode = mode) }
    }

    /** « Réessayer » under a broken search: runs the query on screen again at once. */
    fun retrySearch() {
        val query = _state.value.query
        viewModelScope.launch { runSearch(query) }
    }

    /** The alert's « OK » (iOS `dismissError`). */
    fun dismissError() {
        _state.update { it.copy(error = null) }
    }

    fun toggleSelection(userId: String) {
        val existing = selectedById.remove(userId)
        if (existing == null) {
            val current = _state.value
            val row = (current.results + current.contacts).firstOrNull { it.id == userId } ?: return
            if (row.isBlocked) return
            selectedById[userId] = row.copy(isSelected = true)
        }
        publishSelection()
    }

    fun create() {
        val current = _state.value
        if (!current.canCreate) return
        val participants = selectedById.keys.toList()
        val request = NewConversationLogic.request(participants, current.groupTitle, current.groupRequested, current.encryptionMode)
        submit(request, openingUserId = null)
    }

    private fun submit(request: CreateConversationRequest, openingUserId: String?) {
        _state.update { it.copy(isCreating = true, error = null, openingUserId = openingUserId) }
        viewModelScope.launch {
            try {
                when (val result = conversationRepository.create(request.type, request.title, request.participantIds, request.encryptionMode)) {
                    is NetworkResult.Success ->
                        _state.update { it.copy(isCreating = false, openingUserId = null, createdConversationId = result.data.id) }
                    is NetworkResult.Failure -> onCreateFailed(request, result.error.code)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isCreating = false, openingUserId = null, error = NewConversationError.CREATE_FAILED) }
            }
        }
    }

    private suspend fun onCreateFailed(request: CreateConversationRequest, code: String?) {
        val pendingId = if (code == OFFLINE_CODE) {
            conversationRepository.createOptimistic(request.type, request.title, request.participantIds, request.encryptionMode)
        } else {
            null
        }
        _state.update {
            if (pendingId != null) it.copy(isCreating = false, openingUserId = null, queuedOffline = true)
            else it.copy(isCreating = false, openingUserId = null, error = creationErrorOf(code))
        }
    }

    fun consumeQueued() {
        _state.update { it.copy(queuedOffline = false) }
    }

    fun consumeCreated() {
        _state.update { it.copy(createdConversationId = null) }
    }

    private suspend fun runSearch(query: String) {
        val trimmed = query.trim()
        currentQuery = trimmed
        rawResults = emptyList()
        nextOffset = 0
        if (trimmed.length < MIN_QUERY_LENGTH) {
            _state.update { it.copy(results = emptyList(), isSearching = false, hasMore = false, answeredQuery = null, searchFailed = false) }
            return
        }
        _state.update { it.copy(isSearching = true, hasMore = false, searchFailed = false) }
        try {
            when (val result = userRepository.searchUsersPaged(trimmed, offset = 0)) {
                is NetworkResult.Success -> {
                    rawResults = result.data.data
                    nextOffset = rawResults.size
                    _state.update {
                        it.copy(
                            results = projectedRows(rawResults),
                            isSearching = false,
                            hasMore = result.data.pagination?.hasMore == true,
                            answeredQuery = trimmed,
                            searchFailed = false,
                        )
                    }
                }
                is NetworkResult.Failure -> answerWithNothing(trimmed)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            answerWithNothing(trimmed)
        }
    }

    /**
     * Infinite-scroll trigger (parity iOS `NewConversationView`'s `.onAppear`
     * pagination) — mirrors `CallHistoryViewModel.loadMoreIfNeeded`'s shape.
     * Called from composition once per visible row; a plain, idempotent guard
     * so calling it on every row of every recomposition is safe — it only
     * ever launches a fetch when [userId] is within [LOAD_MORE_THRESHOLD] of
     * the end of the current list AND a next page is known to exist.
     */
    fun loadMoreIfNeeded(userId: String) {
        val current = _state.value
        val index = current.results.indexOfFirst { it.id == userId }
        if (index < 0 || index < current.results.size - LOAD_MORE_THRESHOLD) return
        if (!current.hasMore || current.isLoadingMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = userRepository.searchUsersPaged(currentQuery, offset = nextOffset)) {
                    is NetworkResult.Success -> {
                        rawResults = (rawResults + result.data.data).distinctBy { it.id }
                        nextOffset += result.data.data.size
                        _state.update {
                            it.copy(
                                results = projectedRows(rawResults),
                                hasMore = result.data.pagination?.hasMore == true,
                                isLoadingMore = false,
                            )
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isLoadingMore = false, hasMore = false) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoadingMore = false, hasMore = false) }
            }
        }
    }

    /**
     * Cache first, then the network (iOS `NewConversationViewModel.loadContacts`): the persisted
     * roster paints at once, and only a cold cache shows the loading state. The ONE source of
     * accepted contacts ([AcceptedContactsSource]) is shared with the directory and alone writes the cache.
     */
    private suspend fun loadContacts() {
        val cached = acceptedContacts.cached()
        if (cached != null) publishContacts(cached) else _state.update { it.copy(isLoadingContacts = true) }
        val fresh = try {
            acceptedContacts.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (fresh is NetworkResult.Success) {
            publishContacts(fresh.data)
        } else {
            _state.update { it.copy(isLoadingContacts = false) }
        }
    }

    /**
     * The users I blocked, cache first then the gateway (iOS `BlockService.blockedUserIds`):
     * their rows say « Blocked » and cannot be picked — creating with them would only fail.
     */
    private suspend fun loadBlocked() {
        runCatching { blockedListRepository.cachedSnapshot() }.getOrNull()?.let { publishBlocked(it.map { u -> u.id }) }
        val fresh = try {
            blockRepository.listBlocked()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (fresh is NetworkResult.Success) publishBlocked(fresh.data.map { it.id })
    }

    private fun publishBlocked(ids: List<String>) {
        blockedIds = ids.filter { it.isNotBlank() }.toSet()
        blockedIds.forEach { selectedById.remove(it) }
        _state.update {
            it.copy(
                results = NewConversationLogic.withBlocked(it.results, blockedIds),
                contacts = NewConversationLogic.withBlocked(it.contacts, blockedIds),
                selected = selectedById.values.toList(),
            )
        }
    }

    private fun publishContacts(roster: List<FriendRequestUser>) {
        _state.update {
            it.copy(
                contacts = NewConversationLogic.withBlocked(
                    NewConversationLogic.contactRows(roster, selectedById.keys.toSet(), sessionRepository.currentUserId),
                    blockedIds,
                ),
                isLoadingContacts = false,
            )
        }
    }

    /** A failed search is NOT an empty one (iOS `searchFailed`): the list clears and the screen offers a retry. */
    private fun answerWithNothing(query: String) {
        _state.update { it.copy(results = emptyList(), isSearching = false, hasMore = false, answeredQuery = query, searchFailed = true) }
    }

    private fun creationErrorOf(code: String?): NewConversationError =
        if (code == USER_BLOCKED_CODE) NewConversationError.BLOCKED else NewConversationError.CREATE_FAILED

    private fun projectedRows(results: List<me.meeshy.sdk.net.api.UserSearchResult>) =
        NewConversationLogic.withBlocked(
            NewConversationLogic.rows(results, selectedById.keys.toSet(), sessionRepository.currentUserId),
            blockedIds,
        )

    private fun publishSelection() {
        val selectedIds = selectedById.keys.toSet()
        _state.update { current ->
            current.copy(
                selected = selectedById.values.toList(),
                results = current.results.map { it.copy(isSelected = it.id in selectedIds) },
                contacts = current.contacts.map { it.copy(isSelected = it.id in selectedIds) },
            )
        }
    }

    companion object {
        private const val SEARCH_DEBOUNCE_MS = 350L
        private const val MIN_QUERY_LENGTH = NewConversationLogic.MIN_QUERY_LENGTH
        private const val LOAD_MORE_THRESHOLD = 5
        private const val USER_BLOCKED_CODE = "USER_BLOCKED"
        private const val OFFLINE_CODE = "NETWORK"
    }
}
