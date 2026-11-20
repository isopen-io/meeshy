package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.community.CommunityAppearance
import me.meeshy.sdk.community.CommunityAppearanceStore
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityFetchException
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.Community
import me.meeshy.sdk.model.CommunityAccess
import me.meeshy.sdk.model.CommunityJoinOutcome
import me.meeshy.sdk.model.CommunityJoinRefusal
import me.meeshy.sdk.model.CommunityLoadFailure
import me.meeshy.sdk.model.CommunityMembership
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.joinDeclinedUntil
import me.meeshy.sdk.model.toCommunity
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.toContentFetchFailure
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.displayTitle
import java.time.Instant
import javax.inject.Inject

/** Une rangée de la liste des channels : le titre est résolu une fois, ici, pas à chaque recomposition. */
@Immutable
data class CommunityChannelRow(
    val id: String,
    val title: String?,
    val description: String?,
    val memberCount: Int?,
)

enum class CommunityDetailTab { CHANNELS, FEED }

@Immutable
data class CommunityDetailUiState(
    val community: Community? = null,
    val access: CommunityAccess? = null,
    val appearance: CommunityAppearance? = null,
    val channels: List<CommunityChannelRow> = emptyList(),
    val tab: CommunityDetailTab = CommunityDetailTab.CHANNELS,
    val isLoading: Boolean = true,
    val failure: CommunityLoadFailure? = null,
    val isJoining: Boolean = false,
    val isLeaving: Boolean = false,
    /** La communauté valide chaque entrée (#19429) : on y DEMANDE à entrer. */
    val requiresJoinApproval: Boolean = false,
    /** La demande du lecteur attend un administrateur ou un modérateur (#19870). */
    val joinRequestPending: Boolean = false,
    /** Un refus de la jonction que l'écran dit dans la langue du lecteur. */
    val joinRefusal: CommunityJoinRefusal? = null,
    /** Sa dernière demande a été refusée : nouvelle demande possible à partir de cet instant (#19949). */
    val joinDeclinedUntil: Instant? = null,
) {
    val showSkeleton: Boolean get() = community == null && isLoading
    val showError: Boolean get() = community == null && !isLoading && failure != null
}

sealed interface CommunityDetailEffect {
    /** La communauté n'est plus la mienne (sortie) : l'écran se referme. */
    data object Left : CommunityDetailEffect
    data object Joined : CommunityDetailEffect
    data object ActionFailed : CommunityDetailEffect
}

/**
 * Le détail d'une communauté (iOS `CommunityDetailViewModel`). La fiche et les channels se lisent
 * CACHE-FIRST ; rejoindre est OPTIMISTE (le lecteur devient membre à l'instant, retour arrière si la
 * passerelle refuse). Les droits viennent de la seule loi [CommunityAccess].
 */
@HiltViewModel
class CommunityDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val cache: CommunityCacheRepository,
    private val repository: CommunityRepository,
    private val session: SessionRepository,
    private val appearanceStore: CommunityAppearanceStore,
) : ViewModel() {

    val communityId: String = checkNotNull(savedStateHandle[COMMUNITY_ID_ARG])

    private val _state = MutableStateFlow(CommunityDetailUiState())
    val state: StateFlow<CommunityDetailUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunityDetailEffect>(Channel.BUFFERED)
    val effects: Flow<CommunityDetailEffect> = _effects.receiveAsFlow()

    private var detailJob: Job? = null
    private var channelsJob: Job? = null
    private var appearanceJob: Job? = null

    init {
        observeDetail()
    }

    fun retry() {
        _state.update { it.copy(isLoading = true, failure = null) }
        observeDetail()
    }

    fun selectTab(tab: CommunityDetailTab) = _state.update { it.copy(tab = tab) }

    /** Les channels ou la fiche ont changé côté serveur (channel ajouté, réglages) : relire les deux. */
    fun reload() {
        viewModelScope.launch {
            cache.refreshDetail(communityId)
            cache.refreshChannels(communityId)
        }
    }

    /**
     * Rejoindre est OPTIMISTE. Une communauté qui valide chaque entrée dit « Demande envoyée » dès le
     * toucher et ne fait membre de rien — ni rôle, ni effectif — avant l'acceptation, qui arrive par
     * `community:member-joined` (miroir `CommunityDetailViewModel.joinCommunity` iOS, #19870).
     */
    fun join() {
        val before = _state.value
        val community = before.community ?: return
        val access = before.access ?: return
        if (before.isJoining || before.joinRequestPending || before.joinDeclinedUntil != null || !access.canJoin) return
        _state.update {
            if (before.requiresJoinApproval) {
                it.copy(isJoining = true, joinRequestPending = true, joinRefusal = null)
            } else {
                it.copy(
                    isJoining = true,
                    joinRefusal = null,
                    access = CommunityAccess(CommunityMembership(isCreator = false, isMember = true, role = MemberRole.MEMBER), access.isPrivate),
                    community = community.copy(memberCount = community.memberCount + 1),
                )
            }
        }
        viewModelScope.launch {
            when (val result = repository.join(communityId)) {
                is NetworkResult.Success -> when (result.data) {
                    is CommunityJoinOutcome.Pending -> {
                        _state.update {
                            it.copy(
                                isJoining = false,
                                requiresJoinApproval = true,
                                joinRequestPending = true,
                                access = before.access,
                                community = before.community,
                            )
                        }
                        cache.refreshDetail(communityId)
                    }
                    is CommunityJoinOutcome.Joined -> {
                        cache.refreshDetail(communityId)
                        cache.refreshChannels(communityId)
                        cache.refreshList()
                        _state.update { it.copy(isJoining = false, joinRequestPending = false) }
                        _effects.send(CommunityDetailEffect.Joined)
                    }
                }
                is NetworkResult.Failure -> {
                    val refusal = CommunityJoinRefusal.of(result.error.code)
                    _state.update {
                        it.copy(
                            isJoining = false,
                            joinRequestPending = false,
                            joinRefusal = refusal,
                            access = before.access,
                            community = before.community,
                        )
                    }
                    if (refusal == null) _effects.send(CommunityDetailEffect.ActionFailed)
                }
            }
        }
    }

    fun leave() {
        if (_state.value.isLeaving) return
        _state.update { it.copy(isLeaving = true) }
        viewModelScope.launch {
            when (repository.leave(communityId)) {
                is NetworkResult.Success -> {
                    cache.forget(communityId)
                    cache.refreshList()
                    _state.update { it.copy(isLeaving = false) }
                    _effects.send(CommunityDetailEffect.Left)
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isLeaving = false) }
                    _effects.send(CommunityDetailEffect.ActionFailed)
                }
            }
        }
    }

    private fun observeDetail() {
        detailJob?.cancel()
        detailJob = viewModelScope.launch {
            cache.detail(communityId, onError = ::onDetailFailure).collect { result ->
                result.valueOrNull?.let(::onDetail)
            }
        }
    }

    /**
     * Un refus (403 ou 404, rendus pareils) efface la fiche en cache — une communauté privée qu'on
     * ne lit plus ne se relit pas hors ligne — et l'écran le DIT, avec le seul retour. Réseau et
     * serveur ne cachent pas une fiche déjà peinte (cache d'abord).
     */
    private fun onDetailFailure(error: Throwable) {
        val cause = (error as? CommunityFetchException)?.failure ?: error.toContentFetchFailure()
        val failure = CommunityLoadFailure.of(cause)
        if (failure == CommunityLoadFailure.REFUSED) {
            channelsJob?.cancel()
            _state.update { it.copy(community = null, access = null, channels = emptyList(), isLoading = false, failure = failure) }
            viewModelScope.launch {
                cache.forget(communityId)
                cache.refreshList()
            }
            return
        }
        if (_state.value.community == null) _state.update { it.copy(isLoading = false, failure = failure) }
    }

    private fun onDetail(api: ApiCommunity) {
        val access = CommunityAccess.of(api, session.currentUserId)
        _state.update {
            val sending = it.isJoining && it.joinRequestPending
            it.copy(
                community = api.toCommunity(),
                access = access,
                isLoading = false,
                failure = null,
                requiresJoinApproval = api.requiresJoinApproval == true || sending,
                joinRequestPending = !access.isMember && (api.hasPendingJoinRequest || sending),
                joinRefusal = it.joinRefusal.takeUnless { access.isMember },
                joinDeclinedUntil = api.joinDeclinedUntil(Instant.now()).takeUnless { sending },
            )
        }
        observeAppearance(api)
        if (access.isMember) observeChannels() else channelsJob?.cancel()
    }

    private fun observeAppearance(api: ApiCommunity) {
        if (appearanceJob?.isActive == true) return
        appearanceJob = viewModelScope.launch {
            appearanceStore.observe(communityId, api.name).collect { appearance ->
                _state.update { it.copy(appearance = appearance) }
            }
        }
    }

    private fun observeChannels() {
        if (channelsJob?.isActive == true) return
        channelsJob = viewModelScope.launch {
            cache.channels(communityId).collect { result ->
                val rows = result.valueOrNull?.map(::toRow) ?: return@collect
                _state.update { it.copy(channels = rows) }
            }
        }
    }

    private fun toRow(conversation: ApiConversation) = CommunityChannelRow(
        id = conversation.id,
        title = conversation.displayTitle(session.currentUserId).takeIf { conversation.title != null || conversation.resolvedPreferences?.customName != null },
        description = conversation.description?.takeIf { it.isNotBlank() },
        memberCount = conversation.memberCount.takeIf { it > 0 },
    )

    companion object {
        const val COMMUNITY_ID_ARG = "communityId"
    }
}
