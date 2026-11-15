package me.meeshy.sdk.mediahub

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.CacheCursorStore
import me.meeshy.sdk.cache.store.CacheStoreRegistry
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.cache.PaginationCursor
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.ConversationMediaRules

/**
 * L'index des médias d'une conversation sur Room (`cache_entries`, espace [NAMESPACE]), un index par genre
 * ([ConversationMediaKind.indexKey]) — miroir de `CacheCoordinator.conversationMedia` (iOS) : sans plafond,
 * rétention six mois, fraîcheur dix minutes ([CachePolicy.ConversationMedia]). Le drapeau « le serveur a dit
 * c'est tout » voyage dans le curseur de la clé. Inscrit à l'inventaire des caches : la déconnexion le vide.
 */
@Singleton
class ConversationMediaCacheSource @Inject constructor(
    registry: CacheStoreRegistry,
    dao: CacheEntryDao,
    private val clock: CacheClock,
) : ConversationMediaPersistence {

    private val store = registry.roomStore(
        dao = dao,
        namespace = NAMESPACE,
        policy = CachePolicy.ConversationMedia,
        serializer = ApiMessage.serializer(),
        itemId = { it.id },
        clock = clock,
    )
    private val cursors = CacheCursorStore(dao, NAMESPACE)

    override suspend fun read(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry? {
        val key = kind.indexKey(conversationId)
        val carriers = when (val result = store.load(key)) {
            is CacheResult.Fresh -> result.value
            is CacheResult.Stale -> result.value
            is CacheResult.Syncing, CacheResult.Empty -> return null
        }
        val complete = cursors.load(key)?.hasMore == false
        return MediaHubIndexEntry(ConversationMediaRules.admitted(carriers, clock.nowMillis()), complete)
    }

    override suspend fun write(conversationId: String, kind: ConversationMediaKind, entry: MediaHubIndexEntry) {
        val key = kind.indexKey(conversationId)
        store.save(ConversationMediaRules.admitted(entry.carriers, clock.nowMillis()), key)
        cursors.save(PaginationCursor(nextCursor = null, hasMore = !entry.isComplete), key)
    }

    override suspend fun invalidate(conversationId: String) {
        ConversationMediaKind.entries.forEach { store.clear(it.indexKey(conversationId)) }
    }

    /** `true` quand l'index du genre est dans sa fenêtre de fraîcheur : la tête n'a pas besoin d'être relue. */
    suspend fun isFresh(conversationId: String, kind: ConversationMediaKind): Boolean =
        store.load(kind.indexKey(conversationId)) is CacheResult.Fresh

    companion object {
        const val NAMESPACE: String = "convmedia"
    }
}
