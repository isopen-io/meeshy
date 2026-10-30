package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13795 — `conversation:new` : une conversation créée (par moi, ou qui m'accueille) entre dans la liste sans
 * rafraîchissement, que l'écran de liste soit ouvert ou non. Câblage de production : routeur réel, barrière de compte
 * réelle, Room réelle.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCreatedBindingTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val laneScheduler = TestCoroutineScheduler()
    private val collectorScheduler = TestCoroutineScheduler()
    private val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
    private val api = mockk<ConversationApi>()
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = ConversationRepository(
        api, db, db.conversationDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()), fence = fence,
    )

    private fun attachedBinding(): ConversationCreatedBinding {
        val router = SocketEventRouter(
            SocketEventRegistrar { event, callback -> handlers[event] = callback },
            StandardTestDispatcher(laneScheduler),
            { transition.generation },
            { fence.ticket() },
        )
        return ConversationCreatedBinding(router, json, repository(), owner, StandardTestDispatcher(collectorScheduler))
            .also {
                it.attach()
                collectorScheduler.advanceUntilIdle()
            }
    }

    private fun receive(conversationId: String = "c1", participants: List<String> = listOf("A", "B")) {
        val ids = participants.joinToString(",") { "\"$it\"" }
        handlers.getValue("conversation:new").invoke(
            arrayOf(
                JSONObject(
                    """{"conversationId":"$conversationId","conversationType":"group","title":"Equipe","creatorId":"B","participantIds":[$ids],"createdAt":"2026-10-29T10:00:00.000Z"}""",
                ),
            ),
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

    private suspend fun cachedIds() = db.conversationDao().observeAll().first().map { it.id }

    private fun serving(conversation: ApiConversation) {
        coEvery { api.getById(conversation.id) } returns ApiResponse(success = true, data = conversation)
    }

    private suspend fun cache(conversation: ApiConversation) = db.conversationDao().upsertAll(
        listOf(
            ConversationEntity(
                id = conversation.id,
                payload = MeeshyApi.json.encodeToString(conversation),
                updatedAt = 1L,
                cachedAt = 1L,
                unreadCount = 0,
            ),
        ),
    )

    @Test
    fun `une conversation creee sans message entre dans la liste avec son mode de chiffrement servi`(): Unit =
        kotlinx.coroutines.runBlocking {
            serving(ApiConversation(id = "c1", type = "group", title = "Equipe", encryptionMode = "e2ee", createdAt = "2026-10-29T10:00:00.000Z"))
            val binding = attachedBinding()

            receive()
            pumpCollector { cachedIds().isNotEmpty() }

            val row = repository().cachedById("c1")
            assertThat(row?.title).isEqualTo("Equipe")
            assertThat(row?.encryptionMode).isEqualTo("e2ee")
            binding.detach()
        }

    @Test
    fun `une conversation deja connue n'est ni relue ni dupliquee`(): Unit = kotlinx.coroutines.runBlocking {
        cache(ApiConversation(id = "c1", type = "group", title = "Equipe"))
        val binding = attachedBinding()

        receive()
        pumpCollector { false }

        coVerify(exactly = 0) { api.getById(any()) }
        assertThat(cachedIds()).containsExactly("c1")
        binding.detach()
    }

    @Test
    fun `la meme annonce recue deux fois ne cree qu'une ligne`(): Unit = kotlinx.coroutines.runBlocking {
        serving(ApiConversation(id = "c1", type = "group", title = "Equipe"))
        val binding = attachedBinding()

        receive()
        receive()
        pumpCollector { cachedIds().isNotEmpty() }
        pumpCollector { false }

        assertThat(cachedIds()).containsExactly("c1")
        binding.detach()
    }

    @Test
    fun `une conversation d'un autre compte n'est ni lue ni ecrite`(): Unit = kotlinx.coroutines.runBlocking {
        serving(ApiConversation(id = "c1", type = "group"))
        val binding = attachedBinding()

        receive(participants = listOf("B", "C"))
        pumpCollector { false }

        coVerify(exactly = 0) { api.getById(any()) }
        assertThat(cachedIds()).isEmpty()
        binding.detach()
    }

    @Test
    fun `une annonce arrivee sous A et collectee apres l'arrivee de B ne lit ni n'ecrit rien`(): Unit =
        kotlinx.coroutines.runBlocking {
            serving(ApiConversation(id = "c1", type = "group"))
            val binding = attachedBinding()
            receive()

            owner.id = null
            transition.bumpGeneration()
            fence.close { db.clearAllTables() }
            owner.id = "B"
            transition.bumpGeneration()
            pumpCollector { false }

            coVerify(exactly = 0) { api.getById(any()) }
            assertThat(cachedIds()).isEmpty()
            binding.detach()
        }

    @Test
    fun `une lecture en echec n'ecrit rien et ne leve rien`(): Unit = kotlinx.coroutines.runBlocking {
        coEvery { api.getById("c1") } returns ApiResponse(success = false)
        val binding = attachedBinding()

        receive()
        pumpCollector { false }

        assertThat(cachedIds()).isEmpty()
        binding.detach()
    }
}
