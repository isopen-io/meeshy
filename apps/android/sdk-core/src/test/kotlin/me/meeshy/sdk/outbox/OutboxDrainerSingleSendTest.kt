package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #15677 — deux passes de flush qui se chevauchent (le flush immédiat et le flush planifié, ou le réveil qui suit chaque
 * média reçu) lisent la même ligne `PENDING` : une seule doit l'envoyer. La passe qui perd la réservation n'émet rien.
 */
@RunWith(RobolectricTestRunner::class)
class OutboxDrainerSingleSendTest {

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

    private suspend fun enqueue(kind: OutboxKind, lane: String, cmid: String, dependsOn: Set<String> = emptySet()) {
        outbox.enqueue(
            OutboxMutation(kind, lane, targetId = cmid, payload = "{}", dependsOn = dependsOn, cmid = cmid),
        )
    }

    private fun drainer(senders: Map<OutboxKind, MutationSender>) = OutboxDrainer(outbox, senders)

    @Test
    fun `a story read by two overlapping passes is published once`() = runTest {
        enqueue(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, "story-earlier")
        enqueue(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, "story-with-media")
        val sent = mutableListOf<String>()
        lateinit var overlapping: OutboxDrainer
        val sender = MutationSender { row ->
            sent += row.cmid
            if (row.cmid == "story-earlier" && sent.size == 1) overlapping.drainLane(OutboxLanes.STORY)
            SendResult.Success
        }
        overlapping = drainer(mapOf(OutboxKind.PUBLISH_STORY to sender))

        drainer(mapOf(OutboxKind.PUBLISH_STORY to sender)).drainLane(OutboxLanes.STORY)

        assertThat(sent.filter { it == "story-with-media" }).hasSize(1)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `a story whose media all landed is published once when a second pass reads it before the first sends`() = runTest {
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "media-1")
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "media-2")
        enqueue(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, "story", dependsOn = setOf("media-1", "media-2"))
        val posts = mutableListOf<String>()
        val senders = mapOf(
            OutboxKind.UPLOAD_MEDIA to MutationSender { SendResult.Success },
            OutboxKind.PUBLISH_STORY to MutationSender { row -> posts += row.cmid; SendResult.Success },
        )
        drainer(senders).drainLane(OutboxLanes.MEDIA)
        val overlapping = drainer(senders)
        var overlapped = false
        val beforeSend = object : OutboxPlaintextAdmission {
            override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict {
                if (!overlapped) {
                    overlapped = true
                    overlapping.drainLane(OutboxLanes.STORY)
                }
                return OutboxAdmissionVerdict.ADMIT
            }
        }

        OutboxDrainer(outbox, senders, plaintextAdmission = beforeSend).drainLane(OutboxLanes.STORY)

        assertThat(posts).containsExactly("story")
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `an upload read by two overlapping passes leaves once`() = runTest {
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "media-1")
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "media-2")
        val sent = mutableListOf<String>()
        lateinit var overlapping: OutboxDrainer
        val sender = MutationSender { row ->
            sent += row.cmid
            if (row.cmid == "media-1" && sent.size == 1) overlapping.drainLane(OutboxLanes.MEDIA)
            SendResult.Success
        }
        overlapping = drainer(mapOf(OutboxKind.UPLOAD_MEDIA to sender))

        drainer(mapOf(OutboxKind.UPLOAD_MEDIA to sender)).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("media-1", "media-2")
    }

    /**
     * #15541 — la passe B lit la pièce `PENDING`, la passe A la réserve, l'envoie, échoue et la remet à plus tard : B ne
     * la renvoie pas sur sa lecture périmée — la réservation exige que la ligne soit DUE, pas seulement `PENDING`.
     */
    @Test
    fun `an upload that failed under one pass is not sent again by an overlapping pass that read it before`() = runTest {
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "video")
        val uploads = mutableListOf<String>()
        val senders = mapOf(
            OutboxKind.UPLOAD_MEDIA to MutationSender { row -> uploads += row.cmid; SendResult.TransientFailure },
        )
        val first = drainer(senders)
        var overlapped = false
        val beforeClaim = object : OutboxPlaintextAdmission {
            override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict {
                if (!overlapped) {
                    overlapped = true
                    first.drainLane(OutboxLanes.MEDIA)
                }
                return OutboxAdmissionVerdict.ADMIT
            }
        }

        OutboxDrainer(outbox, senders, plaintextAdmission = beforeClaim).drainLane(OutboxLanes.MEDIA)

        assertThat(uploads).containsExactly("video")
        assertThat(outbox.stateOf("video")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a transport failure under one pass is not sent again by an overlapping pass that read it before`() = runTest {
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "photo")
        val uploads = mutableListOf<String>()
        val senders = mapOf(
            OutboxKind.UPLOAD_MEDIA to MutationSender { row -> uploads += row.cmid; SendResult.TransportFailure },
        )
        val first = drainer(senders)
        var overlapped = false
        val beforeClaim = object : OutboxPlaintextAdmission {
            override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict {
                if (!overlapped) {
                    overlapped = true
                    first.drainLane(OutboxLanes.MEDIA)
                }
                return OutboxAdmissionVerdict.ADMIT
            }
        }

        OutboxDrainer(outbox, senders, plaintextAdmission = beforeClaim).drainLane(OutboxLanes.MEDIA)

        assertThat(uploads).containsExactly("photo")
    }

    /**
     * #15541 — un gros téléversement qui dure plus que le seuil des lignes figées reste `INFLIGHT` tant que CE process
     * l'envoie : le retour au premier plan ne le remet pas en file, où une autre passe le réserverait et le relancerait.
     */
    @Test
    fun `a live upload older than the stale threshold is not put back in the queue`() = runTest {
        enqueue(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "long-video")
        var stateDuringSend: OutboxState? = null
        val sender = MutationSender { row ->
            outbox.reclaimStaleInflight(staleAfterMs = -60_000L)
            stateDuringSend = outbox.stateOf(row.cmid)
            SendResult.Success
        }

        drainer(mapOf(OutboxKind.UPLOAD_MEDIA to sender)).drainLane(OutboxLanes.MEDIA)

        assertThat(stateDuringSend).isEqualTo(OutboxState.INFLIGHT)
    }
}
