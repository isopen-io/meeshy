package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityJoinRequestedBinding
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunityJoinRequest
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.CommunityAccess
import me.meeshy.sdk.model.CommunityJoinRequestDecision
import me.meeshy.sdk.model.CommunityMemberActions
import me.meeshy.sdk.model.CommunityMemberSection
import me.meeshy.sdk.model.CommunityPaging
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

@Immutable
data class CommunityMemberRow(val member: ApiCommunityMember, val actions: CommunityMemberActions)

@Immutable
data class CommunityMemberSectionUi(val role: MemberRole, val rows: List<CommunityMemberRow>)

@Immutable
data class CommunityMembersUiState(
    val sections: List<CommunityMemberSectionUi> = emptyList(),
    val access: CommunityAccess? = null,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val failed: Boolean = false,
    val joinRequests: List<ApiCommunityJoinRequest> = emptyList(),
    val hasMoreJoinRequests: Boolean = false,
    val decidingJoinRequestId: String? = null,
    val joinRequestNotice: CommunityJoinRequestNotice? = null,
) {
    val isEmpty: Boolean get() = sections.isEmpty()
    val showSkeleton: Boolean get() = isEmpty && isLoading
    val showError: Boolean get() = isEmpty && !isLoading && failed
    val canInvite: Boolean get() = access?.canInvite == true
}

/** Ce que l'écran DIT après une décision sur une demande d'entrée (iOS `CommunityJoinRequestNotice`). */
sealed interface CommunityJoinRequestNotice {
    data class Accepted(val name: String) : CommunityJoinRequestNotice
    data object Gone : CommunityJoinRequestNotice
    data object Failed : CommunityJoinRequestNotice
}

sealed interface CommunityMembersEffect {
    data object ActionFailed : CommunityMembersEffect
}

/**
 * Les membres d'une communauté, par rôle décroissant (iOS `CommunityMembersViewModel`). Cache-first ;
 * changer un rôle ou retirer un membre est OPTIMISTE et se défait si la passerelle refuse. Les gestes
 * proposés viennent de [CommunityMemberActions] : jamais sur soi ni sur le créateur, jamais sans être admin.
 */
@HiltViewModel
class CommunityMembersViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val cache: CommunityCacheRepository,
    private val repository: CommunityRepository,
    private val session: SessionRepository,
    private val joinRequested: CommunityJoinRequestedBinding,
) : ViewModel() {

    val communityId: String = checkNotNull(savedStateHandle[CommunityDetailViewModel.COMMUNITY_ID_ARG])

    private val _state = MutableStateFlow(CommunityMembersUiState())
    val state: StateFlow<CommunityMembersUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunityMembersEffect>(Channel.BUFFERED)
    val effects: Flow<CommunityMembersEffect> = _effects.receiveAsFlow()

    private var firstPage: List<ApiCommunityMember> = emptyList()
    private var loaded = false
    private var extra: List<ApiCommunityMember> = emptyList()
    private var firstPageHasMore = false
    private var removedUserIds: Set<String> = emptySet()
    private var roleOverrides: Map<String, String> = emptyMap()
    private var createdBy: String = ""
    private var isSteward = false
    private var joinRequestCursor: String? = null

    init {
        viewModelScope.launch {
            cache.detail(communityId).collect { result ->
                val api = result.valueOrNull ?: return@collect
                createdBy = api.createdBy
                val access = CommunityAccess.of(api, session.currentUserId)
                _state.update { it.copy(access = access) }
                publish()
                applyStewardship(access.canDecideJoinRequests)
            }
        }
        viewModelScope.launch {
            joinRequested.requested.collect { event ->
                if (event.communityId == communityId && isSteward) reloadJoinRequests()
            }
        }
        viewModelScope.launch {
            cache.members(communityId, onError = { if (!loaded) publish(failed = true) }).collect { result ->
                val items = result.valueOrNull ?: return@collect
                firstPage = items
                loaded = true
                if (extra.isEmpty()) firstPageHasMore = items.size >= PAGE_SIZE
                publish(failed = false)
                dropRequestsOfMembers(items)
            }
        }
    }

    fun refresh() {
        if (_state.value.isRefreshing) return
        _state.update { it.copy(isRefreshing = true) }
        viewModelScope.launch {
            extra = emptyList()
            val ok = cache.refreshMembers(communityId)
            _state.update { it.copy(isRefreshing = false) }
            publish(failed = !ok && !loaded)
        }
    }

    fun retry() {
        _state.update { it.copy(isLoading = true, failed = false) }
        viewModelScope.launch { if (!cache.refreshMembers(communityId)) publish(failed = true) }
    }

    fun loadMore() {
        val current = _state.value
        if (!current.hasMore || current.isLoadingMore) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            val offset = CommunityPaging.merge(firstPage, extra, append = true) { it.id }.size
            val result = repository.getMembersPaged(communityId, offset = offset, limit = PAGE_SIZE)
            if (result is NetworkResult.Success) {
                extra = CommunityPaging.merge(extra, result.data.data, append = true) { it.id }
                firstPageHasMore = result.data.pagination?.hasMore ?: false
            }
            _state.update { it.copy(isLoadingMore = false) }
            publish()
        }
    }

    fun changeRole(member: ApiCommunityMember, role: MemberRole) {
        if (member.communityRole == role) return
        roleOverrides = roleOverrides + (member.id to role.wireValue)
        publish()
        viewModelScope.launch {
            val ok = repository.updateMemberRole(communityId, member.id, role.wireValue) is NetworkResult.Success
            if (ok) {
                settle { rows -> rows.map { if (it.id == member.id) it.copy(role = role.wireValue) else it } }
                cache.refreshMembers(communityId)
            }
            roleOverrides = roleOverrides - member.id
            publish()
            if (!ok) _effects.send(CommunityMembersEffect.ActionFailed)
        }
    }

    fun remove(member: ApiCommunityMember) {
        removedUserIds = removedUserIds + member.userId
        publish()
        viewModelScope.launch {
            val ok = repository.removeMember(communityId, member.userId) is NetworkResult.Success
            if (ok) {
                settle { rows -> rows.filterNot { it.userId == member.userId } }
                cache.refreshMembers(communityId)
                cache.refreshDetail(communityId)
                cache.refreshList()
            }
            removedUserIds = removedUserIds - member.userId
            publish()
            if (!ok) _effects.send(CommunityMembersEffect.ActionFailed)
        }
    }

    fun loadMoreJoinRequests() {
        val cursor = joinRequestCursor ?: return
        if (!isSteward) return
        viewModelScope.launch {
            val page = repository.joinRequests(communityId, cursor).getOrNull() ?: return@launch
            val known = _state.value.joinRequests.map { it.id }.toSet()
            joinRequestCursor = page.nextCursor
            _state.update { state ->
                state.copy(
                    joinRequests = state.joinRequests + page.data.filterNot { it.id in known },
                    hasMoreJoinRequests = page.nextCursor != null,
                )
            }
        }
    }

    /**
     * OPTIMISTE : la ligne quitte la liste au geste. Accepter fait entrer le membre que la passerelle sert ;
     * un 404 dit que la demande n'est plus tranchable PAR CE LECTEUR (déjà tranchée, blocage, compte fermé) —
     * la ligne reste partie et tout se relit ; toute autre erreur rend la liste EXACTEMENT telle qu'elle était.
     */
    fun decide(request: ApiCommunityJoinRequest, decision: CommunityJoinRequestDecision) {
        if (!isSteward || _state.value.decidingJoinRequestId != null) return
        val snapshot = _state.value.joinRequests
        _state.update { state ->
            state.copy(
                joinRequests = state.joinRequests.filterNot { it.id == request.id },
                decidingJoinRequestId = request.id,
                joinRequestNotice = null,
            )
        }
        viewModelScope.launch {
            when (val result = repository.decideJoinRequest(communityId, request.id, decision)) {
                is NetworkResult.Success -> {
                    result.data?.let { entered -> settle { rows -> if (rows.any { it.userId == entered.userId }) rows else rows + entered } }
                    publish()
                    _state.update { state ->
                        state.copy(
                            decidingJoinRequestId = null,
                            joinRequestNotice = CommunityJoinRequestNotice.Accepted(request.name).takeIf { decision == CommunityJoinRequestDecision.ACCEPT },
                        )
                    }
                    if (decision == CommunityJoinRequestDecision.ACCEPT) refreshCounters()
                }
                is NetworkResult.Failure -> if (result.error.httpStatus == NOT_FOUND) {
                    _state.update { it.copy(decidingJoinRequestId = null, joinRequestNotice = CommunityJoinRequestNotice.Gone) }
                    reloadJoinRequests()
                    refreshCounters()
                } else {
                    _state.update { it.copy(joinRequests = snapshot, decidingJoinRequestId = null, joinRequestNotice = CommunityJoinRequestNotice.Failed) }
                }
            }
        }
    }

    /** Qui tranche se lit dans ce que le DÉTAIL sert ; la liste n'est demandée qu'à un intendant. */
    private fun applyStewardship(steward: Boolean) {
        if (steward == isSteward) return
        isSteward = steward
        if (steward) {
            viewModelScope.launch { reloadJoinRequests() }
        } else {
            joinRequestCursor = null
            _state.update { it.copy(joinRequests = emptyList(), hasMoreJoinRequests = false) }
        }
    }

    private suspend fun reloadJoinRequests() {
        val page = repository.joinRequests(communityId).getOrNull() ?: return
        if (!isSteward) return
        joinRequestCursor = page.nextCursor
        _state.update { it.copy(joinRequests = page.data, hasMoreJoinRequests = page.nextCursor != null) }
    }

    /** Un demandeur entré par une autre porte (invitation, autre intendant) : sa demande est close, la liste se relit. */
    private fun dropRequestsOfMembers(members: List<ApiCommunityMember>) {
        val entered = members.map { it.userId }.toSet()
        val pending = _state.value.joinRequests
        if (!isSteward || pending.none { it.userId in entered }) return
        _state.update { state -> state.copy(joinRequests = state.joinRequests.filterNot { it.userId in entered }) }
        viewModelScope.launch { reloadJoinRequests() }
    }

    private suspend fun refreshCounters() {
        cache.refreshMembers(communityId)
        cache.refreshDetail(communityId)
        cache.refreshList()
    }

    /** Ce que la passerelle a confirmé tient, même si la relecture qui suit échoue. */
    private fun settle(transform: (List<ApiCommunityMember>) -> List<ApiCommunityMember>) {
        firstPage = transform(firstPage)
        extra = transform(extra)
    }

    private fun publish(failed: Boolean? = null) {
        val access = _state.value.access
        val me = session.currentUserId
        val merged = CommunityPaging.merge(firstPage, extra, append = true) { it.id }
            .filter { it.userId !in removedUserIds }
            .map { m -> roleOverrides[m.id]?.let { m.copy(role = it) } ?: m }
        val sections = CommunityMemberSection.sections(merged).map { section ->
            CommunityMemberSectionUi(
                role = section.role,
                rows = section.members.map { m ->
                    CommunityMemberRow(m, CommunityMemberActions.forMember(access?.canManageMembers == true, me, createdBy, m))
                },
            )
        }
        _state.update {
            it.copy(
                sections = sections,
                hasMore = firstPageHasMore,
                isLoading = !loaded && !(failed ?: it.failed),
                failed = failed ?: it.failed,
            )
        }
    }

    private companion object {
        const val PAGE_SIZE = 30
        const val NOT_FOUND = 404
    }
}
