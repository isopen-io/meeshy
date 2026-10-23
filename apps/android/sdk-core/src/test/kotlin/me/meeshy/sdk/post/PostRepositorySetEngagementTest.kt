package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

/**
 * The post detail likes and bookmarks a post that may not sit in the feed cache (opened from
 * a shared link, a notification, a profile). [PostRepository.setLiked] /
 * [PostRepository.setBookmarked] take the target state explicitly, enqueue the same durable
 * outbox mutation as the feed toggles, and keep the feed cache in step when the post is there.
 */
class PostRepositorySetEngagementTest {

    private val api: PostApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)

    private suspend fun repo(vararg cached: ApiPost): PostRepository {
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = cached.toList())
        return PostRepository(api, mockk<TranslationApi>(relaxed = true), outbox).also { it.refresh() }
    }

    @Test
    fun setLiked_onAPostAbsentFromTheFeed_stillEnqueuesADurableLike() = runTest {
        val repository = repo()
        val mutation = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(mutation)) } returns "cmid"

        repository.setLiked("p9", liked = true)

        assertThat(mutation.captured.kind).isEqualTo(OutboxKind.LIKE_POST)
        assertThat(mutation.captured.lane).isEqualTo(OutboxLanes.SOCIAL)
        assertThat(mutation.captured.targetId).isEqualTo("p9")
    }

    @Test
    fun setLiked_false_enqueuesAnUnlike_andMirrorsTheFeedCache() = runTest {
        val repository = repo(ApiPost(id = "p1", likeCount = 4, isLikedByMe = true))
        val mutation = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(mutation)) } returns "cmid"

        repository.setLiked("p1", liked = false)

        assertThat(mutation.captured.kind).isEqualTo(OutboxKind.UNLIKE_POST)
        val cached = repository.cachedPost("p1")
        assertThat(cached?.isLikedByMe).isFalse()
        assertThat(cached?.likeCount).isEqualTo(3)
    }

    @Test
    fun setBookmarked_enqueuesTheMatchingMutation_andMirrorsTheFeedCache() = runTest {
        val repository = repo(ApiPost(id = "p1", bookmarkCount = 0, isBookmarkedByMe = false))
        val mutation = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(mutation)) } returns "cmid"

        repository.setBookmarked("p1", bookmarked = true)

        assertThat(mutation.captured.kind).isEqualTo(OutboxKind.BOOKMARK_POST)
        assertThat(repository.cachedPost("p1")?.isBookmarkedByMe).isTrue()
        assertThat(repository.cachedPost("p1")?.bookmarkCount).isEqualTo(1)
    }

    @Test
    fun setBookmarked_false_onAnAbsentPost_enqueuesAnUnbookmark() = runTest {
        val repository = repo()
        val mutation = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(mutation)) } returns "cmid"

        repository.setBookmarked("p9", bookmarked = false)

        assertThat(mutation.captured.kind).isEqualTo(OutboxKind.UNBOOKMARK_POST)
    }
}
