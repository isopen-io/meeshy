package me.meeshy.app.feed

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.CommentLikeState
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.sdk.model.CommentSendGate
import me.meeshy.sdk.model.CommentReactionLaw
import me.meeshy.sdk.model.mediaRewritten
import me.meeshy.sdk.model.mergedFirstPage
import me.meeshy.sdk.model.reactionAggregated
import me.meeshy.sdk.model.aggregated
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.mention.MentionContacts
import me.meeshy.sdk.mention.MentionLookupDriver
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.card.PostCommentCardComposition
import me.meeshy.sdk.model.card.PostCommentCardLabels
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.ComposerLanguageState
import me.meeshy.sdk.model.CommentEffects
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostTranslationMerge
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.model.comment.echoReconciled
import me.meeshy.sdk.model.comment.echoReconciledReply
import me.meeshy.sdk.model.comment.isOwnQueuedEcho
import me.meeshy.sdk.post.CommentDraftStore
import me.meeshy.sdk.post.CommentQuotationStore
import me.meeshy.sdk.post.UnsentComments
import me.meeshy.sdk.post.CommentGestureQueue
import me.meeshy.sdk.post.CommentGestureRollback
import me.meeshy.sdk.post.CommentHeartTransport
import me.meeshy.sdk.post.PostCommentsEngine
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UnsentCommentStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
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
    val mentionDisplayNames: Map<String, String> = emptyMap(),
    val draft: String = "",
    val mention: MentionAutocompleteState = MentionAutocompleteState(),
    val replyTarget: ReplyTarget? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val isSubmitting: Boolean = false,
    val canLoadMore: Boolean = false,
    val isEmpty: Boolean = false,
    val errorMessage: String? = null,
    /** The first page could not load: the section draws « Error loading comments » + Try again. */
    val loadFailed: Boolean = false,
    /** A one-shot localized feedback, cleared by [PostCommentsViewModel.consumeNotice]. */
    val notice: CommentNotice? = null,
    val translatingLanguages: Set<String> = emptySet(),
    /** Les pièces jointes au commentaire en cours (#12972). */
    val attachments: CommentAttachmentTray = CommentAttachmentTray(),
    /** La langue que montre la pastille du composeur (#14384) : choisie, sinon détectée, sinon celle du lecteur. */
    val composerLanguageCode: String = ComposerLanguage.DEFAULT,
    /** Le flou et les effets permanents posés sur le commentaire en cours (#14385). */
    val effects: MessageEffects = MessageEffects(),
    /** Le lieu joint au commentaire en cours (#14387) ; il part avec le texte ou une pièce. */
    val place: SharedPlace? = null,
) {
    /** Envoyer : du texte ou une pièce, rien qui se téléverse encore, aucun envoi en vol. */
    val canSubmit: Boolean get() = (draft.isNotBlank() || attachments.hasMedia) && !attachments.isUploading && !isSubmitting
}

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
    /** Le commentaire VISÉ (pas sa racine) : l'ancre `comment-<id>` que la liste garde en vue au-dessus du clavier. */
    val commentId: String? = null,
    /** Sa première ligne, citée dans la bannière « en réponse à ». */
    val excerpt: String? = null,
)

@HiltViewModel
class PostCommentsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val mentionSearch: MentionSearch,
    savedStateHandle: SavedStateHandle,
    private val languageIdentifier: LanguageIdentifying = LanguageIdentifying.Unavailable,
    private val mediaUploader: CommentMediaUploader? = null,
    private val unsentComments: UnsentCommentStore? = null,
    mentionContacts: MentionContacts = MentionContacts.None,
    private val commentsEngine: PostCommentsEngine? = null,
    private val heartTransport: CommentHeartTransport? = null,
    private val network: NetworkMonitor = InMemoryNetworkMonitor(),
    private val gestureQueue: CommentGestureQueue? = null,
    unsentQueue: UnsentComments? = null,
    private val commentDrafts: CommentDraftStore? = null,
    commentQuotations: CommentQuotationStore? = null,
) : ViewModel() {

    private val postId: String = savedStateHandle[POST_ID_ARG] ?: ""

    private val quotes = CommentQuotationBinding(commentQuotations, postId, viewModelScope)
    private val refusals = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    private val offline = MutableStateFlow(false)

    /** Hors ligne : la feuille garde le fil lu et pose un bandeau discret, ou l'état « hors ligne » si rien n'est gardé. */
    val isOffline: StateFlow<Boolean> = offline.asStateFlow()

    /** Appelé quand un commentaire ou une réponse de l'utilisateur est confirmé : l'hôte incrémente son compteur. */
    var onCommentSent: ((postId: String) -> Unit)? = null

    private val thread = MutableStateFlow(CommentThreadState())
    private val status = MutableStateFlow(Status())
    private val likes = MutableStateFlow(CommentLikeState())
    private val replies = MutableStateFlow(CommentRepliesState())
    private val composer = MutableStateFlow<ReplyTarget?>(null)

    /** The rows served from the disk and not written back untouched (it would renew their age). */
    private var persistBaseline: List<ApiPostComment>? = null
    private var networkConfirmed = false

    /** Per-comment Prisme language override (comment id → chosen language code), set by a flag tap. */
    private val activeLanguages = MutableStateFlow<Map<String, String>>(emptyMap())

    /**
     * In-flight on-demand comment translations, keyed `commentId|targetLanguage` — the flag-strip
     * counterpart of [FeedUiState.translatingLanguages]. Guards against a duplicate request while
     * one is already running and surfaces a per-chip spinner. Folded into the projection so a
     * background re-emit never drops it.
     */
    private val translatingLanguages = MutableStateFlow<Set<String>>(emptySet())

    /** The composer's live text + @-mention autocomplete panel, folded into the projection so a
     *  background re-emit (a socket comment landing) never tears the half-typed draft down. */
    private val composerDraft = MutableStateFlow(ComposerDraft())

    /**
     * The « @ » law of #14053 for this thread: the cached contacts and the thread's authors at once,
     * the post's own suggestions (`contextType=post`) from the third character — or the second when
     * the first two letters found nobody locally.
     */
    private val mentions = MentionLookupDriver(
        scope = viewModelScope,
        search = mentionSearch,
        contacts = mentionContacts,
        selfId = { sessionRepository.currentUser.value?.id },
        read = { composerDraft.value.mention },
        write = { transform -> composerDraft.update { it.copy(mention = transform(it.mention)) } },
    )
    private var pendingSeq = 0

    /** Le fil et la file durable d'un même post : les commentaires écrits hors ligne, leur marque, leur relance. */
    internal val outbox: CommentOutboxMirror? = unsentQueue?.takeIf { postId.isNotBlank() }?.let { queue ->
        CommentOutboxMirror(
            postId, queue, thread, replies, sessionRepository,
            onGaveUp = { item -> status.update { it.copy(notice = if (item.payload.parentId == null) CommentNotice.SEND_FAILED else CommentNotice.REPLY_FAILED) } },
            onSettled = { resyncHead() },
        )
    }

    /** The `@username ` prefix [beginReply] last injected, tracked so retargeting the composer to
     *  a different reply strips exactly that prefix rather than any leading text. */
    private var prefilledMention: String? = null

    private val attachments = MutableStateFlow(CommentAttachmentTray())
    private var pieceSeq = 0

    private val _state = MutableStateFlow(PostCommentsUiState())
    val state: StateFlow<PostCommentsUiState> = _state.asStateFlow()

    init {
        mentions.bind(MentionContext.post(postId))
        viewModelScope.launch {
            try {
                network.isOnline.collect { online -> offline.value = !online }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                offline.value = false
            }
        }
        observeQueuedGestureRollbacks()
        viewModelScope.launch {
            combine(thread, sessionRepository.currentUser, status, likes, replies) { t, user, st, likeState, replyState ->
                ProjectionInputs(t, user, st, likeState, replyState)
            }.combine(composer) { inputs, replyTarget ->
                inputs to replyTarget
            }.combine(activeLanguages) { (inputs, replyTarget), langs ->
                Triple(inputs, replyTarget, langs)
            }.combine(composerDraft) { (inputs, replyTarget, langs), draft ->
                ProjectionBundle(inputs, replyTarget, langs, draft)
            }.combine(translatingLanguages) { bundle, translating ->
                project(bundle.inputs, bundle.replyTarget, bundle.activeLanguages, bundle.draft, translating)
            }.combine(attachments) { projected, tray -> projected.copy(attachments = tray) }
                .collect { projected -> _state.value = projected }
        }
        restoreUnsentComment()
        restoreDraft()
        outbox?.let { mirror -> viewModelScope.launch { mirror.run() } }
        persistThread()
        observeRealtime()
        loadInitial()
    }

    /**
     * Every change of the loaded thread (a page, a live echo, an edit, a reaction, a media rewrite) is handed to the
     * disk by the shared engine, so reopening the post serves it back without the network. Optimistic rows are
     * filtered by the cache source itself, never here.
     */
    private fun persistThread() {
        val engine = commentsEngine ?: return
        if (postId.isBlank()) return
        viewModelScope.launch {
            thread.collect { state ->
                val unchangedFromDisk = state.comments == persistBaseline
                if (state.hasLoaded && !unchangedFromDisk && (networkConfirmed || persistBaseline != null)) {
                    try {
                        engine.keep(postId, state.comments)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // the disk is a convenience — the thread on screen stays
                    }
                }
            }
        }
    }

    /** Le brouillon du post revient tel quel (iOS `CommentDraftStore`), sans écraser ce que le refus d'une bannière a rendu. */
    private fun restoreDraft() {
        val saved = commentDrafts?.load(postId) ?: return
        composerDraft.update { draft -> if (draft.text.isBlank()) draft.copy(text = saved) else draft }
    }

    /** Le composer s'arrête (ON_STOP) : le brouillon en vol s'écrit sans attendre. */
    fun onComposerStop() {
        commentDrafts?.flush()
    }

    /** #13693 — a comment typed in a banner and refused for good comes back in this post's field (it leaves the store). */
    private fun restoreUnsentComment() {
        if (postId.isBlank()) return
        val kept = unsentComments?.take(postId) ?: return
        composerDraft.update { draft -> if (draft.text.isBlank()) draft.copy(text = kept) else draft }
    }

    /**
     * The post-detail realtime room: a live `comment:added`/`comment:deleted` for the open post
     * lands in the thread without a refresh (Instant-App). On add, a top-level comment prepends and
     * a reply prepends into its already-visible thread + bumps the parent's reply-count. On delete,
     * the row vanishes everywhere and a deleted reply decrements its parent's reply-count. A blank
     * route [postId] never subscribes, and events for any other post are ignored. Mirror of iOS
     * `PostDetailViewModel.subscribeToSocket` (`commentAdded`/`commentDeleted` sinks filtered to `postId`).
     * Also joins [SocialSocketManager.joinPostRoom] for the sheet's lifetime — mirror of iOS
     * `FeedCommentsSheet.onAppear`/`.onDisappear`, left in [onCleared] below.
     */
    private fun observeRealtime() {
        if (postId.isBlank()) return
        socialSocket.joinPostRoom(postId)
        viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                if (event.postId != postId) return@collect
                onCommentAdded(event.comment, event.clientMutationId)
            }
        }
        viewModelScope.launch {
            socialSocket.commentUpdated.collect { event ->
                if (event.postId != postId) return@collect
                onCommentUpdated(event.comment)
            }
        }
        viewModelScope.launch {
            socialSocket.commentDeleted.collect { event ->
                if (event.postId != postId) return@collect
                onCommentDeleted(event.commentId)
            }
        }
        viewModelScope.launch {
            socialSocket.commentReactionAdded.collect { event -> onCommentReaction(event, added = true) }
        }
        viewModelScope.launch {
            socialSocket.commentReactionRemoved.collect { event -> onCommentReaction(event, added = false) }
        }
        viewModelScope.launch {
            try {
                socialSocket.commentMediaUpdated.collect { event ->
                    if (event.postId != postId) return@collect
                    thread.update { it.mediaRewritten(event.comment) }
                    replies.update { it.mediaRewritten(event.comment) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // a flow that cannot be collected is simply not listened to
            }
        }
        viewModelScope.launch {
            socialSocket.commentTranslationUpdated.collect { event -> onCommentTranslationUpdated(event) }
        }
        viewModelScope.launch {
            try {
                socialSocket.reconnected.collect { resyncHead() }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // a flow that cannot be collected is simply not listened to
            }
        }
    }

    /** After a reconnection the comments emitted during the cut are lost: the first page is read again, silently. */
    private suspend fun resyncHead() {
        socialSocket.joinPostRoom(postId)
        try {
            (postRepository.getComments(postId, null, PAGE_SIZE) as? NetworkResult.Success)?.let { ok ->
                thread.update { it.headResynced(ok.data) }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // best-effort — the thread on screen stays
        }
    }

    /**
     * A live `comment:translation-updated` for the open post: the gateway finished translating a
     * comment and pushed the entry. Fold it into whichever collection holds the comment (top-level
     * [thread] or a loaded [replies] thread — each transition is inert for the other) via the
     * metadata-preserving [PostTranslationMerge], so the row re-renders in the reader's preferred
     * language the instant it lands. Unlike [requestCommentTranslation] no [activeLanguages]
     * override is forced — the reader did not tap, so their own Prisme chain decides whether the
     * newly-available language is the one displayed (parity with iOS `applyCommentTranslationUpdate`).
     * Inert for another post, an unknown/unloaded comment, or a no-op merge (blank/identical entry).
     */
    private fun onCommentTranslationUpdated(event: SocketCommentTranslationUpdatedData) {
        if (event.postId != postId) return
        val comment = findComment(event.commentId) ?: return
        val merged = PostTranslationMerge.mergeTranslation(comment, event.language, event.translation) ?: return
        thread.update { it.retranslated(event.commentId, merged.translations) }
        replies.update { it.retranslated(event.commentId, merged.translations) }
    }

    /**
     * A live `comment:reaction-added`/`comment:reaction-removed` heart for the open post. The viewer's
     * own reaction (echoed from this or another device) syncs the heart; a third party's moves the count
     * only. Non-heart emojis and events for any other post are ignored. The change flows through the
     * existing [CommentProjection] (heart + displayed count), so no new UI is needed. Mirror of iOS
     * `PostDetailViewModel` `commentReactionAdded`/`commentReactionRemoved` sinks.
     */
    private fun onCommentReaction(event: SocketCommentReactionUpdateData, added: Boolean) {
        if (event.postId != postId) return
        val viewerId = sessionRepository.currentUser.value?.id
        val aggregation = event.aggregation
        if (aggregation != null && aggregation.emoji.isNotBlank()) {
            thread.update { it.reactionAggregated(event.commentId, aggregation, viewerId, HEART_EMOJI) }
            replies.update { it.reactionAggregated(event.commentId, aggregation, viewerId, HEART_EMOJI) }
            if (aggregation.emoji == HEART_EMOJI) {
                likes.update { it.aggregated(event.commentId, CommentReactionLaw.viewerHeart(aggregation, viewerId)) }
            }
            return
        }
        if (event.emoji != HEART_EMOJI) return
        val isOwn = event.userId == viewerId
        likes.update { it.reactionApplied(event.commentId, isOwn = isOwn, added = added) }
    }

    /**
     * A live `comment:updated` for the open post: a comment was edited server-side and the gateway
     * pushed the COMPLETE new comment. Replace the matched row in place in whichever collection holds
     * it (top-level [thread] or a loaded [replies] thread — each transition is inert for the other),
     * so the edited content/effects/translations repaint instantly with no refetch. Unlike a
     * translation push this adopts every field (mirror of iOS `applyCommentEdit`). Inert for another
     * post, an unknown/unloaded comment, or an id not currently present.
     */
    private fun onCommentUpdated(comment: ApiPostComment) {
        thread.update { it.replaced(comment) }
        replies.update { it.replacedReply(comment) }
    }

    private fun onCommentAdded(comment: ApiPostComment, clientMutationId: String? = null) {
        val parentId = comment.parentId?.takeIf { it.isNotBlank() }
        val queued = isOwnQueuedEcho(thread.value, replies.value, clientMutationId)
        if (parentId == null) {
            thread.update { it.echoReconciled(clientMutationId, comment) }
        } else {
            replies.update { it.echoReconciledReply(parentId, clientMutationId, comment) }
            if (!queued) thread.update { it.bumpReplyCount(parentId, 1) }
        }
        likes.update { it.seeded(listOf(comment), HEART_EMOJI) }
    }

    /**
     * A live `comment:deleted` for the open post. A top-level comment is dropped and its reply
     * thread purged; a reply is dropped from its thread and its parent's reply-count decremented.
     * An unknown id (an unloaded page, or already gone) is a no-op — fully idempotent with the
     * client that issued the delete. Mirror of iOS `PostDetailViewModel` `commentDeleted` sink.
     */
    private fun onCommentDeleted(commentId: String) {
        if (thread.value.comments.any { it.id == commentId }) {
            thread.update { it.removed(commentId) }
            replies.update { it.removedThread(commentId) }
            return
        }
        val parentId = replies.value.parentOfReply(commentId) ?: return
        replies.update { it.removedReply(commentId) }
        thread.update { it.bumpReplyCount(parentId, -1) }
    }

    /** Leaves the realtime room this VM joined in [observeRealtime]. */
    override fun onCleared() {
        if (postId.isNotBlank()) socialSocket.leavePostRoom(postId)
        attachments.value.pieces.forEach { MediaIntake.release(it.item) }
        quotes.clear()
        super.onCleared()
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
        val engine = commentsEngine
        if (engine == null) {
            fetch(cursor = null, loadingMore = false)
            return
        }
        viewModelScope.launch {
            val cached = try {
                engine.cached(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                CacheResult.Empty
            }
            val rows = cached.valueOrNull
            if (rows != null) {
                val more = rows.size >= PAGE_SIZE
                persistBaseline = rows
                thread.update { it.mergedFirstPage(rows, if (more) rows.lastOrNull()?.id else null, more) }
                likes.update { it.seeded(rows, HEART_EMOJI) }
                preloadReplyPreviews()
            }
            if (cached is CacheResult.Fresh) {
                status.update { it.copy(isLoading = false, error = null) }
            } else {
                fetch(cursor = null, loadingMore = false)
            }
        }
    }

    /** « Try again » of the error state: replays the first page. */
    fun retryLoad() {
        if (postId.isBlank() || status.value.isLoading || thread.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetch(cursor = null, loadingMore = false)
    }

    /** The toast for [PostCommentsUiState.notice] has been shown. */
    fun consumeNotice() {
        status.update { it.copy(notice = null) }
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
                        val served = persistBaseline
                        persistBaseline = null
                        networkConfirmed = true
                        val pageIds = page.mapTo(HashSet()) { it.id }
                        val vanished = if (cursor == null && served != null) {
                            served.take(page.size).filter { it.id !in pageIds }.mapTo(HashSet()) { it.id }
                        } else emptySet()
                        thread.update {
                            if (cursor != null) it.appended(page, nextCursor, more)
                            else it.copy(comments = it.comments.filter { row -> row.id !in vanished }).mergedFirstPage(page, nextCursor, more)
                        }
                        likes.update { it.seeded(page, HEART_EMOJI) }
                        status.update { it.copy(isLoading = false, isLoadingMore = false, error = null) }
                        preloadReplyPreviews()
                    }
                    is NetworkResult.Failure -> status.update { it.fetchFailed(result.error.message, loadingMore) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.fetchFailed(e.message, loadingMore) }
            }
        }
    }

    /**
     * A composer keystroke: store the new [value], then let the « @ » law serve the panel — the
     * cached contacts and the thread's authors at once, the post's suggestions from the network when
     * [me.meeshy.sdk.model.mention.MentionLookupLaw.stage] says so. Kept in a folded flow so a
     * realtime re-projection never drops the half-typed draft.
     */
    fun onDraftChange(value: String) {
        composerDraft.update { it.copy(text = value, language = it.language.onDraftChanged(value)) }
        commentDrafts?.save(postId, value)
        mentions.onTextChange(value)
    }

    /** La pastille DÉCLARE la langue du commentaire (iOS `composerLanguage`, #6587) : elle gagne sur la détection. */
    fun onComposerLanguagePicked(code: String) {
        composerDraft.update { it.copy(language = it.language.withManualPick(code)) }
    }

    /** #14385 — le flou ou un effet permanent se pose ou se retire du commentaire en cours (iOS `commentEffects`). */
    fun toggleCommentEffect(flag: Long) {
        composerDraft.update { it.copy(effects = CommentEffects.toggle(it.effects, flag)) }
    }

    fun clearCommentEffects() {
        composerDraft.update { it.copy(effects = MessageEffects()) }
    }

    /** #14387 — le lieu choisi au sélecteur rejoint le commentaire en cours ; un second remplace le premier (iOS `pendingPlace`). */
    fun attachPlace(place: SharedPlace) {
        composerDraft.update { it.copy(place = place) }
    }

    fun removePlace() {
        composerDraft.update { it.copy(place = null) }
    }

    /** Un emoji rapide part aussitôt comme commentaire (iOS `sendQuickEmoji`) — jamais par-dessus un brouillon. */
    fun sendQuickEmoji(emoji: String) {
        if (composerDraft.value.text.isNotBlank() || attachments.value.hasMedia) return
        composerDraft.update { it.copy(text = emoji) }
        submit()
    }

    /**
     * Insert the picked [candidate]'s handle into the draft (replacing the trailing `@fragment`),
     * record it as a draft mention, and dismiss the suggestion panel — the same driver the chat
     * composer uses, so both surfaces behave identically. Inert when no mention is in progress.
     */
    fun onMentionSelected(candidate: MentionCandidate) {
        val text = mentions.select(candidate, composerDraft.value.text)
        composerDraft.update { it.copy(text = text) }
    }

    /**
     * Send from the composer. Trimmed-blank content, a blank post id, or a send already in
     * flight are inert. When a [ReplyTarget] is active the text is posted as a reply under its
     * parent; otherwise as a top-level comment. Either way the row appears optimistically for
     * instant feedback, then confirmed with the server row or rolled back if the send fails, and
     * the composer draft + mention panel reset for the next comment.
     */
    fun submit() {
        val content = composerDraft.value.text.trim()
        val tray = attachments.value
        if (postId.isBlank() || status.value.isSubmitting) return
        val gate = CommentSendGate.decide(content, tray.pieces.map { CommentSendGate.Piece(it.id, isReady = it.uploaded != null) }, hasPlace = false)
        if (gate !is CommentSendGate.Decision.Send) return
        val attachmentIds = tray.attachmentIds.takeIf { it.isNotEmpty() }
        val pill = composerDraft.value.language
        val effectFlags = CommentEffects.wire(composerDraft.value.effects)
        val place = composerDraft.value.place
        val quoted = quotes.consume()
        attachments.value = CommentAttachmentTray()
        tray.pieces.flatMap { it.owned }.forEach(MediaIntake::release)
        if (offline.value && outbox != null) {
            queueOffline(content, attachmentIds, pill, CommentExtras(effectFlags, place, quoted))
            return
        }
        composer.value?.let { target ->
            clearDraft()
            sendReply(target.parentId, content, attachmentIds, pill, CommentExtras(effectFlags, place, quoted))
            return
        }
        val tempId = "pending-${pendingSeq++}"
        thread.update { it.optimistic(optimisticCommentRow(tempId, content, sessionRepository.currentUser.value).copy(effectFlags = effectFlags, location = place)) }
        clearDraft()
        status.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val language = languageAtSend(pill, content)
                when (val result = postRepository.addComment(postId, content, effectFlags = effectFlags, originalLanguage = language, attachmentIds = attachmentIds, location = place, quotedPostMediaId = quoted)) {
                    is NetworkResult.Success -> {
                        thread.update { it.confirmed(tempId, result.data) }
                        status.update { it.copy(isSubmitting = false, error = null) }
                        onCommentSent?.invoke(postId)
                    }
                    is NetworkResult.Failure -> {
                        thread.update { it.failed(tempId) }
                        sendFailed(result.error.message, content, CommentNotice.SEND_FAILED, place)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                thread.update { it.failed(tempId) }
                sendFailed(e.message, content, CommentNotice.SEND_FAILED, place)
            }
        }
    }

    /** Hors ligne : le commentaire entre dans la file durable et part au retour du réseau ; le miroir montre sa ligne. */
    private fun queueOffline(content: String, attachmentIds: List<String>?, pill: ComposerLanguageState, extras: CommentExtras) {
        val parentId = composer.value?.parentId
        composer.value = null
        clearDraft()
        viewModelScope.launch {
            try {
                val language = languageAtSend(pill, content)
                val cmid = postRepository.queueComment(postId, content, parentId, language, attachmentIds, extras.effectFlags, extras.place, extras.quotedPostMediaId)
                if (cmid == null) sendFailed(null, content, CommentNotice.SEND_FAILED, extras.place)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                sendFailed(e.message, content, CommentNotice.SEND_FAILED, extras.place)
            }
        }
    }

    /** Le média du post dont le prochain commentaire parle (« Commenter ce média », #6578), et sa croix. */
    val quotation: StateFlow<CommentQuotedMedia?> = quotes.quotation
    fun removeQuotation() = quotes.clear()

    /** Une pièce n'est pas entrée (pas un média, ou plafond atteint) : l'écran avertit par l'haptique. */
    val attachmentRefusals: SharedFlow<Unit> = refusals.asSharedFlow()

    /** Joint une photo ou une vidéo (#12972) : elle entre au bandeau et se téléverse aussitôt. */
    fun attachMedia(item: MediaUploadItem) {
        val outcome = attachments.value.admission(item, nextPieceId = "piece-$pieceSeq")
        if (outcome.shouldWarn) refusals.tryEmit(Unit)
        if (outcome.accepted.isEmpty()) {
            MediaIntake.release(item)
            status.update { it.copy(notice = CommentNotice.MEDIA_FAILED) }
            return
        }
        val id = "piece-${pieceSeq++}"
        attachments.update { it.adding(id, item) }
        upload(id, item)
    }

    /**
     * La pièce retouchée (#12735) remplace l'autre à sa place, et se téléverse de nouveau ; son original et sa recette
     * ([retouch], #14844) restent pour la rouvrir. Seuls les fichiers que la nouvelle pièce ne tient plus quittent le disque.
     */
    fun replaceMedia(id: String, item: MediaUploadItem, retouch: CommentPieceRetouch? = null) {
        val replaced = attachments.value.piece(id) ?: return
        attachments.update { it.replacing(id, item, retouch) }
        val kept = listOfNotNull(item, retouch?.original)
        replaced.owned.filter { owned -> kept.none { it === owned } }.forEach(MediaIntake::release)
        upload(id, item)
    }

    fun removeMedia(id: String) {
        attachments.value.piece(id)?.owned?.forEach(MediaIntake::release)
        attachments.update { it.removing(id) }
    }

    /** Une réponse ne s'applique qu'à la pièce qu'elle téléversait : une pièce retouchée ou retirée entre-temps l'ignore. */
    private fun upload(id: String, item: MediaUploadItem) {
        viewModelScope.launch {
            val media = mediaUploader.firstUploaded(item)
            attachments.update { tray ->
                when {
                    tray.piece(id)?.item !== item -> tray
                    media != null -> tray.uploaded(id, media)
                    else -> tray.failed(id).also { MediaIntake.release(item) }
                }
            }
            if (media == null) status.update { it.copy(notice = CommentNotice.MEDIA_FAILED) }
        }
    }

    /**
     * Aim the composer at [commentId]. Replying to a reply attaches to the *root* parent
     * (flat 2-level threading, mirror of iOS `sendReply`), and the parent's thread is opened
     * and loaded so the viewer sees the context their reply lands in. When the target is itself
     * a reply, its author's `@username ` is prefilled into the draft — otherwise flat threading
     * would notify/highlight the thread's root author instead of the person actually being
     * addressed (mirror of iOS `FeedCommentsSheet.beginReply(to:)`); switching targets strips the
     * previous prefill via [ReplyMentionPrefill]. A blank post/comment id is inert.
     */
    fun beginReply(commentId: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        val comment = findComment(commentId)
        val parentId = comment?.parentId?.takeIf { it.isNotBlank() } ?: commentId
        val name = comment?.author?.let { it.displayName ?: it.username }?.takeIf { it.isNotBlank() }
        composer.value = ReplyTarget(parentId, name, commentId = commentId, excerpt = comment?.content?.takeIf { it.isNotBlank() })
        ensureThreadLoaded(parentId)

        val prefill = ReplyMentionPrefill.apply(
            currentText = composerDraft.value.text,
            previousMention = prefilledMention,
            replyToParentId = comment?.parentId,
            authorUsername = comment?.author?.username,
        )
        prefilledMention = prefill.prefilledMention
        composerDraft.update { it.copy(text = prefill.text) }
    }

    /** Drop the active reply target — the composer returns to posting a top-level comment. */
    fun cancelReply() {
        composer.value = null
        val prefill = ReplyMentionPrefill.apply(composerDraft.value.text, prefilledMention, replyToParentId = null, authorUsername = null)
        prefilledMention = null
        composerDraft.update { it.copy(text = prefill.text) }
    }

    /** Reset the composer text + mention tracking after a send. */
    private fun clearDraft() {
        commentDrafts?.clear(postId)
        mentions.reset()
        composerDraft.value = ComposerDraft()
    }

    /**
     * Tap on a comment's Prisme language-flag chip: switch that comment's displayed language, or
     * revert to the default resolution when the chip is already active. The override is keyed per
     * comment id so a switch on one row never disturbs another. Inert for a blank/unknown comment,
     * a blank post, or a content-less language (a read-only strip never surfaces one). The pure
     * [LanguageFlagTapResolver] owns the decision — one rule shared with the feed post and chat.
     */
    fun onCommentFlagTap(commentId: String, code: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        val comment = findComment(commentId) ?: return
        val preferences: LanguageResolver.ContentLanguagePreferences =
            sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = CommentProjection.resolveActiveCode(comment, preferences, activeLanguages.value[commentId]),
            originalLanguage = comment.originalLanguage,
            translations = comment.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate ->
                activeLanguages.update { it + (commentId to result.code) }
            LanguageFlagTapResolver.Result.Revert ->
                activeLanguages.update { it - commentId }
            is LanguageFlagTapResolver.Result.RequestTranslation ->
                requestCommentTranslation(commentId, result.targetLanguage)
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * The reader tapped a configured language a comment has no content for yet: translate it on
     * demand, fold the merged translation into whichever collection holds the comment (top-level
     * [thread] or a loaded [replies] thread — each transition is inert for the other), and point
     * that comment's [activeLanguages] override at it so the row lands on the translation. A failed
     * or inert translation leaves the strip's translatable chip in place to retry; a second tap
     * while the request is in flight is ignored via [translatingLanguages]. The comment-thread
     * counterpart of [PostDetailViewModel.requestOnDemandTranslation], keyed per comment.
     */
    private fun requestCommentTranslation(commentId: String, target: String) {
        val comment = findComment(commentId) ?: return
        val key = "$commentId|$target"
        if (key in translatingLanguages.value) return
        translatingLanguages.update { it + key }
        viewModelScope.launch {
            try {
                val merged = postRepository.translateComment(comment, target)
                if (merged != null) {
                    thread.update { it.retranslated(commentId, merged.translations) }
                    replies.update { it.retranslated(commentId, merged.translations) }
                    activeLanguages.update { it + (commentId to target) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(error = e.message) }
            } finally {
                translatingLanguages.update { it - key }
            }
        }
    }

    private fun sendReply(parentId: String, content: String, attachmentIds: List<String>?, pill: ComposerLanguageState, extras: CommentExtras) {
        val tempId = "pending-${pendingSeq++}"
        val row = optimisticCommentRow(tempId, content, sessionRepository.currentUser.value).copy(parentId = parentId, effectFlags = extras.effectFlags, location = extras.place)
        replies.update { it.optimisticReply(parentId, row) }
        thread.update { it.bumpReplyCount(parentId, 1) }
        composer.value = null
        status.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val language = languageAtSend(pill, content)
                when (val result = postRepository.addComment(postId, content, parentId, effectFlags = extras.effectFlags, originalLanguage = language, attachmentIds = attachmentIds, location = extras.place, quotedPostMediaId = extras.quotedPostMediaId)) {
                    is NetworkResult.Success -> {
                        replies.update { it.confirmedReply(parentId, tempId, result.data) }
                        status.update { it.copy(isSubmitting = false, error = null) }
                        onCommentSent?.invoke(postId)
                    }
                    is NetworkResult.Failure -> {
                        replies.update { it.failedReply(parentId, tempId) }
                        thread.update { it.bumpReplyCount(parentId, -1) }
                        sendFailed(result.error.message, content, CommentNotice.REPLY_FAILED, extras.place)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                replies.update { it.failedReply(parentId, tempId) }
                thread.update { it.bumpReplyCount(parentId, -1) }
                sendFailed(e.message, content, CommentNotice.REPLY_FAILED, extras.place)
            }
        }
    }

    /** #14502 — la langue part toujours : la pastille, sinon la détection, sinon ce que la pastille affiche. */
    private suspend fun languageAtSend(pill: ComposerLanguageState, content: String): String =
        pill.atSend(content, fallback = readerLanguage(sessionRepository.currentUser.value), identifier = languageIdentifier)

    private fun readerLanguage(user: MeeshyUser?): String =
        user?.let(LanguageResolver::resolveUserLanguage) ?: ComposerLanguage.DEFAULT

    /**
     * A send the server refused: the localized notice, and the text goes back to the composer
     * (when the author has not started another one) — never lost (iOS `CommentUnsentBadge`).
     */
    private fun sendFailed(message: String?, content: String, notice: CommentNotice, place: SharedPlace?) {
        status.update { it.copy(isSubmitting = false, error = message, notice = notice) }
        if (composerDraft.value.text.isBlank()) composerDraft.update { it.copy(text = content) }
        if (place != null && composerDraft.value.place == null) composerDraft.update { it.copy(place = place) }
    }

    /**
     * #13922 — la carte qu'« Imager » ouvre sur [commentId] (iOS `CommentMoreMenu`) : lui tel que sa rangée l'affiche, le
     * fil chargé autour de lui, et [support], le post en tête quand il est public ; `null` quand rien ne s'image.
     */
    fun commentCard(commentId: String, support: PostCommentCardPost?, labels: PostCommentCardLabels): PostCommentCardSubject? {
        val target = findComment(commentId) ?: return null
        val shown = _state.value.comments + _state.value.replyThreads.values.flatMap { it.replies }
        val user = sessionRepository.currentUser.value
        val source = CommentCardReading.source(
            target = target,
            shownText = shown.firstOrNull { it.id == commentId }?.content,
            loaded = thread.value.comments + replies.value.repliesByParent.values.flatten(),
            pending = shown.filter { it.isPending }.map { it.id }.toSet(),
            support = support,
            viewer = user,
            preferences = user ?: EmptyContentPreferences,
        )
        return PostCommentCardComposition.cardOf(source, labels)
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
                if (offline.value && queueLike(commentId, liked = !wasLiked)) return@launch
                val transport = heartTransport
                if (transport != null) {
                    if (transport.deliver(wasLiked, commentId, postId)) likes.update { it.settle(commentId) }
                    else if (!queueLike(commentId, liked = !wasLiked)) likes.update { it.rollback(commentId) }
                    return@launch
                }
                val result =
                    if (wasLiked) postRepository.unlikeComment(postId, commentId)
                    else postRepository.likeComment(postId, commentId)
                when (result) {
                    is NetworkResult.Success -> likes.update { it.settle(commentId) }
                    is NetworkResult.Failure ->
                        if (!(isRetryable(result) && queueLike(commentId, liked = !wasLiked))) likes.update { it.rollback(commentId) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!queueLike(commentId, liked = !wasLiked)) likes.update { it.rollback(commentId) }
            }
        }
    }

    private suspend fun queueDelete(commentId: String, threadSnapshot: CommentThreadState, repliesSnapshot: CommentRepliesState): Boolean {
        val queue = gestureQueue ?: return false
        if (!queue.queueDelete(postId, commentId)) return false
        queuedDeletions[commentId] = threadSnapshot to repliesSnapshot
        status.update { it.copy(notice = CommentNotice.DELETED) }
        return true
    }

    /** Le coeur voulu entre dans la file durable : l'optimiste reste, le geste part au retour du réseau. */
    private suspend fun queueLike(commentId: String, liked: Boolean): Boolean {
        val queue = gestureQueue ?: return false
        if (!queue.queueLike(postId, commentId, liked)) return false
        likes.update { it.settle(commentId) }
        return true
    }

    private fun isRetryable(failure: NetworkResult.Failure): Boolean =
        SendFailureClassifier.classify(failure.error) !is SendResult.PermanentFailure

    /** Un geste mis en file a renoncé (refus définitif) : le coeur ou le commentaire revient comme avant le geste. */
    private fun observeQueuedGestureRollbacks() {
        val queue = gestureQueue ?: return
        viewModelScope.launch {
            queue.rollbacks.collect { rollback ->
                when (rollback) {
                    is CommentGestureRollback.Like ->
                        if (likes.value.isLiked(rollback.commentId) == rollback.liked) {
                            likes.update { state -> state.beginToggle(rollback.commentId)?.settle(rollback.commentId) ?: state }
                        }
                    is CommentGestureRollback.Delete -> restoreDeleted(rollback.commentId)
                }
            }
        }
    }

    private fun restoreDeleted(commentId: String) {
        val snapshot = queuedDeletions.remove(commentId) ?: return
        thread.value = snapshot.first
        replies.value = snapshot.second
        status.update { it.copy(notice = CommentNotice.DELETE_FAILED) }
    }

    private val queuedDeletions = mutableMapOf<String, Pair<CommentThreadState, CommentRepliesState>>()

    /**
     * Delete a comment the viewer authored (the UI gates the affordance to
     * [CommentPresentation.isOwn]). Optimistic removal reuses [onCommentDeleted]'s exact
     * transition — a top-level comment vanishes with its loaded reply thread, a reply vanishes
     * and decrements its parent's `replyCount` — then confirms with the server or fully rolls
     * back [thread]/[replies] to their pre-delete snapshot on failure. A blank post/comment id,
     * or a comment not currently loaded, is inert. Mirror of iOS `FeedCommentsSheet.deleteComment`.
     */
    fun deleteComment(commentId: String) {
        if (postId.isBlank() || commentId.isBlank()) return
        if (findComment(commentId) == null) return
        val threadSnapshot = thread.value
        val repliesSnapshot = replies.value
        onCommentDeleted(commentId)
        viewModelScope.launch {
            try {
                if (offline.value && queueDelete(commentId, threadSnapshot, repliesSnapshot)) return@launch
                when (val result = postRepository.deleteComment(postId, commentId)) {
                    is NetworkResult.Success -> status.update { it.copy(notice = CommentNotice.DELETED) }
                    is NetworkResult.Failure -> {
                        if (isRetryable(result) && queueDelete(commentId, threadSnapshot, repliesSnapshot)) return@launch
                        thread.value = threadSnapshot
                        replies.value = repliesSnapshot
                        status.update { it.copy(error = result.error.message, notice = CommentNotice.DELETE_FAILED) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                thread.value = threadSnapshot
                replies.value = repliesSnapshot
                status.update { it.copy(error = e.message, notice = CommentNotice.DELETE_FAILED) }
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

    private fun project(
        inputs: ProjectionInputs,
        replyTarget: ReplyTarget?,
        activeLanguages: Map<String, String>,
        draft: ComposerDraft,
        translatingLanguages: Set<String>,
    ): PostCommentsUiState {
        val thread = inputs.thread
        val st = inputs.status
        val likeState = inputs.likes
        val replyState = inputs.replies
        val prefs: LanguageResolver.ContentLanguagePreferences = inputs.user ?: EmptyContentPreferences
        val currentUserId = inputs.user?.id
        val topLevel = thread.comments.filter { it.parentId.isNullOrBlank() }
        val rows = topLevel.map {
            CommentProjection.build(
                it,
                prefs,
                config.apiBaseUrl,
                isPending = it.id in thread.pendingIds,
                likeState = likeState,
                activeLanguageCode = activeLanguages[it.id],
                currentUserId = currentUserId,
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
                            config.apiBaseUrl,
                            isPending = replyState.isPendingReply(it.id),
                            likeState = likeState,
                            activeLanguageCode = activeLanguages[it.id],
                            currentUserId = currentUserId,
                            depth = 1,
                        )
                    },
                    isPreview = !expanded && shown.isNotEmpty(),
                    hiddenReplyCount = (all.size - shown.size).coerceAtLeast(0),
                )
            }
        val allComments = thread.comments + replyState.repliesByParent.values.flatten()
        val mentionDisplayNames = CommentMentionDirectory.build(allComments)
        mentions.updateRoster(CommentMentionRoster.build(allComments, excludeUserId = inputs.user?.id))
        val showSkeleton = st.isLoading && !thread.hasLoaded && thread.comments.isEmpty() && st.error == null
        return PostCommentsUiState(
            comments = rows,
            replyThreads = replyThreads,
            mentionDisplayNames = mentionDisplayNames,
            draft = draft.text,
            mention = draft.mention,
            replyTarget = replyTarget,
            isLoading = st.isLoading,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            isSubmitting = st.isSubmitting,
            canLoadMore = thread.canLoadMore,
            isEmpty = thread.hasLoaded && thread.comments.isEmpty(),
            errorMessage = st.error,
            loadFailed = st.error != null && !st.isLoading && !thread.hasLoaded && thread.comments.isEmpty(),
            notice = st.notice,
            translatingLanguages = translatingLanguages,
            composerLanguageCode = draft.language.display(readerLanguage(inputs.user)),
            effects = draft.effects,
            place = draft.place,
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
