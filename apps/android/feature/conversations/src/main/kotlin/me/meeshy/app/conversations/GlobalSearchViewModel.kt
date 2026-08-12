package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.RecentSearchesStore
import me.meeshy.sdk.search.GlobalSearchResults
import javax.inject.Inject

/** Les trois volets de la recherche globale — parite iOS `SearchTab`, meme ordre. */
enum class GlobalSearchTab { MESSAGES, CONVERSATIONS, USERS }

data class GlobalSearchUiState(
    val query: String = "",
    val recentSearches: List<String> = emptyList(),
    val selectedTab: GlobalSearchTab = GlobalSearchTab.MESSAGES,
    val isSearching: Boolean = false,
    val hasSearched: Boolean = false,
    val results: GlobalSearchResults = GlobalSearchResults(),
) {
    fun countFor(tab: GlobalSearchTab): Int = when (tab) {
        GlobalSearchTab.MESSAGES -> results.messages.size
        GlobalSearchTab.CONVERSATIONS -> results.conversations.size
        GlobalSearchTab.USERS -> results.users.size
    }

    /** Vrai quand la recherche a tourne et que l'onglet COURANT est vide. */
    val isCurrentTabEmpty: Boolean
        get() = hasSearched && !isSearching && countFor(selectedTab) == 0
}

/**
 * Recherche globale (messages, conversations, utilisateurs) — parite iOS
 * `GlobalSearchViewModel` : debounce 300 ms, seuil de 2 caracteres, annulation de
 * la recherche precedente a chaque frappe, une SEULE requete alimente les trois
 * onglets (les onglets ne re-fetchent pas).
 */
@HiltViewModel
class GlobalSearchViewModel @Inject constructor(
    private val repository: GlobalSearchRepository,
    private val recentSearchesStore: RecentSearchesStore,
) : ViewModel() {

    private val _state = MutableStateFlow(GlobalSearchUiState())
    val state: StateFlow<GlobalSearchUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            recentSearchesStore.searches.collect { recents ->
                _state.update { it.copy(recentSearches = recents) }
            }
        }
    }

    fun setQuery(value: String) {
        _state.update { it.copy(query = value) }
        searchJob?.cancel()
        val trimmed = value.trim()
        if (trimmed.length < MIN_QUERY_LENGTH) {
            _state.update {
                it.copy(results = GlobalSearchResults(), hasSearched = false, isSearching = false)
            }
            return
        }
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            _state.update { it.copy(isSearching = true) }
            val results = repository.search(trimmed)
            // Une recherche qui a REELLEMENT tourne entre dans l'historique — pas
            // chaque frappe : le debounce fait deja office de "recherche commise".
            recentSearchesStore.record(trimmed)
            _state.update { it.copy(isSearching = false, hasSearched = true, results = results) }
        }
    }

    fun selectTab(tab: GlobalSearchTab) {
        _state.update { it.copy(selectedTab = tab) }
    }

    companion object {
        const val MIN_QUERY_LENGTH: Int = 2
        const val DEBOUNCE_MS: Long = 300L
    }

    fun removeRecentSearch(query: String) {
        recentSearchesStore.remove(query)
    }

    fun clearRecentSearches() {
        recentSearchesStore.clear()
    }
}
