package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxFlushPlanTest {

    private fun report(
        delivered: Int = 0,
        exhausted: Int = 0,
        transient: Boolean = false,
        blocked: Boolean = false,
    ) = DrainReport(
        delivered = delivered,
        exhausted = exhausted,
        stoppedOnTransientFailure = transient,
        stoppedOnBlockedDependency = blocked,
    )

    @Test
    fun `no lanes drained succeeds`() {
        assertThat(OutboxFlushPlan.outcome(emptyList())).isEqualTo(FlushOutcome.SUCCESS)
    }

    @Test
    fun `a single clean lane succeeds`() {
        assertThat(OutboxFlushPlan.outcome(listOf(report()))).isEqualTo(FlushOutcome.SUCCESS)
    }

    @Test
    fun `a transient failure on the only lane retries`() {
        assertThat(OutboxFlushPlan.outcome(listOf(report(transient = true))))
            .isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `a blocked dependency on the only lane retries`() {
        assertThat(OutboxFlushPlan.outcome(listOf(report(blocked = true))))
            .isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `a lane stopped on both transient and blocked retries`() {
        assertThat(OutboxFlushPlan.outcome(listOf(report(transient = true, blocked = true))))
            .isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `every lane clean across many lanes succeeds`() {
        val reports = listOf(report(delivered = 2), report(exhausted = 1), report(delivered = 5))
        assertThat(OutboxFlushPlan.outcome(reports)).isEqualTo(FlushOutcome.SUCCESS)
    }

    @Test
    fun `one transient lane among clean lanes retries`() {
        val reports = listOf(report(delivered = 1), report(transient = true), report(delivered = 3))
        assertThat(OutboxFlushPlan.outcome(reports)).isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `one blocked lane among clean lanes retries`() {
        val reports = listOf(report(delivered = 1), report(blocked = true), report(exhausted = 2))
        assertThat(OutboxFlushPlan.outcome(reports)).isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `deliveries and exhaustions without a stop signal never force a retry`() {
        val reports = listOf(report(delivered = 9, exhausted = 4))
        assertThat(OutboxFlushPlan.outcome(reports)).isEqualTo(FlushOutcome.SUCCESS)
    }
}
