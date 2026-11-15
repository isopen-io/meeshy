package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.CreateConversationPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.net.MeeshyApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryCreateOptimisticTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val outbox get() = OutboxRepository(db, db.outboxDao())

    private fun repository() = ConversationRepository(mockk<ConversationApi>(), db, db.conversationDao(), db.syncMetaDao(), outbox)

    @Test
    fun `an offline creation shows a pending row at once and queues the creation`() = runTest {
        val repo = repository()

        val pendingId = repo.createOptimistic("group", "Squad", listOf("u1", "u2"), "server")!!

        assertThat(pendingId).startsWith("pending_")
        assertThat(repo.cachedById(pendingId)?.title).isEqualTo("Squad")
        val queued = outbox.deliverable(OutboxLanes.CONVERSATION).single()
        assertThat(queued.kind).isEqualTo(OutboxKind.CREATE_CONVERSATION.name)
        assertThat(queued.targetId).isEqualTo(pendingId)
        val payload = MeeshyApi.json.decodeFromString(CreateConversationPayload.serializer(), queued.payload)
        assertThat(payload.participantIds).containsExactly("u1", "u2")
    }

    @Test
    fun `the server conversation replaces the pending row without a duplicate`() = runTest {
        val repo = repository()
        val pendingId = repo.createOptimistic("group", "Squad", listOf("u1", "u2"))!!

        repo.reconcileCreated(pendingId, ApiConversation(id = "c0123456789abcdef0123456", type = "group", title = "Squad"))

        assertThat(repo.cachedById(pendingId)).isNull()
        assertThat(repo.cachedById("c0123456789abcdef0123456")?.title).isEqualTo("Squad")
        assertThat(db.conversationDao().allIds()).containsExactly("c0123456789abcdef0123456")
    }

    @Test
    fun `a definitive failure removes the pending row`() = runTest {
        val repo = repository()
        val pendingId = repo.createOptimistic("group", "Squad", listOf("u1", "u2"))!!

        repo.discardPending(pendingId)

        assertThat(repo.cachedById(pendingId)).isNull()
        assertThat(db.conversationDao().allIds()).isEmpty()
    }

    @Test
    fun `a detail update held on the pending id is re-addressed to the server id`() = runTest {
        val repo = repository()
        val pendingId = repo.createOptimistic("group", "Squad", listOf("u1", "u2"))!!
        outbox.enqueue(
            me.meeshy.sdk.outbox.OutboxMutation(
                kind = OutboxKind.UPDATE_CONVERSATION,
                lane = OutboxLanes.CONVERSATION,
                targetId = pendingId,
                payload = """{"title":"Renamed"}""",
            ),
        )
        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION).map { it.kind }).containsExactly(OutboxKind.CREATE_CONVERSATION.name)

        repo.reconcileCreated(pendingId, ApiConversation(id = "c0123456789abcdef0123456", type = "group"))

        val kinds = outbox.deliverable(OutboxLanes.CONVERSATION).map { it.kind }
        assertThat(kinds).contains(OutboxKind.UPDATE_CONVERSATION.name)
    }
}
