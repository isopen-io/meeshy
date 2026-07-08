package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeMessageApi(
    var response: ApiResponse<List<ApiMessage>>,
    var olderResponse: ApiResponse<List<ApiMessage>> = ApiResponse(success = false, error = "no older page"),
) : MessageApi {
    var lastBefore: String? = null
    var lastLimit: Int? = null
    var listCalls: Int = 0

    override suspend fun list(
        conversationId: String,
        offset: Int?,
        limit: Int?,
        before: String?,
    ): ApiResponse<List<ApiMessage>> {
        listCalls += 1
        lastBefore = before
        lastLimit = limit
        return if (before != null) olderResponse else response
    }
    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun edit(messageId: String, body: EditMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun delete(messageId: String) = ApiResponse<Unit>(success = false)
    override suspend fun search(conversationId: String, query: String, limit: Int?, cursor: String?) =
        ApiResponse<List<ApiMessage>>(success = false)
    override suspend fun pin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = true)
    override suspend fun unpin(conversationId: String, messageId: String) =
        ApiResponse<Unit>(success = true)
}

private fun apiMessage(
    id: String,
    conversationId: String = "c1",
    clientMessageId: String? = null,
    createdAt: String? = null,
) = ApiMessage(
    id = id,
    conversationId = conversationId,
    content = "hi",
    clientMessageId = clientMessageId,
    createdAt = createdAt,
)

private class MutableClock(var now: Long) : me.meeshy.sdk.cache.CacheClock {
    override fun nowMillis(): Long = now
}

private const val T1 = "2026-06-01T10:00:00Z"
private const val T2 = "2026-06-01T11:00:00Z"
private const val T3 = "2026-06-01T12:00:00Z"
private const val T4 = "2026-06-01T13:00:00Z"

private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

@RunWith(RobolectricTestRunner::class)
class MessageRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository(api: MessageApi, clock: me.meeshy.sdk.cache.CacheClock = SystemCacheClock) =
        MessageRepository(api, db, db.messageDao(), db.syncMetaDao(), outbox, clock)

    private suspend fun streamedMessages(repo: MessageRepository, conversationId: String = "c1") =
        db.messageDao().observeForConversation(conversationId).first()

    @Test
    fun `stream first emission is Empty on a cold cache`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "down")))

        assertThat(repo.messagesStream("c1").first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists the conversation's messages`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
            ),
        )

        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", "m2")
    }

    @Test
    fun `refresh prunes messages absent from the latest sync`() = runTest {
        val api = FakeMessageApi(
            ApiResponse(success = true, data = listOf(apiMessage("m1"), apiMessage("m2"))),
        )
        val repo = repository(api)
        repo.refresh("c1")

        api.response = ApiResponse(success = true, data = listOf(apiMessage("m2")))
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m2")
    }

    @Test
    fun `refresh throws when the network fails`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "Server down")))

        val thrown = runCatching { repo.refresh("c1") }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(MessageSyncException::class.java)
    }

    @Test
    fun `sendOptimistic shows a SENDING bubble instantly and queues the outbox`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "offline")))

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val row = streamedMessages(repo).single()
        assertThat(row.id).isEqualTo(cmid)
        assertThat(row.sendState).isEqualTo(LocalSendState.SENDING.name)
        assertThat(outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cmid)
    }

    @Test
    fun `refresh keeps the optimistic bubble the server does not know yet`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1"))))
        val repo = repository(api)

        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id }).containsExactly("m1", cmid)
    }

    @Test
    fun `refresh reconciles the bubble once the server list echoes its clientMessageId`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = true, data = emptyList()))
        val repo = repository(api)
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("srv1", clientMessageId = cmid)),
        )
        repo.refresh("c1")

        val rows = streamedMessages(repo)
        assertThat(rows.map { it.id }).containsExactly("srv1")
        assertThat(rows.single().sendState).isNull()
    }

    @Test
    fun `reconcileSent swaps the local bubble for the server message atomically`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.reconcileSent(cmid, apiMessage("srv1", clientMessageId = cmid))

        val rows = streamedMessages(repo)
        assertThat(rows.map { it.id }).containsExactly("srv1")
        assertThat(rows.single().sendState).isNull()
    }

    @Test
    fun `markSendFailed flips the bubble to FAILED`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.markSendFailed(cmid)

        assertThat(streamedMessages(repo).single().sendState)
            .isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `retrySend revives the exhausted outbox row and flips back to SENDING`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        outbox.markExhausted(cmid, "gave up")
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        assertThat(streamedMessages(repo).single().sendState)
            .isEqualTo(LocalSendState.SENDING.name)
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.cmid).isEqualTo(cmid)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `retrySend re-enqueues from the cached payload when the outbox row is gone`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)
        outbox.markSucceeded(cmid)
        repo.markSendFailed(cmid)

        repo.retrySend(cmid)

        assertThat(outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cmid)
    }

    private suspend fun cachedMessage(id: String): ApiMessage =
        MeeshyApi.json.decodeFromString(db.messageDao().find(id)!!.payload)

    @Test
    fun `toggleReactionOptimistic add bumps the summary instantly and queues ADD_REACTION`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        val applied = repo.toggleReactionOptimistic("m1", "❤️", isAdding = true)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").reactionSummary).containsEntry("❤️", 1)
        val row = outbox.deliverable(OutboxLanes.REACTION).single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.ADD_REACTION)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("❤️")
    }

    @Test
    fun `toggleReactionOptimistic remove decrements and drops the emoji at zero`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1").copy(reactionSummary = mapOf("❤️" to 1, "🔥" to 3)),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.toggleReactionOptimistic("m1", "❤️", isAdding = false)

        val summary = cachedMessage("m1").reactionSummary
        assertThat(summary).doesNotContainKey("❤️")
        assertThat(summary).containsEntry("🔥", 3)
        assertThat(outbox.deliverable(OutboxLanes.REACTION).single().kindEnum)
            .isEqualTo(OutboxKind.REMOVE_REACTION)
    }

    @Test
    fun `toggleReactionOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.toggleReactionOptimistic(cmid, "❤️", isAdding = true)

        assertThat(applied).isFalse()
        assertThat(outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `applyReactionDelta updates the cached summary without touching the outbox`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        repo.applyReactionDelta("m1", "🔥", delta = 1)

        assertThat(cachedMessage("m1").reactionSummary).containsEntry("🔥", 1)
        assertThat(outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `editOptimistic rewrites the cached message and queues EDIT_MESSAGE`() = runTest {
        val translated = apiMessage("m1").copy(
            translations = listOf(
                ApiTextTranslation(targetLanguage = "en", translatedContent = "hi there"),
            ),
        )
        val repo = repository(FakeMessageApi(ApiResponse(success = true, data = listOf(translated))))
        repo.refresh("c1")

        val applied = repo.editOptimistic("m1", "bonjour")

        assertThat(applied).isTrue()
        val message = cachedMessage("m1")
        assertThat(message.content).isEqualTo("bonjour")
        assertThat(message.isEdited).isTrue()
        assertThat(message.translations).isEmpty()
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.EDIT_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("bonjour")
    }

    @Test
    fun `editOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.editOptimistic(cmid, "changed")

        assertThat(applied).isFalse()
        assertThat(cachedMessage(cmid).content).isEqualTo("salut")
        assertThat(outbox.deliverable("message:c1").single().kindEnum)
            .isEqualTo(OutboxKind.SEND_MESSAGE)
    }

    @Test
    fun `setPinnedOptimistic pin stamps pinnedAt and queues PIN_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
            clock = MutableClock(1_700_000_000_000),
        )
        repo.refresh("c1")

        val applied = repo.setPinnedOptimistic("m1", pin = true)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").pinnedAt).isNotNull()
        val row = outbox.deliverable(OutboxLanes.PIN).single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.PIN_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
        assertThat(row.payload).contains("c1")
    }

    @Test
    fun `setPinnedOptimistic unpin clears pinnedAt and queues UNPIN_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1").copy(pinnedAt = "2026-07-08T10:00:00Z")),
                ),
            ),
        )
        repo.refresh("c1")

        val applied = repo.setPinnedOptimistic("m1", pin = false)

        assertThat(applied).isTrue()
        assertThat(cachedMessage("m1").pinnedAt).isNull()
        assertThat(outbox.deliverable(OutboxLanes.PIN).single().kindEnum)
            .isEqualTo(OutboxKind.UNPIN_MESSAGE)
    }

    @Test
    fun `setPinnedOptimistic refuses a bubble the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        val applied = repo.setPinnedOptimistic(cmid, pin = true)

        assertThat(applied).isFalse()
        assertThat(cachedMessage(cmid).pinnedAt).isNull()
        assertThat(outbox.deliverable(OutboxLanes.PIN)).isEmpty()
    }

    @Test
    fun `loadOlder pages backwards from the oldest synced message`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m2", createdAt = T2)),
            ),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        val hasMore = repo.loadOlder("c1")

        assertThat(api.lastBefore).isEqualTo("m2")
        assertThat(hasMore).isFalse()
        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m2", "m3")
            .inOrder()
    }

    @Test
    fun `loadOlder reports more history when the server says so`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = true),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        assertThat(repo.loadOlder("c1")).isTrue()
    }

    @Test
    fun `loadOlder leaves the freshness watermark untouched`() = runTest {
        val clock = MutableClock(1_000)
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api, clock)
        repo.refresh("c1")
        clock.now = 5_000

        repo.loadOlder("c1")

        assertThat(db.syncMetaDao().observe("messages:c1").first()).isEqualTo(1_000)
    }

    @Test
    fun `loadOlder does nothing on a cache with no synced message`() = runTest {
        val api = FakeMessageApi(ApiResponse(success = false, error = "n/a"))
        val repo = repository(api)
        repo.sendOptimistic("c1", "salut", "fr", sender)

        val hasMore = repo.loadOlder("c1")

        assertThat(hasMore).isTrue()
        assertThat(api.listCalls).isEqualTo(0)
    }

    @Test
    fun `loadOlder throws when the network fails`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(success = true, data = listOf(apiMessage("m2", createdAt = T2))),
            olderResponse = ApiResponse(success = false, error = "down"),
        )
        val repo = repository(api)
        repo.refresh("c1")

        val thrown = runCatching { repo.loadOlder("c1") }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(MessageSyncException::class.java)
    }

    @Test
    fun `refresh keeps paginated history outside the window it fetched`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m2", createdAt = T2)),
            ),
            olderResponse = ApiResponse(
                success = true,
                data = listOf(apiMessage("m1", createdAt = T1)),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")
        repo.loadOlder("c1")

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("m4", createdAt = T4), apiMessage("m3", createdAt = T3)),
        )
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m2", "m3", "m4")
            .inOrder()
    }

    @Test
    fun `refresh still prunes deletions inside the fetched window`() = runTest {
        val api = FakeMessageApi(
            response = ApiResponse(
                success = true,
                data = listOf(
                    apiMessage("m3", createdAt = T3),
                    apiMessage("m2", createdAt = T2),
                    apiMessage("m1", createdAt = T1),
                ),
            ),
        )
        val repo = repository(api)
        repo.refresh("c1")

        api.response = ApiResponse(
            success = true,
            data = listOf(apiMessage("m3", createdAt = T3), apiMessage("m1", createdAt = T1)),
        )
        repo.refresh("c1")

        assertThat(streamedMessages(repo).map { it.id })
            .containsExactly("m1", "m3")
            .inOrder()
    }

    @Test
    fun `deleteOptimistic tombstones the cached message and queues DELETE_MESSAGE`() = runTest {
        val repo = repository(
            FakeMessageApi(ApiResponse(success = true, data = listOf(apiMessage("m1")))),
        )
        repo.refresh("c1")

        val applied = repo.deleteOptimistic("m1")

        assertThat(applied).isTrue()
        val message = cachedMessage("m1")
        assertThat(message.deletedAt).isNotNull()
        assertThat(message.content).isEmpty()
        assertThat(message.translations).isEmpty()
        val row = outbox.deliverable("message:c1").single()
        assertThat(row.kindEnum).isEqualTo(OutboxKind.DELETE_MESSAGE)
        assertThat(row.targetId).isEqualTo("m1")
    }

    @Test
    fun `applyReadReceipt upgrades own messages up to the frontier`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1", createdAt = T1).copy(senderId = "me"),
                        apiMessage("m2", createdAt = T2).copy(senderId = "me"),
                        apiMessage("m3", createdAt = T4).copy(senderId = "me"),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 2,
            readCount = 1,
            frontierIso = T3,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(1)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(2)
        assertThat(cachedMessage("m2").readCount).isEqualTo(1)
        assertThat(cachedMessage("m3").readCount).isEqualTo(0)
        assertThat(cachedMessage("m3").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt leaves peer messages untouched`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1", createdAt = T1).copy(senderId = "other")),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 1,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt skips optimistic bubbles the server does not know yet`() = runTest {
        val repo = repository(FakeMessageApi(ApiResponse(success = false, error = "n/a")))
        val cmid = repo.sendOptimistic("c1", "salut", "fr", sender)

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 1,
            frontierIso = T4,
        )

        assertThat(cachedMessage(cmid).readCount).isEqualTo(0)
        assertThat(cachedMessage(cmid).deliveredCount).isEqualTo(0)
    }

    @Test
    fun `applyReadReceipt never downgrades a read message`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(
                        apiMessage("m1", createdAt = T1)
                            .copy(senderId = "me", deliveredCount = 3, readCount = 2),
                    ),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 1,
            readCount = 0,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(2)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(3)
    }

    @Test
    fun `applyReadReceipt with no delivery progress is a no-op`() = runTest {
        val repo = repository(
            FakeMessageApi(
                ApiResponse(
                    success = true,
                    data = listOf(apiMessage("m1", createdAt = T1).copy(senderId = "me")),
                ),
            ),
        )
        repo.refresh("c1")

        repo.applyReadReceipt(
            conversationId = "c1",
            ownSenderId = "me",
            deliveredCount = 0,
            readCount = 0,
            frontierIso = T2,
        )

        assertThat(cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(cachedMessage("m1").deliveredCount).isEqualTo(0)
    }
}
