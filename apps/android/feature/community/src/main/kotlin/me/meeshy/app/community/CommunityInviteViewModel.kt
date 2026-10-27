package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

@Immutable
data class CommunityInviteUiState(
    val query: String = "",
    val results: List<UserSearchResult> = emptyList(),
    val isSearching: Boolean = false,
    val invitedIds: Set<String> = emptySet(),
    val recentlyInvited: List<UserSearchResult> = emptyList(),
    val invitingId: String? = null,
) {
    val showsNoResults: Boolean get() = !isSearching && results.isEmpty() && query.trim().length >= 2
}

sealed interface CommunityInviteEffect {
    data object Invited : CommunityInviteEffect
    data object Failed : CommunityInviteEffect
}

/** Inviter des personnes (iOS `CommunityInviteViewModel`) : recherche différée dès deux caractères, une invitation unitaire par tap. */
@HiltViewModel
class CommunityInviteViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: CommunityRepository,
    private val cache: CommunityCacheRepository,
    private val users: UserRepository,
    private val session: SessionRepository,
) : ViewModel() {

    private val communityId: String = checkNotNull(savedStateHandle[CommunityDetailViewModel.COMMUNITY_ID_ARG])

    private val _state = MutableStateFlow(CommunityInviteUiState())
    val state: StateFlow<CommunityInviteUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunityInviteEffect>(Channel.BUFFERED)
    val effects: Flow<CommunityInviteEffect> = _effects.receiveAsFlow()

    private var searchJob: Job? = null

    fun onQuery(value: String) {
        _state.update { it.copy(query = value) }
        searchJob?.cancel()
        if (value.trim().length < 2) {
            _state.update { it.copy(results = emptyList(), isSearching = false) }
            return
        }
        _state.update { it.copy(isSearching = true) }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MILLIS)
            val found = (users.searchUsers(value.trim(), limit = RESULT_LIMIT) as? NetworkResult.Success)?.data.orEmpty()
            val me = session.currentUserId
            _state.update { it.copy(results = found.filter { u -> u.id != me }, isSearching = false) }
        }
    }

    fun invite(user: UserSearchResult) {
        val current = _state.value
        if (user.id in current.invitedIds || current.invitingId != null) return
        _state.update { it.copy(invitingId = user.id) }
        viewModelScope.launch {
            when (repository.invite(communityId, user.id)) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(invitingId = null, invitedIds = it.invitedIds + user.id, recentlyInvited = it.recentlyInvited + user) }
                    cache.refreshMembers(communityId)
                    _effects.send(CommunityInviteEffect.Invited)
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(invitingId = null) }
                    _effects.send(CommunityInviteEffect.Failed)
                }
            }
        }
    }

    private companion object {
        const val SEARCH_DEBOUNCE_MILLIS = 250L
        const val RESULT_LIMIT = 20
    }
}
