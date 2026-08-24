package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.MemberModeration
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.MemberRoster
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.currentUserRole
import me.meeshy.sdk.model.matches
import me.meeshy.sdk.model.role
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

/** Why the members sheet is showing nothing — never conflated with "no members". */
enum class MembersLoadStatus { Idle, Loading, Loaded, Error }

data class ConversationMembersUiState(
    val conversationId: String? = null,
    val roster: MemberRoster = MemberRoster.EMPTY,
    val status: MembersLoadStatus = MembersLoadStatus.Idle,
    val isLoadingMore: Boolean = false,
    val searchQuery: String = "",
    val viewerRole: MemberRole = MemberRole.MEMBER,
    val currentUserId: String? = null,
    val actionFailed: Boolean = false,
) {
    val members: List<PaginatedParticipant> get() = roster.members
    val memberCount: Int get() = roster.displayCount
    val canLoadMore: Boolean get() = roster.hasMore && !isLoadingMore
    val isLoading: Boolean get() = status == MembersLoadStatus.Loading
    val hasError: Boolean get() = status == MembersLoadStatus.Error

    /** Empty because the server really has nothing to show — not because it is still loading. */
    val isEmpty: Boolean get() = status == MembersLoadStatus.Loaded && members.isEmpty()

    fun isSelf(member: PaginatedParticipant): Boolean =
        currentUserId?.let(member::matches) == true

    fun canRemove(member: PaginatedParticipant): Boolean =
        MemberModeration.canRemove(actor = viewerRole, target = member.role, isSelf = isSelf(member))

    fun roleActions(member: PaginatedParticipant): List<MemberRoleAction> =
        MemberModeration.roleActions(actor = viewerRole, target = member.role, isSelf = isSelf(member))

    fun canBan(member: PaginatedParticipant): Boolean =
        MemberModeration.canBan(actor = viewerRole, target = member.role, isSelf = isSelf(member))
}

/**
 * Drives the conversation members sheet (feature-parity §Chat — paginated member
 * list + member moderation), the Android port of iOS `ParticipantsView`.
 *
 * Stays a thin caller over pure logic: [MemberRoster] owns the paging/dedup rules
 * and [MemberModeration] owns which affordances a viewer may see, so this class only
 * sequences network calls and folds their results back into state.
 *
 * Real-time: the gateway broadcasts `participant:role-updated`,
 * `conversation:participant-left` and `conversation:participant-banned` to the whole
 * roster, so a moderation action taken on another device — or by another moderator —
 * lands here without a refetch. Those three socket flows existed in
 * [MessageSocketManager] but had no consumer before this screen.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class ConversationMembersViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val messageSocketManager: MessageSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationMembersUiState())
    val state: StateFlow<ConversationMembersUiState> = _state.asStateFlow()

    private val searchQuery = MutableStateFlow("")

    /** Everything bound to the currently-loaded conversation, cancelled when it changes. */
    private var bindings: List<Job> = emptyList()

    /**
     * Bind to a conversation and load its first page. Idempotent for the same id —
     * reopening the sheet serves what is already loaded instead of restarting.
     * Rebinding to a different id first tears down the previous conversation's
     * collectors, so a stale socket event can never mutate the new roster.
     */
    fun load(conversationId: String) {
        if (_state.value.conversationId == conversationId) return
        bindings.forEach(Job::cancel)
        searchQuery.value = ""
        _state.value = ConversationMembersUiState(
            conversationId = conversationId,
            currentUserId = sessionRepository.currentUser.value?.id,
        )
        bindings = observeViewerRole(conversationId) +
            observeSearch(conversationId) +
            observeRosterEvents(conversationId)
        refresh()
    }

    /** Reload the first page for the current query (initial load, retry after an error). */
    fun refresh() {
        val id = _state.value.conversationId ?: return
        _state.update { it.copy(status = MembersLoadStatus.Loading) }
        viewModelScope.launch { fetchFirstPage(id, _state.value.searchQuery) }
    }

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(searchQuery = query) }
        searchQuery.value = query
    }

    /**
     * Fetch the next cursor page. No-op while one is in flight or once the server
     * said there is nothing left — the list calls this from its last row's
     * composition, which fires repeatedly.
     */
    fun loadMore() {
        val current = _state.value
        val id = current.conversationId ?: return
        val cursor = current.roster.nextCursor ?: return
        if (!current.canLoadMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            val result = conversationRepository.participants(
                id = id,
                search = current.searchQuery,
                cursor = cursor,
            )
            _state.update { state ->
                when (result) {
                    // The cursor is only valid against the roster it was issued for:
                    // a query change mid-flight makes this page stale, so drop it.
                    is NetworkResult.Success ->
                        if (state.searchQuery == current.searchQuery) {
                            state.copy(roster = state.roster.withNextPage(result.data), isLoadingMore = false)
                        } else {
                            state.copy(isLoadingMore = false)
                        }
                    is NetworkResult.Failure -> state.copy(isLoadingMore = false)
                }
            }
        }
    }

    /**
     * Promote or demote a member. Optimistic (ARCHITECTURE.md §5): the row's badge
     * changes instantly and rolls back to the exact prior roster if the server
     * refuses. The server remains the authority on whether the change is allowed —
     * [MemberModeration] only decides what to offer.
     */
    fun changeRole(member: PaginatedParticipant, action: MemberRoleAction) {
        val id = _state.value.conversationId ?: return
        val userId = member.userId ?: member.id
        val previous = _state.value.roster

        _state.update { it.copy(roster = it.roster.withRole(userId, action.target), actionFailed = false) }
        viewModelScope.launch {
            val result = conversationRepository.updateParticipantRole(id, userId, action.target)
            if (result is NetworkResult.Failure) {
                _state.update { it.copy(roster = previous, actionFailed = true) }
            }
        }
    }

    /**
     * Remove a member (destructive — the caller UI confirms first). Optimistic with
     * the same rollback contract as [changeRole].
     */
    fun removeMember(member: PaginatedParticipant) {
        val id = _state.value.conversationId ?: return
        val userId = member.userId ?: member.id
        val previous = _state.value.roster

        _state.update { it.copy(roster = it.roster.withoutUser(userId), actionFailed = false) }
        viewModelScope.launch {
            val result = conversationRepository.removeParticipant(id, userId)
            if (result is NetworkResult.Failure) {
                _state.update { it.copy(roster = previous, actionFailed = true) }
            }
        }
    }

    /**
     * Ban a member (destructive — the caller UI confirms first). Optimistic with the same
     * rollback contract as [removeMember]: banning drops the member from the active roster
     * server-side, same visible effect as removal. Mirror of iOS
     * `MemberManagementSection`/`ConversationSettingsViewModel.banParticipant`.
     */
    fun banMember(member: PaginatedParticipant) {
        val id = _state.value.conversationId ?: return
        val userId = member.userId ?: member.id
        val previous = _state.value.roster

        _state.update { it.copy(roster = it.roster.withoutUser(userId), actionFailed = false) }
        viewModelScope.launch {
            val result = conversationRepository.banParticipant(id, userId)
            if (result is NetworkResult.Failure) {
                _state.update { it.copy(roster = previous, actionFailed = true) }
            }
        }
    }

    fun dismissActionError() = _state.update { it.copy(actionFailed = false) }

    private suspend fun fetchFirstPage(conversationId: String, query: String) {
        val result = conversationRepository.participants(id = conversationId, search = query)
        _state.update { state ->
            // A slower first page for an abandoned query must never overwrite the
            // roster the viewer is now looking at.
            if (state.searchQuery != query) {
                state
            } else {
                when (result) {
                    is NetworkResult.Success ->
                        state.copy(
                            roster = state.roster.withFirstPage(result.data),
                            status = MembersLoadStatus.Loaded,
                        )
                    is NetworkResult.Failure -> state.copy(status = MembersLoadStatus.Error)
                }
            }
        }
    }

    private fun observeViewerRole(conversationId: String): List<Job> = listOf(
        viewModelScope.launch {
            conversationRepository.conversationStream(conversationId).collect { conversation ->
                if (conversation == null) return@collect
                val userId = sessionRepository.currentUser.value?.id
                _state.update {
                    it.copy(
                        currentUserId = userId ?: it.currentUserId,
                        viewerRole = conversation.currentUserRole(userId),
                    )
                }
            }
        },
    )

    private fun observeSearch(conversationId: String): List<Job> = listOf(
        viewModelScope.launch {
            searchQuery
                .drop(1)
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { query ->
                    _state.update { it.copy(status = MembersLoadStatus.Loading) }
                    fetchFirstPage(conversationId, query)
                }
        },
    )

    private fun observeRosterEvents(conversationId: String): List<Job> = listOf(
        viewModelScope.launch {
            messageSocketManager.participantRoleUpdated.collect { event ->
                if (event.conversationId != conversationId) return@collect
                _state.update { it.copy(roster = it.roster.withRole(event.userId, MemberRole.from(event.role))) }
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantLeft.collect { event ->
                if (event.conversationId != conversationId) return@collect
                val removedId = event.userId ?: event.participantId ?: return@collect
                _state.update { it.copy(roster = it.roster.withoutUser(removedId)) }
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantBanned.collect { event ->
                if (event.conversationId != conversationId) return@collect
                val removedId = event.userId ?: event.participantId ?: return@collect
                _state.update { it.copy(roster = it.roster.withoutUser(removedId)) }
            }
        },
    )

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 300L
    }
}
