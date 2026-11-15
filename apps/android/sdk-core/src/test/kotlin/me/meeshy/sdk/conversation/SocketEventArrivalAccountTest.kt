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
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13576 — le CÂBLAGE de production : un événement que la socket de A a reçu, collecté après l'adoption de B, s'écrit
 * sous A (donc nulle part). Rien ici ne pose `withAccountTicket` : le ticket voyage avec l'événement, de la voie série
 * jusqu'au collecteur réel ([MessageEditBinding]).
 */
@RunWith(RobolectricTestRunner::class)
class SocketEventArrivalAccountTest {

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

    private fun wiredBinding(): MessageEditBinding {
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(
            SocketEventRegistrar { event, callback -> socket.on(event, callback) },
            StandardTestDispatcher(laneScheduler),
            { transition.generation },
            { fence.ticket() },
        )
        val manager = MessageSocketManager(socket, json, SyncSeqTracker(), router).also { it.attach() }
        val messages = MessageRepository(
            mockk(relaxed = true), mockk(relaxed = true), db, db.messageDao(), db.syncMetaDao(),
            OutboxRepository(db, db.outboxDao()), clock, EndToEndRegimeKeeper(me.meeshy.sdk.e2ee.EndToEndRegimeLedger.None, db), fence,
        )
        return MessageEditBinding(manager, messages, StandardTestDispatcher(collectorScheduler)).also {
            it.attach()
            collectorScheduler.advanceUntilIdle()
        }
    }

    private suspend fun seedMessage() = db.messageDao().upsertAll(
        listOf(MessageEntityFactory.cached(ApiMessage(id = "m1", conversationId = "c1", content = "salut", senderId = "A"), 1L)),
    )

    private suspend fun cachedContent() =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find("m1")!!.payload).content

    private fun receiveEdit(content: String) {
        handlers.getValue("message:edited").invoke(
            arrayOf(JSONObject("""{"id":"m1","conversationId":"c1","senderId":"A","content":"$content"}""")),
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
    fun `an edit that arrived on A's socket and is collected after B signed in writes nothing`(): Unit = kotlinx.coroutines.runBlocking {
        val binding = wiredBinding()
        receiveEdit("modifié par A")

        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        seedMessage()
        pumpCollector { false }

        assertThat(cachedContent()).isEqualTo("salut")
        binding.detach()
    }

    @Test
    fun `an edit that arrived on the current account's socket is written`(): Unit = kotlinx.coroutines.runBlocking {
        seedMessage()
        val binding = wiredBinding()

        receiveEdit("modifié")
        pumpCollector { cachedContent() == "modifié" }

        assertThat(cachedContent()).isEqualTo("modifié")
        binding.detach()
    }
}
