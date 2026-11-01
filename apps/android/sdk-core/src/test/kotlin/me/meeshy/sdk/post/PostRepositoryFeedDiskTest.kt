package me.meeshy.sdk.post

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountTicket
import org.junit.Test
import java.io.IOException

/**
 * #14263 — le fil se sert du disque d'abord : un démarrage à froid hors ligne montre les publications déjà vues, même
 * périmées, au lieu de « Impossible de charger le fil ». Seul un disque vide rend le fil vide.
 */
class PostRepositoryFeedDiskTest {

    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = NOW
    }

    /** Un disque en mémoire : comme l'écrivain de l'appareil, il garde la page sans faire attendre l'appelant. */
    private class MemoryFeedDisk(var stored: KeyedJsonDocument<List<ApiPost>>? = null) : FeedDiskCache {
        val writes = mutableListOf<List<ApiPost>>()
        override suspend fun read(): KeyedJsonDocument<List<ApiPost>>? = stored
        override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) {
            writes += posts
            stored = KeyedJsonDocument(posts, NOW)
        }
    }

    private fun repository(disk: FeedDiskCache) = PostRepository(api, translationApi, outbox, clock, null, disk)

    private fun offline() {
        coEvery { api.getFeed(any(), any()) } throws IOException("offline")
    }

    private fun CacheResult<List<ApiPost>>.postIds(): List<String> = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value.orEmpty()
        CacheResult.Empty -> emptyList()
    }.map { it.id }

    @Test
    fun `a cold start without network serves the feed kept on disk`() = runTest {
        offline()
        val disk = MemoryFeedDisk(KeyedJsonDocument(listOf(ApiPost(id = "p1"), ApiPost(id = "p2")), NOW - 10 * MINUTE))
        var failures = 0

        repository(disk).feedStream(onSyncError = { failures++ }).test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
            assertThat(first.postIds()).containsExactly("p1", "p2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(failures).isEqualTo(1)
    }

    @Test
    fun `a feed kept on disk past its keep window is still served while it revalidates`() = runTest {
        offline()
        val disk = MemoryFeedDisk(KeyedJsonDocument(listOf(ApiPost(id = "old")), NOW - 30 * DAY))

        repository(disk).feedStream().test {
            val first = awaitItem()
            assertThat(first).isInstanceOf(CacheResult.Syncing::class.java)
            assertThat(first.postIds()).containsExactly("old")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an empty disk is the only cold start that shows an empty feed`() = runTest {
        offline()

        repository(MemoryFeedDisk()).feedStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the first page read from the gateway is kept on disk for the next cold start`() = runTest {
        val page = listOf(ApiPost(id = "n1"), ApiPost(id = "n2"))
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = page, pagination = Pagination(nextCursor = null, hasMore = false))
        val disk = MemoryFeedDisk()

        repository(disk).refresh()

        assertThat(disk.writes.single().map { it.id }).containsExactly("n1", "n2").inOrder()
    }

    @Test
    fun `the first page the feed stream reads from the gateway is kept on disk, even though the stream moves on`() = runTest {
        val page = listOf(ApiPost(id = "n1"), ApiPost(id = "n2"))
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = page, pagination = Pagination(nextCursor = null, hasMore = false))
        val disk = MemoryFeedDisk()

        repository(disk).feedStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            assertThat(awaitItem().postIds()).containsExactly("n1", "n2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }

        assertThat(disk.writes.map { posts -> posts.map { it.id } }).containsExactly(listOf("n1", "n2"))
    }

    @Test
    fun `the network page replaces the disk feed once it arrives`() = runTest {
        val page = listOf(ApiPost(id = "n1"))
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = page, pagination = Pagination(nextCursor = null, hasMore = false))
        val disk = MemoryFeedDisk(KeyedJsonDocument(listOf(ApiPost(id = "d1")), NOW - 10 * MINUTE))

        repository(disk).feedStream().test {
            assertThat(awaitItem().postIds()).containsExactly("d1")
            assertThat(awaitItem().postIds()).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    private companion object {
        const val NOW = 1_800_000_000_000L
        const val MINUTE = 60_000L
        const val DAY = 24 * 60 * MINUTE
    }
}
