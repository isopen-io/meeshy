package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxCapacityTest {

    private fun reaction(cmid: String) =
        OutboxMutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "t-$cmid", "{}", cmid = cmid)

    @Test
    fun `the thresholds are 80 percent alert and 500 ceiling`() {
        assertThat(OutboxCapacity.ALERT_ROWS).isEqualTo(400)
        assertThat(OutboxCapacity.stateFor(399)).isEqualTo(OutboxCapacityState.NORMAL)
        assertThat(OutboxCapacity.stateFor(400)).isEqualTo(OutboxCapacityState.NEAR_CAPACITY)
        assertThat(OutboxCapacity.stateFor(499)).isEqualTo(OutboxCapacityState.NEAR_CAPACITY)
        assertThat(OutboxCapacity.stateFor(500)).isEqualTo(OutboxCapacityState.FULL)
    }

    @Test
    fun `the 501st enqueue is refused with a visible QueueFull and nothing is evicted`() = withOwnedOutbox { outbox, db ->
        repeat(OutboxCapacity.MAX_ROWS) { db.outboxDao().upsert(outboxRow("r$it")) }

        val result = outbox.tryEnqueue(reaction("late"))

        assertThat(result).isEqualTo(OutboxEnqueueResult.QueueFull(rowCount = 500, limit = 500))
        assertThat(db.outboxDao().count()).isEqualTo(500)
        assertThat(outbox.row("late")).isNull()
        assertThat(outbox.row("r0")).isNotNull()
    }

    @Test
    fun `a refused mutation signals Exhausted so its optimistic effect rolls back, even to a late observer`() = withOwnedOutbox { outbox, db ->
        repeat(OutboxCapacity.MAX_ROWS) { db.outboxDao().upsert(outboxRow("r$it")) }

        outbox.tryEnqueue(reaction("late"))

        assertThat(outbox.outcomeFor("late").first())
            .isEqualTo(OutboxOutcome.Exhausted("late", OutboxCapacity.REASON_QUEUE_FULL))
    }

    @Test
    fun `enqueue keeps its contract at the ceiling by answering null`() = withOwnedOutbox { outbox, db ->
        repeat(OutboxCapacity.MAX_ROWS) { db.outboxDao().upsert(outboxRow("r$it")) }

        assertThat(outbox.enqueue(reaction("late"))).isNull()
    }

    @Test
    fun `a replacement does not grow the queue so it is admitted at the ceiling`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(
            outboxRow("profile1", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, targetId = "u1"),
        )
        repeat(OutboxCapacity.MAX_ROWS - 1) { db.outboxDao().upsert(outboxRow("r$it")) }

        val result = outbox.tryEnqueue(
            OutboxMutation(OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, "u1", "{}", cmid = "profile2"),
        )

        assertThat(result).isEqualTo(OutboxEnqueueResult.Accepted("profile2"))
        assertThat(db.outboxDao().count()).isEqualTo(500)
    }

    @Test
    fun `the capacity alert is exposed to the UI at 400 and the queue is full at 500`() = withOwnedOutbox { outbox, db ->
        outbox.observeCapacity().test {
            assertThat(awaitItem()).isEqualTo(OutboxCapacityState.NORMAL)
            repeat(OutboxCapacity.ALERT_ROWS) { db.outboxDao().upsert(outboxRow("r$it")) }
            assertThat(awaitItem()).isEqualTo(OutboxCapacityState.NEAR_CAPACITY)
            repeat(OutboxCapacity.MAX_ROWS - OutboxCapacity.ALERT_ROWS) { db.outboxDao().upsert(outboxRow("s$it")) }
            assertThat(awaitItem()).isEqualTo(OutboxCapacityState.FULL)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a delivered row frees a slot`() = withOwnedOutbox { outbox, db ->
        repeat(OutboxCapacity.MAX_ROWS) { db.outboxDao().upsert(outboxRow("r$it")) }
        outbox.markSucceeded("r0")

        assertThat(outbox.tryEnqueue(reaction("late"))).isEqualTo(OutboxEnqueueResult.Accepted("late"))
    }
}
