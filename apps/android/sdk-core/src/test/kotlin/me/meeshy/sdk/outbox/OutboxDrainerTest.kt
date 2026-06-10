package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxDrainerTest {

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

    private suspend fun enqueueSend(cmid: String) {
        outbox.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, lane, targetId = cmid, payload = "{}", cmid = cmid),
        )
    }

    private fun drainer(sender: MutationSender) =
        OutboxDrainer(outbox, mapOf(OutboxKind.SEND_MESSAGE to sender))

    @Test
    fun `drainLane delivers every pending row on success`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")

        val report = drainer { SendResult.Success }.drainLane(lane)

        assertThat(report.delivered).isEqualTo(2)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `drainLane stops the lane on a transient failure to preserve FIFO`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")
        var calls = 0

        val report = drainer { calls++; SendResult.TransientFailure }.drainLane(lane)

        assertThat(report.stoppedOnTransientFailure).isTrue()
        assertThat(calls).isEqualTo(1)
        assertThat(outbox.observeAll().first().map { it.cmid }).containsExactly("m1", "m2")
    }

    @Test
    fun `drainLane exhausts a permanently-failed row and continues`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")

        val report = drainer { row ->
            if (row.cmid == "m1") SendResult.PermanentFailure("rejected") else SendResult.Success
        }.drainLane(lane)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.observeAll().first().single().cmid).isEqualTo("m1")
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane exhausts a row whose kind has no sender`() = runTest {
        enqueueSend("m1")

        val report = OutboxDrainer(outbox, emptyMap()).drainLane(lane)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane reports every exhausted row through onExhausted`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")
        val exhaustedCmids = mutableListOf<String>()

        OutboxDrainer(
            outbox,
            mapOf(
                OutboxKind.SEND_MESSAGE to MutationSender { row ->
                    if (row.cmid == "m1") SendResult.PermanentFailure("rejected") else SendResult.Success
                },
            ),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(lane)

        assertThat(exhaustedCmids).containsExactly("m1")
    }

    @Test
    fun `drainLane fires onExhausted when transient retries run out`() = runTest {
        enqueueSend("m1")
        repeat(OutboxRepository.MAX_ATTEMPTS - 1) { outbox.markFailed("m1") }
        val exhaustedCmids = mutableListOf<String>()

        OutboxDrainer(
            outbox,
            mapOf(OutboxKind.SEND_MESSAGE to MutationSender { SendResult.TransientFailure }),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(lane)

        assertThat(exhaustedCmids).containsExactly("m1")
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }
}
