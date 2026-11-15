package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.e2ee.SharedPrefsEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * #13820 — un envoi né HORS DU FIL (partage, réponse à une humeur, transfert) ne se fie jamais au mode en cache : la
 * conversation a pu passer en e2ee pendant que l'appareil était loin, et Room dit encore « server ». Le geste relit le mode
 * avant de mettre en file ; un envoi mis en file sans mode relu (hors ligne) est rejugé par la file — message ou pièce,
 * AVANT le téléversement —, jamais envoyé sur la foi du cache, et son attente est bornée.
 */
@RunWith(RobolectricTestRunner::class)
class OutOfThreadSendAdmissionTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private val ledger = InMemoryEndToEndRegimeLedger()
    private val transactions = Executors.newSingleThreadExecutor()

    @Before
    fun setUp() {
        // #13859 — les lectures Room s'exécutent sur le fil du test : sur l'exécuteur d'E/S réel, une lecture lente (machine
        // chargée) laissait runTest, inactif, avancer l'horloge virtuelle jusqu'au délai d'une autre conversation, et la borne
        // d'un geste se mesurait sur l'ordonnanceur au lieu du code.
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .setQueryExecutor(Executor(Runnable::run))
            .setTransactionExecutor(transactions)
            .build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
        transactions.shutdown()
    }

    private val reads = mutableListOf<String>()
    private val served = mutableMapOf<String, String?>()
    private var unreadable: ConversationModeRead = ConversationModeRead.Unreadable
    private var stalls = false
    private val admission get() = EndToEndOutboxAdmission(
        ledger, db.conversationDao(), db.messageDao(), outbox,
        modeReader = { id ->
            reads += id
            if (stalls) awaitCancellation()
            if (id in served) {
                val mode = served.getValue(id)
                if (EndToEndRegime.isEndToEnd(mode)) ledger.learn(id) else ledger.confirmClear(listOf(id))
                ConversationModeRead.Served(ApiConversation(id = id, encryptionMode = mode))
            } else {
                unreadable
            }
        },
    )

    private suspend fun cache(id: String, mode: String?) {
        db.conversationDao().upsertAll(
            listOf(ConversationEntity(id = id, payload = MeeshyApi.json.encodeToString(ApiConversation(id = id, encryptionMode = mode)), updatedAt = 0, cachedAt = 0)),
        )
    }

    private suspend fun enqueueUpload(cmid: String, conversationId: String) {
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = cmid,
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = conversationId)),
                cmid = cmid,
            ),
        )
    }

    private suspend fun enqueueMessage(cmid: String, conversationId: String) {
        outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage(conversationId), targetId = conversationId, payload = "{}", cmid = cmid))
    }

    private fun drainer(sent: MutableList<String>, exhaustedRows: MutableList<String> = mutableListOf()) = OutboxDrainer(
        outbox = outbox,
        senders = OutboxKind.entries.associateWith { MutationSender { row -> sent += row.cmid; SendResult.Success } },
        onExhausted = { exhaustedRows += it.cmid },
        plaintextAdmission = admission,
    )

    /** Un envoi hors du fil mis en file sans mode relu : la conversation est marquée à relire. */
    private suspend fun unconfirmed(id: String) {
        cache(id, "server")
        ledger.markModeUnconfirmed(id)
    }

    private suspend fun waitedBeyondTheBound(cmid: String) {
        db.outboxDao().defer(
            cmid,
            nextAttemptAt = 0L,
            waitingSince = System.currentTimeMillis() - OutboxDrainer.DEFERRED_MAX_WAIT_MS - 60_000L,
            now = 0L,
        )
    }

    private suspend fun enqueuePublicationUpload(cmid: String) {
        outbox.enqueue(OutboxMutation(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, targetId = cmid, payload = "", cmid = cmid))
    }

    // ── La pièce : relue au drainage quand son mode est à relire, jamais sur la foi seule du cache ──

    @Test
    fun `une piece du composeur vers une conversation au mode connu en cache part sans relecture`() = runTest {
        cache("c1", "server")
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up1")
        assertThat(reads).isEmpty()
    }

    @Test
    fun `une piece d un envoi hors du fil mis en file sans mode relu est relue et jamais televersee si le serveur la sert e2ee`() = runTest {
        unconfirmed("c1")
        served["c1"] = "e2ee"
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
        assertThat(reads).containsExactly("c1")
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.row("up1")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_END_TO_END)
    }

    @Test
    fun `une piece dont le mode a relire est relu clair est televersee`() = runTest {
        unconfirmed("c1")
        served["c1"] = "server"
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up1")
        assertThat(reads).containsExactly("c1")
    }

    @Test
    fun `une piece dont le mode ne se relit pas attend, sans essai compte, et ne part jamais sur la foi du cache`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
        assertThat(report.heldBack).isTrue()
        val waiting = outbox.observeAll().first().single()
        assertThat(waiting.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(waiting.attempts).isEqualTo(0)
    }

    @Test
    fun `une relecture qui depasse son delai laisse la piece en attente`() = runTest {
        unconfirmed("c1")
        stalls = true
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
        assertThat(report.heldBack).isTrue()
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.PENDING)
    }

    // ── La voie média : une pièce qui attend ne retient pas les autres, et n'attend pas sans fin ──

    @Test
    fun `une piece dont le mode ne se relit pas ne retient ni la piece d une autre conversation ni celle d une publication`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        unconfirmed("c2")
        served["c2"] = "server"
        enqueueUpload("up2", "c2")
        enqueuePublicationUpload("up-story")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up2", "up-story")
        assertThat(report.heldBack).isTrue()
        assertThat(report.stoppedOnTransientFailure).isFalse()
        val held = outbox.row("up1")!!
        assertThat(held.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(held.attempts).isEqualTo(0)
        assertThat(held.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
    }

    @Test
    fun `une piece qui attend son prochain essai ne retient pas les pieces mises en file apres elle`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()
        drainer(sent).drainLane(OutboxLanes.MEDIA)
        unconfirmed("c2")
        served["c2"] = "server"
        enqueueUpload("up2", "c2")
        reads.clear()

        val report = drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up2")
        assertThat(reads).containsExactly("c2")
        assertThat(report.heldBack).isTrue()
        assertThat(outbox.row("up1")?.stateEnum).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `une piece dont le mode reste illisible au dela de l attente bornee echoue pour de bon, sans jamais partir`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        waitedBeyondTheBound("up1")
        val sent = mutableListOf<String>()
        val exhaustedRows = mutableListOf<String>()

        val report = drainer(sent, exhaustedRows).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(exhaustedRows).containsExactly("up1")
        val failed = outbox.row("up1")!!
        assertThat(failed.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(failed.lastError).contains(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
    }

    @Test
    fun `une piece dont le mode se relit enfin repart avec une attente neuve`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        drainer(mutableListOf()).drainLane(OutboxLanes.MEDIA)
        assertThat(outbox.row("up1")?.waitingSince).isNotNull()
        served["c1"] = "server"
        db.outboxDao().defer("up1", nextAttemptAt = 0L, waitingSince = outbox.row("up1")!!.waitingSince!!, now = 0L)
        val sent = mutableListOf<String>()
        val failing = OutboxDrainer(
            outbox = outbox,
            senders = OutboxKind.entries.associateWith { MutationSender { row -> sent += row.cmid; SendResult.TransientFailure } },
            plaintextAdmission = admission,
        )

        failing.drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up1")
        val row = outbox.row("up1")!!
        assertThat(row.waitingSince).isNull()
        assertThat(row.lastError).isNotEqualTo(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
    }

    // ── Le coût : le geste relit, la pièce qui le suit ne relit pas ──

    @Test
    fun `un partage de deux pieces vers une conversation relue claire ne relit le mode qu une fois`() = runTest {
        cache("c1", "server")
        served["c1"] = "server"
        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.SEND)
        enqueueUpload("up1", "c1")
        enqueueUpload("up2", "c1")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("up1", "up2")
        assertThat(reads).containsExactly("c1")
    }

    @Test
    fun `un partage vers plusieurs conversations les relit en parallele, dans la borne d un seul geste`() = runTest {
        listOf("c1", "c2", "c3").forEach { cache(it, "server") }
        stalls = true

        val admissions = admission.admitAll(listOf("c1", "c2", "c3"))

        assertThat(admissions).containsExactly(
            "c1", OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN,
            "c2", OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN,
            "c3", OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN,
        )
        assertThat(reads).containsExactly("c1", "c2", "c3")
        assertThat(testScheduler.currentTime).isAtMost(EndToEndOutboxAdmission.GESTURE_MODE_READ_BUDGET_MILLIS)
    }

    @Test
    fun `un partage vers plusieurs conversations rend le verdict de chacune`() = runTest {
        cache("c1", "server")
        served["c1"] = "server"
        ledger.learn("c2")
        cache("c3", "server")
        served["c3"] = "e2ee"

        val admissions = admission.admitAll(listOf("c1", "c2", "c3"))

        assertThat(admissions).containsExactly(
            "c1", OutOfThreadAdmission.SEND,
            "c2", OutOfThreadAdmission.END_TO_END,
            "c3", OutOfThreadAdmission.END_TO_END,
        )
    }

    @Test
    fun `une piece vers une conversation apprise e2ee est retenue sans relecture`() = runTest {
        ledger.learn("c1")
        cache("c1", "server")
        enqueueUpload("up1", "c1")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).isEmpty()
        assertThat(reads).isEmpty()
    }

    // ── Le geste : relu avant de mettre en file ──

    @Test
    fun `le geste vers une conversation que le cache croit server mais que le serveur sert e2ee ne met rien en file`() = runTest {
        cache("c1", "server")
        served["c1"] = "e2ee"

        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.END_TO_END)
        assertThat(reads).containsExactly("c1")
    }

    @Test
    fun `le geste relit le mode meme quand le cache le dit clair, et part s il est relu clair`() = runTest {
        cache("c1", "server")
        served["c1"] = "hybrid"

        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.SEND)
        assertThat(reads).containsExactly("c1")
    }

    @Test
    fun `le geste vers une conversation scellee est refuse sans relecture`() = runTest {
        ledger.learn("c1")

        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.END_TO_END)
        assertThat(reads).isEmpty()
    }

    @Test
    fun `le geste vers une conversation que la passerelle ne sert plus ne met rien en file`() = runTest {
        cache("c1", "server")
        unreadable = ConversationModeRead.Inaccessible

        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.UNREACHABLE)
    }

    @Test
    fun `hors ligne ou hors delai, le geste met en file en attente d un mode connu`() = runTest {
        cache("c1", "server")
        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN)

        stalls = true
        cache("c2", "server")
        assertThat(admission.admit("c2")).isEqualTo(OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN)
    }

    // ── L'envoi mis en file sans mode relu : rejugé par la file ──

    @Test
    fun `un envoi hors du fil mis en file hors ligne est rejuge au drainage, et ne part pas si la conversation est e2ee`() = runTest {
        cache("c1", "server")
        assertThat(admission.admit("c1")).isEqualTo(OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN)
        enqueueMessage("m1", "c1")
        reads.clear()
        served["c1"] = "e2ee"
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(reads).containsExactly("c1")
        assertThat(report.exhausted).isEqualTo(1)
    }

    @Test
    fun `un envoi hors du fil mis en file hors ligne attend tant que le mode ne se relit pas`() = runTest {
        cache("c1", "server")
        admission.admit("c1")
        enqueueMessage("m1", "c1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(report.stoppedOnTransientFailure).isTrue()
        assertThat(outbox.observeAll().first().single().attempts).isEqualTo(0)
    }

    @Test
    fun `une fois le mode relu clair, la file part et le cache suffit de nouveau`() = runTest {
        cache("c1", "server")
        admission.admit("c1")
        enqueueMessage("m1", "c1")
        served["c1"] = "server"
        val sent = mutableListOf<String>()
        drainer(sent).drainLane(OutboxLanes.forMessage("c1"))
        reads.clear()

        enqueueMessage("m2", "c1")
        drainer(sent).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).containsExactly("m1", "m2").inOrder()
        assertThat(reads).isEmpty()
    }

    @Test
    fun `sans envoi hors du fil en attente, un message du fil vers une conversation server ne relit rien`() = runTest {
        cache("c1", "server")
        enqueueMessage("m1", "c1")
        val sent = mutableListOf<String>()

        drainer(sent).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).containsExactly("m1")
        assertThat(reads).isEmpty()
    }

    @Test
    fun `un envoi hors du fil dont le mode reste illisible attend sans essai, borne comme une piece`() = runTest {
        unconfirmed("c1")
        enqueueMessage("m1", "c1")
        val sent = mutableListOf<String>()

        val report = drainer(sent).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(report.stoppedOnTransientFailure).isTrue()
        val waiting = outbox.row("m1")!!
        assertThat(waiting.attempts).isEqualTo(0)
        assertThat(waiting.waitingSince).isNotNull()
        assertThat(waiting.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
    }

    @Test
    fun `un envoi hors du fil dont le mode reste illisible au dela de la borne echoue, sans jamais partir`() = runTest {
        unconfirmed("c1")
        enqueueMessage("m1", "c1")
        waitedBeyondTheBound("m1")
        val sent = mutableListOf<String>()
        val exhaustedRows = mutableListOf<String>()

        val report = drainer(sent, exhaustedRows).drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(report.exhausted).isEqualTo(1)
        assertThat(exhaustedRows).containsExactly("m1")
        assertThat(outbox.row("m1")?.lastError).contains(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
    }

    @Test
    fun `le mode a relire survit au redemarrage et appartient a son compte`() {
        var account = "alice"
        val accounts = SyncAccountProvider { account }
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        SharedPrefsEndToEndRegimeLedger(context, accounts).markModeUnconfirmed("c1")

        val reopened = SharedPrefsEndToEndRegimeLedger(context, accounts)
        assertThat(reopened.isModeUnconfirmed("c1")).isTrue()
        account = "bob"
        assertThat(reopened.isModeUnconfirmed("c1")).isFalse()

        account = "alice"
        reopened.confirmMode("c1")
        assertThat(SharedPrefsEndToEndRegimeLedger(context, accounts).isModeUnconfirmed("c1")).isFalse()
    }
}
