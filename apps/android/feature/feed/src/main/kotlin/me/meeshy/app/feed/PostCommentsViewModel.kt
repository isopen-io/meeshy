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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import javax.inject.Inject

/**
 * The comment thread beneath a post opened full-screen — the Android take on the iOS
 * post-detail comments. Loads the first page, cursor-pages by the last comment's id,
 * and sends a new comment **optimistically**: the row appears instantly (Instant-App
 * feedback) and is either confirmed with the server row or rolled back on failure.
 *
 * Prisme parity with the feed: each comment's displayed content follows
 * [CommentProjection], so a francophone reader sees comments in French exactly as the
 * post itself. Replies (`getCommentReplies`) and comment likes are a later slice.
 */
data class PostCommentsUiState(
    val comments: List<CommentPresentation> = emptyList(),
    val replyThreads: Map<String, ReplyThreadUiState> = emptyMap(),
    val replyTarget: ReplyTarget? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val isSubmitting: Boolean = false,
    val canLoadMore: Boolean = false,
    val isEmpty: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * The projected reply thread beneath one top-level comment. When [isExpanded] the full loaded
 * list is shown; when [isPreview] (loaded but collapsed — auto-preloaded, or a manually-collapsed
 * thread falling back to its taste) only the first replies are shown, with [hiddenReplyCount]
 * more available behind a "View all" affordance.
 */
data class ReplyThreadUiState(
    val isExpanded: Boolean,
    val isLoading: Boolean,
    val replies: List<CommentPresentation>,
    val isPreview: Boolean = false,
    val hiddenReplyCount: Int = 0,
)

/**
 * The composer's active reply context: the *root* [parentId] the reply attaches to (flat
 * 2-level threading) and the targeted comment's [authorName] for the "Replying to …" chip.
 */
data class ReplyTarget(
    val parentId: String,
    val authorName: String?,
)

@HiltViewModel
class PostCommentsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val postId: String = savedStateHandle[POST_ID_ARG] ?: ""

    private val thread = MutableStateFlow(CommentThreadState())
    private val status = MutableStateFlow(Status())
    private val likes = MutableStateFlow(CommentLikeState())
    private val replies = MutableStateFlow(CommentRepliesState())
    private val composer = MutableStateFlow<ReplyTarget?>(null)
    private var pendingSeq = 0

    private val _state = MutableStateFlow(PostCommentsUiState())
    val state: StateFlow<PostCommentsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(thread, sessionRepository.currentUser, status, likes, replies) { t, user, st, likeState, replyState ->
                ProjectionInputs(t, user, st, likeState, replyState)
            }.combine(composer) { inputs, replyTarget ->
                project(inputs, replyTarget)
            }.collect { projected -> _state.value = projected }
        }
        observeRealtime()
        loadInitial()
    }

    /**
     * The post-detail realtime room: a live `comment:added` for the open post lands in the thread
     * without a refresh (Instant-App). A top-level comment prepends; a reply prepends into its
     * already-visible thread and bumps the parent's reply-count. A blank route [postId] never
     * subscribes, and events for any other post are ignored. Mirror of iOS
     * `PostDetailViewModel.subscribeToSocket` (`commentAdded` sink filtered to `postId`).
     */
    private fun observeRealtime() {
        if (postId.isBlank()) return
        viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                if (event.postId != postId) return@collect
                onCommentAdded(event.comment)
            }
        }
    }

    private fun onCommentAdded(comment: ApiPostComment) {
        val parentId = comment.parentId?.takeIf { it.isNotBlank() }
        if (parentId == null) {
            thread.update { it.received(comment) }
        } else {
            replies.update { it.receivedReply(parentId, comment) }
            thread.update { it.bumpReplyCount(parentId, 1) }
        }
        likes.update { it.seeded(listOf(comment), HEART_EMOJI) }
    }

    /**
     * First page. A blank [postId] (a malformed route) settles to the empty state without
     * a network call; otherwise guarded so a re-entrant call after the load is a no-op.
     */
    fun loadInitial() {
        if (postId.isBlank()) {
            thread.update { it.copy(hasLoaded = true) }
            return
        }
        if (status.value.isLoading || thread.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetch(cursor = null, loadingMore = false)
    }

    /** Fetch the next page — inert when there is no next page or a fetch is already in flight. */
    fun loadMore() {
        if (status.value.isLoadingMore || !thread.value.canLoadMore) return
        status.update { it.copy(isLoadingMore = true, error = null) }
        fetch(cursor = thread.value.cursor, loadingMore = true)
    }

    private fun fetch(cursor: String?, loadingMore: Boolean) {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getComments(postId, cursor, PAGE_SIZE)) {
                    is NetworkResult.Success -> {
                        val page = result.data
                        val more = page.size >= PAGE_SIZE
                        val nextCursor = if (more) page.lastOrNull()?.id else null
                        thread.update { it.appended(page, nextCursor, more) }
                        likes.update { it.seeded(page, HEART_EMOJI) }
                        status.update { it.copy(isLoading = false, isLoadingMore = false, error = null) }
                        preloadReplyPreviews()
                    }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isLoading = false, isLoadingMore = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isLoadingMore = false, error = e.message) }
            }
        }
    }

    /**
     * Send from the composer. Trimmed-blank content, a blank post id, or a send already in
     * flight are inert. When a [ReplyTarget] is active the text is posted as a reply under its
     * parent; otherwise as a top-level comment. Either way the row appears optimistically for
     * instant feedback, then confirmed with the server row or rolled back if the send fails.
     */
    fun submit(text: String) {
        val content = text.trim()
        if (content.isEmpty() || postId.isBlank() || status.value.isSubmitting) return
        composer.value?.let { target ->
            sendReply(target.parentId, content)
            return
        }
        val tempId = "pending-${pendingSeq++}"
        thread.update { it.optimistic(optimisticRow(tempId, content)) }
        status.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.addComment(postId, content)) {
                    is NetworkResult.Success -> {
                        thread.update { it.confirmed(tempId, result.data) }
                        status.update { it.copy(isSubmitting = false, error = null) }
                    }
                    is NetworkResult.Failure -> {
                        thread.update { it.failed(tempId) }
                        status.update { it.copy(isSubmitting = false, error = result.error.message) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                thread.update { it.failed(tempId) }
                status.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }

    /**
     * Aim the composer at [commentId]. Replying to a reply attaches to the *root* parent
     * (flat 2-level threading, mirror of iOS `sendReply`), and the parent's thread is opened
     * and loaded so the viewer sees the context their reply lands in. A blank post/comment id
     * is inert.
     */
    fun beginReply(commentId: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        val comment = findComment(commentId)
        val parentId = comment?.parentId?.takeIf { it.isNotBlank() } ?: commentId
        val name = comment?.author?.let { it.displayName ?: it.username }?.takeIf { it.isNotBlank() }
        composer.value = ReplyTarget(parentId, name)
        ensureThreadLoaded(parentId)
    }

    /** Drop the active reply target — the composer returns to posting a top-level comment. */
    fun cancelReply() {
        composer.value = null
    }

    private fun sendReply(parentId: String, content: String) {
        val tempId = "pending-${pendingSeq++}"
        val row = optimisticRow(tempId, content).copy(parentId = parentId)
        replies.update { it.optimisticReply(parentId, row) }
        thread.update { it.bumpReplyCount(parentId, 1) }
        composer.value = null
        status.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.addComment(postId, content, parentId)) {
                    is NetworkResult.Success -> {
                        replies.update { it.confirmedReply(parentId, tempId, result.data) }
                        status.update { it.copy(isSubmitting = false, error = null) }
                    }
                    is NetworkResult.Failure -> {
                        replies.update { it.failedReply(parentId, tempId) }
                        thread.update { it.bumpReplyCount(parentId, -1) }
                        status.update { it.copy(isSubmitting = false, error = result.error.message) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                replies.update { it.failedReply(parentId, tempId) }
                thread.update { it.bumpReplyCount(parentId, -1) }
                status.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }

    private fun findComment(id: String): ApiPostComment? =
        thread.value.comments.firstOrNull { it.id == id }
            ?: replies.value.repliesByParent.values.flatten().firstOrNull { it.id == id }

    private fun ensureThreadLoaded(parentId: String) {
        if (replies.value.isExpanded(parentId)) return
        replies.update { it.expanded(parentId) }
        val began = replies.value.beginLoad(parentId) ?: return
        replies.value = began
        fetchReplies(parentId)
    }

    /**
     * Like/unlike a comment optimistically: the heart flips and the count moves instantly
     * (Instant-App feedback), then the matching endpoint confirms it or a failure rolls it
     * back. A blank post/comment id or a toggle already in flight for the same comment is
     * inert — [CommentLikeState.beginToggle] returns `null` on the re-entrancy guard.
     */
    fun toggleLike(commentId: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        val wasLiked = likes.value.isLiked(commentId)
        val began = likes.value.beginToggle(commentId) ?: return
        likes.value = began
        viewModelScope.launch {
            try {
                val result =
                    if (wasLiked) postRepository.unlikeComment(postId, commentId)
                    else postRepository.likeComment(postId, commentId)
                when (result) {
                    is NetworkResult.Success -> likes.update { it.settle(commentId) }
                    is NetworkResult.Failure -> likes.update { it.rollback(commentId) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                likes.update { it.rollback(commentId) }
            }
        }
    }

    /**
     * Expand or collapse the reply thread beneath a top-level comment. Expanding fetches
     * its replies once (cache-first on re-expand — a loaded thread is never refetched);
     * a fetch failure collapses the thread. A blank post/comment id is inert.
     */
    fun toggleReplies(commentId: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        if (replies.value.isExpanded(commentId)) {
            replies.update { it.collapsed(commentId) }
            return
        }
        replies.update { it.expanded(commentId) }
        val began = replies.value.beginLoad(commentId) ?: return
        replies.value = began
        fetchReplies(commentId)
    }

    /**
     * Auto-preload the reply previews of the first top-level comments that have replies, so a
     * taste of each thread shows *without a tap* (Instant-App, mirror of iOS `preloadReplyPreviews`).
     * Bounded to the first [PREVIEW_PRELOAD_LIMIT] comments-with-replies and idempotent — a thread
     * already loaded or in flight is never refetched, so re-running after a page load is a no-op.
     * Fetches run in the background (each [fetchReplies] launches its own coroutine); the thread
     * stays collapsed until the viewer expands it, so this never blocks the comment list.
     */
    private fun preloadReplyPreviews() {
        val candidates = thread.value.comments
            .filter { it.parentId.isNullOrBlank() && (it.replyCount ?: 0) > 0 }
            .map { it.id }
        val targets = replies.value.previewTargets(candidates, PREVIEW_PRELOAD_LIMIT)
        if (targets.isEmpty()) return
        replies.update { it.beginLoadAll(targets) }
        targets.forEach { fetchReplies(it) }
    }

    private fun fetchReplies(commentId: String) {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getCommentReplies(postId, commentId, null, PAGE_SIZE)) {
                    is NetworkResult.Success -> {
                        replies.update { it.loaded(commentId, result.data) }
                        likes.update { it.seeded(result.data, HEART_EMOJI) }
                    }
                    is NetworkResult.Failure -> replies.update { it.failed(commentId) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                replies.update { it.failed(commentId) }
            }
        }
    }

    private fun optimisticRow(tempId: String, content: String): ApiPostComment {
        val me = sessionRepository.currentUser.value
        return ApiPostComment(
            id = tempId,
            content = content,
            author = me?.let { ApiAuthor(id = it.id, username = it.username, displayName = it.displayName, avatar = it.avatar) },
        )
    }

    private fun project(inputs: ProjectionInputs, replyTarget: ReplyTarget?): PostCommentsUiState {
        val thread = inputs.thread
        val st = inputs.status
        val likeState = inputs.likes
        val replyState = inputs.replies
        val prefs: LanguageResolver.ContentLanguagePreferences = inputs.user ?: EmptyContentPreferences
        val topLevel = thread.comments.filter { it.parentId.isNullOrBlank() }
        val rows = topLevel.map {
            CommentProjection.build(
                it,
                prefs,
                config.socketUrl,
                isPending = it.id in thread.pendingIds,
                likeState = likeState,
            )
        }
        val replyThreads = topLevel
            .filter { replyState.isExpanded(it.id) || replyState.isLoaded(it.id) }
            .associate { comment ->
                val expanded = replyState.isExpanded(comment.id)
                val all = replyState.repliesFor(comment.id)
                val shown = if (expanded) all else all.take(PREVIEW_REPLY_LIMIT)
                comment.id to ReplyThreadUiState(
                    isExpanded = expanded,
                    isLoading = replyState.isLoading(comment.id),
                    replies = shown.map {
                        CommentProjection.build(
                            it,
                            prefs,
                            config.socketUrl,
                            isPending = replyState.isPendingReply(it.id),
                            likeState = likeState,
                        )
                    },
                    isPreview = !expanded && shown.isNotEmpty(),
                    hiddenReplyCount = (all.size - shown.size).coerceAtLeast(0),
                )
            }
        val showSkeleton = st.isLoading && !thread.hasLoaded && thread.comments.isEmpty() && st.error == null
        return PostCommentsUiState(
            comments = rows,
            replyThreads = replyThreads,
            replyTarget = replyTarget,
            isLoading = st.isLoading,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            isSubmitting = st.isSubmitting,
            canLoadMore = thread.canLoadMore,
            isEmpty = thread.hasLoaded && thread.comments.isEmpty(),
            errorMessage = st.error,
        )
    }

    companion object {
        const val POST_ID_ARG = "postId"
        private const val PAGE_SIZE = 20
        private const val HEART_EMOJI = "❤️"

        /** Replies shown in a collapsed preview before the viewer taps "View all". */
        private const val PREVIEW_REPLY_LIMIT = 2

        /** Top-level comments whose replies auto-preload (mirror of iOS `prefix(5)`). */
        private const val PREVIEW_PRELOAD_LIMIT = 5
    }
}

private data class Status(
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/** The five reactive inputs folded into the projection, threaded past the 5-arg `combine` cap. */
private data class ProjectionInputs(
    val thread: CommentThreadState,
    val user: MeeshyUser?,
    val status: Status,
    val likes: CommentLikeState,
    val replies: CommentRepliesState,
)
