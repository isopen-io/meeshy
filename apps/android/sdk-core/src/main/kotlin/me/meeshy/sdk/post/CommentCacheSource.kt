package me.meeshy.sdk.post

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentSheetRules
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les commentaires d'un post tels qu'ils survivent à un redémarrage — le pendant de `CacheCoordinator.comments` iOS
 * (clé `post-<id>`, plafond 500). Ce que la ligne porte (résumé de réactions, lieu, médias, traductions) voyage avec
 * elle : un `comment:reaction-*` ou `comment:media-updated` appliqué au fil se relit donc après un redémarrage.
 */
public interface CommentCacheSource {
    /** Le fil gardé et l'instant où le serveur l'a servi ; `null` à froid ou si la charge ne se lit plus (dégradé en vide). */
    public suspend fun read(postId: String): KeyedJsonDocument<List<ApiPostComment>>?

    /**
     * Garde [comments] pour le compte de [ticket] sans jamais faire attendre l'appelant. Une ligne optimiste
     * (`tmp_` / `cmid_`) n'est JAMAIS écrite et le fil est plafonné à [CommentSheetRules.PERSISTED_CAP]. Une écriture
     * qui échoue ne garde rien et ne lève jamais.
     */
    public fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?)

    public companion object {
        /** Aucun disque : le fil ne vit qu'en mémoire (tests, aperçus). */
        public val NONE: CommentCacheSource = object : CommentCacheSource {
            override suspend fun read(postId: String): KeyedJsonDocument<List<ApiPostComment>>? = null
            override fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?) = Unit
        }
    }
}

/** [CommentCacheSource] sur le cache JSON du disque (`post-comments`). La purge de session vide la table entière. */
@Singleton
public class KeyedCommentCacheSource(
    private val cache: KeyedJsonCache,
    scope: CoroutineScope,
) : CommentCacheSource, PerAccountCache {

    @Inject
    public constructor(dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(KeyedJsonCache(dao, fence = fence), CoroutineScope(SupervisorJob() + Dispatchers.IO))

    private val serializer = ListSerializer(ApiPostComment.serializer())

    private class Pending(val postId: String, val comments: List<ApiPostComment>, val ticket: AccountTicket?)

    private val pending = Channel<Pending>(Channel.UNLIMITED)

    init {
        scope.launch { for (entry in pending) write(entry) }
    }

    override suspend fun read(postId: String): KeyedJsonDocument<List<ApiPostComment>>? = try {
        cache.get(NAMESPACE, key(postId), serializer)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    override fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?) {
        pending.trySend(Pending(postId, CommentSheetRules.persistable(comments), ticket))
    }

    override suspend fun clear() {
        cache.clearNamespace(NAMESPACE)
    }

    private suspend fun write(entry: Pending) {
        try {
            cache.put(NAMESPACE, key(entry.postId), entry.comments, serializer, entry.ticket)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            Unit
        }
    }

    private fun key(postId: String) = "post-$postId"

    private companion object {
        const val NAMESPACE = "post-comments"
    }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class CommentCacheModule {
    @Binds
    public abstract fun commentCache(impl: KeyedCommentCacheSource): CommentCacheSource

    @Binds
    @IntoSet
    public abstract fun commentCachePurge(impl: KeyedCommentCacheSource): PerAccountCache
}
