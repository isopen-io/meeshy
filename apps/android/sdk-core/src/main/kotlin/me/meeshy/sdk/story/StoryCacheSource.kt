package me.meeshy.sdk.story

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.DeletionTombstones
import me.meeshy.sdk.model.StoryDeltaCursor
import me.meeshy.sdk.model.StoryTrayPurge
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import me.meeshy.sdk.util.isoToEpochMillis
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** Thrown when a stories revalidation fails; carries the API error message. */
internal class StorySyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the stories feed (ARCHITECTURE.md §4).
 * Mirrors [me.meeshy.sdk.conversation.ConversationCacheSource]: each story post
 * is cached as a serialized payload, `sync_meta` records freshness so an
 * unchanged feed is not rewritten on every revalidation, and a synced-but-empty
 * feed (a real empty list) is distinguished from a cold cache (`null`).
 */
internal class StoryCacheSource(
    private val database: MeeshyDatabase,
    private val storyDao: StoryDao,
    private val syncMetaDao: SyncMetaDao,
    private val storyApi: StoryApi,
    private val clock: CacheClock,
    private val fence: AccountFence? = null,
    private val viewerId: () -> String? = { null },
) : SwrCacheSource<List<ApiPost>> {

    /**
     * L'ordre des écritures locales ([upsertLocal]) : une revalidation retient le rang où elle part, et son élagage
     * épargne toute story écrite APRÈS — une republication adoptée pendant qu'elle était en vol n'est pas sur la page
     * qu'elle a lue, sans être absente du serveur pour autant (#14458).
     */
    private val writeSequence = AtomicLong()
    private val localWrites = ConcurrentHashMap<String, Long>()

    override fun observe(): Flow<List<ApiPost>?> =
        combine(
            storyDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.mapNotNull { it.decodedOrNull() }
            }
        }

    /**
     * Une ligne qui ne se relit plus (écrite par une version antérieure, tronquée) ne
     * coûte qu'ELLE-MÊME : décoder toutes les lignes d'un bloc faisait lever le flux de la
     * barre, et l'exception fermait l'app à l'affichage des stories. La revalidation
     * suivante la réécrit ou l'élague.
     */
    private fun StoryEntity.decodedOrNull(): ApiPost? =
        try {
            MeeshyApi.json.decodeFromString<ApiPost>(payload)
        } catch (_: IllegalArgumentException) {
            null
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    /** Les stories déjà en main, lues une fois — les lignes illisibles sautées. */
    suspend fun readLocal(): List<ApiPost> = storyDao.observeAll().first().mapNotNull { it.decodedOrNull() }

    /**
     * Pages through the feed up to [MAX_PAGES] (`MAX_PAGES * STORIES_PAGE_SIZE` = 300
     * stories, the same tray budget as iOS), following `pagination.nextCursor` while
     * `hasMore` holds. [persist] only prunes rows absent from the fetched set when the
     * window is PROVEN complete — the server said `hasMore = false` — never merely
     * because the budget ran out: an unproven partial window may upsert what it saw,
     * but must never be trusted to know what to delete. A response with no
     * `pagination` block at all (`null`) is treated as a complete single page, matching
     * the API's pre-pagination shape. Any page failing (including the first) throws
     * without persisting anything — Room already holds a complete prior tray, and
     * replacing it with an unproven partial one is worse than serving the stale one
     * a beat longer. A story written locally after this revalidation started (a repost
     * adopted from its 201, a realtime fold) is never pruned by it: its page was read
     * before that story existed, so it proves nothing about it.
     */
    override suspend fun revalidate() {
        val ticket = ticket()
        val startedAt = writeSequence.get()
        val held = purgeDead(ticket)
        val cursor = StoryDeltaCursor.of(held)
        if (cursor != null && revalidateDelta(cursor, ticket)) return
        revalidateFull(ticket, startedAt)
    }

    /**
     * Revalidation silencieuse par delta (iOS R8) : seules les stories créées ou modifiées depuis [cursor] sont
     * demandées, fusionnées sans jamais rien retirer, et les disparitions arrivent par les tombstones du serveur.
     * Rend `false` — l'appelant tombe sur la liste complète — pour toute panne de page, pour des tombstones
     * TRONQUÉS (aucun curseur de reprise : la seule façon de faire sortir les fantômes restants est le
     * remplacement du plateau) et pour une fenêtre non épuisée au plafond de pages.
     */
    private suspend fun revalidateDelta(cursor: String, ticket: AccountTicket?): Boolean {
        val collected = mutableListOf<ApiPost>()
        val deleted = mutableSetOf<String>()
        var truncated = false
        var pageCursor: String? = null
        var exhausted = false

        for (page in 0 until MAX_PAGES) {
            val result = pagedApiCall { storyApi.list(pageCursor, STORIES_PAGE_SIZE, cursor) }
            if (result !is NetworkResult.Success) return false
            val data = result.data
            collected += data.data
            data.meta?.storyTombstones?.let {
                deleted += it.ids
                truncated = truncated || it is DeletionTombstones.Incomplete
            }
            val next = data.pagination?.nextCursor
            if (data.pagination?.hasMore != true || next.isNullOrEmpty()) {
                exhausted = true
                break
            }
            pageCursor = next
        }
        if (!exhausted || truncated) return false

        val now = clock.nowMillis()
        val rows = withSeenHere(collected).map { it.toEntity(now) }
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                if (rows.isNotEmpty()) storyDao.upsertAll(rows)
                if (deleted.isNotEmpty()) storyDao.deleteByIds(deleted.toList())
                syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
            }
        }
        purgeDead(ticket, deleted)
        return true
    }

    private suspend fun revalidateFull(ticket: AccountTicket?, startedAt: Long) {
        val collected = mutableListOf<ApiPost>()
        var cursor: String? = null
        var isComplete = false

        for (page in 0 until MAX_PAGES) {
            when (val result = pagedApiCall { storyApi.list(cursor, STORIES_PAGE_SIZE) }) {
                is NetworkResult.Success -> {
                    collected += result.data.data
                    val hasMore = result.data.pagination?.hasMore ?: false
                    if (!hasMore) {
                        isComplete = true
                        break
                    }
                    cursor = result.data.pagination?.nextCursor ?: break
                }
                is NetworkResult.Failure -> throw StorySyncException(result.error.message)
            }
        }

        persist(collected, prune = isComplete, ticket, writtenAfter = startedAt)
    }

    /**
     * Retire du cache les stories mortes (supprimées, ou expirées sauf celles du lecteur) et rend ce qui reste. Le
     * cache survit à la fenêtre de visibilité d'une story : sans ce balayage il resservirait des stories que le
     * serveur ne renverra plus. Appelé avant chaque revalidation (le curseur delta se dérive de ce qui reste) et à
     * chaque tick du balayage d'expiration.
     */
    suspend fun purgeDead(ticket: AccountTicket?, deletedIds: Set<String> = emptySet()): List<ApiPost> {
        val held = readLocal()
        val dead = StoryTrayPurge.deadIds(held, viewerId(), deletedIds, clock.nowMillis())
        if (dead.isEmpty()) return held
        fence.commitOrWrite(ticket) { storyDao.deleteByIds(dead) }
        val gone = dead.toSet()
        return held.filterNot { it.id in gone }
    }

    /** Les ids retirés par un balayage d'expiration — de quoi libérer leurs médias. */
    suspend fun sweepExpired(): List<String> {
        val held = readLocal()
        val dead = StoryTrayPurge.deadIds(held, viewerId(), nowMillis = clock.nowMillis())
        if (dead.isNotEmpty()) fence.commitOrWrite(ticket()) { storyDao.deleteByIds(dead) }
        return dead
    }

    /**
     * Drops a single cached story by id (a realtime `story:deleted`). The removal is
     * authoritative — the Room-backed [observe] stream re-emits without the row, so the
     * tray repaints. An unknown id is an inert 0-row delete: Room emits nothing, so an
     * over-broadcast deletion for a story the viewer never cached causes no repaint.
     */
    suspend fun deleteLocal(storyId: String, ticket: AccountTicket?) {
        fence.commitOrWrite(ticket) { storyDao.deleteById(storyId) }
    }

    /** Le compte auquel appartient un événement ou une requête qui part MAINTENANT (#13560) ; `null` sans garde. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /**
     * Reads a single cached story by id (decoded), or `null` if it is not cached. The
     * read seam behind the realtime `story:updated` merge — the caller folds the edit
     * onto this copy and writes the result back via [upsertLocal].
     */
    suspend fun findLocal(storyId: String): ApiPost? =
        storyDao.getById(storyId)?.decodedOrNull()

    /**
     * Upserts a single merged story, re-deriving the tray-ordering (`createdAt`) column
     * from it so the Room-backed [observe] stream re-emits with the edit in place. Does
     * not touch `sync_meta`: a realtime fold is not a full revalidation.
     */
    suspend fun upsertLocal(story: ApiPost, ticket: AccountTicket?) {
        localWrites[story.id] = writeSequence.incrementAndGet()
        fence.commitOrWrite(ticket) { storyDao.upsertAll(listOf(story.toEntity(clock.nowMillis()))) }
    }

    private fun ApiPost.toEntity(cachedAt: Long): StoryEntity =
        StoryEntity(
            id = id,
            payload = MeeshyApi.json.encodeToString(this),
            createdAt = isoToEpochMillis(createdAt),
            cachedAt = cachedAt,
        )

    /**
     * Une story déjà vue sur cet appareil le reste : une page servie avant que la vue ne
     * soit arrivée au serveur ne regriserait pas l'anneau à l'envers (vue monotone, comme
     * [me.meeshy.sdk.model.StoryUpdateMerge]).
     */
    private suspend fun withSeenHere(stories: List<ApiPost>): List<ApiPost> {
        val seenHere = readLocal().filter { it.isViewedByMe == true }.mapTo(HashSet()) { it.id }
        return stories.map { if (it.id in seenHere && it.isViewedByMe != true) it.copy(isViewedByMe = true) else it }
    }

    private suspend fun persist(stories: List<ApiPost>, prune: Boolean, ticket: AccountTicket?, writtenAfter: Long) {
        val now = clock.nowMillis()
        val rows = withSeenHere(stories).map { it.toEntity(now) }
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                storyDao.upsertAll(rows)
                if (prune) storyDao.deleteNotIn(rows.map { it.id } + localWrites.filterValues { it > writtenAfter }.keys)
                syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
            }
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "stories"
        private const val STORIES_PAGE_SIZE = 50
        private const val MAX_PAGES = 6
    }
}
