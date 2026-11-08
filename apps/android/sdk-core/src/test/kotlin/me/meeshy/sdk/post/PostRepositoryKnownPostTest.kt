package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
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
 * #14467 — le détail d'un post se peint depuis ce que l'appareil connaît déjà : la carte du fil (en mémoire ou gardée
 * sur le disque) ou le post qu'un détail précédent a lu. Seul un appareil qui n'a jamais vu ce post rend `null`.
 */
class PostRepositoryKnownPostTest {

    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = NOW
    }

    private class MemoryFeedDisk(private val stored: KeyedJsonDocument<List<ApiPost>>? = null) : FeedDiskCache {
        override suspend fun read(): KeyedJsonDocument<List<ApiPost>>? = stored
        override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) = Unit
    }

    private fun repository(disk: FeedDiskCache = MemoryFeedDisk()) =
        PostRepository(api, translationApi, outbox, clock, null, disk)

    @Test
    fun `a post the feed holds in memory is known`() = runTest {
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "p1", content = "Recette")),
            pagination = Pagination(nextCursor = null, hasMore = false),
        )
        val repo = repository()
        repo.refresh()

        assertThat(repo.knownPost("p1")?.content).isEqualTo("Recette")
    }

    @Test
    fun `a post the feed kept on disk is known before the feed is ever opened`() = runTest {
        val disk = MemoryFeedDisk(KeyedJsonDocument(listOf(ApiPost(id = "p1", content = "Disque")), NOW - 10 * MINUTE))

        assertThat(repository(disk).knownPost("p1")?.content).isEqualTo("Disque")
    }

    @Test
    fun `a post a previous detail read is known once the network is gone`() = runTest {
        coEvery { api.getPost("p9") } returns ApiResponse(success = true, data = ApiPost(id = "p9", content = "Lu"))
        val repo = repository()
        repo.getPost("p9")
        coEvery { api.getPost("p9") } throws IOException("offline")

        assertThat(repo.knownPost("p9")?.content).isEqualTo("Lu")
    }

    @Test
    fun `a post the device never saw is unknown`() = runTest {
        assertThat(repository().knownPost("ghost")).isNull()
    }

    @Test
    fun `a post read by a detail is forgotten when the account changes`() = runTest {
        coEvery { api.getPost("p9") } returns ApiResponse(success = true, data = ApiPost(id = "p9"))
        val repo = repository()
        repo.getPost("p9")

        repo.clear()

        assertThat(repo.knownPost("p9")).isNull()
    }

    @Test
    fun `the detail memory stays bounded`() = runTest {
        val repo = repository()
        (0..PostDetailMemo.CAPACITY).forEach { index ->
            coEvery { api.getPost("p$index") } returns ApiResponse(success = true, data = ApiPost(id = "p$index"))
            repo.getPost("p$index")
        }

        assertThat(repo.knownPost("p0")).isNull()
        assertThat(repo.knownPost("p${PostDetailMemo.CAPACITY}")).isNotNull()
    }

    private companion object {
        const val NOW = 1_800_000_000_000L
        const val MINUTE = 60_000L
    }
}
