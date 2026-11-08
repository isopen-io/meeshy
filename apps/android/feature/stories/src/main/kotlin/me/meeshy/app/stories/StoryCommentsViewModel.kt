package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ContentRemovalReason
import me.meeshy.sdk.model.PostCommentSettings
import me.meeshy.sdk.model.STORY_COMMENT_HEART
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.StoryCommentChase
import me.meeshy.sdk.model.StoryCommentChaseOutcome
import me.meeshy.sdk.model.StoryCommentPage
import me.meeshy.sdk.model.StoryCommentsReducer
import me.meeshy.sdk.model.StoryCommentsState
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.story.StoryCommentAttachmentTray
import me.meeshy.sdk.model.story.StoryCommentDraft
import me.meeshy.sdk.model.story.StoryCommentPiece
import me.meeshy.sdk.model.story.StoryCommentPublish
import me.meeshy.sdk.model.story.StoryViewerParticipationMark
import me.meeshy.sdk.story.StoryCommentPublication
import me.meeshy.sdk.story.StoryCommentPublisher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import me.meeshy.sdk.model.toStoryComment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostModerationRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryCommentsRepository
import javax.inject.Inject

/** Ce que l'overlay de commentaires d'une story projette : le fil, l'attente d'un cache vide et l'issue d'une chasse. */
@Immutable
data class StoryCommentsUiState(
    val comments: StoryCommentsState = StoryCommentsState(),
    /** Vrai seulement sur un cache VIDE : un fil déjà peint n'attend jamais le réseau. */
    val isLoadingRoots: Boolean = false,
    val isOffline: Boolean = false,
    /** Les commentaires dont le lecteur a demandé l'original (bascule original/traduit). */
    val showingOriginal: Set<String> = emptySet(),
    /** `null` hors chasse ; vrai quand le commentaire ciblé est chargé, faux quand le serveur ne le sert pas. */
    val targetFound: Boolean? = null,
    /** Le commentaire auquel le composeur répond (bouton « Répondre », glissé) ; `null` : commentaire de premier niveau. */
    val replyTarget: me.meeshy.sdk.model.StoryComment? = null,
    /** Le lecteur : d'où se lisent les entrées du menu « … » de chaque ligne (auteur, modération, autre). */
    val viewerId: String? = null,
    val viewerRole: String? = null,
    /** Le fil de la story est fermé (#16930) : l'hôte le pose depuis le fil épinglé ; l'auteur n'y modifie plus. */
    val commentsClosed: Boolean = false,
)

/**
 * Le fil de commentaires de la story à l'écran — iso `StoryCommentSession` iOS : liste locale d'abord puis réseau,
 * fils de réponses par 20, cœur optimiste, édition, retrait, chasse du commentaire visé et sockets
 * (`comment:added/updated/deleted/translation-updated/reaction-added/removed`). Toutes les transitions sont
 * [StoryCommentsReducer] ; ce ViewModel ne décide que QUAND appeler le réseau.
 */
@HiltViewModel
class StoryCommentsViewModel @Inject constructor(
    private val repository: StoryCommentsRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val moderation: PostModerationRepository,
    private val reports: ReportRepository,
    private val publisher: StoryCommentPublisher? = null,
    private val drafts: StoryCommentDraftStore? = null,
    private val participation: StoryViewerParticipationStore? = null,
    private val mediaUploader: StoryCommentMediaUploader? = null,
) : ViewModel() {

    /** Un commentaire que la file a refusé : son texte (et son parent) retournent au composeur. */
    data class RefusedComment(
        val text: String,
        val parentId: String?,
        val pieces: List<StoryCommentPiece> = emptyList(),
        val place: SharedPlace? = null,
    )

    /** Ce qui part À CÔTÉ du texte : les pièces téléversées, le lieu et les effets (flou, éphémère). */
    private data class Extras(val pieces: List<StoryCommentPiece>, val effectFlags: Int?, val place: SharedPlace?) {
        val attachmentIds: List<String>? get() = pieces.mapNotNull { it.uploadedId }.takeIf { it.isNotEmpty() }
    }

    private val _tray = MutableStateFlow(StoryCommentAttachmentTray())
    val tray: StateFlow<StoryCommentAttachmentTray> = _tray.asStateFlow()
    private val _place = MutableStateFlow<SharedPlace?>(null)
    val place: StateFlow<SharedPlace?> = _place.asStateFlow()
    private var effectFlags: Int? = null
    private var pieceSeq = 0
    private val sentExtras = mutableMapOf<String, Extras>()
    private val mediaFailures = Channel<Unit>(Channel.BUFFERED)
    /** Une pièce n'a pas pu être téléversée : elle a quitté le plateau, l'écran le dit. */
    val mediaFailed: kotlinx.coroutines.flow.Flow<Unit> = mediaFailures.receiveAsFlow()

    private val refusals = Channel<RefusedComment>(Channel.BUFFERED)
    val refused: kotlinx.coroutines.flow.Flow<RefusedComment> = refusals.receiveAsFlow()
    private var pendingSeq = 0

    private val _state = MutableStateFlow(StoryCommentsUiState())
    val state: StateFlow<StoryCommentsUiState> = _state.asStateFlow()

    private var storyId: String? = null
    private var loadJob: Job? = null

    init {
        observeRealtime()
    }

    private val prefs: LanguageResolver.ContentLanguagePreferences
        get() = sessionRepository.currentUser.value ?: NoPreferences

    private fun update(transform: (StoryCommentsState) -> StoryCommentsState) {
        _state.update { it.copy(comments = transform(it.comments)) }
    }

    private fun isViewing(id: String): Boolean = storyId == id

    /** Une story commence : le fil précédent tombe, le compteur est amorcé par la charge de la story. */
    fun begin(newStoryId: String?, payloadCount: Int = 0) {
        storyId?.let { socialSocket.leavePostRoom(it) }
        loadJob?.cancel()
        storyId = newStoryId?.takeIf { it.isNotBlank() }
        _tray.value = StoryCommentAttachmentTray()
        _place.value = null
        effectFlags = null
        val viewer = sessionRepository.currentUser.value
        _state.value = StoryCommentsUiState(
            comments = StoryCommentsState(count = payloadCount),
            viewerId = viewer?.id,
            viewerRole = viewer?.role,
        )
        val id = storyId ?: return
        socialSocket.joinPostRoom(id)
        loadJob = viewModelScope.launch { loadRoots(id) }
    }

    private suspend fun loadRoots(id: String) {
        val cached = guarded { repository.cachedRoots(id, prefs) }
        if (cached != null && isViewing(id)) update { StoryCommentsReducer.rootsPage(it, cached) }
        _state.update { it.copy(isLoadingRoots = cached == null) }
        when (val result = guarded { repository.roots(id, null, prefs) }) {
            is NetworkResult.Success -> if (isViewing(id)) {
                val page = result.data
                update { current ->
                    StoryCommentsReducer.rootsPage(current.copy(roots = emptyList()), page, knownCount(page))
                        .let { refreshed -> refreshed.copy(roots = refreshed.roots.keepLocalHearts(current)) }
                }
                _state.update { it.copy(isLoadingRoots = false, isOffline = false) }
            }
            else -> if (isViewing(id)) _state.update { it.copy(isLoadingRoots = false, isOffline = true) }
        }
    }

    /** Le total n'est connu que d'une liste complète : racines + leurs réponses (iso `reconcileOpeningCount`). */
    private fun knownCount(page: StoryCommentPage): Int? =
        if (page.hasMore) null else page.comments.size + page.comments.sumOf { it.replyCount }

    private fun List<me.meeshy.sdk.model.StoryComment>.keepLocalHearts(previous: StoryCommentsState) =
        map { row -> previous.find(row.id)?.let { row.copy(likedByMe = row.likedByMe || it.likedByMe) } ?: row }

    fun loadMoreRoots() {
        val id = storyId ?: return
        val cursor = _state.value.comments.takeIf { it.canLoadMoreRoots }?.rootCursor ?: return
        viewModelScope.launch {
            val result = guarded { repository.roots(id, cursor, prefs) }
            if (result is NetworkResult.Success && isViewing(id)) update { StoryCommentsReducer.rootsPage(it, result.data) }
        }
    }

    /** Déplie ou replie un fil ; chaque dépliage recharge la première page (le fil d'une story est vivant). */
    fun toggleThread(rootId: String) {
        val id = storyId ?: return
        update { StoryCommentsReducer.threadToggled(it, rootId) }
        if (_state.value.comments.thread.isExpanded(rootId)) loadReplies(id, rootId, cursor = null)
    }

    fun loadMoreReplies(rootId: String) {
        val id = storyId ?: return
        val thread = _state.value.comments.thread
        if (!thread.hasMoreReplies(rootId)) return
        loadReplies(id, rootId, cursor = thread.repliesCursor[rootId])
    }

    private fun loadReplies(id: String, rootId: String, cursor: String?) {
        var began = false
        update { current -> current.thread.beginLoad(rootId)?.let { began = true; current.copy(thread = it) } ?: current }
        if (!began) return
        viewModelScope.launch {
            val result = guarded { repository.replies(id, rootId, cursor, prefs) }
            if (!isViewing(id)) return@launch
            when (result) {
                is NetworkResult.Success -> update { StoryCommentsReducer.repliesPage(it, rootId, result.data, firstPage = cursor == null) }
                else -> update { it.copy(thread = it.thread.loadFailed(rootId)) }
            }
        }
    }

    /** Cœur optimiste, anti double-tap ; le retour arrière n'a lieu que si le serveur a refusé. */
    fun toggleLike(commentId: String) {
        val id = storyId ?: return
        var started: StoryCommentsState? = null
        update { current -> StoryCommentsReducer.beginLike(current, commentId)?.also { started = it } ?: current }
        val liked = started?.find(commentId)?.likedByMe ?: return
        viewModelScope.launch {
            val result = guarded { if (liked) repository.like(id, commentId) else repository.unlike(id, commentId) }
            update {
                if (result is NetworkResult.Success) StoryCommentsReducer.settleLike(it, commentId)
                else StoryCommentsReducer.rollbackLike(it, commentId)
            }
        }
    }

    /**
     * Modifier en place : la ligne change quand le serveur confirme. Un refus `COMMENTS_DISABLED` (#16930) dit que la story
     * a fermé ses commentaires : la ligne garde son texte et [onCommentsClosed] ferme le fil, sans message d'échec.
     */
    fun edit(commentId: String, text: String, onCommentsClosed: () -> Unit = {}) {
        val id = storyId ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            val result = guarded { repository.edit(id, commentId, text, prefs) }
            if (result is NetworkResult.Success && isViewing(id)) update { StoryCommentsReducer.replaced(it, result.data) }
            if (result is NetworkResult.Failure && PostCommentSettings.refusesComments(result.error.code)) onCommentsClosed()
        }
    }

    fun delete(commentId: String) {
        val id = storyId ?: return
        viewModelScope.launch {
            val result = guarded { repository.delete(id, commentId) }
            if (result is NetworkResult.Success && isViewing(id)) update { StoryCommentsReducer.removed(it, commentId) }
        }
    }

    /**
     * Envoi optimiste depuis la barre unique (iOS `sendComment`) : la ligne paraît aussitôt (Pending, compteurs +1), le
     * brouillon de la story tombe, l'action « commenté » est notée pour le contour du rail, puis la file durable prend
     * le relais. Répondre à une réponse cible le parent RACINE. Rend faux quand rien ne part (texte vide, pas de session).
     */
    fun send(text: String, language: String?): Boolean {
        val id = storyId ?: return false
        if (publisher == null) return false
        val clean = text.trim()
        val user = sessionRepository.currentUser.value ?: return false
        val tray = _tray.value
        val place = _place.value
        if (tray.isUploading || (clean.isEmpty() && !tray.hasMedia && place == null)) return false
        val target = _state.value.replyTarget
        val parentId = target?.let { it.parentId?.takeIf { p -> p.isNotBlank() } ?: it.id }
        val tempId = "pending-${pendingSeq++}"
        val author = user.displayName?.takeIf { it.isNotBlank() } ?: user.username
        update { StoryCommentPublish.optimistic(it, StoryCommentPublish.pendingRow(tempId, clean, parentId, author, user.id, user.avatar)) }
        _state.update { it.copy(replyTarget = null) }
        drafts?.sent(id)
        participation?.note(StoryViewerParticipationMark.COMMENTED, id)
        val extras = Extras(tray.pieces, effectFlags, place)
        _tray.value = StoryCommentAttachmentTray()
        _place.value = null
        effectFlags = null
        sentExtras[tempId] = extras
        dispatch(id, tempId, clean, parentId, language, extras)
        return true
    }

    /** Réessaie un commentaire en échec : la ligne repasse en attente et repart par la file. */
    fun retrySend(tempId: String, language: String?) {
        val id = storyId ?: return
        val row = _state.value.comments.find(tempId)?.takeIf { it.status == StoryCommentStatus.Failed } ?: return
        update { StoryCommentPublish.retrying(it, tempId) }
        dispatch(id, tempId, row.originalContent, row.parentId, language, sentExtras[tempId] ?: Extras(emptyList(), null, null))
    }

    private fun dispatch(id: String, tempId: String, text: String, parentId: String?, language: String?, extras: Extras) {
        val queue = publisher ?: return
        viewModelScope.launch {
            val outcome = guarded { queue.publish(id, text, parentId, language, extras.attachmentIds, extras.effectFlags, extras.place) }
            if (!isViewing(id)) return@launch
            if (outcome == StoryCommentPublication.Delivered || outcome == StoryCommentPublication.Dropped) sentExtras.remove(tempId)
            when (outcome) {
                StoryCommentPublication.Delivered -> update { StoryCommentPublish.delivered(it, tempId) }
                StoryCommentPublication.Dropped -> Unit
                null, StoryCommentPublication.Failed -> update { StoryCommentPublish.failed(it, tempId) }
                is StoryCommentPublication.Refused -> {
                    update { current -> StoryCommentPublish.refused(current, tempId)?.state ?: current }
                    sentExtras.remove(tempId)
                    drafts?.refused(id, outcome.text, System.currentTimeMillis(), extras.pieces, extras.place)
                    _tray.update { it.restoring(extras.pieces) }
                    if (_place.value == null) _place.value = extras.place
                    refusals.trySend(RefusedComment(outcome.text, parentId, extras.pieces, extras.place))
                }
            }
        }
    }

    /** Joint une photo, une vidéo, un fichier ou une voix : elle entre au plateau et se téléverse aussitôt. */
    fun attachMedia(item: MediaUploadItem) {
        val path = (item.source as? MediaUploadSource.OnDisk)?.file?.path.orEmpty()
        val piece = StoryCommentPiece("piece-${pieceSeq++}", path, item.fileName, item.mimeType, item.durationMs)
        val before = _tray.value
        val after = before.adding(piece)
        if (after === before) {
            MediaIntake.release(item)
            return
        }
        _tray.value = after
        viewModelScope.launch {
            val outcome = mediaUploader?.upload(item) ?: StoryCommentUpload.Failed
            val stillThere = _tray.value.piece(piece.id) != null
            when {
                !stillThere -> Unit
                outcome is StoryCommentUpload.Done -> _tray.update { it.uploaded(piece.id, outcome.serverId) }
                else -> {
                    _tray.update { it.failed(piece.id) }
                    MediaIntake.release(item)
                    mediaFailures.trySend(Unit)
                }
            }
        }
    }

    fun removeMedia(pieceId: String) {
        val piece = _tray.value.piece(pieceId) ?: return
        _tray.update { it.removing(pieceId) }
        if (piece.localPath.isNotBlank()) {
            MediaIntake.release(MediaUploadItem.onDisk(java.io.File(piece.localPath), piece.fileName, piece.mimeType, piece.durationMs))
        }
    }

    fun setPlace(place: SharedPlace?) {
        _place.value = place
    }

    fun setEffectFlags(flags: Int?) {
        effectFlags = flags?.takeIf { it > 0 }
    }

    /** Le brouillon de la story : le texte saisi, avec les pièces et le lieu du plateau. */
    fun saveDraft(text: String) {
        val id = storyId ?: return
        drafts?.save(id, text, _tray.value.pieces, _place.value)
    }

    /** Rouvre le brouillon de la story : ses pièces et son lieu reprennent leur place ; rend le texte à replacer. */
    fun restoreDraft(): StoryCommentDraft? {
        val draft = storyId?.let { drafts?.draftOf(it) } ?: return null
        _tray.update { it.restoring(draft.pieces) }
        if (_place.value == null) _place.value = draft.place
        return draft
    }

    /** « Répondre » : le composeur épinglé répond à ce commentaire ; le fil le met en vue. */
    fun setReplyTarget(comment: me.meeshy.sdk.model.StoryComment) {
        _state.update { it.copy(replyTarget = comment) }
    }

    fun clearReplyTarget() {
        _state.update { it.copy(replyTarget = null) }
    }

    /**
     * Retrait par la modération, avec son motif (3 à 500 caractères, sinon rien ne part). Optimiste : la ligne
     * quitte le fil aussitôt, et revient telle quelle si la passerelle refuse.
     */
    fun remove(commentId: String, reason: String) {
        val id = storyId ?: return
        val clean = ContentRemovalReason.normalized(reason) ?: return
        val snapshot = _state.value.comments
        if (!snapshot.contains(commentId)) return
        update { StoryCommentsReducer.removed(it, commentId) }
        viewModelScope.launch {
            val result = guarded { moderation.removeComment(id, commentId, clean) }
            if (result !is NetworkResult.Success && isViewing(id)) update { snapshot }
        }
    }

    /** Signale un commentaire d'un autre ; [done] reçoit l'issue (vrai : le signalement est parti). */
    fun report(commentId: String, reason: ReportReason, details: String?, done: (Boolean) -> Unit) {
        viewModelScope.launch {
            val result = guarded { reports.reportComment(commentId, reason, details?.trim()?.takeIf { it.isNotEmpty() }) }
            done(result is NetworkResult.Success)
        }
    }

    fun toggleOriginal(commentId: String) {
        _state.update {
            it.copy(showingOriginal = if (commentId in it.showingOriginal) it.showingOriginal - commentId else it.showingOriginal + commentId)
        }
    }

    /**
     * La chasse du commentaire visé par une notification : les pages de racines jusqu'à lui (ou son parent), puis, pour
     * une réponse, le fil du parent déplié et paginé jusqu'à elle. Chaque page rejoint le fil vivant en arrivant.
     */
    fun huntTarget(commentId: String, parentId: String?) {
        val id = storyId ?: return
        viewModelScope.launch {
            val anchors = setOfNotNull(commentId, parentId)
            val roots = StoryCommentChase.roots(_state.value.comments, anchors) { cursor ->
                fetchRootsPage(id, cursor)
            }
            var found = roots is StoryCommentChaseOutcome.Found
            if (found && parentId != null) {
                update { it.copy(thread = it.thread.expandedThread(parentId)) }
                val reply = StoryCommentChase.reply(_state.value.comments, parentId, commentId) { cursor ->
                    fetchRepliesPage(id, parentId, cursor)
                }
                found = reply is StoryCommentChaseOutcome.Found
            }
            if (isViewing(id)) _state.update { it.copy(targetFound = found) }
        }
    }

    private suspend fun fetchRootsPage(id: String, cursor: String?): StoryCommentPage? {
        val result = guarded { repository.roots(id, cursor, prefs) } as? NetworkResult.Success ?: return null
        if (isViewing(id)) update { StoryCommentsReducer.rootsPage(it, result.data) }
        return result.data
    }

    private suspend fun fetchRepliesPage(id: String, rootId: String, cursor: String?): StoryCommentPage? {
        val result = guarded { repository.replies(id, rootId, cursor, prefs) } as? NetworkResult.Success ?: return null
        if (isViewing(id)) update { StoryCommentsReducer.repliesPage(it, rootId, result.data, firstPage = cursor == null) }
        return result.data
    }

    private fun observeRealtime() {
        viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                safely { if (isViewing(event.postId)) update { StoryCommentPublish.echoed(it, event.comment.toStoryComment(prefs), event.commentCount) } }
            }
        }
        viewModelScope.launch {
            socialSocket.commentUpdated.collect { event ->
                safely { if (isViewing(event.postId)) update { StoryCommentsReducer.replaced(it, event.comment.toStoryComment(prefs)) } }
            }
        }
        viewModelScope.launch {
            socialSocket.commentDeleted.collect { event ->
                safely { if (isViewing(event.postId)) update { StoryCommentsReducer.removed(it, event.commentId) } }
            }
        }
        viewModelScope.launch {
            socialSocket.commentTranslationUpdated.collect { event ->
                safely {
                    if (isViewing(event.postId)) {
                        update { StoryCommentsReducer.translated(it, event.commentId, event.language, event.translation, prefs) }
                    }
                }
            }
        }
        viewModelScope.launch { socialSocket.commentReactionAdded.collect { safely { onReaction(it, added = true) } } }
        viewModelScope.launch { socialSocket.commentReactionRemoved.collect { safely { onReaction(it, added = false) } } }
    }

    private fun onReaction(event: SocketCommentReactionUpdateData, added: Boolean) {
        if (!isViewing(event.postId) || event.emoji != STORY_COMMENT_HEART) return
        val count = event.aggregation?.count ?: return
        val me = sessionRepository.currentUser.value?.id
        update { StoryCommentsReducer.reaction(it, event.commentId, count, event.userId, me, added) }
    }

    override fun onCleared() {
        storyId?.let { socialSocket.leavePostRoom(it) }
        super.onCleared()
    }

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    /** Une panne (IOException déjà rendue en échec par le dépôt, ou toute autre) ne fait jamais tomber le fil. */
    private suspend fun <T> guarded(block: suspend () -> T): T? =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }

    private object NoPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }
}
