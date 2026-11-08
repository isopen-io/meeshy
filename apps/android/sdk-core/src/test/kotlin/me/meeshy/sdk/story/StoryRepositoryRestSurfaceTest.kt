package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiResponseMeta
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.DeletionTombstones
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.StoryViewerWire
import me.meeshy.sdk.model.StoryViewersOutcome
import me.meeshy.sdk.model.StoryViewersResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryTranslationRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class StoryRepositoryRestSurfaceTest {
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

    private fun repository(cache: StoryPostCache = StoryPostCache()) = StoryRepository(
        api, db, db.storyDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()),
        mockk<TranslationApi>(relaxed = true), postCache = cache,
    )

    private fun post(id: String) = ApiPost(id = id, type = "STORY")

    private fun body(json: String = "{}") = json.toResponseBody("application/json".toMediaType())

    @Test
    fun `listDelta envoie updatedSince et rend les tombstones`() = runTest {
        coEvery { api.list(any(), any(), "2026-10-01T00:00:00Z") } returns ApiResponse(
            success = true,
            data = listOf(post("a")),
            pagination = Pagination(hasMore = true, nextCursor = "n1"),
            meta = ApiResponseMeta(deletedStoryIds = listOf("x", "y"), deletedStoryIdsTruncated = false),
        )

        val delta = (repository().listDelta("2026-10-01T00:00:00Z") as NetworkResult.Success).data

        assertThat(delta.posts.map { it.id }).containsExactly("a")
        assertThat(delta.tombstones).isEqualTo(DeletionTombstones.Complete(listOf("x", "y")))
        assertThat(delta.nextCursor).isEqualTo("n1")
        assertThat(delta.hasMore).isTrue()
    }

    @Test
    fun `un delta qui annonce une suppression evince la story du cache par id`() = runTest {
        val cache = StoryPostCache().apply { put(post("x")) }
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = emptyList(),
            meta = ApiResponseMeta(deletedStoryIds = listOf("x")),
        )

        repository(cache).listDelta("2026-10-01T00:00:00Z")

        assertThat(repository(cache).cachedPost("x")).isNull()
    }

    @Test
    fun `list alimente le cache par id`() = runTest {
        coEvery { api.list(any(), any(), null) } returns ApiResponse(success = true, data = listOf(post("a")))
        val repo = repository()

        repo.list()

        assertThat(repo.cachedPost("a")?.id).isEqualTo("a")
    }

    @Test
    fun `invalidate empeche une story supprimee de ressusciter`() = runTest {
        val repo = repository()
        repo.cache(post("a"))

        repo.invalidate(setOf("a"))

        assertThat(repo.cachedPost("a")).isNull()
    }

    @Test
    fun `la suppression reussie evince la story du cache`() = runTest {
        coEvery { api.delete("a") } returns ApiResponse(success = true, data = Unit)
        val repo = repository()
        repo.cache(post("a"))

        repo.delete("a")

        assertThat(repo.cachedPost("a")).isNull()
    }

    @Test
    fun `republish rend la story rechargee et la met en cache`() = runTest {
        coEvery { api.republish("a") } returns ApiResponse(success = true, data = post("a"))
        val repo = repository()

        val result = repo.republish("a")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(repo.cachedPost("a")).isNotNull()
    }

    @Test
    fun `listMine garde la pagination keyset`() = runTest {
        coEvery { api.listMine("c0", 20) } returns ApiResponse(
            success = true,
            data = listOf(post("m1")),
            pagination = Pagination(hasMore = true, nextCursor = "c1"),
        )

        val page = (repository().listMine("c0", 20) as NetworkResult.Success).data

        assertThat(page.nextCursor).isEqualTo("c1")
        assertThat(page.data.map { it.id }).containsExactly("m1")
    }

    @Test
    fun `la suppression avec motif envoie le motif rogne`() = runTest {
        val sent = slot<ContentRemovalRequest>()
        coEvery { api.deleteWithReason("a", capture(sent)) } returns Response.success(body())

        val result = repository().delete("a", "  spam  ")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(sent.captured.reason).isEqualTo("spam")
    }

    @Test
    fun `la suppression sans motif part sans corps`() = runTest {
        coEvery { api.delete("a") } returns ApiResponse(success = true, data = Unit)

        repository().delete("a", "   ")

        coVerify(exactly = 0) { api.deleteWithReason(any(), any()) }
        coVerify(exactly = 1) { api.delete("a") }
    }

    @Test
    fun `la traduction force envoie force true et sinon l'omet`() = runTest {
        val sent = mutableListOf<StoryTranslationRequest>()
        coEvery { api.requestTranslation("a", capture(sent)) } returns Response.success(body())
        val repo = repository()

        repo.requestTranslation("a", "fr", force = true)
        repo.requestTranslation("a", "fr")

        assertThat(sent.map { it.force }).containsExactly(true, null).inOrder()
    }

    @Test
    fun `reactOutcome distingue le refus 409 de la panne reseau`() = runTest {
        coEvery { api.react("a", any()) } returns
            ApiResponse(success = false, error = "limit", code = "REACTION_LIMIT_REACHED")
        val refused = repository().reactOutcome("a", "🔥")
        assertThat(refused).isInstanceOf(StoryReactionOutcome.Refused::class.java)
        assertThat((refused as StoryReactionOutcome.Refused).isLimitReached).isTrue()

        coEvery { api.react("a", any()) } throws IOException("offline")
        assertThat(repository().reactOutcome("a", "🔥")).isInstanceOf(StoryReactionOutcome.TransportFailure::class.java)

        coEvery { api.react("a", any()) } returns ApiResponse(success = true, data = Unit)
        assertThat(repository().reactOutcome("a", "🔥")).isEqualTo(StoryReactionOutcome.Applied)
    }

    @Test
    fun `viewerList a trois issues`() = runTest {
        coEvery { api.viewers("a") } returns ApiResponse(
            success = true,
            data = StoryViewersResponse(listOf(StoryViewerWire(id = "u1", username = "ann"))),
        )
        val loaded = repository().viewerList("a") as StoryViewersOutcome.Loaded
        assertThat(loaded.viewers.map { it.id }).containsExactly("u1")

        coEvery { api.viewers("a") } throws retrofit2.HttpException(Response.error<Any>(403, body()))
        assertThat(repository().viewerList("a")).isEqualTo(StoryViewersOutcome.Forbidden)

        coEvery { api.viewers("a") } throws IOException("offline")
        assertThat(repository().viewerList("a")).isEqualTo(StoryViewersOutcome.Failed)
    }
}
