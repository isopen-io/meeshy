package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14697 — on envoie sans attendre : un message dont la pièce se téléverse encore attend SEUL, les messages composés
 * après lui partent (décision par défaut, jumelle de #14696 iOS), et un second passage du vidangeur ne relance jamais
 * le téléversement qu'un premier passage tient encore.
 */
@RunWith(RobolectricTestRunner::class)
class OutboxMessageLaneWaitingMediaTest {

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

    private val lane = OutboxLanes.forMessage("c1")

    private suspend fun enqueue(cmid: String, rowLane: String = lane, kind: OutboxKind = OutboxKind.SEND_MESSAGE, dependsOn: Set<String> = emptySet()) {
        outbox.enqueue(
            OutboxMutation(kind, rowLane, targetId = cmid, payload = "{}", dependsOn = dependsOn, cmid = cmid),
        )
    }

    private fun drainer(sender: MutationSender) = OutboxDrainer(
        outbox,
        mapOf(OutboxKind.SEND_MESSAGE to sender, OutboxKind.UPLOAD_MEDIA to sender),
    )

    @Test
    fun `a text sent after a video still uploading leaves without waiting for it`() = runTest {
        enqueue("upload", OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        enqueue("video", dependsOn = setOf("upload"))
        enqueue("text")
        val sent = mutableListOf<String>()

        val report = drainer { row -> sent += row.cmid; SendResult.Success }.drainLane(lane)

        assertThat(sent).containsExactly("text")
        assertThat(outbox.stateOf("video")).isEqualTo(OutboxState.PENDING)
        assertThat(report.delivered).isEqualTo(1)
        assertThat(report.stoppedOnBlockedDependency).isTrue()
    }

    @Test
    fun `messages composed during an upload another pass holds keep their own order`() = runTest {
        enqueue("upload", OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        outbox.markInflight("upload")
        enqueue("video", dependsOn = setOf("upload"))
        enqueue("text-1")
        enqueue("text-2")
        val sent = mutableListOf<String>()

        drainer { row -> sent += row.cmid; SendResult.Success }.drainLane(lane)

        assertThat(sent).containsExactly("text-1", "text-2").inOrder()
        assertThat(outbox.stateOf("video")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `the waiting message leaves once its upload has landed`() = runTest {
        enqueue("upload", OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        enqueue("video", dependsOn = setOf("upload"))
        enqueue("text")
        val sent = mutableListOf<String>()
        val drainer = drainer { row -> sent += row.cmid; SendResult.Success }

        drainer.drainLane(lane)
        drainer.drainLane(OutboxLanes.MEDIA)
        drainer.drainLane(lane)

        assertThat(sent).containsExactly("text", "upload", "video").inOrder()
        assertThat(outbox.stateOf("video")).isNull()
    }

    @Test
    fun `a transient failure still holds the messages behind it`() = runTest {
        enqueue("first")
        enqueue("second")
        val sent = mutableListOf<String>()

        drainer { row -> sent += row.cmid; SendResult.TransientFailure }.drainLane(lane)

        assertThat(sent).containsExactly("first")
        assertThat(outbox.stateOf("second")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a second pass never revives the upload a live pass is still sending`() = runTest {
        enqueue("upload", OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val sends = mutableListOf<String>()
        val first = launch {
            drainer { row -> sends += row.cmid; started.complete(Unit); release.await(); SendResult.Success }
                .drainLane(OutboxLanes.MEDIA)
        }
        started.await()

        outbox.recoverInflight()
        drainer { row -> sends += row.cmid; SendResult.Success }.drainLane(OutboxLanes.MEDIA)

        assertThat(outbox.stateOf("upload")).isEqualTo(OutboxState.INFLIGHT)
        release.complete(Unit)
        first.join()
        assertThat(sends).containsExactly("upload")
        assertThat(outbox.stateOf("upload")).isNull()
    }

    @Test
    fun `an upload orphaned by a dead pass is revived`() = runTest {
        enqueue("upload", OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        outbox.markInflight("upload")

        outbox.recoverInflight()

        assertThat(outbox.stateOf("upload")).isEqualTo(OutboxState.PENDING)
    }
}
