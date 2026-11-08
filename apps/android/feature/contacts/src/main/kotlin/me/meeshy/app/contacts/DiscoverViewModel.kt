package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockStatusProvider
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.DiscoverSuggestions
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.SuggestionsRepository
import me.meeshy.sdk.friend.UserRelationshipResolver
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.model.friend.DiscoverSearch
import me.meeshy.sdk.model.friend.DiscoverSearchAction
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** A search result plus its derived inline-connect control. */
data class DiscoverRow(
    val user: UserSearchResult,
    val connect: ConnectAction,
)

data class DiscoverUiState(
    val query: String = "",
    val rows: List<DiscoverRow> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    /** True while the empty-query cache-first suggestions surface owns [rows]. */
    val isShowingSuggestions: Boolean = false,
    val emailText: String = "",
    val isSendingInvite: Boolean = false,
    val isRefreshing: Boolean = false,
    val phoneText: String = "",
) {
    /** True when the trimmed query is long enough that a network search is in play. */
    val isSearchActive: Boolean
        get() = DiscoverSearch.action(query) is DiscoverSearchAction.Search

    /** The neutral prompt shows only before either surface has produced rows. */
    val showEmptyPrompt: Boolean
        get() = !isSearchActive && !isShowingSuggestions && rows.isEmpty() && !isLoading

    /** A searchable query settled with zero matches (and no error) → "no users found". */
    val isNoResults: Boolean
        get() = isSearchActive && !isLoading && errorMessage == null && rows.isEmpty()

    /** The suggestions surface settled with nobody to suggest → a quiet empty state. */
    val isSuggestionsEmpty: Boolean
        get() = isShowingSuggestions && !isLoading && errorMessage == null && rows.isEmpty()
}

/** Résultat d'un geste d'invitation, rejoué en haptique par l'écran. */
enum class DiscoverEffect { Success, Failure }

/**
 * The Discover people-search surface — port of the iOS `DiscoverViewModel` search
 * path. Live user search with an inline connect control per row whose state is the
 * shared [UserRelationshipResolver], so accepting/sending from any other screen
 * flips the button here too (via the [FriendshipCache] version stream).
 *
 * Les gestes de connexion passent par le [ConnectionActionController] partagé.
 */
@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val friendRepository: FriendRepository,
    private val suggestionsRepository: SuggestionsRepository,
    private val friendshipCache: FriendshipCache,
    private val blockCache: BlockCache,
    private val controller: ConnectionActionController,
    sessionRepository: SessionRepository,
    private val toasts: FeedbackToastCenter,
    private val strings: DiscoverStrings,
) : ViewModel() {

    // Block state now resolves live off the shared `BlockCache` (hydrated by the
    // Blocked tab's `BlockRepository`), closing the resolver's block seam.
    private val resolver = UserRelationshipResolver(
        friendshipCache = friendshipCache,
        blockStatus = BlockStatusProvider { blockCache.isBlocked(it) },
        currentUserId = { sessionRepository.currentUserId },
    )

    private val _state = MutableStateFlow(DiscoverUiState())
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    private var searchJob: Job? = null
    private var suggestionsJob: Job? = null

    init {
        observeFriendshipCache()
    }

    /**
     * Start the cache-first empty-query suggestions surface. Idempotent while it
     * is already streaming, so the UI can call it on every appear (parity with
     * iOS `.task { await vm.loadSuggestions() }`) without re-fetching; the
     * `@Singleton` [SuggestionsRepository] keeps the last list, so a return to the
     * Discover tab paints instantly.
     */
    fun loadSuggestions() {
        if (suggestionsJob?.isActive == true) return
        startSuggestions()
    }

    fun onQueryChanged(rawQuery: String) {
        _state.update { it.copy(query = rawQuery) }
        when (val action = DiscoverSearch.action(rawQuery)) {
            is DiscoverSearchAction.Clear -> {
                searchJob?.cancel()
                searchJob = null
                suggestionsJob?.cancel()
                suggestionsJob = null
                _state.update {
                    it.copy(
                        rows = emptyList(),
                        isLoading = false,
                        errorMessage = null,
                        isShowingSuggestions = false,
                    )
                }
            }
            is DiscoverSearchAction.Search -> search(action.query)
        }
    }

    fun retry() {
        when (val action = DiscoverSearch.action(_state.value.query)) {
            is DiscoverSearchAction.Search -> search(action.query)
            is DiscoverSearchAction.Clear -> startSuggestions()
        }
    }

    private fun startSuggestions() {
        suggestionsJob?.cancel()
        _state.update { it.copy(isShowingSuggestions = true, errorMessage = null) }
        suggestionsJob = viewModelScope.launch {
            suggestionsRepository.suggestionsStream(
                onSyncError = { error ->
                    _state.update { it.copy(isLoading = false, errorMessage = error.message) }
                },
            ).collect { result ->
                val snapshot = DiscoverSuggestions.snapshot(result)
                _state.update {
                    it.copy(
                        rows = rowsFor(snapshot.users),
                        isLoading = snapshot.isLoading,
                        errorMessage = null,
                        isShowingSuggestions = true,
                    )
                }
            }
        }
    }

    private fun search(query: String) {
        suggestionsJob?.cancel()
        suggestionsJob = null
        searchJob?.cancel()
        _state.update { it.copy(isLoading = true, errorMessage = null, isShowingSuggestions = false) }
        searchJob = viewModelScope.launch {
            when (val result = userRepository.searchUsers(query)) {
                is NetworkResult.Success ->
                    _state.update {
                        it.copy(
                            rows = rowsFor(result.data),
                            isLoading = false,
                            errorMessage = null,
                            isShowingSuggestions = false,
                        )
                    }
                is NetworkResult.Failure ->
                    _state.update {
                        it.copy(
                            rows = emptyList(),
                            isLoading = false,
                            errorMessage = result.error.message,
                            isShowingSuggestions = false,
                        )
                    }
            }
        }
    }

    val connectionFeedback: Flow<ConnectionFeedback> get() = controller.feedback

    private val _effects = MutableSharedFlow<DiscoverEffect>(extraBufferCapacity = 8)
    val effects: SharedFlow<DiscoverEffect> = _effects.asSharedFlow()

    fun connect(userId: String) {
        controller.send(userId)
    }

    fun acceptReceived(userId: String) {
        controller.accept(userId)
    }

    fun decline(userId: String) {
        controller.decline(userId)
    }

    fun cancel(userId: String) {
        controller.cancel(userId)
    }

    /** Pull-to-refresh (iOS `.refreshable`) : revalide les suggestions ; sans effet quand une recherche est en cours. */
    fun refresh() {
        if (_state.value.isSearchActive || _state.value.isRefreshing) return
        _state.update { it.copy(isRefreshing = true) }
        viewModelScope.launch {
            try {
                suggestionsRepository.refresh()
                _state.update { it.copy(isRefreshing = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isRefreshing = false, errorMessage = e.message) }
            }
        }
    }

    fun onSmsUnavailable() {
        toasts.show(strings.smsUnavailable(), FeedbackToastKind.ERROR)
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    /** Port of iOS `DiscoverViewModel.sendEmailInvitation` — invite by email. */
    fun onEmailTextChanged(text: String) {
        _state.update { it.copy(emailText = text) }
    }

    fun sendEmailInvitation() {
        val email = _state.value.emailText.trim()
        if (email.isEmpty() || _state.value.isSendingInvite) return
        _state.update { it.copy(isSendingInvite = true) }
        viewModelScope.launch {
            when (friendRepository.sendEmailInvitation(email)) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(isSendingInvite = false, emailText = "") }
                    toasts.show(strings.inviteSent(email), FeedbackToastKind.SUCCESS)
                    _effects.emit(DiscoverEffect.Success)
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isSendingInvite = false) }
                    toasts.show(strings.inviteFailed(), FeedbackToastKind.ERROR)
                    _effects.emit(DiscoverEffect.Failure)
                }
            }
        }
    }

    /**
     * Port of iOS `DiscoverViewModel.phoneText` — SMS invite card. Unlike the email card, the
     * send itself has no network call (it just opens the native SMS composer, app-side glue in
     * `DiscoverTab.kt`), so this field is never cleared on send — mirrors iOS, which also leaves
     * `phoneText` untouched after presenting the composer sheet, since the viewer may cancel it.
     */
    fun onPhoneTextChanged(text: String) {
        _state.update { it.copy(phoneText = text) }
    }

    private fun observeFriendshipCache() {
        viewModelScope.launch {
            friendshipCache.version.drop(1).collect { rederiveConnectActions() }
        }
    }

    private fun rederiveConnectActions() {
        _state.update { current ->
            current.copy(rows = current.rows.map { it.copy(connect = connectActionFor(it.user.id)) })
        }
    }

    private fun rowsFor(users: List<UserSearchResult>): List<DiscoverRow> =
        users.map { DiscoverRow(user = it, connect = connectActionFor(it.id)) }

    private fun connectActionFor(userId: String): ConnectAction =
        ConnectAction.from(resolver.resolve(userId))
}
