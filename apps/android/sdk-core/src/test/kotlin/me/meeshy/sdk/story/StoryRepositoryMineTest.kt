package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class StoryRepositoryMineTest {

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

    private fun repository(cache: MyStoriesArchiveCache = InMemoryMyStoriesArchiveCache()) =
        StoryRepository(
            api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()),
            mockk<TranslationApi>(relaxed = true), cache,
        )

    private fun post(id: String) = ApiPost(id = id, type = "STORY")

    private fun page(vararg ids: String, next: String? = null) = ApiResponse(
        success = true,
        data = ids.map { post(it) },
        pagination = Pagination(hasMore = next != null, nextCursor = next),
    )

    private fun drained(result: NetworkResult<List<ApiPost>>): List<String> =
        (result as NetworkResult.Success).data.map { it.id }

    @Test
    fun `la liste suit le curseur et garde la pagination du serveur`() = runTest {
        coEvery { api.listMine(null, 50) } returns page("a", "b", next = "c1")

        val result = repository().listMine(cursor = null, limit = 50)

        val paged = (result as NetworkResult.Success).data
        assertThat(paged.data.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(paged.pagination?.nextCursor).isEqualTo("c1")
    }

    @Test
    fun `l'archive est drainee jusqu'a epuisement puis mise en cache`() = runTest {
        coEvery { api.listMine(null, 50) } returns page("a", "b", next = "c1")
        coEvery { api.listMine("c1", 50) } returns page("c", next = "c2")
        coEvery { api.listMine("c2", 50) } returns page("d")
        val cache = InMemoryMyStoriesArchiveCache()
        val repo = repository(cache)

        assertThat(drained(repo.drainMyStories())).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(cache.read()?.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(repo.cachedMyStories()?.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `une page vide arrete le drain meme si le serveur annonce encore une suite`() = runTest {
        coEvery { api.listMine(null, 50) } returns page("a", next = "c1")
        coEvery { api.listMine("c1", 50) } returns page(next = "c2")

        assertThat(drained(repository().drainMyStories())).containsExactly("a")
        coVerify(exactly = 0) { api.listMine("c2", 50) }
    }

    @Test
    fun `une page sans aucun nouvel id arrete le drain - garde de stagnation`() = runTest {
        coEvery { api.listMine(null, 50) } returns page("a", "b", next = "c1")
        coEvery { api.listMine("c1", 50) } returns page("a", "b", next = "c2")

        assertThat(drained(repository().drainMyStories())).containsExactly("a", "b").inOrder()
        coVerify(exactly = 0) { api.listMine("c2", 50) }
    }

    @Test
    fun `un curseur absent arrete le drain malgre hasMore`() = runTest {
        coEvery { api.listMine(null, 50) } returns ApiResponse(
            success = true,
            data = listOf(post("a")),
            pagination = Pagination(hasMore = true, nextCursor = null),
        )

        assertThat(drained(repository().drainMyStories())).containsExactly("a")
    }

    @Test
    fun `le drain a un plafond de pages`() = runTest {
        coEvery { api.listMine(any(), 50) } answers {
            val n = (firstArg<String?>()?.removePrefix("c")?.toInt() ?: 0) + 1
            page("p$n", next = "c$n")
        }

        val ids = drained(repository().drainMyStories(maxPages = 3))

        assertThat(ids).containsExactly("p1", "p2", "p3").inOrder()
    }

    @Test
    fun `une panne apres la premiere page garde ce qui est deja drainé`() = runTest {
        coEvery { api.listMine(null, 50) } returns page("a", next = "c1")
        coEvery { api.listMine("c1", 50) } throws IOException("offline")

        assertThat(drained(repository().drainMyStories())).containsExactly("a")
    }

    @Test
    fun `une panne sur la premiere page est un echec qui n'ecrase pas le cache`() = runTest {
        val cache = InMemoryMyStoriesArchiveCache().also { it.write(listOf(post("old"))) }
        coEvery { api.listMine(null, 50) } throws IOException("offline")

        val result = repository(cache).drainMyStories()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(cache.read()?.map { it.id }).containsExactly("old")
    }

    @Test
    fun `une archive vide n'ecrase pas un cache non vide`() = runTest {
        val cache = InMemoryMyStoriesArchiveCache().also { it.write(listOf(post("old"))) }
        coEvery { api.listMine(null, 50) } returns page()

        assertThat(drained(repository(cache).drainMyStories())).isEmpty()
        assertThat(cache.read()?.map { it.id }).containsExactly("old")
    }

    @Test
    fun `republier rend la story republiee`() = runTest {
        coEvery { api.republish("s1") } returns ApiResponse(success = true, data = post("s1"))

        val result = repository().republish("s1")

        assertThat((result as NetworkResult.Success).data.id).isEqualTo("s1")
    }

    @Test
    fun `republier remonte l'echec du serveur`() = runTest {
        coEvery { api.republish("s1") } throws IOException("offline")

        assertThat(repository().republish("s1")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
