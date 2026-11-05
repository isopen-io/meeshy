package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiResponseMeta
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class StoryCacheSourceTest {
    private val api: StoryApi = mockk(relaxed = true)
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository(viewer: String? = "me") = StoryRepository(
        api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()),
        mockk<TranslationApi>(relaxed = true),
        session = session(viewer),
    )

    private fun session(viewer: String?): me.meeshy.sdk.session.SessionRepository? {
        if (viewer == null) return null
        val session = mockk<me.meeshy.sdk.session.SessionRepository>(relaxed = true)
        every { session.currentUserId } returns viewer
        return session
    }

    private fun story(id: String, author: String = "u1", updatedAt: String? = "2026-11-03T08:00:00.000Z", agoHours: Long = 1) =
        ApiPost(
            id = id,
            type = "STORY",
            createdAt = Instant.now().minusSeconds(agoHours * 3600).toString(),
            updatedAt = updatedAt,
            author = ApiAuthor(id = author, username = author),
        )

    private suspend fun seed(vararg posts: ApiPost) {
        coEvery { api.list(null, any(), null) } returns ApiResponse(success = true, data = posts.toList())
        repository().refresh()
    }

    private suspend fun held() = repository().cachedStories().map { it.id }

    @Test
    fun `a warm cache revalidates by delta from the greatest updatedAt`() = runTest {
        seed(story("a", updatedAt = "2026-11-01T00:00:00.000Z"), story("b", updatedAt = "2026-11-03T08:00:00.000Z"))
        coEvery { api.list(null, any(), "2026-11-03T08:00:00.000Z") } returns
            ApiResponse(success = true, data = listOf(story("c")))

        repository().refresh()

        coVerify(exactly = 1) { api.list(null, any(), "2026-11-03T08:00:00.000Z") }
        assertThat(held()).containsExactly("a", "b", "c")
    }

    @Test
    fun `complete tombstones evict the vanished stories`() = runTest {
        seed(story("a"), story("b"))
        coEvery { api.list(null, any(), any()) } returns ApiResponse(
            success = true,
            data = emptyList(),
            meta = ApiResponseMeta(deletedStoryIds = listOf("a"), deletedStoryIdsTruncated = false),
        )

        repository().refresh()

        assertThat(held()).containsExactly("b")
    }

    @Test
    fun `truncated tombstones escalate to a full fetch that replaces the tray`() = runTest {
        seed(story("a"), story("ghost"))
        coEvery { api.list(null, any(), "2026-11-03T08:00:00.000Z") } returns ApiResponse(
            success = true,
            data = emptyList(),
            meta = ApiResponseMeta(deletedStoryIds = listOf("a"), deletedStoryIdsTruncated = true),
        )
        coEvery { api.list(null, any(), null) } returns ApiResponse(success = true, data = listOf(story("b")))

        repository().refresh()

        assertThat(held()).containsExactly("b")
    }

    @Test
    fun `a failing delta falls back to the full list`() = runTest {
        seed(story("a"))
        coEvery { api.list(null, any(), "2026-11-03T08:00:00.000Z") } throws java.io.IOException("offline")
        coEvery { api.list(null, any(), null) } returns ApiResponse(success = true, data = listOf(story("a"), story("z")))

        repository().refresh()

        assertThat(held()).containsExactly("a", "z")
    }

    @Test
    fun `a delta window left unfinished at the page cap falls back to the full list`() = runTest {
        seed(story("a"))
        coEvery { api.list(any(), any(), "2026-11-03T08:00:00.000Z") } returns ApiResponse(
            success = true,
            data = listOf(story("p")),
            pagination = Pagination(hasMore = true, nextCursor = "n"),
        )
        coEvery { api.list(null, any(), null) } returns ApiResponse(success = true, data = listOf(story("full")))

        repository().refresh()

        assertThat(held()).containsExactly("full")
    }

    @Test
    fun `revalidation purges other people's expired stories but keeps mine`() = runTest {
        seed(story("mineOld", author = "me", agoHours = 30), story("theirsOld", agoHours = 30), story("live"))
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(success = true, data = emptyList())

        repository().refresh()

        assertThat(held()).containsExactly("mineOld", "live")
    }

    @Test
    fun `the expiry sweep removes dead stories and reports their ids`() = runTest {
        seed(story("mineOld", author = "me", agoHours = 30), story("theirsOld", agoHours = 30), story("live"))

        val removed = repository().sweepExpired()

        assertThat(removed).containsExactly("theirsOld")
        assertThat(held()).containsExactly("mineOld", "live")
    }

    @Test
    fun `a delta never regresses a story already seen on this device`() = runTest {
        seed(story("a").copy(isViewedByMe = true))
        coEvery { api.list(null, any(), any()) } returns
            ApiResponse(success = true, data = listOf(story("a").copy(isViewedByMe = false, updatedAt = "2026-11-04T00:00:00.000Z")))

        repository().refresh()

        assertThat(repository().cachedStories().single().isViewedByMe).isTrue()
    }

    @Test
    fun `viewed, reaction and comment events fold into the cached story`() = runTest {
        seed(story("a").copy(viewCount = 1, commentCount = 0))
        val repo = repository()

        assertThat(repo.applyStoryViewed("a", 5)).isTrue()
        assertThat(repo.applyStoryReaction("a", "🔥", "u9", "me", 1)).isTrue()
        assertThat(repo.applyStoryCommentCount("a", 3)).isTrue()
        assertThat(repo.applyStoryViewed("unknown", 1)).isFalse()

        val a = repo.cachedStories().single()
        assertThat(a.viewCount).isEqualTo(5)
        assertThat(a.reactionSummary).containsExactly("🔥", 1)
        assertThat(a.commentCount).isEqualTo(3)
    }
}
