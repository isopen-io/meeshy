package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxDrainerDeferredTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private var clock = 1_000_000L
    private var sends = 0
    private var result: SendResult = SendResult.Deferred("origin not delivered")
    private val lane = OutboxLanes.forMessage("c1")
    private val exhaustedRows = mutableListOf<String>()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() = db.close()

    private fun drainer() = OutboxDrainer(
        outbox,
        mapOf(OutboxKind.SEND_MESSAGE to MutationSender { sends++; result }),
        onExhausted = { exhaustedRows += it.cmid },
        now = { clock },
    )

    private suspend fun enqueue(cmid: String) {
        outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, lane, "cid_$cmid", "{}", cmid = cmid))
    }

    @Test
    fun `a deferred row consumes no attempt, is rescheduled and holds its lane`() = runTest {
        enqueue("m1")
        enqueue("m2")

        val report = drainer().drainLane(lane)

        assertThat(report.stoppedOnBlockedDependency).isTrue()
        assertThat(sends).isEqualTo(1)
        val row = db.outboxDao().find("m1")!!
        assertThat(row.attempts).isEqualTo(0)
        assertThat(row.state).isEqualTo(OutboxState.PENDING.name)
        assertThat(row.waitingSince).isNotNull()
        assertThat(row.nextAttemptAt).isGreaterThan(row.waitingSince)
        assertThat(row.lastError).isEqualTo("origin not delivered")
    }

    @Test
    fun `a row not yet due is not sent again`() = runTest {
        enqueue("m1")
        drainer().drainLane(lane)
        val next = db.outboxDao().find("m1")!!.nextAttemptAt!!
        clock = next - 1

        val report = drainer().drainLane(lane)

        assertThat(sends).isEqualTo(1)
        assertThat(report.stoppedOnBlockedDependency).isTrue()
    }

    @Test
    fun `once due the row is retried and delivered when the origin has arrived`() = runTest {
        enqueue("m1")
        drainer().drainLane(lane)
        clock = db.outboxDao().find("m1")!!.nextAttemptAt!!
        result = SendResult.Success

        drainer().drainLane(lane)

        assertThat(sends).isEqualTo(2)
        assertThat(db.outboxDao().find("m1")).isNull()
    }

    @Test
    fun `beyond the wait bound a deferred row is exhausted cleanly with a rollback`() = runTest {
        enqueue("m1")
        drainer().drainLane(lane)
        clock = Long.MAX_VALUE / 2
        db.outboxDao().defer("m1", nextAttemptAt = 0, waitingSince = 1, now = 2)
        val real = OutboxRepository(db, db.outboxDao())

        val report = OutboxDrainer(
            real,
            mapOf(OutboxKind.SEND_MESSAGE to MutationSender { SendResult.Deferred("still waiting") }),
            onExhausted = { exhaustedRows += it.cmid },
            now = { clock },
        ).drainLane(lane)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(exhaustedRows).containsExactly("m1")
        val row = db.outboxDao().find("m1")!!
        assertThat(row.state).isEqualTo(OutboxState.EXHAUSTED.name)
        assertThat(row.attempts).isEqualTo(0)
    }
}
