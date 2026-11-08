package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.PostGalleryCommentFeed

/**
 * **Les commentaires que la galerie d'un post feuillette** — miroir de `PostGalleryCommentSource` iOS : le cache des
 * commentaires d'abord (jamais d'attente réseau quand il répond), le réseau ensuite si le cache n'est pas frais et que le
 * post annonce plus de commentaires qu'on n'en tient. **Lecture seule** : la galerie n'écrit jamais ce cache, que l'écran
 * des commentaires possède.
 */
@Singleton
public class PostGalleryCommentSource internal constructor(
    private val cache: CommentCacheSource,
    private val fetch: suspend (postId: String) -> List<ApiPostComment>?,
    private val clock: CacheClock,
) {
    @Inject
    public constructor(cache: CommentCacheSource, repository: PostRepository, clock: CacheClock) :
        this(cache, { postId -> repository.getComments(postId, null, FETCH_LIMIT).getOrNull() }, clock)

    /**
     * Les états successifs de la liste : [embedded] d'abord, puis fusionnée au cache, puis au réseau. Un cache frais
     * clôt le flux ; une panne réseau laisse le dernier état, sans erreur.
     */
    public fun comments(postId: String, embedded: List<ApiPostComment>, commentCount: Int): Flow<List<ApiPostComment>> = flow {
        var current = embedded
        emit(current)
        val cached = readCache(postId)
        if (cached != null) {
            current = PostGalleryCommentFeed.merging(cached.comments, current)
            emit(current)
            if (cached.isFresh) return@flow
        }
        if (commentCount <= current.size) return@flow
        val fetched = fetchOrNull(postId) ?: return@flow
        emit(PostGalleryCommentFeed.merging(fetched, current))
    }

    private class Cached(val comments: List<ApiPostComment>, val isFresh: Boolean)

    private suspend fun readCache(postId: String): Cached? {
        val document = cache.read(postId) ?: return null
        val age = clock.nowMillis() - document.fetchedAt
        if (age > CachePolicy.Comments.keepForMillis) return null
        return Cached(document.value, isFresh = age <= CachePolicy.Comments.freshForMillis)
    }

    private suspend fun fetchOrNull(postId: String): List<ApiPostComment>? = try {
        fetch(postId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val FETCH_LIMIT = 20
    }
}
