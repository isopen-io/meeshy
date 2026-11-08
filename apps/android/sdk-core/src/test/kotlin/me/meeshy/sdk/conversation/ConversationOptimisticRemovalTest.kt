package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.senders.ConversationRemovalPayload
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationOptimisticRemovalTest {

    private lateinit var db: MeeshyDatabase
    private var flushes = 0

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val outbox get() = OutboxRepository(db, db.outboxDao())

    private fun repository() = ConversationRepository(mockk<ConversationApi>(), db, db.conversationDao(), db.syncMetaDao(), outbox)

    private fun removal(repo: ConversationRepository) = ConversationOptimisticRemoval(
        conversationDao = db.conversationDao(),
        repository = repo,
        outbox = outbox,
        flushScheduler = OutboxFlushScheduler { flushes++ },
        events = ConversationRemovalEvents(),
    )

    @Test
    fun `leaving takes the row off the list at once and queues the request`() = runTest {
        val repo = repository()
        repo.remember(ApiConversation(id = "c1", title = "Équipe"))

        val write = removal(repo).remove("c1", ConversationRemoval.LEAVE)

        assertThat(write).isEqualTo(ConversationRemovalWrite.Queued)
        assertThat(repo.cachedById("c1")).isNull()
        val queued = outbox.deliverable(OutboxLanes.CONVERSATION_STATE).single()
        assertThat(queued.kind).isEqualTo(OutboxKind.LEAVE_CONVERSATION.name)
        assertThat(queued.targetId).isEqualTo("c1")
        assertThat(flushes).isEqualTo(1)
    }

    @Test
    fun `the queued row carries the row as it was, for the rollback`() = runTest {
        val repo = repository()
        repo.remember(ApiConversation(id = "c1", title = "Équipe"))

        removal(repo).remove("c1", ConversationRemoval.DELETE_FOR_ME)

        val queued = outbox.deliverable(OutboxLanes.CONVERSATION_STATE).single()
        val payload = MeeshyApi.json.decodeFromString(ConversationRemovalPayload.serializer(), queued.payload)
        assertThat(payload.snapshot?.title).isEqualTo("Équipe")
        assertThat(queued.kind).isEqualTo(OutboxKind.DELETE_CONVERSATION_FOR_ME.name)
    }

    @Test
    fun `each gesture is its own row, even for the same conversation`() = runTest {
        val repo = repository()
        repo.remember(ApiConversation(id = "c1"))
        val remover = removal(repo)

        remover.remove("c1", ConversationRemoval.LEAVE)
        remover.remove("c1", ConversationRemoval.DELETE_FOR_ALL)
        remover.remove("c1", ConversationRemoval.DELETE_FOR_ALL)

        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION_STATE).map { it.kind }).containsExactly(
            OutboxKind.LEAVE_CONVERSATION.name,
            OutboxKind.DELETE_CONVERSATION_FOR_ALL.name,
            OutboxKind.DELETE_CONVERSATION_FOR_ALL.name,
        )
    }

    @Test
    fun `an unknown conversation is still queued, with nothing to give back`() = runTest {
        val repo = repository()

        val write = removal(repo).remove("c9", ConversationRemoval.LEAVE)

        assertThat(write).isEqualTo(ConversationRemovalWrite.Queued)
        val queued = outbox.deliverable(OutboxLanes.CONVERSATION_STATE).single()
        assertThat(MeeshyApi.json.decodeFromString(ConversationRemovalPayload.serializer(), queued.payload).snapshot).isNull()
    }

    @Test
    fun `a blank id queues nothing`() = runTest {
        val write = removal(repository()).remove(" ", ConversationRemoval.LEAVE)

        assertThat(write).isInstanceOf(ConversationRemovalWrite.Failed::class.java)
        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION_STATE)).isEmpty()
    }

    @Test
    fun `a refused removal puts the row back where it was`() = runTest {
        val repo = repository()
        repo.remember(ApiConversation(id = "c1", title = "Équipe"))
        removal(repo).remove("c1", ConversationRemoval.LEAVE)
        val row = outbox.deliverable(OutboxLanes.CONVERSATION_STATE).single()

        me.meeshy.sdk.outbox.senders.LeaveConversationHandler(repo, MeeshyApi.json, ConversationRemovalEvents()).onExhausted(row)

        assertThat(repo.cachedById("c1")?.title).isEqualTo("Équipe")
    }
}
