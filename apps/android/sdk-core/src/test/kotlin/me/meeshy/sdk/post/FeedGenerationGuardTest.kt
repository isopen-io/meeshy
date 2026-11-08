package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountTicket
import org.junit.Test

/** #12457 : la relecture garde les pages defilees, une page tardive est ignoree, les likes en file sont rejoues, le disque est plafonne. */
class FeedGenerationGuardTest {

    private class RecordingDisk : FeedDiskCache {
        val writes = mutableListOf<List<ApiPost>>()
        override suspend fun read() = null
        override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) {
            writes += posts
        }
    }

    private val api: PostApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)
    private val disk = RecordingDisk()
    private val repository = PostRepository(api, mockk(relaxed = true), outbox, feedDisk = disk)

    private fun post(id: String, minute: Int, liked: Boolean = false, likes: Int = 0) = ApiPost(
        id = id,
        createdAt = "2026-10-01T10:%02d:00.000Z".format(minute),
        isLikedByMe = liked,
        likeCount = likes,
    )

    private fun page(posts: List<ApiPost>, next: String?, hasMore: Boolean = true) =
        ApiResponse(success = true, data = posts, pagination = Pagination(nextCursor = next, hasMore = hasMore))

    @Test
    fun `une relecture silencieuse garde la page defilee et le curseur le plus profond`() = runTest {
        coEvery { api.getFeed(null, any()) } returns page(listOf(post("c", 30), post("b", 20)), next = "after-b")
        repository.refresh()
        coEvery { api.getFeed("after-b", any()) } returns page(listOf(post("a", 10)), next = "after-a")
        repository.loadMore()

        repository.refresh()

        assertThat(repository.feedCacheSnapshot!!.map { it.id }).containsExactly("c", "b", "a").inOrder()
        coEvery { api.getFeed("after-a", any()) } returns page(listOf(post("z", 5)), next = null, hasMore = false)
        repository.loadMore()
        assertThat(repository.feedCacheSnapshot!!.map { it.id }).containsExactly("c", "b", "a", "z").inOrder()
    }

    @Test
    fun `une page revenue apres un tirer pour rafraichir est ignoree`() = runTest {
        coEvery { api.getFeed(null, any()) } returns page(listOf(post("c", 30), post("b", 20)), next = "after-b")
        repository.refresh()
        val answer = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.getFeed("after-b", any()) } coAnswers { answer.await() }
        val loading = async { repository.loadMore() }
        runCurrent()

        repository.refreshReporting()
        answer.complete(page(listOf(post("a", 10)), next = "after-a"))
        loading.await()

        assertThat(repository.feedCacheSnapshot!!.map { it.id }).containsExactly("c", "b").inOrder()
    }

    @Test
    fun `un like encore en file est rejoue sur la page relue`() = runTest {
        coEvery { outbox.pendingTargets(OutboxKind.LIKE_POST) } returns setOf("b")
        coEvery { outbox.pendingTargets(OutboxKind.UNLIKE_POST) } returns emptySet()
        coEvery { api.getFeed(null, any()) } returns page(listOf(post("b", 20, liked = false, likes = 2)), next = null, hasMore = false)

        repository.refresh()

        val row = repository.cachedPost("b")!!
        assertThat(row.isLikedByMe).isTrue()
        assertThat(row.likeCount).isEqualTo(3)
    }

    @Test
    fun `le disque ne garde que les 100 posts les plus recents`() = runTest {
        val many = (1..130).map { post("p$it", 59) }
        coEvery { api.getFeed(null, any()) } returns page(many, next = null, hasMore = false)

        repository.refresh()

        assertThat(disk.writes.single()).hasSize(100)
    }
}
