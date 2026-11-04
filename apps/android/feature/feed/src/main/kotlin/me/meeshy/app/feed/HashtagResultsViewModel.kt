package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostHashtagRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class HashtagResultsUiState(
    val tag: String = "",
    val posts: List<FeedPostPresentation> = emptyList(),
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    /** L'échec d'un premier chargement sans rien à montrer : l'écran offre « Réessayer ». */
    val loadFailed: Boolean = false,
    val errorMessage: String? = null,
    /** Le compositeur de citation ouvert par « Citer » (#12234) ; `null` quand il est fermé. */
    val quoteComposer: QuoteComposerState? = null,
    /** L'issue d'un repartage, dite une fois puis consommée. */
    val notice: FeedNotice? = null,
)

/**
 * Les résultats d'un hashtag — port de `HashtagResultsViewModel` d'iOS. Cache-first : la
 * première page déjà vue s'affiche à l'ouverture (jamais de squelette dessus) et se
 * revalide en silence. Le texte de chaque post descend le Prisme par [FeedPostBuilder],
 * comme le fil. Les gestes des cartes sont ceux du fil ([ListedPostActions]) : au geste, rendus si le serveur refuse.
 */
@HiltViewModel
class HashtagResultsViewModel @Inject constructor(
    private val hashtags: PostHashtagRepository,
    private val postRepository: PostRepository,
    reports: ReportRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val tag: String = (savedStateHandle[TAG_ARG] ?: "").removePrefix("#").trim().lowercase()

    private val listState = MutableStateFlow(
        hashtags.cachedFirstPage(tag)?.let { PostPageListState().foldPage(it) } ?: PostPageListState(),
    )
    private val status = MutableStateFlow(HashtagStatus())

    private val _state = MutableStateFlow(HashtagResultsUiState(tag = tag))
    val state: StateFlow<HashtagResultsUiState> = _state.asStateFlow()

    /** Les gestes du fil sur les résultats (#13244 ; Repartager / Citer : iOS `HashtagResultsViewModel.toggleRepost`, #15934). */
    private val actions = ListedPostActions(viewModelScope, postRepository, reports, listState) { sessionRepository.currentUser.value }

    /** Ce que font les cartes des résultats : les gestes du fil, chacun câblé ([ListedPostCardActions]). */
    val cards: ListedPostCardActions get() = actions

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status, actions.state) { list, user, st, gestures ->
                project(list, user, st, gestures)
            }.collect { projected -> _state.value = projected }
        }
        revalidate(refreshing = false)
    }

    fun refresh() = revalidate(refreshing = true)

    fun retry() = revalidate(refreshing = false)

    private fun revalidate(refreshing: Boolean) {
        if (tag.isBlank() || status.value.isFetching) return
        status.update { it.copy(isFetching = true, isRefreshing = refreshing, error = null) }
        viewModelScope.launch {
            try {
                when (val result = hashtags.posts(tag, cursor = null)) {
                    is NetworkResult.Success -> listState.value = PostPageListState().foldPage(result.data)
                    is NetworkResult.Failure -> status.update { it.copy(error = result.error.message ?: "") }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(error = e.message ?: "") }
            } finally {
                status.update { it.copy(isFetching = false, isRefreshing = false) }
            }
        }
    }

    /** Défilement infini : à moins de [LOAD_MORE_THRESHOLD] cartes de la fin, la page suivante. */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore || status.value.isFetching) return

        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = hashtags.posts(tag, cursor = list.cursor)) {
                    is NetworkResult.Success -> listState.update { it.foldPage(result.data) }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Une page perdue n'est pas la fin de la liste : le prochain défilement la redemande.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    private fun project(list: PostPageListState, user: MeeshyUser?, st: HashtagStatus, gestures: ListedPostCardsState): HashtagResultsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map {
            FeedPostBuilder.build(it, prefs, config.apiBaseUrl, gestures.languageOverrides[it.id], currentUserId = user?.id)
        }
        val cold = projected.isEmpty() && !list.hasLoaded
        return HashtagResultsUiState(
            tag = tag,
            posts = projected,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = cold && st.isFetching && st.error == null,
            loadFailed = cold && !st.isFetching && st.error != null,
            errorMessage = st.error?.takeIf { it.isNotEmpty() && !cold },
            quoteComposer = gestures.quoteComposer,
            notice = gestures.notice,
        )
    }

    companion object {
        const val TAG_ARG = "tag"
        private const val LOAD_MORE_THRESHOLD = 5
    }
}

private data class HashtagStatus(
    val isFetching: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
