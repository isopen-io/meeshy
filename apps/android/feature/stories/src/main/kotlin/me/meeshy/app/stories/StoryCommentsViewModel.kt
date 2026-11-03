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
import me.meeshy.sdk.model.STORY_COMMENT_HEART
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.StoryCommentChase
import me.meeshy.sdk.model.StoryCommentChaseOutcome
import me.meeshy.sdk.model.StoryCommentPage
import me.meeshy.sdk.model.StoryCommentsReducer
import me.meeshy.sdk.model.StoryCommentsState
import me.meeshy.sdk.model.toStoryComment
import me.meeshy.sdk.net.NetworkResult
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
) : ViewModel() {

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
        _state.value = StoryCommentsUiState(comments = StoryCommentsState(count = payloadCount))
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

    fun edit(commentId: String, text: String) {
        val id = storyId ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            val result = guarded { repository.edit(id, commentId, text, prefs) }
            if (result is NetworkResult.Success && isViewing(id)) update { StoryCommentsReducer.replaced(it, result.data) }
        }
    }

    fun delete(commentId: String) {
        val id = storyId ?: return
        viewModelScope.launch {
            val result = guarded { repository.delete(id, commentId) }
            if (result is NetworkResult.Success && isViewing(id)) update { StoryCommentsReducer.removed(it, commentId) }
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
                safely { if (isViewing(event.postId)) update { StoryCommentsReducer.added(it, event.comment.toStoryComment(prefs), event.commentCount) } }
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
