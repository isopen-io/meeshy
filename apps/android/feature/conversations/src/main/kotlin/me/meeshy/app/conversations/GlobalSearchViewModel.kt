package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.search.SearchLoadState
import me.meeshy.sdk.model.search.SearchLoadStates
import me.meeshy.sdk.model.search.SearchPaneKind
import me.meeshy.sdk.model.search.SearchQueryCache
import me.meeshy.sdk.search.GlobalSearchRepository
import me.meeshy.sdk.search.GlobalSearchResults
import me.meeshy.sdk.search.GlobalSearchSnapshot
import me.meeshy.sdk.search.RecentSearchesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import java.util.Locale
import javax.inject.Inject

/** Effets ponctuels de l'ecran : retour haptique leger (parite iOS `HapticFeedback.light`) et fiche profil. */
sealed interface GlobalSearchEffect {
    data object Haptic : GlobalSearchEffect
    data class OpenUserProfile(val userId: String) : GlobalSearchEffect
}

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
    /** Ce que l'ecran rend A LA PLACE de la liste ; `LOADING` seulement a froid, sans resultat. */
    val loadState: SearchLoadState = SearchLoadState.IDLE,
    val hasSearched: Boolean = false,
    /** Le premier volet reseau en echec (conversations, personnes, messages) ; `null` si aucun. */
    val failure: SearchPaneKind? = null,
    /** Les volets en echec individuellement : un volet en panne n'est jamais « aucun resultat ». */
    val failedPanes: Set<SearchPaneKind> = emptySet(),
    val results: GlobalSearchResults = GlobalSearchResults(),
    /**
     * Le LECTEUR : l'interlocuteur d'un direct s'elit contre lui (#11615). Sans lui, une
     * ligne de resultat « conversation » ne pourrait pas nommer l'autre personne et
     * retomberait sur le nom generique.
     */
    val currentUserId: String? = null,
    /** Le prisme du lecteur (descente stricte, sans repli) : sert l'apercu traduit des lignes de conversation. */
    val readerPrism: List<String> = emptyList(),
) {
    val isSearching: Boolean get() = loadState == SearchLoadState.LOADING

    /** Revalidation discrete : des resultats restent affiches pendant que le reseau repond. */
    val isRevalidating: Boolean get() = loadState == SearchLoadState.CACHED_STALE

    val hasDisplayedResults: Boolean
        get() = results.conversations.isNotEmpty() || results.users.isNotEmpty() || results.messages.isNotEmpty()

    fun isFailed(tab: GlobalSearchTab): Boolean = when (tab) {
        GlobalSearchTab.MESSAGES -> SearchPaneKind.MESSAGES
        GlobalSearchTab.CONVERSATIONS -> SearchPaneKind.CONVERSATIONS
        GlobalSearchTab.USERS -> SearchPaneKind.PEOPLE
    } in failedPanes

    fun countFor(tab: GlobalSearchTab): Int = when (tab) {
        GlobalSearchTab.MESSAGES -> results.messages.size
        GlobalSearchTab.CONVERSATIONS -> results.conversations.size
        GlobalSearchTab.USERS -> results.users.size
    }

    /**
     * Vrai quand la recherche a ABOUTI et que l'onglet COURANT est vide. Un volet en panne
     * n'est jamais un « aucun resultat », et une revalidation en cours n'est pas encore une reponse.
     */
    val isCurrentTabEmpty: Boolean
        get() = hasSearched &&
            (loadState == SearchLoadState.LOADED || loadState == SearchLoadState.OFFLINE) &&
            countFor(selectedTab) == 0 &&
            !isFailed(selectedTab)
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
    sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(GlobalSearchUiState())
    val state: StateFlow<GlobalSearchUiState> = _state.asStateFlow()

    private val _effects = Channel<GlobalSearchEffect>(Channel.BUFFERED)
    val effects: Flow<GlobalSearchEffect> = _effects.receiveAsFlow()

    private var searchJob: Job? = null
    private var lastQuery: String = ""
    private var queryCache = SearchQueryCache.empty<GlobalSearchResults>()

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update {
                    it.copy(
                        currentUserId = user?.id,
                        readerPrism = user?.let { reader -> ReaderPrism.resolve(reader, Locale.getDefault()) }.orEmpty(),
                    )
                }
            }
        }
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
        viewModelScope.launch {
            messageSocket.conversationClosed.collect { invalidateSearchCache() }
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
                    loadState = SearchLoadState.IDLE,
                    failure = null,
                    failedPanes = emptySet(),
                )
            }
            return
        }
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            performSearch(trimmed)
        }
    }

    /**
     * Rejoue la derniere requete lancee, sans attendre le debounce — le bouton « Reessayer »
     * des etats hors ligne et erreur. Une frappe qui suit l'annule, comme toute recherche.
     */
    fun retryLastSearch() {
        val query = lastQuery
        if (query.length < MIN_QUERY_LENGTH) return
        _effects.trySend(GlobalSearchEffect.Haptic)
        searchJob?.cancel()
        searchJob = viewModelScope.launch { performSearch(query) }
    }

    private suspend fun performSearch(query: String) {
        lastQuery = query
        // Cache-first : un HIT dans la fenetre TTL ressert sans reseau ni spinner ; le
        // terme entre quand meme dans l'historique (il a bien ete « cherche »).
        val cached = queryCache.get(query, clock.nowMillis())
        recentSearchesStore.record(query)
        if (cached != null) {
            _state.update {
                it.copy(
                    loadState = SearchLoadState.LOADED,
                    hasSearched = true,
                    results = cached,
                    resultsQuery = query,
                    failure = null,
                    failedPanes = emptySet(),
                )
            }
            return
        }
        // Un spinner ne remplace JAMAIS ce qui est deja a l'ecran : LOADING = demarrage a froid.
        _state.update {
            it.copy(
                hasSearched = true,
                loadState = SearchLoadStates.starting(hasCachedHit = false, hasDisplayedResults = it.hasDisplayedResults),
            )
        }
        repository.search(query).collect { snapshot -> apply(query, snapshot) }
    }

    private fun apply(query: String, snapshot: GlobalSearchSnapshot) {
        val settled = snapshot.remoteSettled
        val failure = snapshot.firstFailure
        _state.update { current ->
            current.copy(
                results = snapshot.results,
                resultsQuery = query,
                failure = if (settled) failure else null,
                failedPanes = if (settled) failedPanesOf(snapshot) else emptySet(),
                loadState = when {
                    !settled && snapshot.hasDisplayedResults -> SearchLoadState.CACHED_STALE
                    !settled -> current.loadState
                    else -> SearchLoadStates.settled(snapshot.offline, failure, snapshot.hasDisplayedResults)
                },
            )
        }
        if (settled && failure == null && !snapshot.offline) {
            // On ne memorise QUE ce qui a abouti : le vide d'une panne ne doit pas etre ressservi.
            queryCache = queryCache.put(query, snapshot.results, clock.nowMillis())
        }
    }

    private fun failedPanesOf(snapshot: GlobalSearchSnapshot): Set<SearchPaneKind> = buildSet {
        if (snapshot.conversations.isFailed) add(SearchPaneKind.CONVERSATIONS)
        if (snapshot.users.isFailed) add(SearchPaneKind.PEOPLE)
        if (snapshot.messages.isFailed) add(SearchPaneKind.MESSAGES)
    }

    fun selectTab(tab: GlobalSearchTab) {
        _effects.trySend(GlobalSearchEffect.Haptic)
        _state.update { it.copy(selectedTab = tab) }
    }

    /** Toucher une recherche recente la relance sur-le-champ (parite iOS). */
    fun relaunchRecentSearch(query: String) {
        _effects.trySend(GlobalSearchEffect.Haptic)
        setQuery(query)
    }

    fun onResultTapped() {
        _effects.trySend(GlobalSearchEffect.Haptic)
    }

    /** Toucher un utilisateur ouvre sa fiche en feuille ; l'hote decide du rendu. */
    fun onUserTapped(userId: String) {
        _effects.trySend(GlobalSearchEffect.Haptic)
        _effects.trySend(GlobalSearchEffect.OpenUserProfile(userId))
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
        _effects.trySend(GlobalSearchEffect.Haptic)
        recentSearchesStore.remove(query)
    }

    fun clearRecentSearches() {
        _effects.trySend(GlobalSearchEffect.Haptic)
        recentSearchesStore.clear()
    }
}
