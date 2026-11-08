package me.meeshy.sdk.post

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.postTypeFromWire
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.toContentFetchFailure

/** Ce que l'opener de réel lit : le cache de l'appareil (le push y précharge le post), puis le réseau. */
public interface ReelPostSource {
    public suspend fun cached(postId: String): ApiPost?
    public suspend fun fetch(postId: String): NetworkResult<ApiPost>
}

/** Où atterrit le toucher d'une notification de réel (iOS `ReelNotificationDestination`, #6508). */
public sealed interface ReelDestination {
    public data class Reel(val post: ApiPost) : ReelDestination

    /** Le post EXISTE et n'est pas un réel : le détail universel le rend, amorcé par le post déjà lu. */
    public data class PostDetail(val post: ApiPost) : ReelDestination

    /** La lecture a échoué : le lecteur s'ouvre sur cette cause. */
    public data class Failure(val failure: ContentFetchFailure) : ReelDestination
}

public val ApiPost.isReel: Boolean get() = postTypeFromWire(type) == PostType.REEL

/**
 * UNE requête et la vraie cause d'un échec (iOS `ReelNotificationOpener`). Cache d'abord ; un cache qui tient un post
 * NON-réel ne tranche pas, le réseau reclasse.
 */
public class ReelNotificationOpener(private val source: ReelPostSource) {
    public suspend fun destination(postId: String): ReelDestination {
        source.cachedReel(postId)?.let { return ReelDestination.Reel(it) }
        return when (val result = source.safeFetch(postId)) {
            is NetworkResult.Success ->
                if (result.data.isReel) ReelDestination.Reel(result.data) else ReelDestination.PostDetail(result.data)
            is NetworkResult.Failure -> ReelDestination.Failure(result.error.toContentFetchFailure())
        }
    }

    private suspend fun ReelPostSource.cachedReel(postId: String): ApiPost? =
        try {
            cached(postId)?.takeIf { it.isReel }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }

    private suspend fun ReelPostSource.safeFetch(postId: String): NetworkResult<ApiPost> =
        try {
            fetch(postId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = failure.message.orEmpty(), code = if (failure is java.io.IOException) "NETWORK" else null))
        }
}

/** Ce que la porte demande au lecteur immersif (iOS `ReelsPresenting`). */
public interface ReelsPresenting {
    public fun present(post: ApiPost, commentId: String?, parentCommentId: String?)
    public fun presentFailure(failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?)
}

/**
 * La seule porte d'un réel nommé, pour toutes les entrées (iOS `ReelDoor`). Chaque racine ne fournit que SA façon
 * d'ouvrir un détail de post.
 */
public class ReelDoor(
    private val opener: ReelNotificationOpener,
    private val presenter: ReelsPresenting,
) {
    public suspend fun open(
        postId: String,
        commentId: String? = null,
        parentCommentId: String? = null,
        showPostDetail: (ApiPost) -> Unit,
    ) {
        when (val destination = opener.destination(postId)) {
            is ReelDestination.Reel -> presenter.present(destination.post, commentId, parentCommentId)
            is ReelDestination.PostDetail -> showPostDetail(destination.post)
            is ReelDestination.Failure -> presenter.presentFailure(destination.failure, postId, commentId, parentCommentId)
        }
    }
}
