package me.meeshy.sdk.post

import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.classifyCache
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import javax.inject.Inject

/**
 * Le moteur CACHE-FIRST des commentaires d'un post, partagé par le détail et les reels (iso `CommentThreadViewModel`
 * iOS) : il sert le disque d'abord ([cached] : frais = servi sans relecture, périmé = servi puis rafraîchi en silence,
 * vide = squelette seulement) et garde le fil au fur et à mesure ([keep]). Il ne décide ni de l'écran ni du réseau :
 * l'appelant le consulte, puis lit la première page et la fusionne avec `CommentSheetRules.mergeFetched`.
 */
public class PostCommentsEngine(
    private val cache: CommentCacheSource,
    private val ticket: suspend () -> AccountTicket?,
    private val clock: CacheClock = SystemCacheClock,
    private val policy: CachePolicy = CachePolicy.Comments,
) {
    @Inject
    public constructor(cache: CommentCacheSource, fence: AccountFence) : this(cache, { fence.currentTicket() })

    /** Le fil gardé, classé par âge ; un disque vide ou illisible est [CacheResult.Empty]. */
    public suspend fun cached(postId: String): CacheResult<List<ApiPostComment>> {
        val document = cache.read(postId)?.takeIf { it.value.isNotEmpty() }
        return classifyCache(document?.value, document?.let { clock.nowMillis() - it.fetchedAt } ?: 0L, policy)
    }

    /** Garde le fil pour le compte courant ; les lignes optimistes et le surplus au-delà de 500 sont écartés. */
    public suspend fun keep(postId: String, comments: List<ApiPostComment>) {
        cache.keep(postId, comments, ticket())
    }
}
