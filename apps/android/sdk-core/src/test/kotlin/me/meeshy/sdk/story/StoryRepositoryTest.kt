package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.StoryViewerWire
import me.meeshy.sdk.model.StoryViewersResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class StoryRepositoryTest {

    private val api: StoryApi = mockk(relaxed = true)
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository() = StoryRepository(api, db, db.storyDao(), db.syncMetaDao())

    private fun stubList(vararg posts: ApiPost) {
        coEvery { api.list(any(), any()) } returns ApiResponse(success = true, data = posts.toList())
    }

    private fun story(id: String, createdAt: String = "2026-06-20T10:00:00Z") =
        ApiPost(id = id, type = "STORY", createdAt = createdAt)

    @Test
    fun viewers_mapsWirePayloadToDomain() = runTest {
        coEvery { api.viewers("s1") } returns ApiResponse(
            success = true,
            data = StoryViewersResponse(
                viewers = listOf(
                    StoryViewerWire(id = "u1", username = "alice", displayName = "Alice", reaction = "❤️"),
                    StoryViewerWire(id = "u2", username = "bob", displayName = null),
                ),
            ),
        )

        val result = repository().viewers("s1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val viewers = (result as NetworkResult.Success).data
        assertThat(viewers.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(viewers[0].reactionEmoji).isEqualTo("❤️")
        assertThat(viewers[1].displayName).isEqualTo("bob")
    }

    @Test
    fun viewers_emptyPayloadMapsToEmptyList() = runTest {
        coEvery { api.viewers("s1") } returns
            ApiResponse(success = true, data = StoryViewersResponse(viewers = emptyList()))

        assertThat((repository().viewers("s1") as NetworkResult.Success).data).isEmpty()
    }

    @Test
    fun viewers_networkErrorIsFailure() = runTest {
        coEvery { api.viewers("s1") } throws IOException("offline")

        assertThat(repository().viewers("s1")).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `storiesStream first emission is Empty on a cold cache`() = runTest {
        coEvery { api.list(any(), any()) } returns ApiResponse(success = false, error = "down")

        assertThat(repository().storiesStream().first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists stories and sync metadata`() = runTest {
        stubList(story("s1"), story("s2"))
        val repo = repository()

        repo.refresh()

        assertThat(db.storyDao().observeAll().first().map { it.id }).containsExactly("s1", "s2")
        assertThat(db.syncMetaDao().observe(StoryCacheSource.RESOURCE_KEY).first()).isNotNull()
    }

    @Test
    fun `refresh removes stories absent from the latest sync`() = runTest {
        coEvery { api.list(any(), any()) } returnsMany listOf(
            ApiResponse(success = true, data = listOf(story("s1"), story("s2"))),
            ApiResponse(success = true, data = listOf(story("s2"))),
        )
        val repo = repository()

        repo.refresh()
        repo.refresh()

        assertThat(db.storyDao().observeAll().first().map { it.id }).containsExactly("s2")
    }

    @Test
    fun `storiesStream serves the cached feed as Fresh after a refresh`() = runTest {
        stubList(story("s1"), story("s2"))
        val repo = repository()

        repo.refresh()
        val result = repo.storiesStream().first()

        assertThat(result).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((result as CacheResult.Fresh).value.map { it.id }).containsExactly("s1", "s2")
    }

    @Test
    fun `refresh throws StorySyncException carrying the API error when the network fails`() = runTest {
        coEvery { api.list(any(), any()) } returns ApiResponse(success = false, error = "Server down")

        val thrown = runCatching { repository().refresh() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(StorySyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("Server down")
    }
}
