package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CommunityChannelPicker
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.displayTitle
import javax.inject.Inject

@Immutable
data class CommunityChannelCandidate(val id: String, val title: String, val memberCount: Int?, val belongsToOtherCommunity: Boolean)

@Immutable
data class CommunityAddChannelUiState(
    val candidates: List<CommunityChannelCandidate> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = true,
    val addingId: String? = null,
    val pendingMove: CommunityChannelCandidate? = null,
    val errorMessage: String? = null,
) {
    val visible: List<CommunityChannelCandidate>
        get() = query.trim().let { q -> if (q.isEmpty()) candidates else candidates.filter { it.title.contains(q, ignoreCase = true) } }
}

sealed interface CommunityAddChannelEffect {
    data object Added : CommunityAddChannelEffect
}

/**
 * Le choix d'une conversation à rattacher (iOS `CommunityAddChannelViewModel`). Les candidates se lisent
 * du cache local des conversations (instantané, hors ligne) et se limitent à celles que la passerelle
 * accepterait ([CommunityChannelPicker]). Une conversation d'une autre communauté demande confirmation.
 */
@HiltViewModel
class CommunityAddChannelViewModel @Inject constructor(
    private val conversations: ConversationRepository,
    private val repository: CommunityRepository,
    private val cache: CommunityCacheRepository,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CommunityAddChannelUiState())
    val state: StateFlow<CommunityAddChannelUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunityAddChannelEffect>(Channel.BUFFERED)
    val effects: Flow<CommunityAddChannelEffect> = _effects.receiveAsFlow()

    private var communityId: String = ""
    private var byId: Map<String, ApiConversation> = emptyMap()

    fun start(id: String) {
        if (communityId == id) return
        communityId = id
        viewModelScope.launch {
            val me = session.currentUserId
            val rows = CommunityChannelPicker.candidates(conversations.cachedConversations().first(), id).map { c ->
                c to CommunityChannelCandidate(c.id, c.displayTitle(me), c.memberCount.takeIf { it > 0 }, c.communityId != null)
            }
            byId = rows.associate { (c, _) -> c.id to c }
            _state.update { it.copy(candidates = rows.map { (_, v) -> v }, isLoading = false) }
        }
    }

    fun onQuery(value: String) = _state.update { it.copy(query = value) }
    fun dismissError() = _state.update { it.copy(errorMessage = null) }
    fun cancelMove() = _state.update { it.copy(pendingMove = null) }

    fun onPick(candidate: CommunityChannelCandidate) {
        if (_state.value.addingId != null) return
        val source = byId[candidate.id] ?: return
        if (CommunityChannelPicker.requiresMoveConfirmation(source, communityId)) {
            _state.update { it.copy(pendingMove = candidate) }
        } else {
            add(candidate)
        }
    }

    fun confirmMove() {
        val pending = _state.value.pendingMove ?: return
        _state.update { it.copy(pendingMove = null) }
        add(pending)
    }

    private fun add(candidate: CommunityChannelCandidate) {
        _state.update { it.copy(addingId = candidate.id) }
        viewModelScope.launch {
            when (val result = repository.addConversation(communityId, candidate.id)) {
                is NetworkResult.Success -> {
                    byId[candidate.id]?.let { conversations.remember(it.copy(communityId = communityId)) }
                    cache.refreshChannels(communityId)
                    cache.refreshDetail(communityId)
                    _state.update { s -> s.copy(addingId = null, candidates = s.candidates.filterNot { it.id == candidate.id }) }
                    _effects.send(CommunityAddChannelEffect.Added)
                }
                is NetworkResult.Failure -> _state.update { it.copy(addingId = null, errorMessage = result.error.message) }
            }
        }
    }
}
