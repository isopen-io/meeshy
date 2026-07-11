package me.meeshy.app.feed

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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import javax.inject.Inject

data class FeedUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = true,
    val isLoadingMore: Boolean = false,
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    /**
     * Per-post displayed-language override (`postId -> language code`) set by a flag
     * tap. Kept outside the cache stream so the viewer's choice survives every
     * background refresh and re-projection (instant-app: no reset on re-emit).
     */
    private val activeLanguageOverride = MutableStateFlow<Map<String, String>>(emptyMap())

    /** The raw posts currently displayed — the flag-tap handler resolves against these. */
    private var latestPosts: List<ApiPost> = emptyList()

    init {
        viewModelScope.launch {
            combine(
                postRepository.feedStream(
                    onSyncError = { error ->
                        _state.update {
                            it.copy(errorMessage = error.message, isSyncing = false, showSkeleton = false)
                        }
                    },
                ),
                sessionRepository.currentUser,
                postRepository.feedHasMore,
                activeLanguageOverride,
            ) { result, user, hasMore, overrides -> FeedInputs(result, user, hasMore, overrides) }
                .collect { (result, user, hasMore, overrides) ->
                    latestPosts = result.postsOrNull() ?: latestPosts
                    _state.update {
                        it.applyResult(result, user, config.socketUrl, overrides).copy(hasMore = hasMore)
                    }
                }
        }
    }

    /**
     * Tap on a post's Prisme language-flag chip: switch the post's displayed
     * language, or revert to the default resolution when the chip is already active.
     * The pure [LanguageFlagTapResolver] owns the decision (SSOT with chat); here we
     * only apply it to the per-post override map. A read-only content strip never
     * surfaces a content-less language, so [LanguageFlagTapResolver.Result.RequestTranslation]
     * is inert until an on-demand post-translation path lands.
     */
    fun onPostFlagTap(postId: String, code: String) {
        val post = latestPosts.firstOrNull { it.id == postId } ?: return
        val preferences = sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = FeedPostBuilder.resolveActiveCode(post, preferences, activeLanguageOverride.value[postId]),
            originalLanguage = post.originalLanguage,
            translations = post.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate ->
                activeLanguageOverride.update { it + (postId to result.code) }
            LanguageFlagTapResolver.Result.Revert ->
                activeLanguageOverride.update { it - postId }
            is LanguageFlagTapResolver.Result.RequestTranslation -> Unit
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * Infinite-scroll trigger (port of FeedViewModel.loadMoreIfNeeded): once the
     * given post is within [LOAD_MORE_THRESHOLD] of the tail and more pages remain,
     * fetch the next page. Re-entrancy is guarded by [FeedUiState.isLoadingMore];
     * failures are swallowed so the user can simply scroll again.
     */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        if (!current.hasMore || current.isLoadingMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                postRepository.loadMore()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true) }
        viewModelScope.launch {
            try {
                postRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message, isSyncing = false) }
            }
        }
    }

    fun toggleLike(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.toggleLike(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

/** The 4 combined inputs of the feed projection (Kotlin has no built-in Quadruple). */
private data class FeedInputs(
    val result: CacheResult<List<ApiPost>>,
    val user: MeeshyUser?,
    val hasMore: Boolean,
    val overrides: Map<String, String>,
)

/** The posts a cache result carries, or null when it holds none (keep the prior list). */
private fun CacheResult<List<ApiPost>>.postsOrNull(): List<ApiPost>? = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value
    CacheResult.Empty -> emptyList()
}

private fun Map<String, ApiPostTranslationEntry>?.toTranslationRows():
    List<LanguageResolver.TranslationLike> =
    this?.map { (code, entry) -> PostTranslationRow(code, entry.text) }.orEmpty()

private data class PostTranslationRow(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

private fun List<ApiPost>.toPresentations(
    preferences: LanguageResolver.ContentLanguagePreferences,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
): List<FeedPostPresentation> =
    map { FeedPostBuilder.build(it, preferences, mediaBaseUrl, activeLanguageCode = overrides[it.id]) }

private fun FeedUiState.applyResult(
    result: CacheResult<List<ApiPost>>,
    user: MeeshyUser?,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
): FeedUiState {
    val prefs = user ?: EmptyContentPreferences
    return when (result) {
        is CacheResult.Fresh -> copy(
            posts = result.value.toPresentations(prefs, mediaBaseUrl, overrides),
            isSyncing = false,
            showSkeleton = false,
            errorMessage = null,
        )
        is CacheResult.Stale -> copy(
            posts = result.value.toPresentations(prefs, mediaBaseUrl, overrides),
            isSyncing = true,
            showSkeleton = false,
        )
        is CacheResult.Syncing -> copy(
            posts = result.value?.toPresentations(prefs, mediaBaseUrl, overrides) ?: posts,
            isSyncing = true,
            showSkeleton = result.value == null && posts.isEmpty() && errorMessage == null,
        )
        CacheResult.Empty -> copy(
            posts = emptyList(),
            isSyncing = false,
            showSkeleton = errorMessage == null,
        )
    }
}

private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
