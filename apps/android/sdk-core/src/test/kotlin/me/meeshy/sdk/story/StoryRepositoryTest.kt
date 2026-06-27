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
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
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

    private fun outbox() = OutboxRepository(db, db.outboxDao())

    private fun repository(outbox: OutboxRepository = outbox()) =
        StoryRepository(api, db, db.storyDao(), db.syncMetaDao(), outbox)

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

    @Test
    fun `enqueuePublish persists a PUBLISH_STORY mutation on the story lane`() = runTest {
        val outbox = outbox()
        val request = CreateStoryRequest(content = "hello", visibility = "FRIENDS", originalLanguage = "fr")

        val cmid = repository(outbox).enqueuePublish(request)

        val rows = outbox.deliverable(OutboxLanes.STORY)
        assertThat(rows).hasSize(1)
        assertThat(rows.single().cmid).isEqualTo(cmid)
        assertThat(rows.single().kindEnum).isEqualTo(OutboxKind.PUBLISH_STORY)
    }

    @Test
    fun `enqueuePublish serializes the request as the row payload`() = runTest {
        val outbox = outbox()
        val request = CreateStoryRequest(content = "bonjour", visibility = "PUBLIC", originalLanguage = "fr")

        repository(outbox).enqueuePublish(request)

        val payload = outbox.deliverable(OutboxLanes.STORY).single().payload
        assertThat(MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload)).isEqualTo(request)
    }

    @Test
    fun `enqueuePublish keeps each story as an independent row (no coalescing)`() = runTest {
        val outbox = outbox()

        repository(outbox).enqueuePublish(CreateStoryRequest(content = "first"))
        repository(outbox).enqueuePublish(CreateStoryRequest(content = "second"))

        assertThat(outbox.deliverable(OutboxLanes.STORY)).hasSize(2)
    }

    @Test
    fun `pendingPublishes decodes a queued publish into its building block`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "hi", visibility = "FRIENDS", originalLanguage = "es"))

        val pending = repo.pendingPublishes().first().single()

        assertThat(pending.content).isEqualTo("hi")
        assertThat(pending.visibility).isEqualTo("FRIENDS")
        assertThat(pending.originalLanguage).isEqualTo("es")
        assertThat(pending.tempId).startsWith("pending_")
        assertThat(pending.createdAtMillis).isGreaterThan(0L)
    }

    @Test
    fun `pendingPublishes excludes an exhausted publish (rollback)`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        val cmid = repo.enqueuePublish(CreateStoryRequest(content = "doomed"))!!

        outbox.markExhausted(cmid, "gave up")

        assertThat(repo.pendingPublishes().first()).isEmpty()
    }

    @Test
    fun `pendingPublishes ignores non-publish outbox rows`() = runTest {
        val outbox = outbox()
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.ADD_REACTION,
                lane = OutboxLanes.REACTION,
                targetId = "m1:like",
                payload = """{"emoji":"👍"}""",
            ),
        )

        assertThat(repository(outbox).pendingPublishes().first()).isEmpty()
    }

    @Test
    fun `pendingPublishes skips a blank-content publish`() = runTest {
        val outbox = outbox()
        repository(outbox).enqueuePublish(CreateStoryRequest(content = "   "))

        assertThat(repository(outbox).pendingPublishes().first()).isEmpty()
    }

    @Test
    fun `pendingPublishes skips an undecodable payload without crashing`() = runTest {
        val outbox = outbox()
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_bad",
                payload = "{ not json",
            ),
        )

        assertThat(repository(outbox).pendingPublishes().first()).isEmpty()
    }

    @Test
    fun `pendingPublishes surfaces each independent publish`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "first"))
        repo.enqueuePublish(CreateStoryRequest(content = "second"))

        assertThat(repo.pendingPublishes().first().map { it.content })
            .containsExactly("first", "second")
    }

    @Test
    fun `publishQueue surfaces live and exhausted publishes together in one snapshot`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "live"))
        val doomed = repo.enqueuePublish(CreateStoryRequest(content = "doomed"))!!
        outbox.markExhausted(doomed, "gave up")

        val queue = repo.publishQueue().first()

        assertThat(queue.pending.map { it.content }).containsExactly("live")
        assertThat(queue.failed.map { it.content }).containsExactly("doomed")
    }

    @Test
    fun `publishQueue is empty when nothing is queued`() = runTest {
        val queue = repository().publishQueue().first()

        assertThat(queue.pending).isEmpty()
        assertThat(queue.failed).isEmpty()
    }

    @Test
    fun `failedPublishes surfaces an exhausted publish with its cmid and content`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        val cmid = repo.enqueuePublish(
            CreateStoryRequest(content = "doomed", visibility = "FRIENDS", originalLanguage = "es"),
        )!!
        outbox.markExhausted(cmid, "gave up")

        val failed = repo.failedPublishes().first().single()

        assertThat(failed.cmid).isEqualTo(cmid)
        assertThat(failed.tempId).startsWith("pending_")
        assertThat(failed.content).isEqualTo("doomed")
        assertThat(failed.visibility).isEqualTo("FRIENDS")
        assertThat(failed.originalLanguage).isEqualTo("es")
        assertThat(failed.createdAtMillis).isGreaterThan(0L)
        assertThat(failed.failedAtMillis).isAtLeast(failed.createdAtMillis)
    }

    @Test
    fun `failedPublishes excludes a still-pending publish`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "in flight"))

        assertThat(repo.failedPublishes().first()).isEmpty()
    }

    @Test
    fun `failedPublishes ignores non-publish exhausted rows`() = runTest {
        val outbox = outbox()
        val cmid = outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.ADD_REACTION,
                lane = OutboxLanes.REACTION,
                targetId = "m1:like",
                payload = """{"emoji":"👍"}""",
            ),
        )!!
        outbox.markExhausted(cmid, "gave up")

        assertThat(repository(outbox).failedPublishes().first()).isEmpty()
    }

    @Test
    fun `failedPublishes skips a blank-content exhausted row`() = runTest {
        val outbox = outbox()
        val cmid = repository(outbox).enqueuePublish(CreateStoryRequest(content = "   "))
        // A blank publish never enqueues content; an exhausted blank/undecodable
        // row must never produce a failure item.
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_bad",
                payload = "{ not json",
            ),
        )?.let { outbox.markExhausted(it, "gave up") }

        assertThat(repository(outbox).failedPublishes().first()).isEmpty()
        assertThat(cmid).isNotNull()
    }

    @Test
    fun `retryPublish revives an exhausted publish back into the live queue`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        val cmid = repo.enqueuePublish(CreateStoryRequest(content = "retry me"))!!
        outbox.markExhausted(cmid, "gave up")

        val revived = repo.retryPublish(cmid)

        assertThat(revived).isTrue()
        assertThat(repo.failedPublishes().first()).isEmpty()
        assertThat(repo.pendingPublishes().first().map { it.content }).containsExactly("retry me")
    }

    @Test
    fun `retryPublish on an unknown cmid reports no row revived`() = runTest {
        assertThat(repository().retryPublish("missing")).isFalse()
    }

    @Test
    fun `discardPublish removes an exhausted publish for good`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        val cmid = repo.enqueuePublish(CreateStoryRequest(content = "drop me"))!!
        outbox.markExhausted(cmid, "gave up")

        repo.discardPublish(cmid)

        assertThat(repo.failedPublishes().first()).isEmpty()
        assertThat(repo.pendingPublishes().first()).isEmpty()
    }
}
