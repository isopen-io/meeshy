package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import me.meeshy.sdk.model.StoryViewerWire
import me.meeshy.sdk.model.StoryViewersResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxDependencyKey
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
    private val translationApi: TranslationApi = mockk(relaxed = true)
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
        StoryRepository(api, db, db.storyDao(), db.syncMetaDao(), outbox, translationApi)

    private fun translated(text: String) =
        ApiResponse(success = true, data = TranslateResponse(translatedText = text))

    private fun stubList(vararg posts: ApiPost) {
        coEvery { api.list(any(), any()) } returns ApiResponse(success = true, data = posts.toList())
    }

    private fun story(id: String, createdAt: String = "2026-06-20T10:00:00Z") =
        ApiPost(id = id, type = "STORY", createdAt = createdAt)

    /** A row seeded directly into Room to stand in for a prior sync's cache — never round-tripped through [story]/the API. */
    private fun staleEntity(id: String) =
        StoryEntity(id = id, payload = "{}", createdAt = 0L, cachedAt = 0L)

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
    fun `refresh follows nextCursor across pages and prunes once the server reports no more`() = runTest {
        coEvery { api.list(null, any()) } returns ApiResponse(
            success = true,
            data = listOf(story("s1"), story("s2")),
            pagination = Pagination(hasMore = true, nextCursor = "c1"),
        )
        coEvery { api.list("c1", any()) } returns ApiResponse(
            success = true,
            data = listOf(story("s3")),
            pagination = Pagination(hasMore = false),
        )
        // A story from a previous, now-superseded sync — must be pruned once the
        // fetched window is proven complete (server said hasMore = false).
        db.storyDao().upsertAll(listOf(staleEntity("stale")))

        repository().refresh()

        assertThat(db.storyDao().observeAll().first().map { it.id })
            .containsExactly("s1", "s2", "s3").inOrder()
    }

    @Test
    fun `refresh never prunes when the page budget is reached before the server reports completion`() = runTest {
        // Every page still claims more remains — a tray deeper than the budget.
        for (page in 0 until 6) {
            val cursor = if (page == 0) null else "c$page"
            coEvery { api.list(cursor, any()) } returns ApiResponse(
                success = true,
                data = listOf(story("s$page")),
                pagination = Pagination(hasMore = true, nextCursor = "c${page + 1}"),
            )
        }
        // A story from a previous sync, outside the budget-limited window this
        // refresh fetches — deleting it would be the exact regression this test
        // guards: truncating at the page budget must never authorize a prune.
        db.storyDao().upsertAll(listOf(staleEntity("beyond-budget")))

        repository().refresh()

        val ids = db.storyDao().observeAll().first().map { it.id }
        assertThat(ids).contains("beyond-budget")
        assertThat(ids).containsAtLeast("s0", "s1", "s2", "s3", "s4", "s5")
    }

    @Test
    fun `refresh throws and leaves the cache untouched when a later page fails`() = runTest {
        coEvery { api.list(null, any()) } returns ApiResponse(
            success = true,
            data = listOf(story("s1")),
            pagination = Pagination(hasMore = true, nextCursor = "c1"),
        )
        coEvery { api.list("c1", any()) } returns ApiResponse(success = false, error = "Server down")
        db.storyDao().upsertAll(listOf(staleEntity("previously-synced")))

        val thrown = runCatching { repository().refresh() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(StorySyncException::class.java)
        // Neither the first page's stories nor a prune landed — the previous
        // complete tray survives an unproven, partially-fetched window intact.
        assertThat(db.storyDao().observeAll().first().map { it.id })
            .containsExactly("previously-synced")
    }

    // --- Realtime story:updated tray fold (applyStoryUpdate) ---

    private fun storyPost(
        id: String,
        authorId: String = "author",
        content: String? = "Bonjour",
        isViewedByMe: Boolean? = false,
        createdAt: String = "2026-06-20T10:00:00Z",
    ) = ApiPost(
        id = id,
        type = "STORY",
        content = content,
        createdAt = createdAt,
        author = me.meeshy.sdk.model.ApiAuthor(id = authorId, username = "alice"),
        isViewedByMe = isViewedByMe,
    )

    private suspend fun cachedStory(repo: StoryRepository, id: String): ApiPost =
        repo.storiesStream().first().let { (it as CacheResult.Fresh).value.single { post -> post.id == id } }

    @Test
    fun `applyStoryUpdate folds an edit into the cache so the stream repaints`() = runTest {
        stubList(storyPost("s1", content = "Bonjour"))
        val repo = repository()
        repo.refresh()

        val changed = repo.applyStoryUpdate(
            updated = storyPost("s1", content = "Bonjour (edited)"),
            engagementReset = false,
            currentUserId = "me",
        )

        assertThat(changed).isTrue()
        assertThat(cachedStory(repo, "s1").content).isEqualTo("Bonjour (edited)")
    }

    @Test
    fun `applyStoryUpdate reverts a non-owner ring to unseen on an engagement reset`() = runTest {
        stubList(storyPost("s1", authorId = "author", isViewedByMe = true))
        val repo = repository()
        repo.refresh()

        val changed = repo.applyStoryUpdate(
            updated = storyPost("s1", authorId = "author", content = "edited", isViewedByMe = false),
            engagementReset = true,
            currentUserId = "me",
        )

        assertThat(changed).isTrue()
        assertThat(cachedStory(repo, "s1").isViewedByMe).isFalse()
    }

    @Test
    fun `applyStoryUpdate keeps the reader's seen state on a metadata-only edit`() = runTest {
        stubList(storyPost("s1", isViewedByMe = true))
        val repo = repository()
        repo.refresh()

        repo.applyStoryUpdate(
            updated = storyPost("s1", content = "edited", isViewedByMe = false),
            engagementReset = false,
            currentUserId = "me",
        )

        assertThat(cachedStory(repo, "s1").isViewedByMe).isTrue()
    }

    @Test
    fun `applyStoryUpdate keeps the author's own seen state through an engagement reset`() = runTest {
        stubList(storyPost("s1", authorId = "me", isViewedByMe = true))
        val repo = repository()
        repo.refresh()

        repo.applyStoryUpdate(
            updated = storyPost("s1", authorId = "me", content = "edited", isViewedByMe = false),
            engagementReset = true,
            currentUserId = "me",
        )

        assertThat(cachedStory(repo, "s1").isViewedByMe).isTrue()
    }

    @Test
    fun `applyStoryUpdate is inert for an unknown story id`() = runTest {
        stubList(storyPost("s1"))
        val repo = repository()
        repo.refresh()

        val changed = repo.applyStoryUpdate(
            updated = storyPost("s2", content = "phantom"),
            engagementReset = false,
            currentUserId = "me",
        )

        assertThat(changed).isFalse()
        assertThat(db.storyDao().observeAll().first().map { it.id }).containsExactly("s1")
    }

    @Test
    fun `applyStoryUpdate is inert for a no-op re-broadcast`() = runTest {
        stubList(storyPost("s1", content = "Bonjour", isViewedByMe = true))
        val repo = repository()
        repo.refresh()

        val changed = repo.applyStoryUpdate(
            updated = storyPost("s1", content = "Bonjour", isViewedByMe = false),
            engagementReset = false,
            currentUserId = "me",
        )

        assertThat(changed).isFalse()
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
    fun `enqueuePublish persists the dependsOn prerequisite when given`() = runTest {
        val outbox = outbox()

        repository(outbox).enqueuePublish(
            CreateStoryRequest(content = "gated"),
            dependsOn = listOf("upload-cmid"),
        )

        val stored = outbox.deliverable(OutboxLanes.STORY).single().dependsOn
        assertThat(OutboxDependencyKey.decode(stored)).containsExactly("upload-cmid")
    }

    @Test
    fun `enqueuePublish persists every prerequisite when gated on several uploads`() = runTest {
        val outbox = outbox()

        repository(outbox).enqueuePublish(
            CreateStoryRequest(content = "gated"),
            dependsOn = listOf("up-1", "up-2"),
        )

        val stored = outbox.deliverable(OutboxLanes.STORY).single().dependsOn
        assertThat(OutboxDependencyKey.decode(stored)).containsExactly("up-1", "up-2").inOrder()
    }

    @Test
    fun `enqueuePublish leaves dependsOn null by default`() = runTest {
        val outbox = outbox()

        repository(outbox).enqueuePublish(CreateStoryRequest(content = "free"))

        assertThat(outbox.deliverable(OutboxLanes.STORY).single().dependsOn).isNull()
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
    fun `pendingPublishes decodes a media-only publish with no text`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = null, mediaIds = listOf("m1"), visibility = "FRIENDS"))

        val pending = repo.pendingPublishes().first().single()

        assertThat(pending.content).isNull()
        assertThat(pending.mediaIds).containsExactly("m1")
        assertThat(pending.visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun `pendingPublishes carries the queued media ids alongside the text`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "caption", mediaIds = listOf("m1", "m2")))

        val pending = repo.pendingPublishes().first().single()

        assertThat(pending.content).isEqualTo("caption")
        assertThat(pending.mediaIds).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `pendingPublishes filters out blank media ids`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = null, mediaIds = listOf("", "  ", "m1")))

        assertThat(repo.pendingPublishes().first().single().mediaIds).containsExactly("m1")
    }

    @Test
    fun `pendingPublishes skips a publish with neither text nor media`() = runTest {
        val outbox = outbox()
        repository(outbox).enqueuePublish(CreateStoryRequest(content = "   ", mediaIds = listOf("", "  ")))

        assertThat(repository(outbox).pendingPublishes().first()).isEmpty()
    }

    @Test
    fun `pendingPublishes leaves media ids empty for a text-only publish`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        repo.enqueuePublish(CreateStoryRequest(content = "just text"))

        assertThat(repo.pendingPublishes().first().single().mediaIds).isEmpty()
    }

    @Test
    fun `failedPublishes surfaces an exhausted media-only publish`() = runTest {
        val outbox = outbox()
        val repo = repository(outbox)
        val cmid = repo.enqueuePublish(CreateStoryRequest(content = null, mediaIds = listOf("m1")))!!
        outbox.markExhausted(cmid, "gave up")

        val failed = repo.failedPublishes().first().single()

        assertThat(failed.cmid).isEqualTo(cmid)
        assertThat(failed.content).isNull()
        assertThat(failed.mediaIds).containsExactly("m1")
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

    // --- On-demand story translation for a caller-held slide (translateStory) ---

    @Test
    fun `translateStory translates the source and returns the merged story`() = runTest {
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repository().translateStory(StoryItem(id = "s9", content = "Bonjour"), "es")

        assertThat(merged?.translations)
            .containsExactly(StoryTranslation(language = "es", content = "Hola"))
    }

    @Test
    fun `translateStory forwards the source text and trims the target`() = runTest {
        val slot = slot<TranslateRequest>()
        coEvery { translationApi.translate(capture(slot)) } returns translated("Hola")

        repository().translateStory(StoryItem(id = "s9", content = "Bonjour"), "  es  ")

        assertThat(slot.captured.text).isEqualTo("Bonjour")
        assertThat(slot.captured.targetLanguage).isEqualTo("es")
    }

    @Test
    fun `translateStory is inert for a blank target`() = runTest {
        val merged = repository().translateStory(StoryItem(id = "s9", content = "Bonjour"), "   ")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun `translateStory is inert when the story has no source text`() = runTest {
        val merged = repository().translateStory(StoryItem(id = "s9", content = "   "), "es")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun `translateStory returns null when the translator fails`() = runTest {
        coEvery { translationApi.translate(any()) } throws IOException("offline")

        val merged = repository().translateStory(StoryItem(id = "s9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun `translateStory returns null for a blank translation`() = runTest {
        coEvery { translationApi.translate(any()) } returns translated("   ")

        val merged = repository().translateStory(StoryItem(id = "s9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun `translateStory is idempotent when the translation already matches`() = runTest {
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repository().translateStory(
            StoryItem(
                id = "s9",
                content = "Bonjour",
                translations = listOf(StoryTranslation(language = "es", content = "Hola")),
            ),
            "es",
        )

        assertThat(merged).isNull()
    }
}
