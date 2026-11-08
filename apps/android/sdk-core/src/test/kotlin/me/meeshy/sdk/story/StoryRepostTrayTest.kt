package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * La barre montre la republication dès sa création (#14458) : la story que la passerelle rend en 201 rejoint le cache de
 * la barre, et une revalidation partie AVANT la republication ne l'efface pas en élaguant ce que sa page ne portait pas.
 * Celle d'un ami arrive par `post:reposted`, la seule annonce que la passerelle émet pour une republication (#14466).
 */
@RunWith(RobolectricTestRunner::class)
class StoryRepostTrayTest {

    private lateinit var db: MeeshyDatabase
    private val api: StoryApi = mockk(relaxed = true)

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = StoryRepository(
        api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), mockk(relaxed = true),
    )

    private suspend fun seed(post: ApiPost) =
        db.storyDao().upsertAll(listOf(StoryEntity(post.id, MeeshyApi.json.encodeToString(post), 1L, 1L)))

    // Des stories VIVANTES : depuis bebd40fec1 la revalidation purge les stories expirées (20 h), et une date figée
    // finit toujours par expirer.
    private fun hoursAgo(hours: Long): String = java.time.Instant.now().minusSeconds(hours * 3_600).toString()

    private val friendStory = ApiPost(id = "s1", type = "STORY", createdAt = hoursAgo(3))
    private val myRepost = ApiPost(id = "rp1", type = "STORY", createdAt = hoursAgo(2))

    @Test
    fun `a story repost joins the tray at once`() = runTest {
        seed(friendStory)
        coEvery { api.repost("s1", any()) } returns ApiResponse(success = true, data = myRepost)
        val repository = repository()

        repository.repost("s1")

        assertThat(repository.cachedStories().map { it.id }).contains("rp1")
    }

    @Test
    fun `a revalidation already in flight when the repost lands does not drop it`() = runTest {
        seed(friendStory)
        val page = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.list(any(), any()) } coAnswers { page.await() }
        coEvery { api.repost("s1", any()) } returns ApiResponse(success = true, data = myRepost)
        val repository = repository()
        val sync = launch { repository.refresh() }
        runCurrent()

        repository.repost("s1")
        page.complete(ApiResponse(success = true, data = listOf(friendStory)))
        sync.join()

        assertThat(repository.cachedStories().map { it.id }).containsExactly("rp1", "s1")
    }

    @Test
    fun `a revalidation started after the repost still prunes what the server no longer serves`() = runTest {
        seed(friendStory)
        coEvery { api.repost("s1", any()) } returns ApiResponse(success = true, data = myRepost)
        coEvery { api.list(any(), any()) } returns ApiResponse(success = true, data = listOf(friendStory))
        val repository = repository()
        repository.repost("s1")

        repository.refresh()

        assertThat(repository.cachedStories().map { it.id }).containsExactly("s1")
    }

    @Test
    fun `a refused repost leaves the tray as it was`() = runTest {
        seed(friendStory)
        coEvery { api.repost("s1", any()) } returns ApiResponse(success = false, data = null, error = "introuvable")
        val repository = repository()

        repository.repost("s1")

        assertThat(repository.cachedStories().map { it.id }).containsExactly("s1")
    }

    @Test
    fun `a repost the server served as something other than a story stays out of the tray`() = runTest {
        seed(friendStory)
        coEvery { api.repost("s1", any()) } returns ApiResponse(success = true, data = myRepost.copy(type = "POST"))
        val repository = repository()

        repository.repost("s1")

        assertThat(repository.cachedStories().map { it.id }).containsExactly("s1")
    }

    private val friendRepost = ApiPost(id = "rp2", type = "STORY", createdAt = hoursAgo(1))

    @Test
    fun `a friend's story repost announced by post-reposted joins the tray at once`() = runTest {
        seed(friendStory)
        val repository = repository()

        val adopted = repository.adoptAnnouncedRepost(friendRepost)

        assertThat(adopted).isTrue()
        assertThat(repository.cachedStories().map { it.id }).containsExactly("rp2", "s1")
    }

    @Test
    fun `a friend's repost into the feed announced by post-reposted stays out of the tray`() = runTest {
        seed(friendStory)
        val repository = repository()

        val adopted = repository.adoptAnnouncedRepost(friendRepost.copy(type = "POST"))

        assertThat(adopted).isFalse()
        assertThat(repository.cachedStories().map { it.id }).containsExactly("s1")
    }

    @Test
    fun `an announced repost the tray already holds keeps what the reader saw`() = runTest {
        seed(friendRepost.copy(isViewedByMe = true))
        val repository = repository()

        val adopted = repository.adoptAnnouncedRepost(friendRepost)

        assertThat(adopted).isFalse()
        assertThat(repository.cachedStories().single().isViewedByMe).isTrue()
    }

    @Test
    fun `a friend's story repost announced while a revalidation is in flight survives it`() = runTest {
        seed(friendStory)
        val page = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.list(any(), any()) } coAnswers { page.await() }
        val repository = repository()
        val sync = launch { repository.refresh() }
        runCurrent()

        repository.adoptAnnouncedRepost(friendRepost)
        page.complete(ApiResponse(success = true, data = listOf(friendStory)))
        sync.join()

        assertThat(repository.cachedStories().map { it.id }).containsExactly("rp2", "s1")
    }
}
