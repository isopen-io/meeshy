package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusPage
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.Test

/**
 * Pulling the list reloads what surrounds the conversations, as iOS `onRefresh` does: the
 * stories tray, the friends' moods and the categories — and one failing source never fails
 * the others.
 */
class ConversationListPullRefreshTest {

    private object Clock : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    private val mood = StatusEntry(id = "s1", userId = "u1", moodEmoji = "🎉")

    @Test
    fun `a pull reloads the stories, the moods and the categories`() = runTest {
        val stories = mockk<StoryRepository>(relaxed = true)
        val categories = mockk<CategoryRepository>(relaxed = true)
        val statuses = mockk<StatusRepository> {
            coEvery { list(mode = StatusFeedMode.FRIENDS, cursor = null, limit = any()) } returns
                NetworkResult.Success(StatusPage(listOf(mood), nextCursor = null, hasMore = false))
        }
        val cache = StatusBarCache(Clock)
        var painted: List<StatusEntry>? = null

        ConversationListPullRefresh(stories, statuses, cache, categories)
            .refreshSurroundings { painted = it }

        coVerify(exactly = 1) { stories.refresh() }
        coVerify(exactly = 1) { categories.refresh() }
        assertThat(painted).containsExactly(mood)
        assertThat(cache.load(StatusFeedMode.FRIENDS).valueOrNull).containsExactly(mood)
    }

    @Test
    fun `a failing source keeps the others going and never throws`() = runTest {
        val stories = mockk<StoryRepository> { coEvery { refresh() } throws IllegalStateException("offline") }
        val categories = mockk<CategoryRepository>(relaxed = true)
        val statuses = mockk<StatusRepository> {
            coEvery { list(mode = any(), cursor = any(), limit = any()) } returns
                NetworkResult.Success(StatusPage(listOf(mood), nextCursor = null, hasMore = false))
        }
        var painted: List<StatusEntry>? = null

        ConversationListPullRefresh(stories, statuses, StatusBarCache(Clock), categories)
            .refreshSurroundings { painted = it }

        coVerify(exactly = 1) { categories.refresh() }
        assertThat(painted).containsExactly(mood)
    }
}
