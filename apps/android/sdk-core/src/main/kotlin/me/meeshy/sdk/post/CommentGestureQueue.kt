package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.DeleteCommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.ToggleLikeCommentPayload

/** Un geste de commentaire mis en file a renoncé : l'écran défait son effet optimiste. */
sealed interface CommentGestureRollback {
    val commentId: String

    /** Le coeur voulu ([liked]) n'a pas pu partir : l'écran rend l'état inverse. */
    data class Like(override val commentId: String, val liked: Boolean) : CommentGestureRollback

    /** La suppression n'a pas pu partir : le commentaire revient. */
    data class Delete(override val commentId: String) : CommentGestureRollback
}

/**
 * Le coeur et la suppression d'un commentaire quand le réseau ne répond pas (iOS `toggleLikeComment` / `deleteComment`) :
 * le geste entre dans la file durable et part au retour du réseau. Un coeur puis son contraire s'annulent sans requête.
 * Un refus définitif ([CommentGestureRollback]) est annoncé à l'écran qui a appliqué l'optimiste.
 */
@Singleton
class CommentGestureQueue @Inject constructor(
    private val outbox: OutboxRepository,
    private val flush: OutboxFlushScheduler,
) {
    private val flow = MutableSharedFlow<CommentGestureRollback>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    val rollbacks: SharedFlow<CommentGestureRollback> = flow.asSharedFlow()

    /** `true` quand le geste est tenu (en file, ou annulé par son contraire) ; `false` quand la file l'a refusé. */
    suspend fun queueLike(postId: String, commentId: String, liked: Boolean): Boolean =
        queue(
            OutboxMutation(
                kind = OutboxKind.TOGGLE_LIKE_COMMENT,
                lane = OutboxLanes.COMMENT,
                targetId = commentId,
                payload = MeeshyApi.json.encodeToString(ToggleLikeCommentPayload.serializer(), ToggleLikeCommentPayload(postId, liked)),
            ),
        )

    suspend fun queueDelete(postId: String, commentId: String): Boolean =
        queue(
            OutboxMutation(
                kind = OutboxKind.DELETE_COMMENT,
                lane = OutboxLanes.COMMENT,
                targetId = commentId,
                payload = MeeshyApi.json.encodeToString(DeleteCommentPayload.serializer(), DeleteCommentPayload(postId)),
            ),
        )

    internal fun rolledBack(rollback: CommentGestureRollback) {
        flow.tryEmit(rollback)
    }

    private suspend fun queue(mutation: OutboxMutation): Boolean {
        val result = outbox.tryEnqueue(mutation)
        if (result is me.meeshy.sdk.outbox.OutboxEnqueueResult.QueueFull) return false
        flush.schedule()
        return true
    }
}
