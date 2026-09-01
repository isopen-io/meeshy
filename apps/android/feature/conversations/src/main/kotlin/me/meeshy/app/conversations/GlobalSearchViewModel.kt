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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.search.SearchQueryCache
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.RecentSearchesStore
import me.meeshy.sdk.search.GlobalSearchResults
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

/** Les trois volets de la recherche globale — parite iOS `SearchTab`, meme ordre. */
enum class GlobalSearchTab { MESSAGES, CONVERSATIONS, USERS }

data class GlobalSearchUiState(
    val query: String = "",
    /**
     * La requete qui a PRODUIT les [results] actuellement affiches — distincte de
     * [query], la saisie vive. Une ligne de resultat surligne son texte contre
     * CETTE requete (parite iOS `resultsQuery`) : pendant qu'une nouvelle requete
     * se tape, les anciens resultats restent affiches et leur surlignage doit
     * rester ancre sur le terme qui les a produits, jamais sur la saisie en cours.
     */
    val resultsQuery: String = "",
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
 *
 * Cache-first (dimension 2 Performance) : une requete deja vue dans la fenetre TTL
 * se ressert depuis le [SearchQueryCache] SANS repartir en reseau — parite iOS
 * `messageQueryCache`. Le cache est invalide quand une conversation est mise a jour
 * ou supprimee (socket), car un resultat garde pourrait alors etre perime — parite
 * iOS `setupSocketInvalidation`. Le "quand" appartient a ce ViewModel ; le cache
 * lui-meme reste un building block pur `:core:model` sans horloge ni socket.
 */
@HiltViewModel
class GlobalSearchViewModel @Inject constructor(
    private val repository: GlobalSearchRepository,
    private val recentSearchesStore: RecentSearchesStore,
    private val messageSocket: MessageSocketManager,
    private val clock: CacheClock,
) : ViewModel() {

    private val _state = MutableStateFlow(GlobalSearchUiState())
    val state: StateFlow<GlobalSearchUiState> = _state.asStateFlow()

    private var searchJob: Job? = null
    private var queryCache = SearchQueryCache.empty<GlobalSearchResults>()

    init {
        viewModelScope.launch {
            recentSearchesStore.searches.collect { recents ->
                _state.update { it.copy(recentSearches = recents) }
            }
        }
        viewModelScope.launch {
            messageSocket.conversationUpdated.collect { invalidateSearchCache() }
        }
        viewModelScope.launch {
            messageSocket.conversationDeleted.collect { invalidateSearchCache() }
        }
    }

    fun setQuery(value: String) {
        _state.update { it.copy(query = value) }
        searchJob?.cancel()
        val trimmed = value.trim()
        if (trimmed.length < MIN_QUERY_LENGTH) {
            _state.update {
                it.copy(
                    results = GlobalSearchResults(),
                    resultsQuery = "",
                    hasSearched = false,
                    isSearching = false,
                )
            }
            return
        }
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            // Cache-first : un HIT dans la fenetre TTL ressert sans reseau ni
            // spinner ; le terme entre quand meme dans l'historique (il a bien ete
            // "cherche"), comme sur le chemin reseau.
            val cached = queryCache.get(trimmed, clock.nowMillis())
            if (cached != null) {
                recentSearchesStore.record(trimmed)
                _state.update {
                    it.copy(isSearching = false, hasSearched = true, results = cached, resultsQuery = trimmed)
                }
                return@launch
            }
            _state.update { it.copy(isSearching = true) }
            val results = repository.search(trimmed)
            queryCache = queryCache.put(trimmed, results, clock.nowMillis())
            // Une recherche qui a REELLEMENT tourne entre dans l'historique — pas
            // chaque frappe : le debounce fait deja office de "recherche commise".
            recentSearchesStore.record(trimmed)
            _state.update {
                it.copy(isSearching = false, hasSearched = true, results = results, resultsQuery = trimmed)
            }
        }
    }

    fun selectTab(tab: GlobalSearchTab) {
        _state.update { it.copy(selectedTab = tab) }
    }

    /**
     * Vide le cache de requetes : la prochaine recherche, meme identique, repart en
     * reseau. Appele quand une donnee sous-jacente a change (socket) — expose aussi
     * pour un rafraichissement manuel eventuel.
     */
    fun invalidateSearchCache() {
        queryCache = queryCache.invalidate()
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
