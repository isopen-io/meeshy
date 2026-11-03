package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxOutcomeFlowTest {

    @Test
    fun `a subscriber arriving after the delivery still receives the terminal outcome`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("m1"))
        outbox.markSucceeded("m1")

        assertThat(outbox.outcomeFor("m1").first()).isEqualTo(OutboxOutcome.Succeeded("m1"))
    }

    @Test
    fun `an observer waiting before the delivery receives it and completes`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("m1"))
        outbox.outcomeFor("m1").test {
            outbox.markSucceeded("m1")
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Succeeded("m1"))
            awaitComplete()
        }
    }

    @Test
    fun `cancelling one observer leaves the others served`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("m1"))
        val cancelled = outbox.outcomeFor("m1")
        val kept = outbox.outcomeFor("m1")
        kept.test {
            cancelled.test { cancelAndIgnoreRemainingEvents() }
            outbox.markSucceeded("m1")
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Succeeded("m1"))
            awaitComplete()
        }
    }

    @Test
    fun `a retried row forgets its stale failure so observers wait for the new outcome`() = withOwnedOutbox { outbox, db ->
        db.outboxDao().upsert(outboxRow("m1", state = OutboxState.INFLIGHT))
        outbox.markExhausted("m1", "boom")
        assertThat(outbox.outcomeFor("m1").first()).isEqualTo(OutboxOutcome.Exhausted("m1", "boom"))

        outbox.retry("m1")

        outbox.outcomeFor("m1").test {
            outbox.markSucceeded("m1")
            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Succeeded("m1"))
            awaitComplete()
        }
    }
}
