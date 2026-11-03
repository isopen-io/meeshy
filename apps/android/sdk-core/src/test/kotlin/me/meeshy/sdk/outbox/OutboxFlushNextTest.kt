package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxFlushNextTest {

    private fun report(transient: Boolean = false, blocked: Boolean = false, heldBack: Boolean = false) =
        DrainReport(0, 0, stoppedOnTransientFailure = transient, stoppedOnBlockedDependency = blocked, heldBack = heldBack)

    @Test
    fun `a clean pass with nothing scheduled is done`() {
        assertThat(OutboxFlushNext.after(listOf(report()), earliestScheduledAt = null, now = 0L)).isEqualTo(FlushNext.Done)
    }

    @Test
    fun `the next pass is planned at the earliest due row`() {
        val next = OutboxFlushNext.after(listOf(report(transient = true)), earliestScheduledAt = 5_000L, now = 1_000L)

        assertThat(next).isEqualTo(FlushNext.RunAfter(4_000L))
    }

    @Test
    fun `a row already due is never planned sooner than the minimum`() {
        val next = OutboxFlushNext.after(listOf(report(transient = true)), earliestScheduledAt = 500L, now = 1_000L)

        assertThat(next).isEqualTo(FlushNext.RunAfter(OutboxFlushNext.MIN_DELAY_MS))
    }

    @Test
    fun `a lane held by a dependency with nothing scheduled comes back after the deferral delay`() {
        val next = OutboxFlushNext.after(listOf(report(blocked = true)), earliestScheduledAt = null, now = 0L)

        assertThat(next).isEqualTo(FlushNext.RunAfter(OutboxDrainer.DEFERRED_RETRY_MS))
    }
}
