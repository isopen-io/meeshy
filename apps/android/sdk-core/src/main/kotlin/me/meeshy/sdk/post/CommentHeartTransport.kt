package me.meeshy.sdk.post

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.SocialSocketManager
import javax.inject.Inject

/** Le chemin socket du coeur : lève quand rien n'est livré. */
public fun interface CommentHeartSocket {
    public suspend fun react(add: Boolean, commentId: String, postId: String, emoji: String)
}

/** Le repli REST du coeur, idempotent : `true` quand il est persisté. */
public fun interface CommentHeartRest {
    public suspend fun deliver(add: Boolean, commentId: String, postId: String): Boolean
}

/**
 * Le transport du coeur d'un commentaire — iso `CommentHeartTransport` iOS : la réaction socket ❤️ d'abord, sous un
 * délai DUR (un socket suspendu ne bloque jamais le bouton), le repli REST ensuite. Il ne touche à aucun état :
 * l'appelant applique l'optimiste avant l'appel et annule quand rien n'a été livré.
 */
public class CommentHeartTransport(
    private val socket: CommentHeartSocket,
    private val rest: CommentHeartRest,
    private val timeoutMillis: Long = SOCKET_TIMEOUT_MILLIS,
) {
    @Inject
    public constructor(socialSocket: SocialSocketManager, posts: PostRepository) : this(
        socket = CommentHeartSocket { add, commentId, postId, emoji -> socialSocket.reactToComment(add, commentId, postId, emoji) },
        rest = CommentHeartRest { add, commentId, postId ->
            val result = if (add) posts.likeComment(postId, commentId) else posts.unlikeComment(postId, commentId)
            result is NetworkResult.Success
        },
    )

    /** `true` quand le coeur est persisté (socket, ou repli REST) ; `false` quand les deux chemins ont échoué. */
    public suspend fun deliver(wasLiked: Boolean, commentId: String, postId: String): Boolean {
        val add = !wasLiked
        return try {
            withTimeout(timeoutMillis) { socket.react(add, commentId, postId, HEART) }
            true
        } catch (_: TimeoutCancellationException) {
            fallback(add, commentId, postId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            fallback(add, commentId, postId)
        }
    }

    private suspend fun fallback(add: Boolean, commentId: String, postId: String): Boolean = try {
        rest.deliver(add, commentId, postId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    public companion object {
        public const val HEART: String = "❤️"
        public const val SOCKET_TIMEOUT_MILLIS: Long = 10_000L
    }
}
