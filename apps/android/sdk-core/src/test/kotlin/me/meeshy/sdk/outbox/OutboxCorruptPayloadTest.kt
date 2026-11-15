package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxCorruptPayloadTest {

    @Test
    fun `an unreadable payload is accepted once, deleted, and its Exhausted outcome published`() = runTest {
        val db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        try {
            val outbox = OutboxRepository(db, db.outboxDao())
            var calls = 0
            val rolledBack = mutableListOf<String>()
            val sender = MutationSender { row ->
                calls++
                MeeshyApi.json.withPayload<ReactionPayload>(row) { SendResult.Success }
            }
            val drainer = OutboxDrainer(
                outbox,
                mapOf(OutboxKind.ADD_REACTION to sender),
                onExhausted = { rolledBack += it.cmid },
            )
            outbox.enqueue(
                OutboxMutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "t", "not json", cmid = "bad"),
            )

            outbox.outcomes.test {
                val report = drainer.drainLane(OutboxLanes.REACTION)
                val outcome = awaitItem()
                assertThat(outcome).isInstanceOf(OutboxOutcome.Exhausted::class.java)
                assertThat(outcome.cmid).isEqualTo("bad")
                assertThat(report.exhausted).isEqualTo(1)
            }

            drainer.drainLane(OutboxLanes.REACTION)
            assertThat(calls).isEqualTo(1)
            assertThat(rolledBack).containsExactly("bad")
            assertThat(outbox.observeAll().first()).isEmpty()
        } finally {
            db.close()
        }
    }
}
