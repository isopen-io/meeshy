package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.AudienceRoster
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

@Immutable
data class AudiencePickerState(
    val query: String = "",
    val results: List<AudienceCandidate> = emptyList(),
    val selectedIds: List<String> = emptyList(),
    /** Les personnes cochées, pour les puces : jamais reconstruites depuis un identifiant seul. */
    val selected: List<AudienceCandidate> = emptyList(),
    val isSearching: Boolean = false,
    val hasLoadedContacts: Boolean = false,
)

/**
 * Le sélecteur de personnes de l'audience (`ONLY` / `EXCEPT`) et des mentions — miroir de
 * `AudienceUserPickerViewModel` (iOS) : les contacts du cache s'affichent à l'ouverture sans
 * attendre le réseau, la saisie filtre le local instantanément puis complète par l'annuaire.
 * Soi et les personnes bloquées n'y paraissent jamais, et une sélection héritée d'un brouillon
 * est purgée de ce qui est devenu bloqué avant d'être montrée.
 */
@HiltViewModel
class StoryAudiencePickerViewModel @Inject constructor(
    private val friends: FriendListRepository,
    private val users: UserRepository,
    private val blocks: BlockCache,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AudiencePickerState())
    val state: StateFlow<AudiencePickerState> = _state.asStateFlow()

    /** Délai de saisie avant l'annuaire ; 0 en test. */
    internal var searchDebounceMs: Long = SEARCH_DEBOUNCE_MS

    private var contacts: List<AudienceCandidate> = emptyList()
    private var searchJob: Job? = null

    private val selfId: String? get() = session.currentUser.value?.id

    /**
     * [keepsBlocked] : sous EXCEPT la liste EXCLUT — un bloqué qui en sortirait redeviendrait
     * destinataire ; il y reste donc, sans être proposé. Sous ONLY il est écarté.
     */
    fun start(initialSelection: List<String>, keepsBlocked: Boolean = false) {
        val blocked = if (keepsBlocked) emptySet() else blocks.currentBlockedIds
        val kept = initialSelection.filter { it != selfId && it !in blocked }.distinct()
        _state.value = AudiencePickerState(selectedIds = kept)
        viewModelScope.launch {
            val cached = friends.cachedSnapshot().orEmpty()
            contacts = AudienceRoster.contacts(
                friends = cached.map { AudienceCandidate(it.id, it.username, it.displayName, it.avatar) },
                selfId = selfId,
                blocked = blocks.currentBlockedIds,
            )
            _state.update {
                it.copy(
                    results = AudienceRoster.filterLocal(contacts, it.query),
                    selected = contacts.filter { person -> person.id in it.selectedIds },
                    hasLoadedContacts = true,
                )
            }
        }
    }

    fun onQueryChange(query: String) {
        searchJob?.cancel()
        val local = AudienceRoster.filterLocal(contacts, query)
        _state.update { it.copy(query = query, results = local, isSearching = false) }
        if (query.isBlank()) return
        searchJob = viewModelScope.launch {
            if (searchDebounceMs > 0) delay(searchDebounceMs)
            _state.update { it.copy(isSearching = true) }
            try {
                val outcome = users.searchUsers(query.trim(), limit = SEARCH_LIMIT, offset = 0)
                if (outcome is NetworkResult.Success) {
                    val remote = outcome.data.mapNotNull { it.toCandidate() }
                    _state.update {
                        it.copy(results = AudienceRoster.merge(local, remote, selfId, blocks.currentBlockedIds))
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } finally {
                _state.update { it.copy(isSearching = false) }
            }
        }
    }

    fun onToggle(id: String) {
        _state.update { current ->
            val next = AudienceRoster.toggle(current.selectedIds, id)
            val person = (current.results + current.selected).firstOrNull { it.id == id }
            val chips = when {
                id !in next -> current.selected.filterNot { it.id == id }
                person != null && current.selected.none { it.id == id } -> current.selected + person
                else -> current.selected
            }
            current.copy(selectedIds = next, selected = chips)
        }
    }

    private fun UserSearchResult.toCandidate(): AudienceCandidate? =
        username.trim().takeIf { it.isNotEmpty() }?.let { AudienceCandidate(id, it, displayName, avatar) }

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 250L
        const val SEARCH_LIMIT = 20
    }
}
