package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import me.meeshy.sdk.post.UnsentComment
import me.meeshy.sdk.post.UnsentCommentResult
import me.meeshy.sdk.post.UnsentComments
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.comments.CommentUnsentState

/**
 * Le miroir du fil et de la FILE durable pour un post (iOS `PostDetailViewModel+CommentSend`, `CommentUnsentBadge`) : un
 * commentaire mis en file apparaît tout de suite (id = son `cmid`, compteur du parent +1, fil ouvert), part au retour du
 * réseau, et se relit depuis la file — il survit donc à la fermeture de la feuille et au redémarrage. L'écho
 * `comment:added` le remplace par `clientMutationId`. Une ligne livrée quitte la file : le fil est relu puis la ligne
 * optimiste part ; une ligne qui renonce reste, marquée, et prévient l'auteur une fois.
 */
internal class CommentOutboxMirror(
    private val postId: String,
    private val unsent: UnsentComments,
    private val thread: MutableStateFlow<CommentThreadState>,
    private val replies: MutableStateFlow<CommentRepliesState>,
    private val session: SessionRepository,
    private val onGaveUp: (UnsentComment) -> Unit,
    private val onSettled: suspend () -> Unit,
) {
    private val marks = MutableStateFlow<Map<String, CommentUnsentState>>(emptyMap())

    /** L'état de chaque ligne locale du fil, par `cmid` : en attente ou en échec. */
    val states: StateFlow<Map<String, CommentUnsentState>> = marks.asStateFlow()

    private var known: Map<String, UnsentComment> = emptyMap()
    private var first = true

    /** Suit la file jusqu'à l'annulation de l'appelant. */
    suspend fun run() {
        unsent.observe(postId).collect { now ->
            try {
                apply(now)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // le miroir est une commodité — le fil à l'écran reste
            }
        }
    }

    suspend fun retry(cmid: String): Boolean = unsent.retryCreateComment(cmid) == UnsentCommentResult.Done

    suspend fun cancel(cmid: String): Boolean = unsent.cancelCreateComment(cmid) == UnsentCommentResult.Done

    /** « Reprendre » : le texte de la ligne (que le composer ajoute à l'existant) ; la ligne quitte la file. */
    suspend fun resume(cmid: String): String? = unsent.resume(cmid)

    private suspend fun apply(now: List<UnsentComment>) {
        val byId = now.associateBy { it.cmid }
        now.filter { it.cmid !in known }.forEach(::show)
        if (!first) now.filter { it.isFailed && known[it.cmid]?.isFailed == false }.forEach(onGaveUp)
        val gone = known.values.filter { it.cmid !in byId }
        if (gone.isNotEmpty()) {
            onSettled()
            gone.forEach(::hide)
        }
        known = byId
        first = false
        marks.value = byId.mapValues { (_, item) -> if (item.isFailed) CommentUnsentState.Failed() else CommentUnsentState.Pending }
    }

    private fun show(item: UnsentComment) {
        val row = optimisticRow(item)
        val parentId = item.payload.parentId?.takeIf { it.isNotBlank() }
        if (parentId == null) {
            thread.update { it.optimistic(row) }
        } else {
            replies.update { it.optimisticReply(parentId, row) }
            thread.update { it.bumpReplyCount(parentId, 1) }
        }
    }

    private fun hide(item: UnsentComment) {
        val parentId = item.payload.parentId?.takeIf { it.isNotBlank() }
        if (parentId == null) {
            thread.update { it.failed(item.cmid) }
        } else {
            val wasShown = item.cmid in replies.value.pendingReplyIds
            replies.update { it.failedReply(parentId, item.cmid) }
            if (wasShown) thread.update { it.bumpReplyCount(parentId, -1) }
        }
    }

    private fun optimisticRow(item: UnsentComment): ApiPostComment {
        val me = session.currentUser.value
        return ApiPostComment(
            id = item.cmid,
            content = item.payload.content,
            originalLanguage = item.payload.originalLanguage,
            parentId = item.payload.parentId,
            effectFlags = item.payload.effectFlags,
            location = item.payload.location,
            author = me?.let { ApiAuthor(id = it.id, username = it.username, displayName = it.displayName, avatar = it.avatar) },
        )
    }
}
