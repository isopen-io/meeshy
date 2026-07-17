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
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import javax.inject.Inject

/**
 * A single post opened full-screen from the feed — the Android take on iOS `PostDetailView`.
 * Fetches the post by id, projects it through the shared [FeedPostBuilder] so the Prisme
 * language resolution matches the feed exactly, and lets the reader switch the displayed
 * language via the same per-post flag-tap rule the feed uses (SSOT with the chat bubble).
 *
 * There is no per-post cache yet, so a cold open shows a skeleton until the fetch answers;
 * a blank id (a malformed route) is surfaced as not-found rather than an endless spinner.
 * Threaded comments and the post-detail realtime room are deliberately out of this slice.
 */
data class PostDetailUiState(
    val post: FeedPostPresentation? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val notFound: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val postId: String = savedStateHandle[POST_ID_ARG] ?: ""

    private val rawPost = MutableStateFlow<ApiPost?>(null)
    private val activeCode = MutableStateFlow<String?>(null)
    private val status = MutableStateFlow(PostDetailStatus())

    private val _state = MutableStateFlow(PostDetailUiState())
    val state: StateFlow<PostDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(rawPost, sessionRepository.currentUser, activeCode, status) { post, user, active, st ->
                project(post, user, active, st)
            }.collect { projected -> _state.value = projected }
        }
        loadInitial()
    }

    /**
     * First load. Guarded so a re-entrant call while a fetch is in flight or after the post
     * has already loaded is a no-op — [refresh] forces a reload. A blank [postId] (a malformed
     * route) is surfaced as not-found and never hits the network.
     */
    fun loadInitial() {
        if (postId.isBlank()) {
            status.update { it.copy(notFound = true) }
            return
        }
        if (status.value.isLoading || status.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetch()
    }

    /** Pull-to-refresh: re-fetch the post, keeping the current one visible meanwhile. */
    fun refresh() {
        if (postId.isBlank()) return
        status.update { it.copy(isRefreshing = true, error = null) }
        fetch()
    }

    private fun fetch() {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getPost(postId)) {
                    is NetworkResult.Success -> {
                        rawPost.value = result.data
                        status.update {
                            it.copy(isLoading = false, isRefreshing = false, hasLoaded = true, error = null)
                        }
                    }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isLoading = false, isRefreshing = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    /**
     * Tap on the post's Prisme language-flag chip: switch the displayed language, or revert to
     * the default resolution when the chip is already active. Inert until the post has loaded,
     * and inert for a content-less language (a read-only strip never surfaces one). The pure
     * [LanguageFlagTapResolver] owns the decision — one rule shared with the feed and chat.
     */
    fun onFlagTap(code: String) {
        val post = rawPost.value ?: return
        val preferences: LanguageResolver.ContentLanguagePreferences =
            sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = FeedPostBuilder.resolveActiveCode(post, preferences, activeCode.value),
            originalLanguage = post.originalLanguage,
            translations = post.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate -> activeCode.value = result.code
            LanguageFlagTapResolver.Result.Revert -> activeCode.value = null
            is LanguageFlagTapResolver.Result.RequestTranslation -> Unit
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    private fun project(
        post: ApiPost?,
        user: MeeshyUser?,
        active: String?,
        st: PostDetailStatus,
    ): PostDetailUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = post?.let {
            FeedPostBuilder.build(it, prefs, config.socketUrl, activeLanguageCode = active)
        }
        val showSkeleton = st.isLoading && post == null && !st.notFound && st.error == null
        return PostDetailUiState(
            post = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            showSkeleton = showSkeleton,
            notFound = st.notFound,
            errorMessage = st.error,
        )
    }

    companion object {
        const val POST_ID_ARG = "postId"
    }
}

private data class PostDetailStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasLoaded: Boolean = false,
    val notFound: Boolean = false,
    val error: String? = null,
)
