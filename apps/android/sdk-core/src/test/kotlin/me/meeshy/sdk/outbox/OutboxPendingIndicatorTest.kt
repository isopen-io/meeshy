package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxPendingIndicatorTest {

    @Test
    fun `the counter counts user work and ignores background reports`() = withOwnedOutbox { outbox, db ->
        val indicator = OutboxPendingIndicator(outbox)
        indicator.pendingCount.test {
            assertThat(awaitItem()).isEqualTo(0)
            db.outboxDao().upsert(outboxRow("m1", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE))
            assertThat(awaitItem()).isEqualTo(1)
            db.outboxDao().upsert(outboxRow("rr", OutboxKind.READ_RECEIPT, OutboxLanes.READ_RECEIPT))
            expectNoEvents()
        }
    }

    @Test
    fun `the pill feed excludes the same kinds as the counter`() = withOwnedOutbox { outbox, db ->
        val indicator = OutboxPendingIndicator(outbox)
        db.outboxDao().upsert(outboxRow("rr", OutboxKind.READ_RECEIPT, OutboxLanes.READ_RECEIPT))
        db.outboxDao().upsert(outboxRow("p", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE))
        indicator.pendingUiItems.test {
            assertThat(awaitItem().map { it.id }).containsExactly("p")
        }
    }

    @Test
    fun `the near capacity alert rises at 400 rows`() = withOwnedOutbox { outbox, db ->
        val indicator = OutboxPendingIndicator(outbox)
        repeat(OutboxCapacity.ALERT_ROWS - 1) { db.outboxDao().upsert(outboxRow("r$it", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, targetId = "t$it")) }
        indicator.isNearCapacity.test {
            assertThat(awaitItem()).isFalse()
            db.outboxDao().upsert(outboxRow("last", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, targetId = "tl"))
            assertThat(awaitItem()).isTrue()
        }
    }

    @Test
    fun `retryItem revives an exhausted row and says false for a missing one`() = withOwnedOutbox { outbox, db ->
        val indicator = OutboxPendingIndicator(outbox)
        db.outboxDao().upsert(outboxRow("dead", OutboxKind.UPDATE_PROFILE, OutboxLanes.PROFILE, state = OutboxState.EXHAUSTED))
        assertThat(indicator.retryItem("dead")).isTrue()
        assertThat(outbox.stateOf("dead")).isEqualTo(OutboxState.PENDING)
        assertThat(indicator.retryItem("ghost")).isFalse()
    }
}
