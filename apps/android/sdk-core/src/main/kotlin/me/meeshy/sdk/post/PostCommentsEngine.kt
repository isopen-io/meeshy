package me.meeshy.sdk.post

import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.classifyCache
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import me.meeshy.sdk.model.comment.CommentEditRequest
import me.meeshy.sdk.model.comment.CommentEditing
import me.meeshy.sdk.net.NetworkResult
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

    public companion object {
        /**
         * L'ÉDITION en place d'un commentaire (iOS `updateComment`) : la ligne est remplacée aussitôt, même id, jamais
         * insérée, dans le fil ou dans les réponses qui la portent ; [send] part ensuite. Le serveur confirme avec sa
         * ligne, et la ligne éditée reste ; l'écho `comment:updated` la reconfirme par [applyEcho] (idempotent). S'il refuse,
         * ou si l'envoi échoue, la ligne d'origine revient.
         */
        public suspend fun edit(
            thread: MutableStateFlow<CommentThreadState>,
            replies: MutableStateFlow<CommentRepliesState>,
            target: ApiPostComment,
            request: CommentEditRequest,
            send: suspend (CommentEditRequest) -> NetworkResult<ApiPostComment>,
        ): CommentEditOutcome {
            applyEcho(thread, replies, CommentEditing.edited(target, request))
            return try {
                when (val result = send(request)) {
                    is NetworkResult.Success -> CommentEditOutcome.Confirmed(result.data)
                    is NetworkResult.Failure -> CommentEditOutcome.Refused(result.error.message).also { applyEcho(thread, replies, target) }
                }
            } catch (e: CancellationException) {
                applyEcho(thread, replies, target)
                throw e
            } catch (e: Exception) {
                applyEcho(thread, replies, target)
                CommentEditOutcome.Refused(e.message)
            }
        }

        /** Remplace la ligne [comment] là où elle vit, racine ou réponse — inerte si elle n'est plus là. */
        public fun applyEcho(
            thread: MutableStateFlow<CommentThreadState>,
            replies: MutableStateFlow<CommentRepliesState>,
            comment: ApiPostComment,
        ) {
            thread.update { it.replaced(comment) }
            replies.update { it.replacedReply(comment) }
        }
    }
}

/** L'issue d'une édition : la ligne du serveur, ou le refus (la ligne d'origine est déjà revenue). */
public sealed interface CommentEditOutcome {
    public data class Confirmed(val comment: ApiPostComment) : CommentEditOutcome
    public data class Refused(val message: String?) : CommentEditOutcome
}
