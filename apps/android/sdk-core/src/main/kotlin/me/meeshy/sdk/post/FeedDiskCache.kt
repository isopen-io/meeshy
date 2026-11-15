package me.meeshy.sdk.post

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La première page du fil telle qu'elle survit à un redémarrage (#14263) — le pendant du `CacheCoordinator.feed` iOS
 * (`main-feed`, GRDB). Un démarrage à froid sans réseau sert ces publications, même périmées, au lieu d'un fil vide.
 */
public interface FeedDiskCache {
    /** Le fil gardé et l'instant où le serveur l'a servi ; `null` à froid ou si la charge ne se lit plus. */
    public suspend fun read(): KeyedJsonDocument<List<ApiPost>>?

    /**
     * Garde [posts] pour le compte de [ticket] sans jamais faire attendre l'appelant : publier la page relance le flux du
     * fil, qui annule le bloc appelant, et une écriture suspendue dans ce bloc n'atteindrait jamais le disque. Une
     * écriture qui échoue ne garde rien et ne lève jamais.
     */
    public fun keep(posts: List<ApiPost>, ticket: AccountTicket?)

    public companion object {
        /** Aucun disque : le fil ne vit qu'en mémoire (tests, aperçus). */
        public val NONE: FeedDiskCache = object : FeedDiskCache {
            override suspend fun read(): KeyedJsonDocument<List<ApiPost>>? = null
            override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) = Unit
        }
    }
}

/**
 * [FeedDiskCache] sur le cache JSON du disque (`feed:home`). Les écritures passent l'une après l'autre sur son propre
 * écrivain et seule la plus récente compte. La frontière de compte est celle du cache : une page d'un compte fermé ne
 * s'écrit pas, et la purge de session vide la table entière.
 */
@Singleton
public class KeyedFeedDiskCache(private val cache: KeyedJsonCache, scope: CoroutineScope) : FeedDiskCache {

    @Inject
    public constructor(dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(KeyedJsonCache(dao, fence = fence), CoroutineScope(SupervisorJob() + Dispatchers.IO))

    private val serializer = ListSerializer(ApiPost.serializer())

    private class Pending(val posts: List<ApiPost>, val ticket: AccountTicket?)

    private val pending = Channel<Pending>(Channel.CONFLATED)

    init {
        scope.launch { for (page in pending) write(page) }
    }

    override suspend fun read(): KeyedJsonDocument<List<ApiPost>>? = try {
        cache.get(NAMESPACE, KEY, serializer)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) {
        pending.trySend(Pending(posts, ticket))
    }

    private suspend fun write(page: Pending) {
        try {
            cache.put(NAMESPACE, KEY, page.posts, serializer, page.ticket)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            Unit
        }
    }

    private companion object {
        const val NAMESPACE = "feed:home"
        const val KEY = "page0"
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface FeedDiskCacheModule {
    @Binds
    public fun feedDiskCache(impl: KeyedFeedDiskCache): FeedDiskCache
}

/**
 * Le disque du fil n'est relu qu'UNE fois par compte, même sous deux abonnés : ensuite la mémoire fait foi. Seul un fil
 * gardé non vide se sert — un disque vide laisse le démarrage à froid à l'état vide.
 */
internal class FeedDiskRestore(private val disk: FeedDiskCache) {
    private val mutex = Mutex()
    private var consulted = false

    suspend fun once(serve: suspend (KeyedJsonDocument<List<ApiPost>>) -> Unit) {
        mutex.withLock {
            if (consulted) return
            consulted = true
            disk.read()?.takeIf { it.value.isNotEmpty() }?.let { serve(it) }
        }
    }

    suspend fun reset() {
        mutex.withLock { consulted = false }
    }
}
