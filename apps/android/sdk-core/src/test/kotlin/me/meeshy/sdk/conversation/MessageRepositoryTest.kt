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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.stateEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private class FakeMessageApi(
    var response: ApiResponse<List<ApiMessage>>,
) : MessageApi {
    override suspend fun list(conversationId: String, offset: Int?, limit: Int?) = response
    override suspend fun send(conversationId: String, body: SendMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun edit(messageId: String, body: EditMessageRequest) =
        ApiResponse<ApiMessage>(success = false)
    override suspend fun delete(messageId: String) = ApiResponse<Unit>(success = false)
    override suspend fun search(conversationId: String, query: String, limit: Int?, cursor: String?) =
        ApiResponse<List<ApiMessage>>(success = false)
}

private fun apiMessage(id: String, conversationId: String = "c1", clientMessageId: String? = null) =
    ApiMessage(id = id, conversationId = conversationId, content = "hi", clientMessageId = clientMessageId)

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

    private fun repository(api: MessageApi) =
        MessageRepository(api, db, db.messageDao(), db.syncMetaDao(), outbox, SystemCacheClock)

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
}
