package me.meeshy.sdk.cache.purge

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.mediacache.CacheAttributionDeriver
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.net.MeeshyApi

/**
 * L'attribution dérivée de Room : les pièces jointes des messages -> Conversations, les médias des stories -> Stories,
 * le fil persisté (`feed:home`) et le registre ([MediaAttributionLedger]) -> Publications et Réels. Une charge illisible
 * est écartée : elle ne revendique rien et ses fichiers tombent dans les médias orphelins.
 */
public class RoomCacheAttributionSource(
    private val database: MeeshyDatabase,
    private val ledger: MediaAttributionLedger,
    private val json: Json = MeeshyApi.json,
) : CacheAttributionSource {

    override suspend fun index(): Map<CacheDomain, CacheMediaIndex> {
        val feed = CacheAttributionDeriver.indexFeed(persistedFeed())
        return mapOf(
            CacheDomain.POSTS to (feed.getValue(CacheDomain.POSTS) + ledger.index(CacheDomain.POSTS)),
            CacheDomain.REELS to (feed.getValue(CacheDomain.REELS) + ledger.index(CacheDomain.REELS)),
            CacheDomain.CONVERSATIONS to messagesIndex(),
            CacheDomain.STORIES to storiesIndex(),
        )
    }

    private suspend fun persistedFeed(): List<ApiPost> {
        val raw = database.keyedJsonCacheDao().find(FEED_NAMESPACE, FEED_KEY)?.payload
            ?: return emptyList()
        return runCatching { json.decodeFromString(ListSerializer(ApiPost.serializer()), raw) }.getOrDefault(emptyList())
    }

    private suspend fun messagesIndex(): CacheMediaIndex {
        val dao = database.messageDao()
        return pages { limit, offset -> dao.payloadPage(limit, offset) }.fold(CacheMediaIndex()) { acc, page ->
            val messages = page.mapNotNull { runCatching { json.decodeFromString(ApiMessage.serializer(), it) }.getOrNull() }
            acc + CacheAttributionDeriver.indexMessages(messages)
        }
    }

    private suspend fun storiesIndex(): CacheMediaIndex {
        val dao = database.storyDao()
        return pages { limit, offset -> dao.payloadPage(limit, offset) }.fold(CacheMediaIndex()) { acc, page ->
            val stories = page.mapNotNull { runCatching { json.decodeFromString(ApiPost.serializer(), it) }.getOrNull() }
            acc + CacheAttributionDeriver.indexStories(stories)
        }
    }

    private suspend fun pages(load: suspend (Int, Int) -> List<String>): List<List<String>> {
        val result = ArrayList<List<String>>()
        var offset = 0
        while (true) {
            val page = load(PAGE_SIZE, offset)
            if (page.isEmpty()) break
            result += page
            if (page.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }
        return result
    }

    private companion object {
        const val PAGE_SIZE = 300
    }
}

/** Les charges Room de la purge : messages, conversations, stories et fil (Publications). */
public class RoomCachePayloadStores(private val database: MeeshyDatabase) : CachePayloadStores {

    override fun store(kind: CacheDataKind, domain: CacheDomain): CachePayloadStore? = when {
        kind == CacheDataKind.MESSAGES && domain == CacheDomain.CONVERSATIONS -> messages()
        kind == CacheDataKind.PAYLOADS && domain == CacheDomain.POSTS -> feed()
        kind == CacheDataKind.PAYLOADS && domain == CacheDomain.CONVERSATIONS -> conversations()
        kind == CacheDataKind.PAYLOADS && domain == CacheDomain.STORIES -> stories()
        else -> null
    }

    private fun messages() = object : CachePayloadStore {
        private val dao = database.messageDao()
        override suspend fun bytes(): Long = dao.purgeablePayloadBytes()
        override suspend fun clear(): Long = dao.purgeablePayloadBytes().also { dao.clearPurgeable() }
    }

    private fun conversations() = object : CachePayloadStore {
        private val dao = database.conversationDao()
        override suspend fun bytes(): Long = dao.payloadBytes()
        override suspend fun clear(): Long = dao.payloadBytes().also { dao.clear() }
    }

    private fun stories() = object : CachePayloadStore {
        private val dao = database.storyDao()
        override suspend fun bytes(): Long = dao.payloadBytes()
        override suspend fun clear(): Long = dao.payloadBytes().also { dao.clear() }
    }

    private fun feed() = object : CachePayloadStore {
        private val dao = database.keyedJsonCacheDao()
        override suspend fun bytes(): Long = dao.find(FEED_NAMESPACE, FEED_KEY)
            ?.payload?.toByteArray(Charsets.UTF_8)?.size?.toLong() ?: 0L
        override suspend fun clear(): Long = bytes().also { dao.delete(FEED_NAMESPACE, FEED_KEY) }
    }
}

/** Le cache JSON du fil (`KeyedFeedDiskCache`) : la même adresse, relue ici sans en rouvrir le type. */
private const val FEED_NAMESPACE = "feed:home"
private const val FEED_KEY = "page0"
