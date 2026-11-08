package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.ApiError
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxDrainerClassificationTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private val lane = OutboxLanes.forMessage("c1")
    private val exhausted = mutableListOf<String>()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() = db.close()

    private fun drainer(now: () -> Long = { Long.MAX_VALUE }, send: (ApiError) -> SendResult, error: ApiError) = OutboxDrainer(
        outbox,
        mapOf(OutboxKind.SEND_MESSAGE to MutationSender { send(error) }),
        onExhausted = { exhausted += it.cmid },
        now = now,
    )

    private suspend fun enqueue() {
        outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, lane, "cid_m1", "{}", cmid = "m1"))
    }

    private fun classified(error: ApiError) = drainer(send = SendFailureClassifier::classify, error = error)

    @Test
    fun `a 404 exhausts the row at the first attempt`() = runTest {
        enqueue()

        classified(ApiError("gone", code = "POST_NOT_FOUND", httpStatus = 404)).drainLane(lane)

        val row = db.outboxDao().find("m1")!!
        assertThat(row.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(row.attempts).isEqualTo(0)
        assertThat(exhausted).containsExactly("m1")
    }

    @Test
    fun `a network outage of many passes exhausts nothing`() = runTest {
        enqueue()
        val drainer = classified(ApiError("offline", code = "NETWORK"))

        repeat(OutboxRepository.MAX_ATTEMPTS * 3) { drainer.drainLane(lane) }

        val row = db.outboxDao().find("m1")!!
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(row.attempts).isEqualTo(0)
        assertThat(row.nextAttemptAt).isNotNull()
        assertThat(exhausted).isEmpty()
    }

    @Test
    fun `a transport failure holds the row back and reports the lane stopped`() = runTest {
        enqueue()
        val before = System.currentTimeMillis()

        val report = classified(ApiError("offline", code = "NETWORK")).drainLane(lane)

        assertThat(report.stoppedOnTransientFailure).isTrue()
        assertThat(db.outboxDao().find("m1")!!.nextAttemptAt!!).isAtLeast(before + OutboxBackoff.TRANSPORT_DELAY_MS)
    }

    @Test
    fun `a server error charges one attempt and backs the row off`() = runTest {
        enqueue()
        val before = System.currentTimeMillis()

        classified(ApiError("down", code = "INTERNAL", httpStatus = 503)).drainLane(lane)

        val row = db.outboxDao().find("m1")!!
        assertThat(row.attempts).isEqualTo(1)
        assertThat(row.nextAttemptAt!!).isAtLeast(before + OutboxBackoff.FIRST_DELAY_MS)
        assertThat(row.nextAttemptAt!!).isAtMost(System.currentTimeMillis() + OutboxBackoff.FIRST_DELAY_MS + OutboxBackoff.MAX_JITTER_MS)
    }

    @Test
    fun `repeated server errors exhaust the row at the budget`() = runTest {
        enqueue()
        val drainer = classified(ApiError("down", code = "INTERNAL", httpStatus = 503))

        repeat(OutboxRepository.MAX_ATTEMPTS) { drainer.drainLane(lane) }

        assertThat(db.outboxDao().find("m1")!!.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(exhausted).containsExactly("m1")
    }

    @Test
    fun `an expired session costs no attempt and the row waits`() = runTest {
        enqueue()

        classified(ApiError("expired", code = "UNAUTHORIZED", httpStatus = 401)).drainLane(lane)

        val row = db.outboxDao().find("m1")!!
        assertThat(row.attempts).isEqualTo(0)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(row.waitingSince).isNotNull()
    }

    @Test
    fun `a backed-off row does not stop the other lanes`() = runTest {
        enqueue()
        outbox.enqueue(OutboxMutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", "{}", cmid = "b1"))
        val registryLike = OutboxDrainer(
            outbox,
            mapOf(
                OutboxKind.SEND_MESSAGE to MutationSender { SendResult.TransportFailure },
                OutboxKind.BLOCK_USER to MutationSender { SendResult.Success },
            ),
            now = { Long.MAX_VALUE },
        )

        registryLike.drainLane(lane)
        val other = registryLike.drainLane(OutboxLanes.BLOCK)

        assertThat(other.delivered).isEqualTo(1)
    }

    @Test
    fun `a dependency is awaited for at most 30 minutes`() {
        assertThat(OutboxDrainer.DEFERRED_MAX_WAIT_MS).isEqualTo(30 * 60 * 1000L)
    }
}
