package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.model.MemberModeration
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.MemberRoster
import me.meeshy.sdk.model.MemberRosterPage
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
 * [MessageSocketManager] but had no consumer before this screen. An arrival
 * (`conversation:participant-joined`, `-unbanned`) silently re-reads the first page (#13795).
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class ConversationMembersViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val participantCache: ParticipantCacheRepository,
    private val sessionRepository: SessionRepository,
    private val messageSocketManager: MessageSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationMembersUiState())
    val state: StateFlow<ConversationMembersUiState> = _state.asStateFlow()

    private val searchQuery = MutableStateFlow("")

    /** Everything bound to the currently-loaded conversation, cancelled when it changes. */
    private var bindings: List<Job> = emptyList()

    /** La relecture silencieuse en cours : une arrivée plus récente la remplace, la plus lente ne l'écrase jamais. */
    private var revalidation: Job? = null

    /** La fenêtre de regroupement ouverte par la première arrivée : celles qui la suivent y sont absorbées. */
    private var revalidationWindow: Job? = null

    /**
     * Bind to a conversation and load its first page. Idempotent for the same id —
     * reopening the sheet serves what is already loaded instead of restarting.
     * Rebinding to a different id first tears down the previous conversation's
     * collectors, so a stale socket event can never mutate the new roster.
     */
    fun load(conversationId: String) {
        if (_state.value.conversationId == conversationId) return
        bindings.forEach(Job::cancel)
        revalidation?.cancel()
        revalidationWindow?.cancel()
        searchQuery.value = ""
        _state.value = ConversationMembersUiState(
            conversationId = conversationId,
            currentUserId = sessionRepository.currentUser.value?.id,
        )
        bindings = observeViewerRole(conversationId) +
            observeSearch(conversationId) +
            observeRosterEvents(conversationId) +
            observeCachedRoster(conversationId)
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
            if (current.searchQuery.isBlank()) {
                val result = participantCache.nextPage(id)
                _state.update { state ->
                    when {
                        result is NetworkResult.Success && state.searchQuery.isBlank() ->
                            state.copy(roster = result.data, isLoadingMore = false)
                        else -> state.copy(isLoadingMore = false)
                    }
                }
                return@launch
            }
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
            } else {
                participantCache.updateRole(id, userId, action.target.wireValue)
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
            } else {
                participantCache.removeParticipant(id, userId)
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
            } else {
                participantCache.removeParticipant(id, userId)
            }
        }
    }

    fun dismissActionError() = _state.update { it.copy(actionFailed = false) }

    /**
     * [revalidate] : relecture réseau FORCÉE d'une liste déjà à l'écran (arrivée d'un membre) — silencieuse, donc un
     * échec laisse la liste affichée telle quelle (jamais d'écran d'erreur sur un roster qui se lisait).
     */
    private suspend fun fetchFirstPage(conversationId: String, query: String, revalidate: Boolean = false) {
        val result = if (query.isBlank()) {
            participantCache.firstPage(conversationId, forceRefresh = revalidate).let { cached ->
                when (cached) {
                    is NetworkResult.Success -> NetworkResult.Success(cached.data.asPage())
                    is NetworkResult.Failure -> cached
                }
            }
        } else {
            conversationRepository.participants(id = conversationId, search = query)
        }
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
                    is NetworkResult.Failure ->
                        if (revalidate) state else state.copy(status = MembersLoadStatus.Error)
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

    /**
     * Follows the cached unfiltered roster so a silent revalidation lands on screen. Ignored while
     * a search is active (the roster then is a filtered one) and while nothing is cached yet.
     */
    private fun observeCachedRoster(conversationId: String): List<Job> = listOf(
        viewModelScope.launch {
            participantCache.observe(conversationId).collect { cached ->
                if (cached == null) return@collect
                _state.update { state ->
                    if (state.searchQuery.isNotBlank() || state.status != MembersLoadStatus.Loaded) state
                    else state.copy(roster = cached)
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
                participantCache.updateRole(conversationId, event.userId, event.role)
                _state.update { it.copy(roster = it.roster.withRole(event.userId, MemberRole.from(event.role))) }
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantLeft.collect { event ->
                if (event.conversationId != conversationId) return@collect
                val removedId = event.userId ?: event.participantId ?: return@collect
                participantCache.removeParticipant(conversationId, removedId)
                _state.update { it.copy(roster = it.roster.withoutUser(removedId)) }
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantJoined.collect { event ->
                if (event.conversationId == conversationId) revalidateRoster(conversationId)
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantUnbanned.collect { event ->
                if (event.conversationId == conversationId && event.membershipRestored != false) {
                    revalidateRoster(conversationId)
                }
            }
        },
        viewModelScope.launch {
            messageSocketManager.participantBanned.collect { event ->
                if (event.conversationId != conversationId) return@collect
                val removedId = event.userId ?: event.participantId ?: return@collect
                participantCache.removeParticipant(conversationId, removedId)
                _state.update { it.copy(roster = it.roster.withoutUser(removedId)) }
            }
        },
    )

    /**
     * Un membre vient d'arriver (adhésion, débannissement) : la fiche d'un nouveau membre (avatar, rang, nom servi) ne se
     * devine pas de l'événement, donc la première page se relit — sans écran de chargement, pour la requête affichée
     * (la recherche en cours se relit elle-même, jamais remplacée par la liste complète). L'effectif suit le total servi.
     * Les arrivées rapprochées (≤ 300 ms de la première) sont regroupées : une rafale ne coûte qu'UNE requête.
     */
    private fun revalidateRoster(conversationId: String) {
        if (revalidationWindow?.isActive == true) return
        revalidationWindow = viewModelScope.launch {
            delay(ROSTER_COALESCE_MS)
            revalidation?.cancel()
            revalidation = viewModelScope.launch {
                fetchFirstPage(conversationId, _state.value.searchQuery, revalidate = true)
            }
        }
    }

    private fun MemberRoster.asPage() = MemberRosterPage(members, nextCursor, hasMore, totalCount)

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 300L

        /** Une rafale d'arrivées (import de groupe) se regroupe en UNE relecture. */
        const val ROSTER_COALESCE_MS = 300L
    }
}
