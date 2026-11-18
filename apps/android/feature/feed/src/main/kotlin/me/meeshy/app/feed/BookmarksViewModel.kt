package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostEngagementPatch
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import javax.inject.Inject

/**
 * The saved-posts (bookmarked) feed — port of iOS `BookmarksViewModel`. Loads the
 * signed-in user's bookmarks cursor-page by cursor-page, projects each post through
 * the shared [FeedPostBuilder] (so the Prisme language resolution matches the main
 * feed), and un-bookmarks optimistically with rollback on failure.
 *
 * The list is the pure [BookmarksListState]; this ViewModel is the orchestration
 * layer (when to fetch, when to roll back). The first page is served from the disk copy
 * ([UserPostsCacheRepository.cachedBookmarks], #19426) before the network: no skeleton
 * on a non-empty cache, a stale copy is revalidated silently and replaced by the first
 * page, and every change of the list (page, un-save, rollback) is written back — under the account the list was
 * loaded for ([listTicket]), never whoever is signed in when the write lands. The open list follows the live post
 * events the disk copy already takes (`PostEngagementBinding`): otherwise its next write would hand back to the disk a
 * post deleted or un-saved elsewhere, and the counts it had before.
 */
data class BookmarksUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val hasMore: Boolean = true,
    val errorMessage: String? = null,
    /** Le compositeur de citation ouvert par « Citer » (#12234) ; `null` quand il est fermé. */
    val quoteComposer: QuoteComposerState? = null,
    /** L'issue d'un repartage, dite une fois puis consommée. */
    val notice: FeedNotice? = null,
)

@HiltViewModel
class BookmarksViewModel @Inject constructor(
    private val postRepository: PostRepository,
    reports: ReportRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    socialSocket: SocialSocketManager,
    private val cache: UserPostsCacheRepository,
) : ViewModel() {

    private val listState = MutableStateFlow(BookmarksListState())
    private val status = MutableStateFlow(BookmarksStatus())

    /** The account the list on screen was read or fetched for: the fence refuses its writes once that account closed. */
    private var listTicket: AccountTicket? = null

    /**
     * A post was saved elsewhere that the list on screen does not hold: the list is no longer the whole of the saved
     * posts, so it stops writing to the disk (whose copy the binding has made revalidate) until a first page answers.
     */
    private var behindServer = false

    private val _state = MutableStateFlow(BookmarksUiState())
    val state: StateFlow<BookmarksUiState> = _state.asStateFlow()

    /** Les gestes du fil sur les favoris (#13244 ; Repartager / Citer : iOS `BookmarksViewModel.toggleRepost`, #15934). */
    private val actions = ListedPostActions(viewModelScope, postRepository, reports, listState, socialSocket.listedPostTranslations()) { sessionRepository.currentUser.value }

    /**
     * Ce que font les cartes des favoris — ceux du fil, sauf « Enregistrer » : une carte des favoris EST enregistrée, la
     * toucher retire le favori et la carte quitte la liste (iOS `BookmarksView` : `onBookmark` → `removeBookmark`).
     */
    val cards: ListedPostCardActions = object : ListedPostCardActions by actions {
        override fun toggleBookmark(postId: String) = removeBookmark(postId)
    }

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status, actions.state) { list, user, st, gestures ->
                project(list, user, st, gestures)
            }.collect { projected -> _state.value = projected }
        }
        followLive(socialSocket)
        loadInitial()
    }

    private fun followLive(socket: SocialSocketManager) {
        viewModelScope.launch {
            socket.postBookmarked.collect { e ->
                if (e.bookmarked && listState.value.posts.none { it.id == e.postId }) behindServer = true
            }
        }
        follow(socket.postDeleted) { list, e -> list.removed(e.postId) }
        follow(socket.postBookmarked) { list, e ->
            if (e.bookmarked) list.patched(e.postId) { PostEngagementPatch.bookmarked(it, true, e.bookmarkCount) } else list.removed(e.postId)
        }
        follow(socket.postLiked) { list, e -> list.patched(e.postId) { PostEngagementPatch.liked(it, e.likesCount, mine(e.userId, true)) } }
        follow(socket.postUnliked) { list, e -> list.patched(e.postId) { PostEngagementPatch.liked(it, e.likesCount, mine(e.userId, false)) } }
        follow(socket.commentAdded) { list, e -> list.patched(e.postId) { PostEngagementPatch.commented(it, e.commentCount) } }
        follow(socket.commentDeleted) { list, e -> list.patched(e.postId) { PostEngagementPatch.commented(it, e.commentCount) } }
    }

    /** The heart follows only the viewer's own gesture; anyone's moves the count (same law as `PostEngagementBinding`). */
    private fun mine(actorId: String, liked: Boolean): Boolean? =
        liked.takeIf { actorId.isNotBlank() && actorId == sessionRepository.currentUser.value?.id }

    private fun <E> follow(events: Flow<E>, fold: (BookmarksListState, E) -> BookmarksListState) {
        viewModelScope.launch {
            events.collect { event ->
                try {
                    listState.update { fold(it, event) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Un événement illisible est ignoré : la collecte continue.
                }
            }
        }
    }

    private suspend fun cachedCopy(): CacheResult<UserPostsSnapshot> = try {
        cache.cachedBookmarks()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        CacheResult.Empty
    }

    private suspend fun persistCurrent() {
        val list = listState.value
        if (!list.hasLoaded || behindServer) return
        try {
            cache.persistBookmarks(UserPostsSnapshot(list.posts, list.cursor, list.hasMore), listTicket)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Le disque est un confort : une écriture manquée ne change rien à l'écran.
        }
    }

    /**
     * First page. Guarded so a re-entrant call (e.g. an `onAppear` re-fire) while a
     * load is in flight or after the list has already loaded is a no-op — [refresh]
     * is the way to force a reload.
     */
    fun loadInitial() {
        if (status.value.isLoading || listState.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val ticket = cache.ticket()
            val held = cachedCopy()
            val snapshot = when (held) {
                is CacheResult.Fresh -> held.value
                is CacheResult.Stale -> held.value
                is CacheResult.Syncing -> held.value
                CacheResult.Empty -> null
            }
            if (snapshot != null) {
                listTicket = ticket
                listState.value = BookmarksListState(snapshot.posts, snapshot.nextCursor, snapshot.hasMore, hasLoaded = true)
                status.update { it.copy(isLoading = false) }
            }
            if (held is CacheResult.Fresh) return@launch
            fetchFirstPage(replacing = snapshot != null)
        }
    }

    /**
     * Pull-to-refresh: reset the accumulation to a cold list and re-fetch the first
     * page. Mirrors iOS `refresh()` (invalidate + reload).
     */
    fun refresh() {
        listState.value = BookmarksListState()
        status.update { it.copy(isRefreshing = true, error = null) }
        viewModelScope.launch { fetchFirstPage(replacing = false) }
    }

    /** [replacing] : une copie du disque est déjà peinte — la page l'écrase, et un échec ne dit rien. */
    private suspend fun fetchFirstPage(replacing: Boolean) {
        try {
            val ticket = cache.ticket()
            when (val result = postRepository.getBookmarksPage(cursor = null)) {
                is NetworkResult.Success -> {
                    listTicket = ticket
                    behindServer = false
                    listState.update { (if (replacing) BookmarksListState() else it).foldPage(result.data) }
                    status.update { it.copy(isLoading = false, isRefreshing = false) }
                    persistCurrent()
                }
                is NetworkResult.Failure -> failFirstPage(replacing, result.error.message)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failFirstPage(replacing, e.message)
        }
    }

    private fun failFirstPage(replacing: Boolean, message: String?) =
        status.update { it.copy(isLoading = false, isRefreshing = false, error = message.takeUnless { replacing }) }

    /**
     * Infinite scroll: once the given post is within [LOAD_MORE_THRESHOLD] of the tail
     * and the pure state says a page can still be fetched, load it. Re-entrancy is
     * guarded by [BookmarksStatus.isLoadingMore]; a failed page is silent (the next
     * scroll re-triggers), matching the feed.
     */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore) return

        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.getBookmarksPage(cursor = list.cursor)) {
                    is NetworkResult.Success -> {
                        listState.update { it.foldPage(result.data) }
                        persistCurrent()
                    }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /**
     * Optimistic un-bookmark: drop the post from the list instantly, persist, and
     * restore the pre-removal snapshot on failure. Port of iOS `removeBookmark`.
     * Inert when the post is not currently in the list.
     */
    fun removeBookmark(postId: String) {
        val before = listState.value
        val removed = before.posts.firstOrNull { it.id == postId } ?: return
        listState.update { it.removed(postId) }
        viewModelScope.launch {
            persistCurrent()
            val refusal = try {
                when (val result = postRepository.removeBookmark(postId)) {
                    is NetworkResult.Failure -> Refused(result.error.message)
                    is NetworkResult.Success -> null
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Refused(e.message)
            }
            if (refusal == null) return@launch
            listState.update { it.restoredAfter(removed, before) }
            status.update { it.copy(error = refusal.message) }
            persistCurrent()
        }
    }

    private data class Refused(val message: String?)

    /**
     * A refused un-save: [removed] goes back after the posts that preceded it in [before] and are still listed — never
     * the whole earlier list, which would bring back a post deleted or un-saved live in the meantime.
     */
    private fun BookmarksListState.restoredAfter(removed: ApiPost, before: BookmarksListState): BookmarksListState {
        val listed = posts.mapTo(HashSet()) { it.id }
        val at = before.posts.takeWhile { it.id != removed.id }.count { it.id in listed }
        return restored(removed, at)
    }

    private fun project(
        list: BookmarksListState,
        user: MeeshyUser?,
        st: BookmarksStatus,
        gestures: ListedPostCardsState,
    ): BookmarksUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map {
            FeedPostBuilder.build(it, prefs, config.apiBaseUrl, gestures.languageOverrides[it.id], currentUserId = user?.id)
                .copy(isBookmarked = true)
        }
        val showSkeleton = st.isLoading && !list.hasLoaded && projected.isEmpty() && st.error == null
        return BookmarksUiState(
            posts = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            hasMore = list.hasMore,
            errorMessage = st.error,
            quoteComposer = gestures.quoteComposer,
            notice = gestures.notice,
        )
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

private data class BookmarksStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
