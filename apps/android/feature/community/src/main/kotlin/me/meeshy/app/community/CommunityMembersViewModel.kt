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
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.CommunityAccess
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
) {
    val isEmpty: Boolean get() = sections.isEmpty()
    val showSkeleton: Boolean get() = isEmpty && isLoading
    val showError: Boolean get() = isEmpty && !isLoading && failed
    val canInvite: Boolean get() = access?.canInvite == true
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

    init {
        viewModelScope.launch {
            cache.detail(communityId).collect { result ->
                val api = result.valueOrNull ?: return@collect
                createdBy = api.createdBy
                val access = CommunityAccess.resolve(api.createdBy, api.isPrivate, session.currentUserId, api.members.orEmpty())
                _state.update { it.copy(access = access) }
                publish()
            }
        }
        viewModelScope.launch {
            cache.members(communityId, onError = { if (!loaded) publish(failed = true) }).collect { result ->
                val items = result.valueOrNull ?: return@collect
                firstPage = items
                loaded = true
                if (extra.isEmpty()) firstPageHasMore = items.size >= PAGE_SIZE
                publish(failed = false)
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
            if (ok) cache.refreshMembers(communityId)
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
                cache.refreshMembers(communityId)
                cache.refreshDetail(communityId)
                cache.refreshList()
            }
            removedUserIds = removedUserIds - member.userId
            publish()
            if (!ok) _effects.send(CommunityMembersEffect.ActionFailed)
        }
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
    }
}
