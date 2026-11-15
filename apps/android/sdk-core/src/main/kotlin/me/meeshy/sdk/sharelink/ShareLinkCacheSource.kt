package me.meeshy.sdk.sharelink

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite
import javax.inject.Inject
import javax.inject.Singleton

/** La liste « Mes liens » telle qu'elle est gardée sur disque, et l'instant de sa dernière lecture réseau. */
public data class PersistedShareLinks(val links: List<MyShareLink>, val syncedAt: Long)

/** Où « Mes liens » survit à la mort du process. [NoShareLinksDiskStore] la garde en mémoire seulement. */
public interface ShareLinksDiskStore {
    public suspend fun read(): PersistedShareLinks?

    public suspend fun write(snapshot: PersistedShareLinks)

    public suspend fun clear()
}

public object NoShareLinksDiskStore : ShareLinksDiskStore {
    override suspend fun read(): PersistedShareLinks? = null
    override suspend fun write(snapshot: PersistedShareLinks) = Unit
    override suspend fun clear() = Unit
}

/** Un document JSON dans le magasin générique `keyed_json_cache` (pas de table dédiée). */
@Singleton
internal class RoomShareLinksDiskStore @Inject constructor(
    private val dao: KeyedJsonCacheDao,
    private val fence: AccountFence,
    @IoDispatcher private val dispatcher: CoroutineDispatcher,
) : ShareLinksDiskStore {
    private val serializer = ListSerializer(MyShareLink.serializer())

    override suspend fun read(): PersistedShareLinks? = withContext(dispatcher) {
        val row = dao.find(NAMESPACE, KEY) ?: return@withContext null
        try {
            PersistedShareLinks(MeeshyApi.json.decodeFromString(serializer, row.payload), row.fetchedAt)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
    }

    override suspend fun write(snapshot: PersistedShareLinks) {
        val ticket = fence.currentTicket()
        val payload = withContext(dispatcher) { MeeshyApi.json.encodeToString(serializer, snapshot.links) }
        fence.commitOrWrite(ticket) {
            dao.upsert(KeyedJsonCacheEntity(NAMESPACE, KEY, payload, snapshot.syncedAt))
        }
    }

    override suspend fun clear() {
        dao.delete(NAMESPACE, KEY)
    }

    private companion object {
        const val NAMESPACE = "sharelinks"
        const val KEY = "mine"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ShareLinksDiskModule {
    @Binds
    abstract fun bindShareLinksDiskStore(store: RoomShareLinksDiskStore): ShareLinksDiskStore
}
