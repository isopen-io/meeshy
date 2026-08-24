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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.ImpressionBatcher
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import javax.inject.Inject

data class FeedUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = true,
    val isLoadingMore: Boolean = false,
    /** Count of posts that arrived via `post:created` since the last acknowledge/refresh. */
    val newPostsCount: Int = 0,
    /** L'id de l'utilisateur connecte — decide quel menu d'options porte chaque card. */
    val currentUserId: String? = null,
    /**
     * On-demand post translations in flight, keyed `postId|language`. Guards a
     * double-tap on a translatable flag chip from firing two requests, and lets the
     * card surface a spinner on the pending chip. Mirrors the chat composer's
     * [me.meeshy.app.chat.ChatUiState.translatingLanguages].
     */
    val translatingLanguages: Set<String> = emptySet(),
    /**
     * The fullscreen media gallery currently open (a tap on a post's image tile),
     * or `null` when the lightbox is dismissed. Ephemeral view state kept in the
     * flow so a background re-emit never tears the open viewer down.
     */
    val imageViewer: FeedGallery? = null,
    /**
     * The quote-repost composer currently open (the user chose "Quote" on a post),
     * or `null` when dismissed. Ephemeral view state kept in the flow so a background
     * re-emit never tears the half-typed commentary down. Mirrors iOS's `quotePost`
     * on the shared composer sheet.
     */
    val quoteComposer: QuoteComposerState? = null,
)

/**
 * State of the open quote-repost composer: the source post being quoted (author +
 * a content preview so the sheet renders the embed) and the commentary draft.
 */
data class QuoteComposerState(
    val postId: String,
    val sourceAuthorName: String?,
    val sourceContentPreview: String,
    val text: String = "",
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val feedMediaUploader: FeedMediaUploader,
    private val reportRepository: ReportRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    /**
     * Per-post displayed-language override (`postId -> language code`) set by a flag
     * tap. Kept outside the cache stream so the viewer's choice survives every
     * background refresh and re-projection (instant-app: no reset on re-emit).
     */
    private val activeLanguageOverride = MutableStateFlow<Map<String, String>>(emptyMap())

    /**
     * Socket-arrived posts (`post:created`) that sit above the cache-projected feed,
     * plus the "new posts" banner count. Kept outside the cache stream so a just-arrived
     * post is never erased by a background refresh (the protective realtime-head merge).
     */
    private val realtimeHead = MutableStateFlow(FeedRealtimeHead())

    /** The raw posts currently displayed — the flag-tap handler resolves against these. */
    private var latestPosts: List<ApiPost> = emptyList()

    /** The cache-projected posts alone (excludes the realtime head), kept across re-emits. */
    private var latestCachePosts: List<ApiPost> = emptyList()

    /**
     * Groups impressions before sending them (feature-parity §F). Owns its own scope rather
     * than [viewModelScope] — see [ImpressionBatcher]'s own doc for why [onCleared]'s flush
     * would otherwise race the ViewModel's own teardown.
     */
    private val impressionBatcher = ImpressionBatcher(source = "feed", postRepository = postRepository)

    /** [postId] just appeared on screen — call once per composition entry. */
    fun trackImpression(postId: String) {
        impressionBatcher.record(postId)
    }

    override fun onCleared() {
        super.onCleared()
        impressionBatcher.flushNowAsync()
    }

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
                realtimeHead,
            ) { result, user, hasMore, overrides, head -> FeedInputs(result, user, hasMore, overrides, head) }
                .collect { (result, user, hasMore, overrides, head) ->
                    val cachePosts = result.postsOrNull() ?: latestCachePosts
                    latestCachePosts = cachePosts
                    val cacheIds = cachePosts.mapTo(HashSet()) { it.id }

                    // Prune buffered posts the cache has surfaced (memory hygiene) and release
                    // like overlays the cache has caught up to; the display work below already
                    // keeps buffered posts from double-rendering.
                    val prunedHead = FeedRealtimeReducer.reconcile(head, cacheIds)
                    val reconciledLikes = FeedRealtimeReducer.reconcileLikes(prunedHead, cachePosts)
                    val reconciledBookmarks = FeedRealtimeReducer.reconcileBookmarks(reconciledLikes, cachePosts)
                    val reconciled = FeedRealtimeReducer.reconcileComments(reconciledBookmarks, cachePosts)
                    if (reconciled !== head) realtimeHead.value = reconciled

                    // Tombstoned posts (live `post:deleted`) are hidden from both the head and
                    // the cache-projected list until a refresh drops them from the cache. Live
                    // like overlays (`post:liked`/`post:unliked`) and bookmark overlays
                    // (`post:bookmarked`) override the cache count/own-state.
                    val removed = reconciled.removedIds
                    val likes = reconciled.likes
                    val bookmarks = reconciled.bookmarks
                    val comments = reconciled.comments
                    val visibleCache = cachePosts
                        .let { if (removed.isEmpty()) it else it.filterNot { p -> p.id in removed } }
                        .withLikeOverlays(likes)
                        .withBookmarkOverlays(bookmarks)
                        .withCommentOverlays(comments)
                    val visibleRealtime = reconciled.posts
                        .filterNot { it.id in cacheIds || it.id in removed }
                        .withLikeOverlays(likes)
                        .withBookmarkOverlays(bookmarks)
                        .withCommentOverlays(comments)
                    latestPosts = visibleRealtime + visibleCache
                    _state.update {
                        it.project(
                            result = result,
                            cachePosts = visibleCache,
                            realtimePosts = visibleRealtime,
                            user = user,
                            mediaBaseUrl = config.socketUrl,
                            overrides = overrides,
                            newPostsCount = reconciled.newPostsCount,
                        ).copy(hasMore = hasMore)
                    }
                }
        }
        viewModelScope.launch {
            socialSocket.postCreated.collect { payload ->
                val cacheIds = latestCachePosts.mapTo(HashSet()) { it.id }
                realtimeHead.update { FeedRealtimeReducer.accept(it, payload.post, cacheIds) }
            }
        }
        viewModelScope.launch {
            socialSocket.postDeleted.collect { payload ->
                realtimeHead.update { FeedRealtimeReducer.remove(it, payload.postId) }
            }
        }
        viewModelScope.launch {
            socialSocket.postLiked.collect { payload ->
                val mine = if (payload.userId == currentUserId()) true else null
                realtimeHead.update { FeedRealtimeReducer.like(it, payload.postId, payload.likesCount, mine) }
            }
        }
        viewModelScope.launch {
            socialSocket.postUnliked.collect { payload ->
                val mine = if (payload.userId == currentUserId()) false else null
                realtimeHead.update { FeedRealtimeReducer.like(it, payload.postId, payload.likesCount, mine) }
            }
        }
        viewModelScope.launch {
            socialSocket.postBookmarked.collect { payload ->
                realtimeHead.update {
                    FeedRealtimeReducer.bookmark(it, payload.postId, payload.bookmarkCount, payload.bookmarked)
                }
            }
        }
        viewModelScope.launch {
            socialSocket.commentAdded.collect { payload ->
                realtimeHead.update { FeedRealtimeReducer.comment(it, payload.postId, payload.commentCount) }
            }
        }
        viewModelScope.launch {
            socialSocket.commentDeleted.collect { payload ->
                realtimeHead.update { FeedRealtimeReducer.comment(it, payload.postId, payload.commentCount) }
            }
        }
        viewModelScope.launch {
            // Prisme, push side: the gateway translated a post server-side and broadcast
            // the finished entry. Fold it into the feed cache so the open card re-renders
            // in the reader's preferred language the instant it lands — the reader's own
            // resolution chain (preferences + active override) decides whether to surface
            // it, so no override is forced here (parity with iOS applyPostTranslation and
            // the story-viewer realtime merge).
            socialSocket.postTranslationUpdated.collect { payload ->
                postRepository.applyTranslationUpdate(payload.postId, payload.language, payload.translation)
            }
        }
    }

    /**
     * The signed-in user's id, or null for an anonymous session — used to tell the
     * viewer's own `post:liked`/`post:unliked` echo (flip `isLiked`) from another
     * user's like (count only). Mirrors the iOS `data.userId == currentUser.id` guard.
     */
    private fun currentUserId(): String? = sessionRepository.currentUser.value?.id

    /**
     * Tap on the "new posts" banner (scroll-to-top): clear the banner count. The posts
     * already sit at the head, so only the counter resets. Port of iOS `acknowledgeNewPosts`.
     */
    fun acknowledgeNewPosts() {
        realtimeHead.update { FeedRealtimeReducer.acknowledge(it) }
    }

    /**
     * Tap on a post's Prisme language-flag chip: switch the post's displayed
     * language, or revert to the default resolution when the chip is already active.
     * The pure [LanguageFlagTapResolver] owns the decision (SSOT with chat); here we
     * only apply it to the per-post override map. Tapping a configured-but-absent
     * language ([LanguageFlagTapResolver.Result.RequestTranslation]) translates it on
     * demand and switches to it once it lands — the same flow as a chat bubble.
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
            is LanguageFlagTapResolver.Result.RequestTranslation ->
                requestOnDemandTranslation(postId, result.targetLanguage)
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * The viewer tapped a configured language the post has no content for yet:
     * translate it on demand, then switch the card to it. The merged translation
     * arrives through the cache stream (so the strip's translatable chip becomes a
     * live content chip), and the active override points the card at it. A failed or
     * inert translation leaves the translatable chip in place to retry; a second tap
     * while the request is in flight is ignored. Mirrors the chat bubble's
     * `requestOnDemandTranslation`, keyed per post rather than per message.
     */
    private fun requestOnDemandTranslation(postId: String, targetLanguage: String) {
        val key = "$postId|$targetLanguage"
        if (key in _state.value.translatingLanguages) return
        _state.update { it.copy(translatingLanguages = it.translatingLanguages + key) }
        viewModelScope.launch {
            try {
                val stored = postRepository.requestOnDemandTranslation(postId, targetLanguage)
                if (stored) {
                    activeLanguageOverride.update { it + (postId to targetLanguage) }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                _state.update { it.copy(errorMessage = error.message) }
            } finally {
                _state.update { it.copy(translatingLanguages = it.translatingLanguages - key) }
            }
        }
    }

    /**
     * Open the fullscreen media gallery on the image at [imageIndex] of the post
     * [postId]. Resolves against the projected posts (the URLs already carry the
     * media base), so an unknown post id — or one with no image — is inert: the
     * gallery only opens when there is something to show.
     */
    fun openImageViewer(postId: String, imageIndex: Int) {
        val post = _state.value.posts.firstOrNull { it.id == postId } ?: return
        val gallery = FeedMediaGallery.of(post, imageIndex)
        _state.update { it.copy(imageViewer = gallery.takeUnless(FeedGallery::isEmpty)) }
    }

    /** Dismiss the fullscreen media gallery. */
    fun dismissImageViewer() {
        _state.update { it.copy(imageViewer = null) }
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
        realtimeHead.update { FeedRealtimeReducer.clear(it) }
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

    /**
     * Repost simple (pas de quote) puis refresh : le repost cree un POST nouveau
     * cote serveur, que seul un re-fetch peut faire apparaitre en tete de flux.
     *
     * Le [RepostCommand] resout la cible : reposter un repost vise sa RACINE, jamais
     * le partage intermediaire (sinon la nouvelle card embarque une share vide — le
     * gateway n'hydrate `repostOf` que sur un niveau). Port d'iOS `resolveRepostTargetId`.
     */
    fun repost(postId: String) {
        val command = RepostCommand.of(postId, repostOfFor(postId), quote = false, commentary = null)
        sendRepost(command)
    }

    /**
     * Ouvre le compositeur de citation pour [postId] (le repost accompagne d'un
     * commentaire). Inerte si le post n'est pas charge — rien a citer. Mirror d'iOS
     * qui presente sa feuille de composition avec `quotePost` renseigne.
     */
    fun beginQuote(postId: String) {
        val source = latestPosts.firstOrNull { it.id == postId } ?: return
        _state.update {
            it.copy(
                quoteComposer = QuoteComposerState(
                    postId = postId,
                    sourceAuthorName = (source.author?.displayName ?: source.author?.username)
                        ?.takeIf { name -> name.isNotBlank() },
                    sourceContentPreview = source.content.orEmpty().trim(),
                ),
            )
        }
    }

    fun onQuoteTextChange(text: String) {
        _state.update { s -> s.quoteComposer?.let { s.copy(quoteComposer = it.copy(text = text)) } ?: s }
    }

    fun cancelQuote() {
        _state.update { it.copy(quoteComposer = null) }
    }

    /**
     * Publie la citation : reposte la RACINE de la source avec le commentaire. Un
     * commentaire vide/blanc degrade en repost simple (surpasse iOS qui enverrait
     * `content = ""`). La feuille se ferme aussitot (parite iOS : dismiss + toast
     * d'erreur eventuel), le refresh fait remonter le nouveau post.
     */
    fun submitQuote() {
        val composer = _state.value.quoteComposer ?: return
        val command = RepostCommand.of(
            composer.postId,
            repostOfFor(composer.postId),
            quote = true,
            commentary = composer.text,
        )
        _state.update { it.copy(quoteComposer = null) }
        sendRepost(command)
    }

    private fun repostOfFor(postId: String) =
        latestPosts.firstOrNull { it.id == postId }?.repostOf

    private fun sendRepost(command: RepostCommand) {
        viewModelScope.launch {
            val result = postRepository.repost(
                command.targetId,
                content = command.content,
                isQuote = command.isQuote,
            )
            when (result) {
                is NetworkResult.Success -> postRepository.refresh()
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /**
     * Epingle un de SES PROPRES posts (feature-parity §F) — port fidele d'iOS
     * (`PostDetailViewModel.pinPost`/`ProfileUserPostsList.pinPost`), qui n'expose
     * jamais de contrepartie "unpin" dans son UI ; `PostRepository.unpinPost`
     * existe côté SDK mais reste sans appelant sur les deux plateformes, donc
     * pas branche ici. Refresh apres succes pour faire remonter `isPinned`.
     */
    fun pinPost(postId: String) {
        viewModelScope.launch {
            when (val result = postRepository.pinPost(postId)) {
                is NetworkResult.Success -> postRepository.refresh()
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /** Suppression confirmee cote UI ; le refresh retire le post du flux. */
    fun deletePost(postId: String) {
        viewModelScope.launch {
            when (val result = postRepository.delete(postId)) {
                is NetworkResult.Success -> postRepository.refresh()
                is NetworkResult.Failure -> _state.update { it.copy(errorMessage = result.error.message) }
            }
        }
    }

    /** Signale [postId] pour [reason] — best effort, echec silencieux (parite report user). */
    fun reportPost(postId: String, reason: ReportReason) {
        viewModelScope.launch {
            reportRepository.reportPost(postId, reason, details = null)
        }
    }

    /** Comptabilise un partage cote serveur — l'intent systeme part sans attendre. */
    fun recordShare(postId: String) {
        viewModelScope.launch {
            postRepository.share(postId)
        }
    }

    fun toggleBookmark(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.toggleBookmark(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /**
     * Publish a post: the pure [FeedComposerDraft]/[FeedPostPublishRequest] already
     * validated [content]/[visibility]/[mediaIds] before calling this (the publish gate
     * is that draft's SSOT, not re-checked here — mirror of
     * [StatusesViewModel.setStatus] trusting its own [StatusPublishRequest]). Port of
     * iOS `FeedViewModel.createPost`'s direct (non-durable) path: confirmed by the
     * network before the post is shown, so there is nothing to roll back on failure. A
     * blank [content] (a media-only post) is sent as `null`, never an empty string, so
     * a stricter gateway validation on the text field is never exercised for a post
     * that carries only media. A successful create is prepended to the realtime head
     * via [FeedRealtimeReducer.created] — visible at the top instantly, without raising
     * the "new posts" banner. [type] carries the reel-classification decision the pure
     * [FeedComposerDraft.postType] already resolved (`ReelComposition.defaultType`) —
     * defaulted to [PostType.POST] so any other call site is unaffected. [location]
     * carries the optional device-captured [me.meeshy.sdk.model.SharedPlace] attachment
     * the composer's location tile resolved — forwarded to the gateway verbatim,
     * `null` when no location was attached (the common case, unaffected). [language]
     * carries the composer's source-language choice ([me.meeshy.sdk.model.ComposerLanguage],
     * mirrors iOS's `composerLanguage`) — forwarded to the gateway's `originalLanguage`
     * field verbatim, `null` when the caller doesn't supply one (every other existing
     * call site is unaffected; the real composer always supplies one, see
     * `FeedComposerDraft.language`). **Deliberate, documented scope cuts**: no
     * durable-outbox queueing yet (unlike iOS's `enqueueDurableTextPost`, U1 ST3) — a
     * post typed while offline is lost rather than durably queued; a tracked follow-up
     * once Android's `OutboxKind` gains a `CREATE_POST` lane. Camera capture, file and
     * audio attachments remain separately-scoped follow-ups to this photo/video
     * sub-slice.
     */
    fun publishPost(
        content: String,
        visibility: String,
        mediaIds: List<String> = emptyList(),
        type: String = PostType.POST.name,
        location: SharedPlace? = null,
        language: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val result = postRepository.create(
                    content = content.ifBlank { null },
                    type = type,
                    visibility = visibility,
                    mediaIds = mediaIds.ifEmpty { null },
                    location = location,
                    originalLanguage = language,
                )
                when (result) {
                    is NetworkResult.Success ->
                        realtimeHead.update { FeedRealtimeReducer.created(it, result.data) }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /**
     * Uploads freshly-picked composer media as `post`-context TUS attachments — the
     * network half of the photo/video fast-follow to the text-only Feed composer,
     * consuming the TUS foundation the story-media fix built (never the legacy
     * `MessageAttachment`-producing path). A plain suspend delegate (no `_state`
     * mutation): the composer sheet owns its own upload-in-flight UI state via
     * `remember`, mirroring the story composer's split between network call and
     * caller-owned progress state, just without a ViewModel of its own for the sheet.
     */
    suspend fun uploadMedia(items: List<MediaUploadItem>): NetworkResult<List<UploadedMedia>> =
        feedMediaUploader.upload(items)

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

/** The combined inputs of the feed projection (Kotlin has no built-in Quintuple). */
private data class FeedInputs(
    val result: CacheResult<List<ApiPost>>,
    val user: MeeshyUser?,
    val hasMore: Boolean,
    val overrides: Map<String, String>,
    val head: FeedRealtimeHead,
)

/**
 * Overlay each post's live like state (absolute count + viewer-own flip) when a
 * `post:liked`/`post:unliked` overlay targets it. An absent overlay leaves the post
 * untouched; a `null` [LikeOverlay.mine] keeps the cache's `isLikedByMe` (another user's
 * like), so only the count moves. Returns the same list when no overlay applies.
 */
private fun List<ApiPost>.withLikeOverlays(likes: Map<String, LikeOverlay>): List<ApiPost> {
    if (likes.isEmpty()) return this
    return map { post ->
        val overlay = likes[post.id] ?: return@map post
        post.copy(
            likeCount = overlay.count,
            isLikedByMe = overlay.mine ?: post.isLikedByMe,
        )
    }
}

/**
 * Overlay each post's live bookmark state (absolute count + viewer-own flip) when a
 * `post:bookmarked` overlay targets it. An absent overlay leaves the post untouched.
 * Because the event is personal, both the count and `isBookmarkedByMe` are authoritative.
 * Returns the same list when no overlay applies.
 */
private fun List<ApiPost>.withBookmarkOverlays(bookmarks: Map<String, BookmarkOverlay>): List<ApiPost> {
    if (bookmarks.isEmpty()) return this
    return map { post ->
        val overlay = bookmarks[post.id] ?: return@map post
        post.copy(
            bookmarkCount = overlay.count,
            isBookmarkedByMe = overlay.mine,
        )
    }
}

/**
 * Overlay each post's live comment count (absolute) when a `comment:added`/`comment:deleted`
 * overlay targets it. An absent overlay leaves the post untouched. There is no viewer-own
 * dimension — a comment count is public. Returns the same list when no overlay applies.
 */
private fun List<ApiPost>.withCommentOverlays(comments: Map<String, Int>): List<ApiPost> {
    if (comments.isEmpty()) return this
    return map { post ->
        val overlay = comments[post.id] ?: return@map post
        post.copy(commentCount = overlay)
    }
}

/** The posts a cache result carries, or null when it holds none (keep the prior list). */
private fun CacheResult<List<ApiPost>>.postsOrNull(): List<ApiPost>? = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value
    CacheResult.Empty -> emptyList()
}

private fun List<ApiPost>.toPresentations(
    preferences: LanguageResolver.ContentLanguagePreferences,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
): List<FeedPostPresentation> =
    map { FeedPostBuilder.build(it, preferences, mediaBaseUrl, activeLanguageCode = overrides[it.id]) }

/**
 * Projects the cache result plus the real-time head into the UI state. Realtime posts
 * (already filtered to be disjoint from the cache) are prepended to the cache-projected
 * list; skeleton shows only when there is genuinely nothing to display.
 */
private fun FeedUiState.project(
    result: CacheResult<List<ApiPost>>,
    cachePosts: List<ApiPost>,
    realtimePosts: List<ApiPost>,
    user: MeeshyUser?,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
    newPostsCount: Int,
): FeedUiState {
    val prefs = user ?: EmptyContentPreferences
    val projected = realtimePosts.toPresentations(prefs, mediaBaseUrl, overrides) +
        cachePosts.toPresentations(prefs, mediaBaseUrl, overrides)
    val clearedError = if (result is CacheResult.Fresh) null else errorMessage
    val isSyncing = when (result) {
        is CacheResult.Fresh -> false
        is CacheResult.Stale -> true
        is CacheResult.Syncing -> true
        CacheResult.Empty -> false
    }
    val showSkeleton = when (result) {
        is CacheResult.Fresh, is CacheResult.Stale -> false
        is CacheResult.Syncing, CacheResult.Empty -> projected.isEmpty() && clearedError == null
    }
    return copy(
        posts = projected,
        isSyncing = isSyncing,
        showSkeleton = showSkeleton,
        errorMessage = clearedError,
        newPostsCount = newPostsCount,
        currentUserId = user?.id,
    )
}
