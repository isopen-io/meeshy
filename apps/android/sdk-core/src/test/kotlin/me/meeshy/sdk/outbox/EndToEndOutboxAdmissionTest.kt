package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #12956 — LA GARDE UNIQUE DU CLAIR DANS L'OUTBOX. Un message mis en file avant l'activation du
 * bout en bout, sa pièce, ou une modification ne repartent jamais en clair : la ligne s'épuise
 * AVANT tout envoi et avant tout téléversement, et sa bulle passe en échec.
 */
@RunWith(RobolectricTestRunner::class)
class EndToEndOutboxAdmissionTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private val ledger = InMemoryEndToEndRegimeLedger()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private val admission get() = EndToEndOutboxAdmission(ledger, db.conversationDao(), db.messageDao(), outbox)

    private suspend fun cache(id: String, mode: String?) {
        db.conversationDao().upsertAll(
            listOf(ConversationEntity(id = id, payload = MeeshyApi.json.encodeToString(ApiConversation(id = id, encryptionMode = mode)), updatedAt = 0, cachedAt = 0)),
        )
    }

    private suspend fun enqueue(kind: OutboxKind, cmid: String, targetId: String, lane: String = OutboxLanes.forMessage(targetId), dependsOn: Set<String> = emptySet()) {
        outbox.enqueue(OutboxMutation(kind, lane, targetId = targetId, payload = "{}", dependsOn = dependsOn, cmid = cmid))
    }

    private fun drainer(sent: MutableList<String>) = OutboxDrainer(
        outbox = outbox,
        senders = OutboxKind.entries.associateWith { MutationSender { row -> sent += row.cmid; SendResult.Success } },
        plaintextAdmission = admission,
    )

    @Test
    fun `un message en file vers une conversation chiffrée de bout en bout ne part pas`() = runTest {
        cache("c-e2ee", "e2ee")
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-e2ee")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.forMessage("c-e2ee"))

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `apprise e2ee puis servie sans mode, le registre la garde fermée`() = runTest {
        cache("c-down", null)
        ledger.learn("c-down")
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-down")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-down"))

        assertThat(sent).isEmpty()
    }

    @Test
    fun `la pièce d'un message vers une conversation e2ee n'est jamais téléversée`() = runTest {
        cache("c-e2ee", "e2ee")
        enqueue(OutboxKind.UPLOAD_MEDIA, "up1", targetId = "up1", lane = OutboxLanes.MEDIA)
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-e2ee", dependsOn = setOf("up1"))
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
    }

    @Test
    fun `une pièce vidée avant que son message ne soit en file n'est pas téléversée vers une conversation e2ee`() = runTest {
        cache("c-e2ee", "e2ee")
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = "up1",
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = "c-e2ee")),
                cmid = "up1",
            ),
        )
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
    }

    @Test
    fun `une modification dont le message a quitté Room reste gardée par la file de sa conversation`() = runTest {
        ledger.learn("c-gone")
        enqueue(OutboxKind.EDIT_MESSAGE, "e1", targetId = "msg-absent", lane = OutboxLanes.forMessage("c-gone"))
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-gone"))

        assertThat(sent).isEmpty()
    }

    @Test
    fun `une modification d'un message d'une conversation e2ee ne part pas`() = runTest {
        cache("c-e2ee", "e2ee")
        db.messageDao().upsertAll(listOf(MessageEntityFactory.cached(ApiMessage(id = "msg-1", conversationId = "c-e2ee", content = "x"), 0)))
        enqueue(OutboxKind.EDIT_MESSAGE, "e1", targetId = "msg-1", lane = OutboxLanes.forMessage("c-e2ee"))
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-e2ee"))

        assertThat(sent).isEmpty()
    }

    @Test
    fun `une conversation en clair, ou une pièce sans message (story, profil), part`() = runTest {
        cache("c-plain", null)
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-plain")
        enqueue(OutboxKind.UPLOAD_MEDIA, "up-story", targetId = "up-story", lane = OutboxLanes.MEDIA)
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-plain"))
        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("m1", "up-story")
    }
}
