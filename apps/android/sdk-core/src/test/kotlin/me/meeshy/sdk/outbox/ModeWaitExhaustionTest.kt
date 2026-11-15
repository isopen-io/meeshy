package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.senders.UploadMediaHandler
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13820 — une ligne qui a attendu le mode de sa conversation échoue sur la ligne À JOUR (sa raison d'échec, pas celle de
 * son attente) : refusée e2ee ou introuvable, la pièce perd ses octets. Et la borne d'attente court pour toute la file d'une
 * conversation à la fois, jamais une ligne après l'autre.
 */
@RunWith(RobolectricTestRunner::class)
class ModeWaitExhaustionTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private val ledger = InMemoryEndToEndRegimeLedger()
    private val blobs = mockk<MediaBlobStore>(relaxed = true)
    private var mode: ConversationModeRead = ConversationModeRead.Unreadable

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

    private val uploads get() = UploadMediaHandler(blobs, mockk(), mockk(), MeeshyApi.json, MediaUploadProgressLedger(), ledger)

    private fun drainer() = OutboxDrainer(
        outbox = outbox,
        senders = OutboxKind.entries.associateWith { MutationSender { SendResult.Success } },
        onExhausted = { row -> if (row.kindEnum == OutboxKind.UPLOAD_MEDIA) uploads.onExhausted(row) },
        plaintextAdmission = EndToEndOutboxAdmission(ledger, db.conversationDao(), db.messageDao(), outbox, modeReader = { mode }),
    )

    private suspend fun unconfirmed(id: String) {
        db.conversationDao().upsertAll(
            listOf(ConversationEntity(id = id, payload = MeeshyApi.json.encodeToString(ApiConversation(id = id, encryptionMode = "server")), updatedAt = 0, cachedAt = 0)),
        )
        ledger.markModeUnconfirmed(id)
    }

    private suspend fun waitedOnceThenDue(cmid: String) {
        drainer().drainLane(OutboxLanes.MEDIA)
        val waiting = outbox.row(cmid)!!
        assertThat(waiting.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
        db.outboxDao().defer(cmid, nextAttemptAt = 0L, waitingSince = waiting.waitingSince!!, now = 0L)
    }

    private suspend fun enqueueUpload(cmid: String, conversationId: String) = outbox.enqueue(
        OutboxMutation(
            OutboxKind.UPLOAD_MEDIA,
            OutboxLanes.MEDIA,
            targetId = cmid,
            payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = conversationId)),
            cmid = cmid,
        ),
    )

    @Test
    fun `une piece qui a attendu son mode puis le decouvre e2ee perd ses octets`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        waitedOnceThenDue("up1")
        mode = ConversationModeRead.Served(ApiConversation(id = "c1", encryptionMode = "e2ee"))

        drainer().drainLane(OutboxLanes.MEDIA)

        assertThat(outbox.row("up1")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_END_TO_END)
        coVerify(exactly = 1) { blobs.remove("up1") }
    }

    @Test
    fun `une piece qui a attendu son mode puis que la passerelle ne sert plus perd ses octets`() = runTest {
        unconfirmed("c1")
        enqueueUpload("up1", "c1")
        waitedOnceThenDue("up1")
        mode = ConversationModeRead.Inaccessible

        drainer().drainLane(OutboxLanes.MEDIA)

        assertThat(outbox.row("up1")?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE)
        coVerify(exactly = 1) { blobs.remove("up1") }
    }

    @Test
    fun `deux messages en file depuis plus d une heure pour un mode illisible echouent tous deux`() = runTest {
        unconfirmed("c1")
        val lane = OutboxLanes.forMessage("c1")
        outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, lane, targetId = "c1", payload = "{}", cmid = "m1"))
        outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, lane, targetId = "c1", payload = "{}", cmid = "m2"))
        val anHourAgo = System.currentTimeMillis() - OutboxDrainer.DEFERRED_MAX_WAIT_MS - 60_000L
        db.openHelper.writableDatabase.execSQL("UPDATE outbox SET createdAt = $anHourAgo")
        db.outboxDao().defer("m1", nextAttemptAt = 0L, waitingSince = anHourAgo, now = 0L)

        drainer().drainLane(lane)

        assertThat(outbox.row("m1")?.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(outbox.row("m2")?.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }
}
