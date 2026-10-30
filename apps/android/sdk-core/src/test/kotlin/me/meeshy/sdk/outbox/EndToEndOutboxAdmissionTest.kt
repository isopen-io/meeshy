package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.outbox.senders.AddReactionHandler
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
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

    private val reads = mutableListOf<String>()
    private var served: ApiConversation? = null
    private var refusal: ConversationModeRead = ConversationModeRead.Unreadable

    private val admission get() = EndToEndOutboxAdmission(
        ledger, db.conversationDao(), db.messageDao(), outbox,
        modeReader = { id ->
            reads += id
            served
                ?.also { if (EndToEndRegime.isEndToEnd(it.encryptionMode)) ledger.learn(id) else ledger.confirmClear(listOf(id)) }
                ?.let { ConversationModeRead.Served(it) }
                ?: refusal
        },
    )

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
        ledger.confirmClear(listOf("c-plain"))
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-plain")
        enqueue(OutboxKind.UPLOAD_MEDIA, "up-story", targetId = "up-story", lane = OutboxLanes.MEDIA)
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-plain"))
        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("m1", "up-story")
    }

    @Test
    fun `mode inconnu et serveur e2ee, aucun envoi en clair et la ligne est epuisee`() = runTest {
        cache("c-stale", null)
        served = ApiConversation(id = "c-stale", encryptionMode = "e2ee")
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-stale")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.forMessage("c-stale"))

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(ledger.isSealed("c-stale")).isTrue()
    }

    @Test
    fun `mode inconnu et serveur clair, une relecture puis l'envoi, et plus jamais de relecture`() = runTest {
        served = ApiConversation(id = "c-unseen", encryptionMode = null)
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-unseen")
        enqueue(OutboxKind.SEND_MESSAGE, "m2", "c-unseen")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-unseen"))

        assertThat(sent).containsExactly("m1", "m2").inOrder()
        assertThat(reads).containsExactly("c-unseen")
    }

    @Test
    fun `mode inconnu et hors ligne, la ligne reste en attente sans essai compte puis part au retour si clair`() = runTest {
        cache("c-stale", null)
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-stale")
        val sent = mutableListOf<String>()

        val offline = drainer(sent).drainLane(OutboxLanes.forMessage("c-stale"))

        assertThat(sent).isEmpty()
        assertThat(offline.stoppedOnTransientFailure).isTrue()
        val waiting = outbox.observeAll().first().single()
        assertThat(waiting.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(waiting.attempts).isEqualTo(0)

        served = ApiConversation(id = "c-stale", encryptionMode = null)
        drainer(sent).drainLane(OutboxLanes.forMessage("c-stale"))

        assertThat(sent).containsExactly("m1")
    }

    @Test
    fun `mode inconnu et hors ligne, la piece n'est pas televersee`() = runTest {
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = "up1",
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = "c-unseen")),
                cmid = "up1",
            ),
        )
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
    }

    @Test
    fun `mode clair connu en cache, aucun appel supplementaire`() = runTest {
        cache("c-server", "server")
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-server")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-server"))

        assertThat(sent).containsExactly("m1")
        assertThat(reads).isEmpty()
    }

    @Test
    fun `mode nul servi par le serveur, clair autorise sans relecture`() = runTest {
        cache("c-plain", null)
        ledger.confirmClear(listOf("c-plain"))
        enqueue(OutboxKind.SEND_MESSAGE, "m1", "c-plain")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-plain"))

        assertThat(sent).containsExactly("m1")
        assertThat(reads).isEmpty()
    }

    @Test
    fun `une conversation scellee n'est jamais confirmee claire`() = runTest {
        ledger.learn("c-sealed")
        ledger.confirmClear(listOf("c-sealed"))

        assertThat(ledger.isClearConfirmed("c-sealed")).isFalse()
    }

    @Test
    fun `mode inconnu et conversation refusee par la passerelle, la piece est epuisee sans clair et la file media repart`() = runTest {
        refusal = ConversationModeRead.Inaccessible
        cache("c-known", "server")
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = "up-gone",
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = "c-gone")),
                cmid = "up-gone",
            ),
        )
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = "up-ok",
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = "c-known")),
                cmid = "up-ok",
            ),
        )
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up-ok")
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(report.stoppedOnTransientFailure).isFalse()
        assertThat(outbox.row("up-gone")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE)
    }

    @Test
    fun `seuls 403, 410 et le 404 de la passerelle sont definitifs, tout autre echec de relecture se reessaie`() {
        listOf(403, 410).forEach {
            assertThat(ConversationModeReader.refusalOf(it, code = null)).isEqualTo(ConversationModeRead.Inaccessible)
        }
        assertThat(ConversationModeReader.refusalOf(404, code = ConversationModeReader.GATEWAY_NOT_FOUND_CODE))
            .isEqualTo(ConversationModeRead.Inaccessible)
        listOf(null, 401, 408, 429, 500, 503).forEach {
            assertThat(ConversationModeReader.refusalOf(it, code = null)).isEqualTo(ConversationModeRead.Unreadable)
        }
    }

    @Test
    fun `un 404 du proxy pendant un redemarrage de la passerelle est illisible, jamais definitif`() = runTest {
        assertThat(ConversationModeReader.refusalOf(404, code = "HTTP_404")).isEqualTo(ConversationModeRead.Unreadable)
        assertThat(ConversationModeReader.refusalOf(404, code = null)).isEqualTo(ConversationModeRead.Unreadable)
        val conversations = mockk<ConversationRepository>()
        coEvery { conversations.getById("c-proxy") } returns
            NetworkResult.Failure(ApiError("404 page not found", code = "HTTP_404", httpStatus = 404))

        assertThat(RepositoryConversationModeReader(conversations).read("c-proxy")).isEqualTo(ConversationModeRead.Unreadable)
    }

    @Test
    fun `la reponse d une banniere, une conversation chiffree est retenue avant toute bulle`() = runTest {
        cache("c1", "e2ee")

        assertThat(admission.verdictFor("c1")).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `un geste hors outbox vers une conversation apprise e2ee que Room croit encore server est retenu, sans relecture`() = runTest {
        ledger.learn("c1")
        cache("c1", "server")

        val verdict: ConversationPlaintextVerdict = admission
        assertThat(verdict.verdictFor("c1")).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
        assertThat(reads).isEmpty()
    }

    @Test
    fun `la reponse d une banniere, un mode inconnu est relu au serveur, jamais admis a l aveugle`() = runTest {
        served = ApiConversation(id = "c2", encryptionMode = null)

        assertThat(admission.verdictFor("c2")).isEqualTo(OutboxAdmissionVerdict.ADMIT)
        assertThat(reads).containsExactly("c2")

        reads.clear()
        served = null
        refusal = ConversationModeRead.Unreadable
        assertThat(admission.verdictFor("c3")).isEqualTo(OutboxAdmissionVerdict.WAIT)

        refusal = ConversationModeRead.Inaccessible
        assertThat(admission.verdictFor("c4")).isEqualTo(OutboxAdmissionVerdict.UNREACHABLE)
    }

    @Test
    fun `la reponse d une banniere, un mode clair confirme n appelle pas le serveur`() = runTest {
        ledger.confirmClear(listOf("c5"))

        assertThat(admission.verdictFor("c5")).isEqualTo(OutboxAdmissionVerdict.ADMIT)
        assertThat(reads).isEmpty()
    }

    // ── #13790 — réagir, épingler, supprimer pour tous : des gestes en clair que le bout en bout refuse ──

    private suspend fun cacheMessage(id: String, conversationId: String) {
        db.messageDao().upsertAll(listOf(MessageEntityFactory.cached(ApiMessage(id = id, conversationId = conversationId, content = "x"), 0)))
    }

    private suspend fun enqueueReaction(cmid: String, messageId: String, conversationId: String? = null) {
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.ADD_REACTION,
                OutboxLanes.REACTION,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(ReactionPayload("🔥", conversationId)),
                cmid = cmid,
            ),
        )
    }

    private suspend fun enqueuePin(kind: OutboxKind, cmid: String, messageId: String, conversationId: String) {
        outbox.enqueue(
            OutboxMutation(kind, OutboxLanes.PIN, targetId = messageId, payload = MeeshyApi.json.encodeToString(PinPayload(conversationId)), cmid = cmid),
        )
    }

    @Test
    fun `une reaction vers une conversation chiffree de bout en bout n'atteint jamais le client HTTP`() = runTest {
        cache("c-e2ee", "e2ee")
        cacheMessage("msg-1", "c-e2ee")
        enqueueReaction("r1", "msg-1")
        val reactionApi = mockk<ReactionApi>()
        val drainer = OutboxDrainer(
            outbox = outbox,
            senders = mapOf(OutboxKind.ADD_REACTION to AddReactionHandler(reactionApi, mockk(relaxed = true), MeeshyApi.json, withdrawals = OwnReactionWithdrawals())),
            plaintextAdmission = admission,
        )

        val report = drainer.drainLane(OutboxLanes.REACTION)

        coVerify(exactly = 0) { reactionApi.add(any()) }
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.row("r1")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_END_TO_END)
    }

    @Test
    fun `une reaction portant sa conversation reste gardee quand son message a quitte Room`() = runTest {
        ledger.learn("c-sealed")
        enqueueReaction("r1", "msg-absent", conversationId = "c-sealed")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.REACTION)

        assertThat(sent).isEmpty()
    }

    @Test
    fun `une reaction dont la conversation ne se retrouve pas ne part pas en clair`() = runTest {
        enqueueReaction("r1", "msg-absent")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.REACTION)

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.row("r1")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE)
    }

    @Test
    fun `une reaction vers un mode inconnu et illisible attend sans essai compte, jamais envoyee`() = runTest {
        cache("c-stale", null)
        cacheMessage("msg-1", "c-stale")
        enqueueReaction("r1", "msg-1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.REACTION)

        assertThat(sent).isEmpty()
        assertThat(report.stoppedOnTransientFailure).isTrue()
        assertThat(outbox.row("r1")?.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.row("r1")?.attempts).isEqualTo(0)
    }

    @Test
    fun `epingler ou desepingler dans une conversation e2ee ne part pas`() = runTest {
        cache("c-e2ee", "e2ee")
        enqueuePin(OutboxKind.PIN_MESSAGE, "p1", "msg-1", "c-e2ee")
        enqueuePin(OutboxKind.UNPIN_MESSAGE, "p2", "msg-2", "c-e2ee")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.PIN)

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(2)
    }

    @Test
    fun `supprimer pour tous dans une conversation e2ee ne part pas, meme quand le message a quitte Room`() = runTest {
        ledger.learn("c-e2ee")
        enqueue(OutboxKind.DELETE_MESSAGE, "d1", targetId = "msg-absent", lane = OutboxLanes.forMessage("c-e2ee"))
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c-e2ee"))

        assertThat(sent).isEmpty()
    }

    @Test
    fun `reagir, epingler et supprimer pour tous partent vers une conversation connue claire`() = runTest {
        cache("c-plain", null)
        ledger.confirmClear(listOf("c-plain"))
        cacheMessage("msg-1", "c-plain")
        enqueueReaction("r1", "msg-1")
        enqueuePin(OutboxKind.PIN_MESSAGE, "p1", "msg-1", "c-plain")
        enqueue(OutboxKind.DELETE_MESSAGE, "d1", targetId = "msg-1", lane = OutboxLanes.forMessage("c-plain"))
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.REACTION)
        drainer(sent).drainLane(OutboxLanes.PIN)
        drainer(sent).drainLane(OutboxLanes.forMessage("c-plain"))

        assertThat(sent).containsExactly("r1", "p1", "d1").inOrder()
        assertThat(reads).isEmpty()
    }
}
