package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.serialization.json.Json
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13609 — le CÂBLAGE de production : `attachment:deleted` reçu par la socket, publié par le sujet de la famille du fil,
 * collecté par [AttachmentDeletionBinding] réel, écrit dans Room sous le compte auquel il est ARRIVÉ.
 */
@RunWith(RobolectricTestRunner::class)
class AttachmentDeletionArrivalAccountTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val laneScheduler = TestCoroutineScheduler()
    private val collectorScheduler = TestCoroutineScheduler()
    private lateinit var db: MeeshyDatabase
    private val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun wiredBinding(): AttachmentDeletionBinding {
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(
            SocketEventRegistrar { event, callback -> socket.on(event, callback) },
            StandardTestDispatcher(laneScheduler),
            { transition.generation },
            { fence.ticket() },
        )
        val events = ConversationSocketEventsManager(socket, json, router).also { it.attach() }
        val applier = AttachmentDeletionApplier(db, db.messageDao(), clock, fence, ConversationMediaHubIndex(fence))
        return AttachmentDeletionBinding(events, applier, StandardTestDispatcher(collectorScheduler)).also {
            it.attach()
            collectorScheduler.advanceUntilIdle()
        }
    }

    private suspend fun seedMessage() = db.messageDao().upsertAll(
        listOf(
            MessageEntityFactory.cached(
                ApiMessage(
                    id = "m1", conversationId = "c1", senderId = "A", content = "légende",
                    attachments = listOf(ApiMessageAttachment(id = "a1"), ApiMessageAttachment(id = "a2")),
                ),
                1L,
            ),
        ),
    )

    private suspend fun cachedPieces() =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find("m1")!!.payload).attachments.map { it.id }

    private fun receiveDeletion() {
        handlers.getValue("attachment:deleted").invoke(
            arrayOf(JSONObject("""{"conversationId":"c1","messageId":"m1","attachmentId":"a1"}""")),
        )
        laneScheduler.advanceUntilIdle()
    }

    private suspend fun pumpCollector(until: suspend () -> Boolean) {
        repeat(200) {
            collectorScheduler.advanceUntilIdle()
            if (until()) return
            Thread.sleep(10)
        }
    }

    @Test
    fun `a deletion that arrived on the current account's socket removes the piece`(): Unit = kotlinx.coroutines.runBlocking {
        seedMessage()
        val binding = wiredBinding()

        receiveDeletion()
        pumpCollector { cachedPieces() == listOf("a2") }

        assertThat(cachedPieces()).containsExactly("a2")
        binding.detach()
    }

    @Test
    fun `a deletion that arrived on A's socket and is collected after B signed in writes nothing`(): Unit = kotlinx.coroutines.runBlocking {
        val binding = wiredBinding()
        receiveDeletion()

        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        seedMessage()
        pumpCollector { false }

        assertThat(cachedPieces()).containsExactly("a1", "a2")
        binding.detach()
    }
}
