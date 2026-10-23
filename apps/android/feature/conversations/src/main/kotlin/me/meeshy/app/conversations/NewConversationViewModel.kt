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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactList
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
    val createdConversationId: String? = null,
    val contacts: List<SelectableUser> = emptyList(),
    val isLoadingContacts: Boolean = false,
) {
    val isGroup: Boolean get() = selected.size >= 2

    /** Before a searchable query, the picker shows « Your contacts » (iOS `NewConversationView`). */
    val showsContacts: Boolean get() = query.trim().length < NewConversationLogic.MIN_QUERY_LENGTH

    /** « No contacts » once the roster has answered with nobody — never during its first load. */
    val showsNoContacts: Boolean get() = showsContacts && !isLoadingContacts && contacts.isEmpty()

    /**
     * « Aucun utilisateur trouvé » (parity iOS `conversation.new.no-user-found`): only once the
     * search for the query on screen has ANSWERED with nothing — a failed search reads the same,
     * never as a technical message.
     */
    val showsNoResults: Boolean
        get() = !isSearching && results.isEmpty() && answeredQuery != null && answeredQuery == query.trim()
    val canCreate: Boolean
        get() = NewConversationLogic.canCreate(selected.size) && !isCreating
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
    private val friendListRepository: FriendListRepository,
    private val friendRepository: FriendRepository,
    private val blockedListRepository: BlockedListRepository,
    private val blockRepository: BlockRepository,
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
        viewModelScope.launch { loadContacts() }
        viewModelScope.launch { loadBlocked() }
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
        val request = NewConversationLogic.request(participants, current.groupTitle)
        _state.update { it.copy(isCreating = true, error = null) }
        viewModelScope.launch {
            try {
                when (val result = conversationRepository.create(request.type, request.title, request.participantIds)) {
                    is NetworkResult.Success ->
                        _state.update { it.copy(isCreating = false, createdConversationId = result.data.id) }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isCreating = false, error = creationErrorOf(result.error.code)) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isCreating = false, error = NewConversationError.CREATE_FAILED) }
            }
        }
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
            _state.update { it.copy(results = emptyList(), isSearching = false, hasMore = false, answeredQuery = null) }
            return
        }
        _state.update { it.copy(isSearching = true, hasMore = false) }
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
     * roster paints at once, and only a cold cache shows the loading state. The roster is read,
     * never written — the contacts screen owns that store.
     */
    private suspend fun loadContacts() {
        val cached = runCatching { friendListRepository.cachedSnapshot() }.getOrNull()
        if (cached != null) publishContacts(cached) else _state.update { it.copy(isLoadingContacts = true) }
        val fresh = try {
            friendRepository.acceptedFriendRequests()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (fresh is NetworkResult.Success) {
            publishContacts(ContactList.fromAcceptedRequests(fresh.data, sessionRepository.currentUserId.orEmpty()))
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

    /** A failed search reads like an empty one (parity iOS: `searchResults = []`, no message). */
    private fun answerWithNothing(query: String) {
        _state.update { it.copy(results = emptyList(), isSearching = false, hasMore = false, answeredQuery = query) }
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
        private const val SEARCH_DEBOUNCE_MS = 300L
        private const val MIN_QUERY_LENGTH = NewConversationLogic.MIN_QUERY_LENGTH
        private const val LOAD_MORE_THRESHOLD = 5
        private const val USER_BLOCKED_CODE = "USER_BLOCKED"
    }
}
